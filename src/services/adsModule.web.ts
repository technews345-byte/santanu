/**
 * Web has no Google Mobile Ads implementation, so it gets none. This file is
 * what Metro resolves for `./adsModule` on web, which keeps the native-only
 * package out of the web bundle entirely.
 */
export type AdsModule = typeof import('react-native-google-mobile-ads');

export function loadAdsModule(): AdsModule | null {
  return null;
}
