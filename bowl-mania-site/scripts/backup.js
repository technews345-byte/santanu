// Online, consistent SQLite backup (safe while the server is running). Keeps the newest 30 files.
// Usage: npm run backup            (schedule it daily with cron / a systemd timer)
import fs from 'node:fs';
import path from 'node:path';
import { db } from '../src/db/index.js';
import { ROOT } from '../src/config.js';

const dir = process.env.BACKUP_DIR || path.join(ROOT, 'backups');
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, `bowl-mania-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
await db.backup(file);
const old = fs.readdirSync(dir).filter(f => f.startsWith('bowl-mania-') && f.endsWith('.db')).sort().reverse().slice(30);
old.forEach(f => fs.unlinkSync(path.join(dir, f)));
console.log(`Backup written: ${file}${old.length ? ` (removed ${old.length} old)` : ''}`);
