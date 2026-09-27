// Online, consistent SQLite backup (safe while the server is running). Keeps the newest 30 files.
// Usage: npm run backup            (schedule it daily with cron / a systemd timer)
import { backupDatabase } from '../src/lib/backup.js';

const { file, removed } = await backupDatabase(30);
console.log(`Backup written: ${file}${removed ? ` (removed ${removed} old)` : ''}`);
