import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import { config, ROOT } from './config.js';
import { log } from './lib/logger.js';
import { errorHandler, notFoundApi } from './middleware/errors.js';
import { rateLimit } from './middleware/rateLimit.js';
import authRoutes from './routes/auth.js';
import publicRoutes, { webhooks } from './routes/public.js';
import adminRoutes from './routes/admin/index.js';
import riderRoutes from './routes/rider.js';

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
    hsts: config.isProd,
    // Send only the site origin to other sites: OpenStreetMap map tiles are refused without a Referer.
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
  }));

  // Request log (skips static assets).
  app.use((req, res, next) => {
    const t = Date.now();
    res.on('finish', () => { if (req.path.startsWith('/api')) log.info('request', { m: req.method, p: req.path, s: res.statusCode, ms: Date.now() - t }); });
    next();
  });

  // Turn off browser features the site never uses.
  app.use((req, res, next) => {
    res.set('Permissions-Policy', 'camera=(), microphone=(), usb=(), serial=(), bluetooth=(), payment=(self "https://checkout.razorpay.com" "https://api.razorpay.com"), geolocation=(self)');
    next();
  });

  app.use('/api', webhooks);                       // raw bodies for signature checks (not rate limited)
  // Overall ceiling per IP for the API; individual routes have tighter limits where it matters.
  app.use('/api', rateLimit({ windowMs: 60_000, max: Number(process.env.API_RATE_LIMIT_PER_MIN || 600) }));
  // Signed-in responses carry private data: never store them in browser or proxy caches.
  app.use(['/api/admin', '/api/auth', '/api/rider'], (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.use(express.json({ limit: '200kb' }));
  app.use(cookieParser());
  app.use('/api/auth', authRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/rider', riderRoutes);                // Bowl Mania Rider Android app (bearer tokens)
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
