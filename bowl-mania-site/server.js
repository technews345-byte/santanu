import { migrate } from './src/db/index.js';
import { seed } from './src/db/seed.js';
import { createApp } from './src/app.js';
import { config } from './src/config.js';
import { backupDatabase } from './src/lib/backup.js';
import { log } from './src/lib/logger.js';

if ((process.env.RAILWAY_ENVIRONMENT_NAME || process.env.RAILWAY_ENVIRONMENT) && !process.env.RAILWAY_VOLUME_MOUNT_PATH && !process.env.DATABASE_FILE)
  log.warn('No Railway volume attached: the database and uploaded photos will be lost on the next deploy. Attach a volume to this service.');

migrate();
await seed();
const app = createApp();
const server = app.listen(config.port, () => log.info('Bowl Mania running', { url: config.publicUrl, port: config.port }));

// Hosts without cron (e.g. Railway): set AUTO_BACKUP_HOURS to back up the database on a timer.
const every = Number(process.env.AUTO_BACKUP_HOURS || 0);
if (every > 0) {
  const run = () => backupDatabase(14).then(r => log.info('database backup written', r)).catch(e => log.error('database backup failed', { error: e.message }));
  setTimeout(run, 60_000).unref();
  setInterval(run, every * 3_600_000).unref();
}

process.on('unhandledRejection', e => log.error('unhandled rejection', { error: e?.message }));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { log.info('shutting down'); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 5000).unref(); });
