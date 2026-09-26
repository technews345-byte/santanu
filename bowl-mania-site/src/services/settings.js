import { db, json } from '../db/index.js';

// Defaults double as the schema of each settings group. Secrets never live here; they stay in .env.
export const DEFAULTS = {
  restaurant: {
    name: 'Bowl Mania', tagline: 'Fresh like a new morning', logo: 'assets/logo.jpg',
    phone: '8099026415', whatsapp: '918099026415', email: '', address: 'Sonari & Nazira, Assam',
    instagram: 'https://www.instagram.com/bowlmaniasonarinazira', facebook: '', youtube: ''
  },
  business: {
    status_mode: 'auto', closed_message: 'We are closed right now. You can still place an order for the next delivery slot.',
    accept_preorders: true, min_order: 0, tax_percent: 0, currency: 'INR', timezone: 'Asia/Kolkata',
    prep_minutes: 20, delivery_minutes: 25, order_cutoff_minutes: 15
  },
  payments: { online_enabled: true, cod_enabled: true },
  notifications: {
    whatsapp_enabled: false, browser_sound: true,
    templates: {
      order_received: { enabled: true, template_name: '', language: 'en', body: 'Hello {{customer_name}},\nWe have received your Bowl Mania order {{order_id}}.\nAmount: ₹{{amount}}\nTrack your order: {{tracking_url}}' },
      payment_success: { enabled: true, template_name: '', language: 'en', body: 'Hello {{customer_name}}, your payment of ₹{{amount}} for order {{order_id}} was successful. Thank you!' },
      order_confirmed: { enabled: true, template_name: '', language: 'en', body: 'Hello {{customer_name}},\nYour Bowl Mania order {{order_id}} has been confirmed.\n\nAmount: ₹{{amount}}\n\nTrack your order:\n{{tracking_url}}\n\nThank you for choosing Bowl Mania ❤️' },
      preparing: { enabled: true, template_name: '', language: 'en', body: 'Your Bowl Mania order {{order_id}} is being prepared fresh right now 🥗' },
      ready: { enabled: true, template_name: '', language: 'en', body: 'Your Bowl Mania order {{order_id}} is ready{{pickup_note}}.' },
      out_for_delivery: { enabled: true, template_name: '', language: 'en', body: 'Your Bowl Mania order {{order_id}} is on the way with {{rider_name}} ({{rider_phone}}). Track: {{tracking_url}}' },
      delivered: { enabled: true, template_name: '', language: 'en', body: 'Your Bowl Mania order {{order_id}} has been delivered. Enjoy your bowl! Rate us: {{tracking_url}}' },
      cancelled: { enabled: true, template_name: '', language: 'en', body: 'Your Bowl Mania order {{order_id}} has been cancelled. If you paid online, the refund will be processed.' },
      refund_processed: { enabled: true, template_name: '', language: 'en', body: 'A refund of ₹{{refund_amount}} for Bowl Mania order {{order_id}} has been processed.' }
    }
  }
};

const cache = new Map();
export function getSetting(key) {
  if (cache.has(key)) return cache.get(key);
  const row = db.prepare('SELECT value FROM settings WHERE key=?').get(key);
  const stored = row ? json(row.value, {}) : {};
  const merged = mergeDeep(structuredClone(DEFAULTS[key] || {}), stored);
  cache.set(key, merged);
  return merged;
}
export function setSetting(key, value) {
  const merged = mergeDeep(getSetting(key) && structuredClone(getSetting(key)), value);
  db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP`).run(key, JSON.stringify(merged));
  cache.delete(key);
  return getSetting(key);
}
export const clearSettingsCache = () => cache.clear();
function mergeDeep(a, b) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return b ?? a;
  for (const [k, v] of Object.entries(b)) {
    a[k] = v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object' ? mergeDeep(a[k], v) : v;
  }
  return a;
}
