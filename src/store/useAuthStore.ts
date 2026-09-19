import { create } from 'zustand';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { setSyncHandler } from '../sync/scheduler';
import { useStore } from './useStore';
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

    setSyncHandler(() => get().syncNow());

    // Anything queued while offline goes up as soon as there is a connection
    // again, without the user having to open or do anything.
    NetInfo.addEventListener((state) => {
      if (state.isConnected && get().user) get().syncNow();
    });

    AppState.addEventListener('change', (next) => {
      if (next === 'active' && get().user) get().syncNow();
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
      const { runSync, claimLocalDataFor } = require('../sync/engine') as typeof import('../sync/engine');
      const { createFirestoreAdapter } = require('../sync/firestoreAdapter') as typeof import('../sync/firestoreAdapter');

      // Guest rows are kept and uploaded; another account's rows are cleared
      // before anything is pulled or pushed.
      const transition = await claimLocalDataFor(user.uid);
      await runSync(createFirestoreAdapter(user.uid));
      if (transition === 'switched-account') await useStore.getState().hydrate();
      const now = new Date().toISOString();
      await setMeta(LAST_SYNC_KEY, now);
      set({ syncState: 'idle', lastSyncedAt: now, pendingCount: await countPending() });
      // Pulled rows have to reach the screens, not just the database.
      await useStore.getState().hydrate();
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
    // Push anything still queued before letting go, so signing out cannot
    // strand an expense that never reached the account.
    await get().syncNow();
    const { signOut } = require('../services/auth') as typeof import('../services/auth');
    const { releaseOwner } = require('../sync/engine') as typeof import('../sync/engine');
    await signOut();
    await releaseOwner();
    set({ user: null, syncState: 'idle' });
  },
}));
