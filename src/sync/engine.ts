import {
  SYNCED_TABLES,
  SyncedTable,
  applyRemote,
  markClean,
  readAll,
  readDirtyIds,
  getMeta,
  setMeta,
} from '../db/syncStore';
import { SyncRecord, planMerge } from './merge';

export interface RemoteAdapter {
  /** Rows changed since the cursor, tombstones included. */
  pull(table: SyncedTable, since: string | null): Promise<SyncRecord[]>;
  push(table: SyncedTable, rows: SyncRecord[]): Promise<void>;
}

export type SyncState = 'idle' | 'syncing' | 'offline' | 'error';

const OWNER_KEY = 'sync:ownerUid';

export type OwnerTransition = 'first-sign-in' | 'same-account' | 'switched-account';

/**
 * Decides what the local database means for the account now signing in.
 *
 * Rows created before any sign-in are that person's own, so they are kept and
 * upload as a guest migration. Rows belonging to a *different* account must
 * not be kept: on a shared phone they would otherwise show up under the new
 * account, and get uploaded into it.
 */
export async function claimLocalDataFor(uid: string): Promise<OwnerTransition> {
  const previous = await getMeta(OWNER_KEY);
  await setMeta(OWNER_KEY, uid);

  if (!previous) return 'first-sign-in';
  if (previous === uid) return 'same-account';

  const { clearLocalData } = await import('../db/syncStore');
  await clearLocalData();
  await setMeta(OWNER_KEY, uid);
  return 'switched-account';
}

export async function releaseOwner(): Promise<void> {
  await setMeta(OWNER_KEY, '');
}

export interface SyncOutcome {
  pulled: number;
  pushed: number;
}

let inFlight: Promise<SyncOutcome> | null = null;

/**
 * Pull first, then push: a device that has been offline gets the account's
 * current state before deciding which of its own rows still need to go up.
 * Runs whole-table at a time and is safe to call repeatedly — an interrupted
 * run leaves rows dirty, so the next one simply retries them.
 */
export async function runSync(adapter: RemoteAdapter): Promise<SyncOutcome> {
  if (inFlight) return inFlight;

  inFlight = (async () => {
    let pulled = 0;
    let pushed = 0;

    for (const table of SYNCED_TABLES) {
      const cursorKey = `cursor:${table}`;
      const since = await getMeta(cursorKey);

      const remoteRows = await adapter.pull(table, since);
      const localRows = await readAll(table);
      const dirtyIds = await readDirtyIds(table);

      const plan = planMerge(localRows, remoteRows, dirtyIds);

      await applyRemote(table, plan.applyLocally);
      pulled += plan.applyLocally.length;

      if (plan.pushRemote.length > 0) {
        await adapter.push(table, plan.pushRemote);
        // Only cleared once the server has them, so a failed push is retried.
        await markClean(table, plan.pushRemote.map((r) => r.id));
        pushed += plan.pushRemote.length;
      }

      const newest = newestTimestamp(remoteRows, since);
      if (newest) await setMeta(cursorKey, newest);
    }

    return { pulled, pushed };
  })();

  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}

function newestTimestamp(rows: SyncRecord[], fallback: string | null): string | null {
  let newest = fallback;
  for (const row of rows) {
    if (!newest || row.updatedAt > newest) newest = row.updatedAt;
  }
  return newest;
}
