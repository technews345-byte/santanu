import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { config, ROOT } from '../config.js';
import { log } from '../lib/logger.js';

fs.mkdirSync(path.dirname(config.dbFile), { recursive: true, mode: 0o700 });
export const db = new Database(config.dbFile);
// Only the app's own user may read the database (customer details, password hashes, sessions).
try { fs.chmodSync(config.dbFile, 0o600); } catch (e) { log.warn('could not restrict database file permissions', { error: e.message }); }
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

/** Applies every migration in src/db/migrations that has not run yet, in filename order. */
export function migrate() {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT DEFAULT CURRENT_TIMESTAMP)');
  const done = new Set(db.prepare('SELECT version FROM schema_migrations').all().map(r => r.version));
  const dir = path.join(ROOT, 'src', 'db', 'migrations');
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
    if (done.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(file);
    })();
    log.info('migration applied', { file });
  }
}

export const tx = fn => db.transaction(fn);
export const json = (v, fallback = null) => { if (v == null || v === '') return fallback; try { return JSON.parse(v); } catch { return fallback; } };
