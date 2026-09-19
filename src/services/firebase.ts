import { FirebaseApp, initializeApp, getApps } from 'firebase/app';
import { Auth, getAuth, initializeAuth } from 'firebase/auth';
import { Firestore, initializeFirestore } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCloudConfig, isCloudConfigured } from './cloudConfig';

let app: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;

// Everything here is loaded lazily so an unconfigured build never touches the
// Firebase runtime at all.
function ensureApp(): FirebaseApp {
  if (!isCloudConfigured) throw new Error('Cloud sync is not configured');
  if (!app) {
    const existing = getApps();
    app = existing.length > 0 ? existing[0] : initializeApp(getCloudConfig());
  }
  return app;
}

export function getFirebaseAuth(): Auth {
  if (authInstance) return authInstance;
  const instance = ensureApp();
  try {
    // Keeps the session across restarts so the user is not asked to sign in
    // every launch.
    const { getReactNativePersistence } = require('firebase/auth') as {
      getReactNativePersistence?: (storage: unknown) => unknown;
    };
    authInstance = getReactNativePersistence
      ? initializeAuth(instance, { persistence: getReactNativePersistence(AsyncStorage) as never })
      : getAuth(instance);
  } catch {
    authInstance = getAuth(instance);
  }
  return authInstance;
}

export function getFirestoreDb(): Firestore {
  if (!dbInstance) {
    dbInstance = initializeFirestore(ensureApp(), {
      // The app is already offline-first through SQLite; long polling just
      // makes the connection survive flaky mobile networks.
      experimentalAutoDetectLongPolling: true,
    });
  }
  return dbInstance;
}
