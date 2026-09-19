import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isCloudConfigured } from '../services/cloudConfig';
import type { AuthUser } from '../services/auth';
import type { SyncState } from '../sync/engine';
import { countPending, getMeta, setMeta } from '../db/syncStore';

const GUEST_ACK_KEY = 'auth:guestAcknowledged';
const LAST_SYNC_KEY = 'sync:lastCompletedAt';

interface AuthStoreState {
  ready: boolean;
  user: AuthUser | null;
  /** True once the person has chosen to keep using the app without an account. */
  guestAcknowledged: boolean;
  syncState: SyncState;
  syncError: string | null;
  pendingCount: number;
  lastSyncedAt: string | null;

  init: () => Promise<void>;
  continueAsGuest: () => Promise<void>;
  setUser: (user: AuthUser | null) => void;
  refreshPending: () => Promise<void>;
  syncNow: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthStoreState>((set, get) => ({
  ready: false,
  user: null,
  guestAcknowledged: false,
  syncState: 'idle',
  syncError: null,
  pendingCount: 0,
  lastSyncedAt: null,

  init: async () => {
    const [ack, lastSynced, pending] = await Promise.all([
      AsyncStorage.getItem(GUEST_ACK_KEY),
      getMeta(LAST_SYNC_KEY),
      countPending(),
    ]);
    set({ guestAcknowledged: ack === 'true', lastSyncedAt: lastSynced, pendingCount: pending });

    if (!isCloudConfigured) {
      set({ ready: true });
      return;
    }

    const { subscribeToAuth } = require('../services/auth') as typeof import('../services/auth');
    subscribeToAuth((user) => {
      set({ user, ready: true });
      if (user) get().syncNow();
    });
  },

  continueAsGuest: async () => {
    set({ guestAcknowledged: true });
    await AsyncStorage.setItem(GUEST_ACK_KEY, 'true');
  },

  setUser: (user) => set({ user }),

  refreshPending: async () => set({ pendingCount: await countPending() }),

  syncNow: async () => {
    const { user, syncState } = get();
    if (!isCloudConfigured || !user || syncState === 'syncing') return;

    set({ syncState: 'syncing', syncError: null });
    try {
      const { runSync } = require('../sync/engine') as typeof import('../sync/engine');
      const { createFirestoreAdapter } = require('../sync/firestoreAdapter') as typeof import('../sync/firestoreAdapter');
      await runSync(createFirestoreAdapter(user.uid));
      const now = new Date().toISOString();
      await setMeta(LAST_SYNC_KEY, now);
      set({ syncState: 'idle', lastSyncedAt: now, pendingCount: await countPending() });
    } catch (error: any) {
      // Nothing is lost here: the rows stay queued and the next attempt
      // picks them up, so this only affects what the indicator shows.
      const offline = /network|offline|unavailable/i.test(String(error?.message ?? error));
      set({
        syncState: offline ? 'offline' : 'error',
        syncError: offline ? null : String(error?.message ?? error),
        pendingCount: await countPending(),
      });
    }
  },

  signOut: async () => {
    if (!isCloudConfigured) return;
    const { signOut } = require('../services/auth') as typeof import('../services/auth');
    await signOut();
    set({ user: null, syncState: 'idle' });
  },
}));
