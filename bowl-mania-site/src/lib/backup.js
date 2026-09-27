// Online, consistent SQLite backup (safe while the server is running). Keeps the newest `keep` files.
import fs from 'node:fs';
import path from 'node:path';
import { db } from '../db/index.js';
import { ROOT, DATA_DIR } from '../config.js';

export const backupDir = () => process.env.BACKUP_DIR || path.join(DATA_DIR || ROOT, 'backups');

export async function backupDatabase(keep = 30) {
  const dir = backupDir();
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `bowl-mania-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
  await db.backup(file);
  const old = fs.readdirSync(dir).filter(f => f.startsWith('bowl-mania-') && f.endsWith('.db')).sort().reverse().slice(keep);
  old.forEach(f => fs.unlinkSync(path.join(dir, f)));
  return { file, removed: old.length };
}
