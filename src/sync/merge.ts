export interface SyncRecord {
  id: string;
  updatedAt: string;
  deletedAt?: string | null;
  [key: string]: unknown;
}

export type Resolution = 'remote' | 'local' | 'equal';

/**
 * Last write wins on updatedAt. On an exact tie a delete beats an edit, so a
 * row deleted on one device is never resurrected by another device that
 * happened to touch it in the same millisecond.
 */
export function resolve(local: SyncRecord | undefined, remote: SyncRecord): Resolution {
  if (!local) return 'remote';
  if (remote.updatedAt > local.updatedAt) return 'remote';
  if (remote.updatedAt < local.updatedAt) return 'local';
  const localDeleted = !!local.deletedAt;
  const remoteDeleted = !!remote.deletedAt;
  if (remoteDeleted && !localDeleted) return 'remote';
  if (localDeleted && !remoteDeleted) return 'local';
  return 'equal';
}

export interface MergePlan<T extends SyncRecord> {
  /** Remote rows that should overwrite (or create) the local copy. */
  applyLocally: T[];
  /** Local rows the remote has not caught up with yet. */
  pushRemote: T[];
}

/**
 * Records are keyed by a globally unique id generated at creation time, so the
 * same logical row converges on both devices and a retried push can never
 * create a second copy.
 */
export function planMerge<T extends SyncRecord>(localRows: T[], remoteRows: T[], dirtyIds: Set<string>): MergePlan<T> {
  const localById = new Map(localRows.map((r) => [r.id, r]));
  const applyLocally: T[] = [];
  const seenRemote = new Set<string>();

  for (const remote of remoteRows) {
    seenRemote.add(remote.id);
    const local = localById.get(remote.id);
    if (resolve(local, remote) === 'remote') applyLocally.push(remote);
  }

  const pushRemote: T[] = [];
  for (const local of localRows) {
    if (!dirtyIds.has(local.id)) continue;
    const remote = remoteRows.find((r) => r.id === local.id);
    // A dirty row still goes up when the remote copy is older or absent; if the
    // remote is newer it is about to overwrite us, so pushing would fight it.
    if (!remote || resolve(local, remote) !== 'remote') pushRemote.push(local);
  }

  return { applyLocally, pushRemote };
}

/**
 * A guest's local rows keep their ids when they first sign in, so signing in
 * twice, or on a device that already pulled the same rows, cannot duplicate
 * them. Anything the account already holds wins.
 */
export function planGuestMigration<T extends SyncRecord>(localRows: T[], accountRows: T[]): T[] {
  const existing = new Set(accountRows.map((r) => r.id));
  return localRows.filter((r) => !existing.has(r.id) && !r.deletedAt);
}
