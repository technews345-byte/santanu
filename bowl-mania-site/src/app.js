import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import { config, ROOT } from './config.js';
import { log } from './lib/logger.js';
import { errorHandler, notFoundApi } from './middleware/errors.js';
import authRoutes from './routes/auth.js';
import publicRoutes, { webhooks } from './routes/public.js';
import adminRoutes from './routes/admin/index.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', 1);

  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'same-site' },
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'script-src': ["'self'", 'https://checkout.razorpay.com'],
        'style-src': ["'self'", 'https://fonts.googleapis.com', "'unsafe-inline'"],
        'font-src': ["'self'", 'https://fonts.gstatic.com'],
        'img-src': ["'self'", 'data:', 'blob:', 'https:'],
        'media-src': ["'self'", 'blob:'],
        'frame-src': ['https://api.razorpay.com', 'https://checkout.razorpay.com'],
        'connect-src': ["'self'", 'https://lumberjack.razorpay.com', 'https://api.razorpay.com'],
        'upgrade-insecure-requests': config.isProd ? [] : null
      }
    },
    hsts: config.isProd
  }));

  // Request log (skips static assets).
  app.use((req, res, next) => {
    const t = Date.now();
    res.on('finish', () => { if (req.path.startsWith('/api')) log.info('request', { m: req.method, p: req.path, s: res.statusCode, ms: Date.now() - t }); });
    next();
  });

  app.use('/api', webhooks);                       // raw bodies for signature checks
  app.use(express.json({ limit: '200kb' }));
  app.use(cookieParser());
  app.use('/api/auth', authRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api', publicRoutes);
  app.use('/api', notFoundApi);

  fs.mkdirSync(config.uploadsDir, { recursive: true });
  app.use('/uploads', express.static(config.uploadsDir, { maxAge: '30d', immutable: true, index: false }));
  const pub = path.join(ROOT, 'public');
  app.use(express.static(pub, { index: 'index.html', maxAge: config.isProd ? '1h' : 0 }));
  app.get(['/admin', '/admin/'], (req, res) => res.sendFile(path.join(pub, 'admin', 'index.html')));
  app.get('/track/:token', (req, res) => res.sendFile(path.join(pub, 'track.html')));
  app.get('/{*splat}', (req, res) => res.status(404).sendFile(path.join(pub, 'index.html')));
  app.use(errorHandler);
  return app;
}
