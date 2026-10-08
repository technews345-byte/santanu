import { assertRecord } from '../security/validation';
import { collection, doc, getDocs, query, writeBatch, orderBy, limit, startAfter, documentId, QueryConstraint } from 'firebase/firestore';
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
    async pull(table, _since) {
      const db = getFirestoreDb();
      const base = collection(db, userPath(uid, table));
      // updatedAt is a device clock, not a server watermark. A late upload
      // can be older than our cursor. Page the full collection by document
      // ID so offline edits and equal-timestamp page boundaries are not lost.
      const rows: SyncRecord[] = [];
      let cursor: string | null = null;
      for (;;) {
        const constraints: QueryConstraint[] = [orderBy(documentId()), limit(2000)];
        if (cursor !== null) constraints.push(startAfter(cursor));
        const snapshot = await getDocs(query(base, ...constraints));
        for (const document of snapshot.docs) {
          const row = document.data() as SyncRecord;
          if (row.id !== document.id) throw new Error('Cloud record ID does not match its path');
          assertRecord(table, row, true);
          rows.push(row);
        }
        if (snapshot.docs.length < 2000) return rows;
        cursor = snapshot.docs[snapshot.docs.length - 1].id;
      }
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
