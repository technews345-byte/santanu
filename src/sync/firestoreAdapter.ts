import { collection, doc, getDocs, query, where, writeBatch, orderBy, limit } from 'firebase/firestore';
import { getFirestoreDb } from '../services/firebase';
import { SyncedTable } from '../db/syncStore';
import { RemoteAdapter } from './engine';
import { SyncRecord } from './merge';

// One document per row under the signed-in user, so security rules can scope
// every read and write to request.auth.uid and nothing is shared between
// accounts by construction.
const userPath = (uid: string, table: SyncedTable) => `users/${uid}/${table}`;

const PUSH_CHUNK = 400; // Firestore caps a batch at 500 writes.

export function createFirestoreAdapter(uid: string): RemoteAdapter {
  return {
    async pull(table, since) {
      const db = getFirestoreDb();
      const base = collection(db, userPath(uid, table));
      const q = since
        ? query(base, where('updatedAt', '>', since), orderBy('updatedAt', 'asc'), limit(2000))
        : query(base, orderBy('updatedAt', 'asc'), limit(2000));
      const snapshot = await getDocs(q);
      return snapshot.docs.map((d) => d.data() as SyncRecord);
    },

    async push(table, rows) {
      const db = getFirestoreDb();
      for (let i = 0; i < rows.length; i += PUSH_CHUNK) {
        const batch = writeBatch(db);
        for (const row of rows.slice(i, i + PUSH_CHUNK)) {
          // Writing under the row's own id is what keeps a retried push
          // idempotent: it overwrites, it never appends.
          batch.set(doc(db, userPath(uid, table), row.id), sanitise(row));
        }
        await batch.commit();
      }
    },
  };
}

// Firestore rejects undefined, and SQLite hands back integers for booleans.
function sanitise(row: SyncRecord): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = value === undefined ? null : value;
  }
  return out;
}
