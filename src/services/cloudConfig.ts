import Constants from 'expo-constants';
import { Platform } from 'react-native';

export interface CloudConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  /** OAuth client ids, needed only for the providers you enable. */
  googleWebClientId?: string;
  googleAndroidClientId?: string;
  googleIosClientId?: string;
  facebookAppId?: string;
}

const REQUIRED: (keyof CloudConfig)[] = ['apiKey', 'authDomain', 'projectId', 'appId'];

function read(): Partial<CloudConfig> {
  const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>;
  return (extra.firebase as Partial<CloudConfig>) ?? {};
}

const config = read();

/**
 * Cloud sync is opt-in: with no Firebase config the app runs exactly as it
 * always has, entirely on-device, and no auth or network code is reached.
 *
 * These values are not secrets. A Firebase web config is shipped in every
 * client by design; what actually protects an account's data is the server's
 * security rules, which must check request.auth.uid on every document.
 */
export const isCloudConfigured = REQUIRED.every((key) => typeof config[key] === 'string' && config[key]);

export function getCloudConfig(): CloudConfig {
  if (!isCloudConfigured) throw new Error('Cloud sync is not configured for this build');
  return config as CloudConfig;
}

/**
 * Google issues a separate OAuth client per platform and refuses a redirect
 * that belongs to another one, so the build needs the id for the platform it
 * is running on. Expo's Google provider picks the id the same way.
 */
export const googleClientId = Platform.select({
  android: config.googleAndroidClientId,
  ios: config.googleIosClientId,
  default: config.googleWebClientId,
});

/**
 * On a native build Facebook sends its answer to fb<appId>://authorize, so the
 * app has to own that scheme or the login dialog opens and never comes back.
 * Declare it in app.json alongside the app id: "scheme": ["spendly", "fb<id>"].
 */
export function facebookSchemeRegistered(appId: string | undefined): boolean {
  if (!appId) return false;
  if (Platform.OS === 'web') return true;
  const declared = Constants.expoConfig?.scheme;
  const schemes = Array.isArray(declared) ? declared : declared ? [declared] : [];
  return schemes.includes(`fb${appId}`);
}

export const cloudProviders = {
  google: !!googleClientId,
  facebook: facebookSchemeRegistered(config.facebookAppId),
  // Phone verification needs no extra client id, only the provider enabled
  // in the Firebase console.
  phone: isCloudConfigured,
};
