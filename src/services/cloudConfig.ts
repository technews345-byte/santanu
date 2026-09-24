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

export const cloudProviders = {
  google: !!googleClientId,
};
