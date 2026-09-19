import Constants from 'expo-constants';

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

export const cloudProviders = {
  google: !!(config.googleWebClientId || config.googleAndroidClientId),
  facebook: !!config.facebookAppId,
  // Phone verification needs no extra client id, only the provider enabled
  // in the Firebase console.
  phone: isCloudConfigured,
};
