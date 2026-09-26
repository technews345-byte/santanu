// Razorpay integration. The browser only ever sees the public key id and a Razorpay order id.
// A payment counts as paid only after a server-side signature check (checkout callback) or a signed webhook.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { db } from '../db/index.js';
import { config, razorpayEnabled } from '../config.js';
import { badRequest, conflict, HttpError } from '../lib/errors.js';
import { log } from '../lib/logger.js';
import { sqlNow } from '../lib/time.js';
import { getOrder, changeStatus } from './orders.js';
import { hooks } from './hooks.js';

async function rzp(path, { method = 'GET', body } = {}) {
  const auth = Buffer.from(`${config.razorpay.keyId}:${config.razorpay.keySecret}`).toString('base64');
  const r = await fetch(config.razorpay.apiBase + path, {
    method, headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15_000)
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new HttpError(502, data?.error?.description || `Payment provider error (${r.status}).`);
  return data;
}
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };

/** Creates the Razorpay order for an online order. On failure the order is cancelled so nothing is left half-made. */
export async function createPaymentOrder(order) {
  if (!razorpayEnabled()) throw badRequest('Online payment is not configured.');
  try {
    const ro = await rzp('/orders', { method: 'POST', body: { amount: order.total * 100, currency: 'INR', receipt: order.order_number, notes: { order_number: order.order_number } } });
    db.prepare("INSERT INTO payments (order_id, provider, razorpay_order_id, amount, status) VALUES (?, 'razorpay', ?, ?, 'created')").run(order.id, ro.id, order.total);
    return { key_id: config.razorpay.keyId, razorpay_order_id: ro.id, amount: ro.amount, currency: ro.currency };
  } catch (e) {
    db.transaction(() => {
      db.prepare("UPDATE orders SET status='cancelled', payment_status='failed', updated_at=CURRENT_TIMESTAMP WHERE id=?").run(order.id);
      db.prepare("INSERT INTO order_status_history (order_id, from_status, to_status, note, admin_name) VALUES (?, 'new', 'cancelled', 'Online payment could not be started', 'System')").run(order.id);
      db.prepare('DELETE FROM coupon_usage WHERE order_id=?').run(order.id);
    })();
    log.error('razorpay order create failed', { order: order.order_number, error: e.message });
    throw new HttpError(502, 'We could not start the online payment. Please try again or choose cash on delivery.');
  }
}

/** Marks a payment paid exactly once, no matter how many times verify/webhook report it. */
function markPaid(payment, { paymentId, method, amountPaise }) {
  const order = getOrder(payment.order_id);
  if (amountPaise != null && amountPaise !== payment.amount * 100) {
    log.error('payment amount mismatch', { order: order.order_number, expected: payment.amount * 100, got: amountPaise });
    db.prepare("UPDATE payments SET error='Amount mismatch — check in Razorpay', updated_at=CURRENT_TIMESTAMP WHERE id=?").run(payment.id);
    return { order, changed: false };
  }
  const changed = db.transaction(() => {
    const fresh = db.prepare('SELECT status FROM payments WHERE id=?').get(payment.id);
    if (fresh.status === 'paid') return false;
    db.prepare("UPDATE payments SET status='paid', razorpay_payment_id=COALESCE(?, razorpay_payment_id), method=COALESCE(NULLIF(?, ''), method), error='', paid_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?")
      .run(paymentId || null, method || '', payment.id);
    if (order.status === 'cancelled') {
      // Paid after the order was cancelled (e.g. a very late payment): keep it cancelled and flag it for a refund.
      db.prepare("UPDATE orders SET payment_status='paid', updated_at=CURRENT_TIMESTAMP WHERE id=?").run(order.id);
      return 'late';
    }
    db.prepare("UPDATE orders SET payment_status='paid', placed_at=COALESCE(placed_at, ?), updated_at=CURRENT_TIMESTAMP WHERE id=?").run(sqlNow(), order.id);
    db.prepare("INSERT INTO order_status_history (order_id, from_status, to_status, note, admin_name) VALUES (?, ?, ?, 'Payment confirmed', 'System')").run(order.id, order.status, order.status);
    return true;
  })();
  const updated = getOrder(order.id);
  if (changed === true) { hooks.orderPlaced(updated); hooks.paymentSucceeded(updated); }
  if (changed === 'late') hooks.paymentFailed(updated, 'Paid after cancellation — refund needed');
  return { order: updated, changed: !!changed };
}

/** Checkout callback: verifies razorpay_signature = HMAC_SHA256(order_id|payment_id, key_secret). */
export async function verifyCheckout({ razorpay_order_id, razorpay_payment_id, razorpay_signature }) {
  const payment = db.prepare("SELECT * FROM payments WHERE razorpay_order_id=?").get(String(razorpay_order_id || ''));
  if (!payment) throw badRequest('Payment not found.');
  const expected = createHmac('sha256', config.razorpay.keySecret).update(`${razorpay_order_id}|${razorpay_payment_id}`).digest('hex');
  if (!safeEq(expected, razorpay_signature)) {
    log.warn('razorpay signature mismatch', { razorpay_order_id });
    throw badRequest('We could not verify this payment. If money was deducted, it will be confirmed automatically or refunded.');
  }
  let method = '', amountPaise = null;
  try { const p = await rzp(`/payments/${encodeURIComponent(razorpay_payment_id)}`); method = p.method || ''; amountPaise = p.amount; }
  catch (e) { log.warn('could not fetch payment details', { error: e.message }); }
  return markPaid(payment, { paymentId: razorpay_payment_id, method, amountPaise });
}

export function markFailed(razorpayOrderId, reason) {
  const payment = db.prepare('SELECT * FROM payments WHERE razorpay_order_id=?').get(razorpayOrderId);
  if (!payment || payment.status === 'paid') return null;
  db.prepare("UPDATE payments SET status='failed', error=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(String(reason || '').slice(0, 300), payment.id);
  db.prepare("UPDATE orders SET payment_status='failed', updated_at=CURRENT_TIMESTAMP WHERE id=? AND payment_status<>'paid'").run(payment.order_id);
  const o = getOrder(payment.order_id);
  hooks.paymentFailed(o, reason);
  return o;
}

export const verifyWebhook = (rawBody, signature) =>
  !!config.razorpay.webhookSecret && safeEq(createHmac('sha256', config.razorpay.webhookSecret).update(rawBody).digest('hex'), signature || '');

/** Idempotent webhook processing keyed by Razorpay's event id. */
export function handleWebhook(eventId, payload) {
  const ins = db.prepare('INSERT OR IGNORE INTO webhook_events (provider, event_id, event, payload) VALUES (?,?,?,?)').run('razorpay', eventId, payload.event || '', JSON.stringify(payload));
  if (!ins.changes) {
    const prev = db.prepare("SELECT processed_at FROM webhook_events WHERE provider='razorpay' AND event_id=?").get(eventId);
    if (prev?.processed_at) return { duplicate: true };
  }
  try {
    const pe = payload.payload?.payment?.entity, re = payload.payload?.refund?.entity;
    if (['payment.captured', 'order.paid'].includes(payload.event) && pe) {
      const payment = db.prepare('SELECT * FROM payments WHERE razorpay_order_id=?').get(pe.order_id);
      if (payment) markPaid(payment, { paymentId: pe.id, method: pe.method, amountPaise: pe.amount });
    } else if (payload.event === 'payment.failed' && pe) {
      markFailed(pe.order_id, pe.error_description || 'Payment failed');
    } else if (['refund.processed', 'refund.failed'].includes(payload.event) && re) {
      const status = payload.event === 'refund.processed' ? 'processed' : 'failed';
      const r = db.prepare('SELECT * FROM refunds WHERE razorpay_refund_id=?').get(re.id);
      if (r && r.status !== status) {
        db.prepare('UPDATE refunds SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(status, r.id);
        if (status === 'processed') hooks.refundProcessed(getOrder(r.order_id), r.amount);
      }
    }
    db.prepare("UPDATE webhook_events SET processed_at=CURRENT_TIMESTAMP, error='' WHERE provider='razorpay' AND event_id=?").run(eventId);
    return { ok: true };
  } catch (e) {
    db.prepare("UPDATE webhook_events SET error=? WHERE provider='razorpay' AND event_id=?").run(e.message, eventId);
    throw e; // non-2xx makes Razorpay retry later
  }
}

/** Staff-triggered reconciliation: asks Razorpay for the order's payments and applies what it finds. */
export async function reconcile(orderId) {
  const payment = db.prepare("SELECT * FROM payments WHERE order_id=? AND provider='razorpay' ORDER BY id DESC").get(orderId);
  if (!payment) throw badRequest('This order has no online payment.');
  const list = await rzp(`/orders/${payment.razorpay_order_id}/payments`);
  const captured = (list.items || []).find(p => p.status === 'captured');
  if (captured) return { ...markPaid(payment, { paymentId: captured.id, method: captured.method, amountPaise: captured.amount }), found: 'captured' };
  const failed = (list.items || []).find(p => p.status === 'failed');
  if (failed) markFailed(payment.razorpay_order_id, failed.error_description);
  return { order: getOrder(orderId), found: failed ? 'failed' : 'none' };
}

export async function refund(orderId, amount, reason, admin) {
  const payment = db.prepare("SELECT * FROM payments WHERE order_id=? AND provider='razorpay' AND status IN ('paid','partially_refunded') ORDER BY id DESC").get(orderId);
  if (!payment) throw badRequest('Only paid online payments can be refunded here. Settle cash refunds in person.');
  const left = payment.amount - payment.refunded_amount;
  const amt = amount == null ? left : Math.round(amount);
  if (!(amt > 0) || amt > left) throw badRequest(`You can refund up to ₹${left}.`);
  const pending = db.prepare("SELECT COUNT(*) n FROM refunds WHERE payment_id=? AND status='pending'").get(payment.id).n;
  if (pending) throw conflict('A refund for this payment is already in progress.');
  const rf = await rzp(`/payments/${payment.razorpay_payment_id}/refund`, { method: 'POST', body: { amount: amt * 100, notes: { reason: String(reason || '').slice(0, 200) } } });
  const status = rf.status === 'processed' ? 'processed' : rf.status === 'failed' ? 'failed' : 'pending';
  db.transaction(() => {
    db.prepare('INSERT INTO refunds (payment_id, order_id, razorpay_refund_id, amount, status, reason, admin_id) VALUES (?,?,?,?,?,?,?)').run(payment.id, orderId, rf.id, amt, status, reason || '', admin?.id ?? null);
    const refunded = payment.refunded_amount + amt, full = refunded >= payment.amount;
    const ps = full ? 'refunded' : 'partially_refunded';
    db.prepare('UPDATE payments SET refunded_amount=?, status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(refunded, ps, payment.id);
    db.prepare('UPDATE orders SET payment_status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(ps, orderId);
  })();
  const o = getOrder(orderId);
  if (o.payment_status === 'refunded' && o.status !== 'refunded') changeStatus(orderId, 'refunded', { admin, note: `Refunded ₹${amt}`, force: true });
  if (status === 'processed') hooks.refundProcessed(o, amt);
  return getOrder(orderId);
}
