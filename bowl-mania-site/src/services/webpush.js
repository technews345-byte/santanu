// Web push notifications: staff devices get new orders and urgent alerts even when the admin panel is
// closed; customers can follow their own order's status. Keys are VAPID (no third-party account needed).
import webpush from 'web-push';
import { db } from '../db/index.js';
import { config, loadVapidKeys } from '../config.js';
import { log } from '../lib/logger.js';

let keys = null;
function ready() {
  if (!keys) {
    keys = loadVapidKeys(() => webpush.generateVAPIDKeys());
    const subject = config.publicUrl.startsWith('https://') ? config.publicUrl : 'mailto:support@bowlmania.in';
    webpush.setVapidDetails(subject, keys.publicKey, keys.privateKey);
  }
  return keys;
}
export const publicKey = () => ready().publicKey;

/** Admin notification types that are pushed to staff devices (the rest stay in the in-app notification center). */
const PUSHED = new Set(['new_order', 'order_cancelled', 'payment_failed', 'delivery_rejected', 'rider_emergency', 'inquiry']);
export const shouldPush = type => PUSHED.has(type);

async function send(sub, payload, table) {
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), { TTL: 3600, urgency: 'high' });
    if (table === 'admin_push_subscriptions') db.prepare('UPDATE admin_push_subscriptions SET last_used_at=CURRENT_TIMESTAMP WHERE id=?').run(sub.id);
  } catch (e) {
    // 404/410: the browser dropped the subscription (uninstalled, cleared data or turned alerts off).
    if (e.statusCode === 404 || e.statusCode === 410) db.prepare(`DELETE FROM ${table} WHERE id=?`).run(sub.id);
    else log.warn('push failed', { status: e.statusCode, error: String(e.message).slice(0, 200) });
  }
}

/** Pushes to every active staff member whose role has [permission]. Never throws. */
export function pushToStaff(permission, payload) {
  try {
    ready();
    const subs = db.prepare(`SELECT s.* FROM admin_push_subscriptions s JOIN admins a ON a.id=s.admin_id
      WHERE a.status='active' AND EXISTS (SELECT 1 FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id WHERE rp.role_id=a.role_id AND p.key=?)`).all(permission);
    for (const s of subs) send(s, payload, 'admin_push_subscriptions');
  } catch (e) { log.warn('push to staff failed', { error: e.message }); }
}

/** Pushes to one staff member's devices (used for the "send a test alert" button). */
export function pushToAdmin(adminId, payload) {
  try { ready(); for (const s of db.prepare('SELECT * FROM admin_push_subscriptions WHERE admin_id=?').all(adminId)) send(s, payload, 'admin_push_subscriptions'); }
  catch (e) { log.warn('push to admin failed', { error: e.message }); }
}

/** Pushes to the customer browsers following this order. Never throws. */
export function pushToOrder(orderId, payload) {
  try {
    ready();
    for (const s of db.prepare('SELECT * FROM order_push_subscriptions WHERE order_id=?').all(orderId)) send(s, payload, 'order_push_subscriptions');
  } catch (e) { log.warn('push to order failed', { error: e.message }); }
}

export function saveStaffSubscription(adminId, sub, userAgent = '') {
  ready();
  db.prepare(`INSERT INTO admin_push_subscriptions (admin_id, endpoint, p256dh, auth, user_agent) VALUES (?,?,?,?,?)
    ON CONFLICT(endpoint) DO UPDATE SET admin_id=excluded.admin_id, p256dh=excluded.p256dh, auth=excluded.auth, user_agent=excluded.user_agent`)
    .run(adminId, sub.endpoint, sub.keys.p256dh, sub.keys.auth, String(userAgent).slice(0, 200));
}
export function removeStaffSubscription(adminId, endpoint) {
  db.prepare('DELETE FROM admin_push_subscriptions WHERE admin_id=? AND endpoint=?').run(adminId, endpoint);
}
export function saveOrderSubscription(orderId, sub) {
  ready();
  db.prepare(`INSERT INTO order_push_subscriptions (order_id, endpoint, p256dh, auth) VALUES (?,?,?,?)
    ON CONFLICT(order_id, endpoint) DO UPDATE SET p256dh=excluded.p256dh, auth=excluded.auth`).run(orderId, sub.endpoint, sub.keys.p256dh, sub.keys.auth);
}
export function removeOrderSubscription(orderId, endpoint) {
  db.prepare('DELETE FROM order_push_subscriptions WHERE order_id=? AND endpoint=?').run(orderId, endpoint);
}
/** Customer subscriptions are only useful while an order is open; drop them a week after the order. */
export function cleanupOrderSubscriptions() {
  db.prepare("DELETE FROM order_push_subscriptions WHERE created_at < datetime('now','-7 days')").run();
}
