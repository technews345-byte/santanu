/**
 * The Google Mobile Ads module, resolved per platform.
 *
 * Metro follows every `require` string it can see, whether or not the code
 * runs: requiring the ads package from a file that also builds for web fails
 * the whole web bundle, because the package imports React Native's codegen
 * helpers, which are native-only. Keeping the require in this file and
 * shipping an `adsModule.web.ts` beside it means the web bundle never reaches
 * the package at all.
 */
export type AdsModule = typeof import('react-native-google-mobile-ads');

export function loadAdsModule(): AdsModule | null {
  try {
    return require('react-native-google-mobile-ads') as AdsModule;
  } catch {
    // Expo Go ships no AdMob native code, so the require throws there.
    return null;
  }
}
