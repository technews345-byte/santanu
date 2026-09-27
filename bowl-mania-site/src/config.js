import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = process.env;
const isProd = env.NODE_ENV === 'production';

function required(name, fallback) {
  const v = env[name];
  if (v) return v;
  if (isProd) throw new Error(`Missing required environment variable ${name}. See .env.example.`);
  return fallback;
}

// On Railway, keep the database and uploads on the attached volume and use the generated domain,
// so a new deploy never loses data and links work without extra settings.
const onRailway = !!env.RAILWAY_ENVIRONMENT_NAME || !!env.RAILWAY_ENVIRONMENT;
export const DATA_DIR = env.RAILWAY_VOLUME_MOUNT_PATH || '';
const defaultPublicUrl = env.RAILWAY_PUBLIC_DOMAIN ? `https://${env.RAILWAY_PUBLIC_DOMAIN}` : `http://localhost:${env.PORT || 3000}`;

// JWT_SECRET should be set in the environment. If it is missing in production, generate a strong one once
// and keep it next to the database, so sign-ins survive restarts instead of the app refusing to start.
function jwtSecret(dbFile) {
  if (env.JWT_SECRET) return env.JWT_SECRET;
  if (!isProd) return 'dev-only-jwt-secret-change-me';
  const file = path.join(path.dirname(dbFile), '.jwt-secret');
  try { return fs.readFileSync(file, 'utf8').trim(); } catch {}
  const secret = crypto.randomBytes(48).toString('base64url');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, secret, { mode: 0o600 });
  console.warn(`JWT_SECRET is not set: generated one and saved it in ${file}. Set JWT_SECRET to manage it yourself.`);
  return secret;
}
const dbFile = env.DATABASE_FILE || (DATA_DIR ? path.join(DATA_DIR, 'bowl-mania.db') : path.join(ROOT, 'data', 'bowl-mania.db'));

export const config = {
  isProd,
  port: Number(env.PORT || 3000),
  publicUrl: (env.PUBLIC_URL || defaultPublicUrl).replace(/\/$/, ''),
  dbFile,
  uploadsDir: env.UPLOADS_DIR || path.join(DATA_DIR || ROOT, 'uploads'),
  trustProxy: env.TRUST_PROXY ? env.TRUST_PROXY === '1' : onRailway,
  jwtSecret: jwtSecret(dbFile),
  accessTtlMin: Number(env.ACCESS_TOKEN_MINUTES || 15),
  refreshTtlDays: Number(env.REFRESH_TOKEN_DAYS || 30),
  seedAdmin: { email: env.ADMIN_EMAIL || '', password: env.ADMIN_PASSWORD || '', name: env.ADMIN_NAME || 'Owner' },
  razorpay: {
    keyId: env.RAZORPAY_KEY_ID || '',
    keySecret: env.RAZORPAY_KEY_SECRET || '',
    webhookSecret: env.RAZORPAY_WEBHOOK_SECRET || '',
    apiBase: (env.RAZORPAY_API_BASE || 'https://api.razorpay.com/v1').replace(/\/$/, '')
  },
  whatsapp: {
    token: env.WHATSAPP_ACCESS_TOKEN || '',
    phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID || '',
    verifyToken: env.WHATSAPP_VERIFY_TOKEN || '',
    appSecret: env.WHATSAPP_APP_SECRET || '',
    apiBase: (env.WHATSAPP_API_BASE || 'https://graph.facebook.com/v21.0').replace(/\/$/, '')
  },
  smtp: {
    host: env.SMTP_HOST || '', port: Number(env.SMTP_PORT || 587), user: env.SMTP_USER || '', pass: env.SMTP_PASS || '',
    from: env.SMTP_FROM || ''
  }
};

export const razorpayEnabled = () => !!(config.razorpay.keyId && config.razorpay.keySecret);
export const whatsappConfigured = () => !!(config.whatsapp.token && config.whatsapp.phoneNumberId);
