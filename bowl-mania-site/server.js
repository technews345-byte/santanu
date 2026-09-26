import { migrate } from './src/db/index.js';
import { seed } from './src/db/seed.js';
import { createApp } from './src/app.js';
import { config } from './src/config.js';
import { log } from './src/lib/logger.js';

migrate();
await seed();
const app = createApp();
const server = app.listen(config.port, () => log.info('Bowl Mania running', { url: config.publicUrl, port: config.port }));

process.on('unhandledRejection', e => log.error('unhandled rejection', { error: e?.message }));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { log.info('shutting down'); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 5000).unref(); });
