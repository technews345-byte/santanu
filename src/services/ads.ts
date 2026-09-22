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
 * Guards on the app open ad. Spendly is opened in ten-second bursts — log a
 * coffee, close it again — so showing an ad on every return to the foreground
 * would cost more in uninstalls than it could earn. It is capped to once every
 * few hours, and a quick switch away and back never triggers one.
 */
const APP_OPEN_MIN_GAP_MS = 4 * 60 * 60 * 1000;
const APP_OPEN_MIN_BACKGROUND_MS = 30 * 1000;

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
  ready: boolean;
};

let appOpen: AppOpenHandle | null = null;
let appOpenPending = false;
let appOpenLastShownAt = 0;

/**
 * Fetches an app open ad and holds it until the app is next brought forward.
 *
 * App open ads have to be ready *before* the moment they are shown — loading
 * one when the user returns would leave them staring at the app behind a
 * spinner — so this is called at launch and again after each one is used.
 */
export function preloadAppOpenAd(): void {
  const mod = ads();
  if (!mod || appOpenPending) return;
  if (appOpen?.ready && Date.now() - appOpen.loadedAt < APP_OPEN_MAX_AGE_MS) return;

  appOpenPending = true;
  initAds().then(() => {
    const { AppOpenAd, AdEventType } = mod;
    const ad = AppOpenAd.createForAdRequest(appOpenUnitId(mod));
    const handle: AppOpenHandle = { ad, loadedAt: Date.now(), ready: false };

    ad.addAdEventListener(AdEventType.LOADED, () => {
      handle.ready = true;
      handle.loadedAt = Date.now();
      appOpenPending = false;
    });

    ad.addAdEventListener(AdEventType.ERROR, () => {
      // No fill, or no network. Drop it and try again at the next foreground
      // rather than retrying in a loop.
      appOpenPending = false;
      if (appOpen === handle) appOpen = null;
      try {
        ad.removeAllListeners();
        ad.destroy();
      } catch {
        // Already released.
      }
    });

    appOpen = handle;
    ad.load();
  });
}

/**
 * Shows the preloaded app open ad, if showing one is appropriate right now.
 *
 * @param backgroundedForMs How long the app spent in the background. A glance
 *   at another app is not a new session, and being interrupted by an ad for it
 *   is what makes this format infuriating.
 * @returns Whether an ad was shown.
 */
export async function maybeShowAppOpenAd(backgroundedForMs: number): Promise<boolean> {
  const mod = ads();
  if (!mod) return false;
  if (adOnScreen) return false;
  if (backgroundedForMs < APP_OPEN_MIN_BACKGROUND_MS) return false;
  if (Date.now() - appOpenLastShownAt < APP_OPEN_MIN_GAP_MS) return false;

  const handle = appOpen;
  if (!handle?.ready) {
    // Nothing in hand: get one ready for next time instead of showing a
    // loading screen now.
    preloadAppOpenAd();
    return false;
  }
  if (Date.now() - handle.loadedAt >= APP_OPEN_MAX_AGE_MS) {
    appOpen = null;
    preloadAppOpenAd();
    return false;
  }

  const { AdEventType } = mod;
  appOpen = null;
  adOnScreen = true;
  appOpenLastShownAt = Date.now();

  const released = new Promise<void>((resolve) => {
    handle.ad.addAdEventListener(AdEventType.CLOSED, () => resolve());
  });

  try {
    await handle.ad.show();
    await released;
    return true;
  } catch {
    return false;
  } finally {
    adOnScreen = false;
    try {
      handle.ad.removeAllListeners();
      handle.ad.destroy();
    } catch {
      // Already released.
    }
    // Have the next one ready well before it is needed.
    preloadAppOpenAd();
  }
}
