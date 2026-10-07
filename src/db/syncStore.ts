import { getDb } from './client';
import { SyncRecord } from '../sync/merge';

export const SYNCED_TABLES = ['accounts', 'categories', 'transactions', 'budgets'] as const;
export type SyncedTable = (typeof SYNCED_TABLES)[number];

async function columnsOf(table: SyncedTable): Promise<string[]> {
  const db = await getDb();
  const info = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
  return info.map((c) => c.name);
}

/** Every row including tombstones — sync has to see deletions. */
export async function readAll(table: SyncedTable): Promise<SyncRecord[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(`SELECT * FROM ${table}`);
  return rows.map(({ dirty, ...rest }) => rest as SyncRecord);
}

export async function readDirtyIds(table: SyncedTable): Promise<Set<string>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ id: string }>(`SELECT id FROM ${table} WHERE dirty = 1`);
  return new Set(rows.map((r) => r.id));
}

/**
 * Writes rows that came from the server. They are stored clean: marking them
 * dirty would push them straight back and loop forever.
 */
export async function applyRemote(table: SyncedTable, rows: SyncRecord[], expected: SyncRecord[]): Promise<void> {
  if (rows.length === 0) return;
  const db = await getDb();
  const allowed = new Set(await columnsOf(table));
  const expectedById = new Map(expected.map((row) => [row.id, row]));

  for (const row of rows) {
    const keys = Object.keys(row).filter((k) => allowed.has(k) && k !== 'dirty');
    if (!keys.includes('id')) continue;
    const placeholders = keys.map(() => '?').join(', ');
    const values = keys.map((k) => normalise((row as any)[k]));
    const previous = expectedById.get(row.id);
    if (previous) {
      const compare = Object.keys(previous).filter((key) => allowed.has(key) && key !== 'dirty');
      // Do not overwrite a local edit made after the merge was planned.
      await db.runAsync(
        `UPDATE ${table} SET ${keys.map((key) => `${key} = ?`).join(', ')}, dirty = 0
         WHERE ${compare.map((key) => `${key} IS ?`).join(' AND ')}`,
        [...values, ...compare.map((key) => normalise(previous[key]))]
      );
    } else {
      // REPLACE would delete a different budget with the same category/month.
      await db.runAsync(
        `INSERT OR IGNORE INTO ${table} (${keys.join(', ')}, dirty) VALUES (${placeholders}, 0)`,
        values
      );
    }
  }
}

// SQLite takes no booleans, objects or undefined.
function normalise(value: unknown): any {
  if (value === undefined || value === null) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'object') return JSON.stringify(value);
  return value;
}

export async function markClean(table: SyncedTable, rows: SyncRecord[]): Promise<void> {
  if (rows.length === 0) return;
  const db = await getDb();
  const allowed = new Set(await columnsOf(table));
  for (const row of rows) {
    // Compare the uploaded snapshot, including same-millisecond edits and
    // tombstones. An edit made during the network request must stay pending.
    const keys = Object.keys(row).filter((key) => allowed.has(key) && key !== 'dirty');
    if (!keys.includes('id')) continue;
    await db.runAsync(
      `UPDATE ${table} SET dirty = 0 WHERE ${keys.map((key) => `${key} IS ?`).join(' AND ')}`,
      keys.map((key) => normalise(row[key]))
    );
  }
}

export async function countPending(): Promise<number> {
  const db = await getDb();
  let total = 0;
  for (const table of SYNCED_TABLES) {
    const row = await db.getFirstAsync<{ count: number }>(`SELECT COUNT(*) as count FROM ${table} WHERE dirty = 1`);
    total += row?.count ?? 0;
  }
  return total;
}

export async function getMeta(key: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM meta WHERE key = ?', [key]);
  return row?.value ?? null;
}

export async function setMeta(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', [key, value]);
}

/** Used when signing into a different account, so one user's rows never leak into another's. */
export async function clearLocalData(): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const table of SYNCED_TABLES) {
      await db.runAsync(`DELETE FROM ${table}`);
      await db.runAsync('DELETE FROM meta WHERE key = ?', [`cursor:${table}`]);
    }
  });
}
