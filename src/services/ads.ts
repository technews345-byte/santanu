import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { AdsModule, loadAdsModule } from './adsModule';

/**
 * Google Mobile Ads: one banner unit and one interstitial unit.
 *
 * The app ID lives in app.json, where the config plugin writes it into the
 * generated Android manifest; the unit IDs are under `extra.ads`. Every ad
 * unit must belong to that app ID or AdMob serves nothing.
 */

/**
 * The module is resolved lazily and defensively, and remembered either way:
 * it is a native module with no web implementation, and Expo Go ships no
 * AdMob code, so an unsupported environment simply has no ads.
 */
let cached: AdsModule | null | undefined;

export function ads(): AdsModule | null {
  if (cached !== undefined) return cached;
  const unsupported =
    Platform.OS === 'web' || Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
  cached = unsupported ? null : loadAdsModule();
  return cached;
}

type AdsConfig = { androidBannerUnitId?: string; androidInterstitialUnitId?: string };
const configured: AdsConfig = (Constants.expoConfig?.extra as any)?.ads ?? {};

/**
 * Google's test units in development and on iOS (no iOS units yet); the real
 * ones in an Android release build. Requesting a real unit from a debug build
 * counts as invalid traffic against the account.
 */
function unitId(real: string | undefined, test: string): string {
  return __DEV__ || Platform.OS !== 'android' || !real ? test : real;
}

export function bannerUnitId(mod: AdsModule): string {
  return unitId(configured.androidBannerUnitId, mod.TestIds.ADAPTIVE_BANNER);
}

/**
 * The SDK is initialized once before any ad is requested. Kept as the promise
 * so callers racing to load an ad share one initialization.
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
      // reports the real problem, and ads are never the point of a screen.
      .catch(() => undefined);
  }
  return initialization;
}

/**
 * Interstitials appear only at a natural break — after a transaction is
 * saved — and at most once every few minutes, so they never interrupt work
 * in progress (Google's policy also rules them out on app launch).
 */
const INTERSTITIAL_GAP_MS = 3 * 60 * 1000;
let lastInterstitialAt = 0;

type Interstitial = ReturnType<AdsModule['InterstitialAd']['createForAdRequest']>;
let ready: Interstitial | null = null;
let loading = false;

/** Loads an interstitial now so one is in hand when the next break comes. */
export function preloadInterstitial(): void {
  const mod = ads();
  if (!mod || ready || loading) return;
  loading = true;
  initAds().then(() => {
    const ad = mod.InterstitialAd.createForAdRequest(
      unitId(configured.androidInterstitialUnitId, mod.TestIds.INTERSTITIAL)
    );
    const release = () => {
      try {
        ad.removeAllListeners();
      } catch {
        // Already released.
      }
    };
    ad.addAdEventListener(mod.AdEventType.LOADED, () => {
      loading = false;
      ready = ad;
    });
    ad.addAdEventListener(mod.AdEventType.ERROR, () => {
      // No fill or no network; the next break tries again.
      loading = false;
      release();
    });
    ad.addAdEventListener(mod.AdEventType.CLOSED, () => {
      lastInterstitialAt = Date.now();
      release();
      preloadInterstitial();
    });
    ad.load();
  });
}

/** Shows the loaded interstitial if the gap since the last one has passed. */
export function showInterstitialAtBreak(): void {
  if (!ready) {
    preloadInterstitial();
    return;
  }
  if (Date.now() - lastInterstitialAt < INTERSTITIAL_GAP_MS) return;
  const ad = ready;
  ready = null;
  // Counted from the moment it shows, so a failed show is not retried at once.
  lastInterstitialAt = Date.now();
  ad.show().catch(() => preloadInterstitial());
}
