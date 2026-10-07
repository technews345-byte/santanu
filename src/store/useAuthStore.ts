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
let syncTask: Promise<void> | null = null;
let sessionGeneration = 0;
let deletingAccount = false;

interface AuthStoreState {
  ready: boolean;
  switchingAccount: boolean;
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
  deleteAccount: () => Promise<void>;
}

export const useAuthStore = create<AuthStoreState>((set, get) => ({
  ready: false,
  switchingAccount: false,
  user: null,
  guestAcknowledged: false,
  syncState: 'idle',
  syncError: null,
  pendingCount: 0,
  lastSyncedAt: null,

  init: async () => {
    try {
      const [ack, lastSynced, pending] = await Promise.all([
        AsyncStorage.getItem(GUEST_ACK_KEY),
        getMeta(LAST_SYNC_KEY),
        countPending(),
      ]);
      set({ guestAcknowledged: ack === 'true', lastSyncedAt: lastSynced, pendingCount: pending });
    } catch {
      // Defaults stand: a reader that fails should not decide whether the app opens.
    }

    if (!isCloudConfigured) {
      set({ ready: true });
      return;
    }

    // The app waits on this before it draws, so nothing here may leave it
    // waiting for ever: if Firebase neither answers nor throws, carry on
    // signed out. A later answer still arrives and is honoured.
    const giveUpWaiting = setTimeout(() => set({ ready: true }), 5000);

    try {
      const { subscribeToAuth } = require('../services/auth') as typeof import('../services/auth');
      subscribeToAuth((user) => {
        clearTimeout(giveUpWaiting);
        if (get().user?.uid !== user?.uid) sessionGeneration++;
        set({ user, ready: true, switchingAccount: !!user });
        if (user) {
          // A new account waits for old work to finish before claiming SQLite.
          void (async () => {
            if (syncTask) await syncTask;
            if (get().user?.uid === user.uid) await get().syncNow();
          })();
        }
      });
    } catch {
      clearTimeout(giveUpWaiting);
      set({ ready: true });
      return;
    }

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
    if (deletingAccount) return;
    if (syncTask) return syncTask;
    const { user } = get();
    if (!isCloudConfigured || !user) return;
    const generation = sessionGeneration;
    const current = () => generation === sessionGeneration && get().user?.uid === user.uid;
    set({ syncState: 'syncing', syncError: null });
    syncTask = (async () => {
      try {
        const { runSync, claimLocalDataFor } = require('../sync/engine') as typeof import('../sync/engine');
        const { createFirestoreAdapter } = require('../sync/firestoreAdapter') as typeof import('../sync/firestoreAdapter');
        if (!current()) return;
        await claimLocalDataFor(user.uid);
        if (!current()) return;
        // Refresh before network access: an offline failure must not leave
        // another account's records visible under this account's identity.
        await useStore.getState().hydrate();
        if (!current()) return;
        set({ switchingAccount: false });
        await runSync(createFirestoreAdapter(user.uid), current);
        if (!current()) return;
        const now = new Date().toISOString();
        await setMeta(LAST_SYNC_KEY, now);
        set({ syncState: 'idle', lastSyncedAt: now, pendingCount: await countPending() });
        await useStore.getState().hydrate();
      } catch (error: any) {
        if (!current()) return;
        const offline = /network|offline|unavailable/i.test(String(error?.message ?? error));
        set({
          syncState: offline ? 'offline' : 'error',
          syncError: offline ? null : String(error?.message ?? error),
          pendingCount: await countPending().catch(() => get().pendingCount),
        });
      }
    })();
    try { await syncTask; } finally { syncTask = null; }
  },

  deleteAccount: async () => {
    if (deletingAccount) return;
    deletingAccount = true;
    sessionGeneration++;
    try {
      if (syncTask) await syncTask;
      const { deleteAccount } = require('../services/auth') as typeof import('../services/auth');
      await deleteAccount();
      set({ user: null, syncState: 'idle', switchingAccount: false });
    } finally {
      deletingAccount = false;
      set({ syncState: 'idle' });
    }
  },

  signOut: async () => {
    if (!isCloudConfigured) return;
    // Push anything still queued before letting go, so signing out cannot
    // strand an expense that never reached the account.
    await get().syncNow();
    const { signOut } = require('../services/auth') as typeof import('../services/auth');
    await signOut();
    // Keep the owner marker: signing out does not turn saved account data into guest data.
    sessionGeneration++;
    set({ user: null, syncState: 'idle', switchingAccount: false });
  },
}));
