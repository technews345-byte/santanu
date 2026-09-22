import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { AdsModule, loadAdsModule } from './adsModule';

/**
 * Google Mobile Ads, wrapped so the rest of the app can ask for a rewarded ad
 * without knowing whether one is even possible here.
 *
 * This is the React Native equivalent of the Android `RewardedAd.load` /
 * `FullScreenContentCallback` / `show(OnUserEarnedRewardListener)` flow:
 * `react-native-google-mobile-ads` binds the same Google Mobile Ads SDK, so
 * the callbacks arrive as events on one ad object instead of as overridden
 * Java methods. The app ID that the Android guide puts in AndroidManifest.xml
 * is declared in app.json instead, where the config plugin writes it into the
 * generated manifest at prebuild.
 */

/** How long to wait for an ad to fill before giving up on it. */
const LOAD_TIMEOUT_MS = 15000;

/**
 * The only spacing on the app open ad: a short pause after any full-screen ad
 * is dismissed.
 *
 * Showing an ad puts the app itself into the background, so returning from one
 * looks exactly like the user reopening the app. Without this, closing an ad
 * would immediately qualify for the next one and the app would never be
 * reachable behind them.
 */
const AD_COOLDOWN_MS = 15 * 1000;

/** Google drops an app open ad that has been sitting in memory for too long. */
const APP_OPEN_MAX_AGE_MS = 4 * 60 * 60 * 1000;

/** What the caller gets back from a rewarded ad. */
export type RewardOutcome =
  | { status: 'earned'; reward: { type: string; amount: number } }
  /** Watched partly, or closed before the reward was earned. No reward. */
  | { status: 'dismissed' }
  /** No ad ran at all: no fill, no network, or ads are unavailable here. */
  | { status: 'unavailable'; reason: string };

/**
 * The module is resolved lazily and defensively, and remembered either way.
 *
 * It is a native module with no web implementation, and Expo Go ships no AdMob
 * code at all, so an unsupported environment degrades to "no ads" rather than
 * taking down whatever screen asked for one.
 */
let cached: AdsModule | null | undefined;

function ads(): AdsModule | null {
  if (cached !== undefined) return cached;

  const unsupported =
    Platform.OS === 'web' ||
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

  cached = unsupported ? null : loadAdsModule();
  return cached;
}

/** Whether a rewarded ad can run in this build at all. */
export function adsSupported(): boolean {
  return ads() !== null;
}

type AdsConfig = {
  androidRewardedUnitId?: string;
  iosRewardedUnitId?: string;
  androidAppOpenUnitId?: string;
  iosAppOpenUnitId?: string;
};

const configured: AdsConfig = (Constants.expoConfig?.extra as any)?.ads ?? {};

/**
 * Test units in development, the configured ones in a release build.
 *
 * Google's test IDs are the only ones safe to request while developing:
 * loading a real unit from a debug build counts as invalid traffic against
 * the account. The configured IDs in app.json are test IDs too for now, so
 * both paths currently serve Google's sample ads.
 */
function rewardedUnitId(mod: AdsModule): string {
  const real = Platform.select({
    android: configured.androidRewardedUnitId,
    ios: configured.iosRewardedUnitId,
    default: undefined,
  });
  return __DEV__ || !real ? mod.TestIds.REWARDED : real;
}

function appOpenUnitId(mod: AdsModule): string {
  const real = Platform.select({
    android: configured.androidAppOpenUnitId,
    ios: configured.iosAppOpenUnitId,
    default: undefined,
  });
  return __DEV__ || !real ? mod.TestIds.APP_OPEN : real;
}

/**
 * The SDK has to be initialized once before any ad is requested. Kept as the
 * promise rather than a boolean so two callers racing to show an ad both wait
 * on the same initialization instead of starting a second one.
 */
let initialization: Promise<void> | null = null;

export function initAds(): Promise<void> {
  const mod = ads();
  if (!mod) return Promise.resolve();

  if (!initialization) {
    initialization = mod
      .MobileAds()
      .initialize()
      .then(() => undefined)
      // A failed initialize is not worth surfacing: the load that follows
      // will report the real problem, and ads are never the point of the
      // screen that asked for one.
      .catch(() => undefined);
  }
  return initialization;
}

/**
 * Nothing may be shown over an ad that is already on screen: Google counts it
 * as an invalid impression, and the user would be trapped behind two of them.
 */
let adOnScreen = false;

/** When the last full-screen ad was dismissed, for the cooldown above. */
let lastAdDismissedAt = 0;

/**
 * How many screens are currently holding ads back.
 *
 * Signing in leaves the app on purpose — to read a code out of the SMS app, or
 * to finish a security check — and every one of those returns looks like the
 * user reopening Spendly. An ad on top of a half-finished login is how people
 * lose the code and give up, so screens in the middle of a flow like that hold
 * ads until they are done. Counted rather than a flag, because two screens can
 * overlap and the first to finish must not release the second's hold.
 */
let suppressions = 0;

/** Holds app open ads back until the returned function is called. */
export function holdAppOpenAds(): () => void {
  suppressions += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    suppressions = Math.max(0, suppressions - 1);
  };
}

/**
 * Loads a rewarded ad, shows it, and resolves once the user is done with it.
 *
 * A fresh ad is built for every call and destroyed on the way out, which is
 * what the Android guide's "set the ad reference to null so you don't show the
 * ad a second time" is protecting against — a rewarded ad may only be shown
 * once.
 *
 * @param options.userId     Passed to AdMob server-side verification, so a
 *                           reward can be granted from a server rather than
 *                           trusted from the device.
 * @param options.customData Free-form string echoed back in that callback.
 */
export function showRewardedAd(
  options: { userId?: string; customData?: string } = {}
): Promise<RewardOutcome> {
  const mod = ads();
  if (!mod) {
    return Promise.resolve({
      status: 'unavailable',
      reason: 'Ads are not available in this build.',
    });
  }

  const { RewardedAd, RewardedAdEventType, AdEventType } = mod;

  return initAds().then(
    () =>
      new Promise<RewardOutcome>((resolve) => {
        const ad = RewardedAd.createForAdRequest(rewardedUnitId(mod), {
          serverSideVerificationOptions: {
            userId: options.userId,
            customData: options.customData,
          },
        });

        let settled = false;
        let earned: { type: string; amount: number } | null = null;

        // Only the load is on a clock. Once an ad is on screen the user takes
        // as long as they take.
        let loadTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
          finish({ status: 'unavailable', reason: 'The ad took too long to load.' });
        }, LOAD_TIMEOUT_MS);

        const clearLoadTimer = () => {
          if (loadTimer) {
            clearTimeout(loadTimer);
            loadTimer = null;
          }
        };

        const finish = (outcome: RewardOutcome) => {
          if (settled) return;
          settled = true;
          adOnScreen = false;
          // Returning from a rewarded ad is a foreground event too, so it has
          // to start the cooldown or it would be answered with another ad.
          lastAdDismissedAt = Date.now();
          clearLoadTimer();
          try {
            ad.removeAllListeners();
            ad.destroy();
          } catch {
            // Already gone; nothing to release.
          }
          resolve(outcome);
        };

        ad.addAdEventListener(RewardedAdEventType.LOADED, () => {
          clearLoadTimer();
          // Claimed before showing, so a foreground event arriving mid-ad
          // cannot put an app open ad on top of this one.
          adOnScreen = true;
          ad.show().catch((error: unknown) =>
            finish({
              status: 'unavailable',
              reason: (error as Error)?.message ?? 'The ad could not be shown.',
            })
          );
        });

        // Fires while the ad is still up; the ad closing is what ends the flow.
        ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, (reward) => {
          earned = { type: reward.type, amount: reward.amount };
        });

        ad.addAdEventListener(AdEventType.CLOSED, () => {
          finish(earned ? { status: 'earned', reward: earned } : { status: 'dismissed' });
        });

        ad.addAdEventListener(AdEventType.ERROR, (error) => {
          finish({
            status: 'unavailable',
            reason: error?.message ?? 'No ad was available. Please try again later.',
          });
        });

        ad.load();
      })
  );
}

type AppOpenHandle = {
  ad: ReturnType<NonNullable<AdsModule>['AppOpenAd']['createForAdRequest']>;
  loadedAt: number;
};

/** An ad that has loaded and is waiting to be shown. */
let readyAppOpen: AppOpenHandle | null = null;
/** The load in flight, so callers arriving together share one request. */
let appOpenLoad: Promise<AppOpenHandle | null> | null = null;

/**
 * Resolves with an app open ad ready to show, or null if none can be had.
 *
 * A caller that arrives while a load is in flight waits for it rather than
 * starting a second one or giving up — which is what makes an ad on a cold
 * start possible, since at launch there has been no time to preload.
 */
function ensureAppOpenAd(): Promise<AppOpenHandle | null> {
  if (readyAppOpen && Date.now() - readyAppOpen.loadedAt < APP_OPEN_MAX_AGE_MS) {
    return Promise.resolve(readyAppOpen);
  }
  readyAppOpen = null;
  if (appOpenLoad) return appOpenLoad;

  const mod = ads();
  if (!mod) return Promise.resolve(null);

  appOpenLoad = initAds().then(
    () =>
      new Promise<AppOpenHandle | null>((resolve) => {
        const { AppOpenAd, AdEventType } = mod;
        const ad = AppOpenAd.createForAdRequest(appOpenUnitId(mod));

        let settled = false;
        const done = (handle: AppOpenHandle | null) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          appOpenLoad = null;
          resolve(handle);
        };

        const timer = setTimeout(() => done(null), LOAD_TIMEOUT_MS);

        ad.addAdEventListener(AdEventType.LOADED, () => {
          // Recorded even if the wait above already timed out, so a slow fill
          // is shown at the next opportunity instead of being thrown away.
          readyAppOpen = { ad, loadedAt: Date.now() };
          done(readyAppOpen);
        });

        ad.addAdEventListener(AdEventType.ERROR, () => {
          // No fill or no network. Released here; the next open tries again.
          try {
            ad.removeAllListeners();
            ad.destroy();
          } catch {
            // Already released.
          }
          done(null);
        });

        ad.load();
      })
  );

  return appOpenLoad;
}

/** Fetches an app open ad now so one is in hand when it is wanted. */
export function preloadAppOpenAd(): void {
  ensureAppOpenAd();
}

/**
 * Shows an app open ad: on launch, and whenever the app is brought forward.
 *
 * It waits for an ad that is still loading rather than declining, so the first
 * open of a session gets one too. It declines only when another ad is already
 * up, when one was just dismissed, or when nothing could be loaded.
 *
 * @returns Whether an ad was shown.
 */
export async function showAppOpenAd(): Promise<boolean> {
  const mod = ads();
  if (!mod) return false;
  if (adOnScreen || suppressions > 0) return false;
  if (Date.now() - lastAdDismissedAt < AD_COOLDOWN_MS) return false;

  const handle = await ensureAppOpenAd();
  if (!handle) return false;
  // The wait above yields, so re-check: an ad may have gone up meanwhile, or a
  // screen may have started a flow that must not be interrupted.
  if (adOnScreen || suppressions > 0) return false;

  readyAppOpen = null;
  adOnScreen = true;

  const { AdEventType } = mod;
  const dismissed = new Promise<void>((resolve) => {
    handle.ad.addAdEventListener(AdEventType.CLOSED, () => resolve());
  });

  try {
    await handle.ad.show();
    await dismissed;
    return true;
  } catch {
    return false;
  } finally {
    adOnScreen = false;
    lastAdDismissedAt = Date.now();
    try {
      handle.ad.removeAllListeners();
      handle.ad.destroy();
    } catch {
      // Already released.
    }
    // Have the next one ready before it is wanted.
    preloadAppOpenAd();
  }
}
