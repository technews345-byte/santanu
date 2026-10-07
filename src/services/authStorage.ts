import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';

const options = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
type Manifest = { generation: string; count: number };
const queues = new Map<string, Promise<unknown>>();

function serial<T>(key: string, task: () => Promise<T>): Promise<T> {
  const run = (queues.get(key) ?? Promise.resolve()).catch(() => {}).then(task);
  queues.set(key, run);
  void run.finally(() => { if (queues.get(key) === run) queues.delete(key); }).catch(() => {});
  return run;
}

async function storageKey(key: string) {
  return 'firebase.' + await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, key);
}

async function manifest(key: string): Promise<Manifest | null> {
  const value = await SecureStore.getItemAsync(key, options);
  if (!value) return null;
  const parsed = JSON.parse(value);
  if (!/^[a-zA-Z0-9-]+$/.test(parsed.generation) || !Number.isInteger(parsed.count) || parsed.count < 1 || parsed.count > 1000) {
    throw new Error('Invalid secure session metadata');
  }
  return parsed;
}

async function discard(key: string, old: Manifest | null) {
  if (!old) return;
  await Promise.all(Array.from({ length: old.count }, (_, i) =>
    SecureStore.deleteItemAsync(`${key}.${old.generation}.${i}`, options).catch(() => {})));
}

async function write(key: string, value: string) {
  const old = await manifest(key);
  // At most 1600 UTF-8 bytes per item, including non-ASCII profile names.
  const points = Array.from(value);
  const next = { generation: Crypto.randomUUID(), count: Math.max(1, Math.ceil(points.length / 400)) };
  if (next.count > 1000) throw new Error('Session is too large');
  try {
    for (let i = 0; i < next.count; i++) {
      await SecureStore.setItemAsync(`${key}.${next.generation}.${i}`, points.slice(i * 400, (i + 1) * 400).join(''), options);
    }
    // Publish only after every chunk exists, leaving the previous token intact on failure.
    await SecureStore.setItemAsync(key, JSON.stringify(next), options);
  } catch (error) {
    await discard(key, next);
    throw error;
  }
  await discard(key, old);
}

/** Native Firebase sessions use Keychain/Keystore; migrate old AsyncStorage sessions once. */
export const authStorage = {
  getItem: (key: string): Promise<string | null> => serial(key, async () => {
    if (Platform.OS === 'web') return AsyncStorage.getItem(key);
    const secureKey = await storageKey(key);
    const saved = await manifest(secureKey);
    if (saved) {
      const chunks = await Promise.all(Array.from({ length: saved.count }, (_, i) =>
        SecureStore.getItemAsync(`${secureKey}.${saved.generation}.${i}`, options)));
      if (chunks.some((chunk) => chunk === null)) throw new Error('Incomplete secure session');
      return chunks.join('');
    }
    const legacy = await AsyncStorage.getItem(key);
    if (legacy !== null) {
      await write(secureKey, legacy);
      await AsyncStorage.removeItem(key);
    }
    return legacy;
  }),
  setItem: (key: string, value: string): Promise<void> => serial(key, async () => {
    if (Platform.OS === 'web') return AsyncStorage.setItem(key, value);
    await write(await storageKey(key), value);
    await AsyncStorage.removeItem(key);
  }),
  removeItem: (key: string): Promise<void> => serial(key, async () => {
    await AsyncStorage.removeItem(key);
    if (Platform.OS === 'web') return;
    const secureKey = await storageKey(key);
    const saved = await manifest(secureKey);
    await SecureStore.deleteItemAsync(secureKey, options);
    await discard(secureKey, saved);
  }),
};
