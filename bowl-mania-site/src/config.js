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

export const config = {
  isProd,
  port: Number(env.PORT || 3000),
  publicUrl: (env.PUBLIC_URL || `http://localhost:${env.PORT || 3000}`).replace(/\/$/, ''),
  dbFile: env.DATABASE_FILE || path.join(ROOT, 'data', 'bowl-mania.db'),
  uploadsDir: env.UPLOADS_DIR || path.join(ROOT, 'uploads'),
  trustProxy: env.TRUST_PROXY === '1',
  jwtSecret: required('JWT_SECRET', 'dev-only-jwt-secret-change-me'),
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
