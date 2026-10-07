import { getDb } from './client';
import { nextOccurrence } from '../utils/recurrence';
import { RecurrenceInterval } from '../types';

let inFlight: Promise<void> | null = null;

/** Catch up on launch/resume. Deterministic IDs prevent duplicate occurrences on retry or sync. */
export function materializeRecurring(now = new Date()): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const db = await getDb();
    const nowIso = now.toISOString();
    await db.withTransactionAsync(async () => {
      const templates = await db.getAllAsync<{
        id: string; date: string; recurrence: RecurrenceInterval; nextOccurrence: string | null;
      }>("SELECT id, date, recurrence, nextOccurrence FROM transactions WHERE deletedAt IS NULL AND recurrence != 'none'");
      for (const template of templates) {
        let due = template.nextOccurrence ?? nextOccurrence(template.date, template.recurrence);
        // Bound work for very old daily series; the next refresh continues.
        let count = 0;
        while (due && due <= nowIso && count++ < 1000) {
          await db.runAsync(
            `INSERT OR IGNORE INTO transactions
             (id, type, amount, currency, accountId, toAccountId, categoryId, note, date,
              attachments, recurrence, nextOccurrence, createdAt, updatedAt, dirty, deletedAt)
             SELECT ?, type, amount, currency, accountId, toAccountId, categoryId, note, ?,
                    '[]', 'none', NULL, ?, ?, 1, NULL
             FROM transactions WHERE id = ? AND deletedAt IS NULL`,
            [`repeat:${template.id}:${due}`, due, nowIso, nowIso, template.id]
          );
          due = nextOccurrence(due, template.recurrence, template.date);
        }
        if (due !== template.nextOccurrence) {
          await db.runAsync(
            'UPDATE transactions SET nextOccurrence = ?, updatedAt = ?, dirty = 1 WHERE id = ? AND deletedAt IS NULL',
            [due, nowIso, template.id]
          );
        }
      }
    });
  })().finally(() => { inFlight = null; });
  return inFlight;
}
