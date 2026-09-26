// WhatsApp Business Cloud API. Messages are sent in the background and every attempt is logged in notification_logs.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { db } from '../db/index.js';
import { config, whatsappConfigured } from '../config.js';
import { getSetting } from './settings.js';
import { log } from '../lib/logger.js';

export const WA_EVENTS = ['order_received', 'payment_success', 'order_confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled', 'refund_processed'];
export const render = (body, vars) => String(body).replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => vars[k] ?? '');

/** Queues a WhatsApp message for an order event. Never throws: failures are logged and visible in the admin. */
export function sendOrderMessage(event, order, vars) {
  const s = getSetting('notifications');
  const tpl = s.templates?.[event];
  const to = '91' + String(order.customer_phone).replace(/\D/g, '').slice(-10);
  const body = tpl ? render(tpl.body, vars) : '';
  const logRow = (status, error = '') => db.prepare('INSERT INTO notification_logs (channel, event, recipient, order_id, body, status, error) VALUES (?,?,?,?,?,?,?)')
    .run('whatsapp', event, to, order.id, body, status, error).lastInsertRowid;
  if (!s.whatsapp_enabled || !tpl?.enabled) return;
  if (!whatsappConfigured()) { logRow('skipped', 'WhatsApp API keys are not configured'); return; }
  const id = logRow('queued');
  deliver(id, to, tpl, body, vars).catch(e => log.error('whatsapp send crashed', { error: e.message }));
}

async function deliver(logId, to, tpl, body, vars) {
  // Approved templates are required to message customers outside a 24-hour chat window; plain text works inside it.
  const payload = tpl.template_name
    ? { messaging_product: 'whatsapp', to, type: 'template', template: { name: tpl.template_name, language: { code: tpl.language || 'en' },
        components: [{ type: 'body', parameters: templateParams(tpl.body, vars).map(t => ({ type: 'text', text: String(t) })) }] } }
    : { messaging_product: 'whatsapp', to, type: 'text', text: { preview_url: true, body } };
  try {
    const r = await fetch(`${config.whatsapp.apiBase}/${config.whatsapp.phoneNumberId}/messages`, {
      method: 'POST', headers: { Authorization: `Bearer ${config.whatsapp.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000)
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.error?.message || `HTTP ${r.status}`);
    db.prepare("UPDATE notification_logs SET status='sent', provider_message_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(data?.messages?.[0]?.id || null, logId);
  } catch (e) {
    db.prepare("UPDATE notification_logs SET status='failed', error=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(String(e.message).slice(0, 300), logId);
    log.warn('whatsapp send failed', { logId, error: e.message });
  }
}
/** Template parameters follow the order of {{placeholders}} in the configured body. */
const templateParams = (body, vars) => [...String(body).matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map(m => vars[m[1]] ?? '');

export function verifyWebhookSignature(rawBody, header) {
  if (!config.whatsapp.appSecret) return false;
  const expected = 'sha256=' + createHmac('sha256', config.whatsapp.appSecret).update(rawBody).digest('hex');
  const a = Buffer.from(String(header || '')), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
/** Applies delivery receipts (sent/delivered/read/failed) from Meta's webhook. */
export function applyStatusUpdates(payload) {
  let n = 0;
  for (const entry of payload?.entry || []) for (const ch of entry.changes || []) for (const st of ch.value?.statuses || []) {
    const map = { sent: 'sent', delivered: 'delivered', read: 'read', failed: 'failed' };
    if (!map[st.status]) continue;
    n += db.prepare('UPDATE notification_logs SET status=?, error=?, updated_at=CURRENT_TIMESTAMP WHERE provider_message_id=?')
      .run(map[st.status], st.errors?.[0]?.title || '', st.id).changes;
  }
  return n;
}
