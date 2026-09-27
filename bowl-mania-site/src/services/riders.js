// Rider (delivery partner) operations: the delivery workflow, OTPs, proof of delivery, live location,
// notifications and operational statistics. Riders are salaried employees: no pay, fees or incentives here.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { db } from '../db/index.js';
import { config } from '../config.js';
import { badRequest, conflict, notFound, forbidden, HttpError } from '../lib/errors.js';
import { token } from '../lib/ids.js';
import { localParts, localToDate, sqlNow } from '../lib/time.js';
import { emit } from '../lib/events.js';
import { getSetting } from './settings.js';
import { getOrder, changeStatus } from './orders.js';
import { haversineKm } from './delivery.js';
import { notifyAdmins } from './notifications.js';
import { pushToRider } from './push.js';

// ---------- Private files (proof photos, signatures, selfies, rider photos) ----------
const IMAGE = new Set(['image/jpeg', 'image/png', 'image/webp']);
/** Re-encodes an uploaded image (dropping EXIF and anything hidden in it) and stores it outside the public folders. */
export async function savePrivateImage(file, kind, { max = 1600, quality = 80, lossless = false } = {}) {
  if (!file?.buffer?.length) throw badRequest('Add a photo.');
  if (!IMAGE.has(file.mimetype)) throw badRequest('Use a JPEG, PNG or WebP image.');
  const img = sharp(file.buffer, { failOn: 'error' }).rotate();
  const meta = await img.metadata().catch(() => ({}));
  if (!meta.width || meta.width < 64 || meta.height < 64) throw badRequest('That image could not be read. Please take the photo again.');
  const dir = path.join(config.privateDir, kind, new Date().toISOString().slice(0, 7));
  await fs.mkdir(dir, { recursive: true });
  const name = `${kind}/${new Date().toISOString().slice(0, 7)}/${token(12)}.webp`;
  await img.resize({ width: max, height: max, fit: 'inside', withoutEnlargement: true }).webp(lossless ? { lossless: true } : { quality }).toFile(path.join(config.privateDir, name));
  return name;
}
/** Absolute path of a stored private file, or null for anything that is not one of ours. */
export function privatePath(name) {
  if (!/^(proof|signature|selfie|rider|support)\/\d{4}-\d{2}\/[\w-]{10,30}\.webp$/.test(String(name || ''))) return null;
  return path.join(config.privateDir, name);
}

// ---------- Notifications to riders ----------
export function notifyRider(adminId, { type, title, body = '', order_id = null, ticket_id = null }) {
  const id = db.prepare('INSERT INTO rider_notifications (admin_id, type, title, body, order_id, ticket_id) VALUES (?,?,?,?,?,?)')
    .run(adminId, type, title, body, order_id, ticket_id).lastInsertRowid;
  emit('rider_notification', { id, admin_id: adminId, type, order_id }, 'riders.view');
  pushToRider(adminId, { id, type, title, body, order_id, ticket_id }).catch(() => {});
  return id;
}

// ---------- Delivery workflow ----------
export const FLOW = ['assigned', 'accepted', 'to_restaurant', 'at_restaurant', 'picked_up', 'out_for_delivery', 'at_customer', 'otp_verified', 'delivered'];
export const ACTIVE = FLOW.filter(s => !['assigned', 'delivered'].includes(s));
export const STEP_LABEL = {
  assigned: 'Assigned', accepted: 'Accepted', to_restaurant: 'Going to restaurant', at_restaurant: 'Arrived at restaurant', picked_up: 'Picked up',
  out_for_delivery: 'Out for delivery', at_customer: 'Arrived at customer', otp_verified: 'Delivery OTP verified', delivered: 'Delivered'
};
const otp = () => String(crypto.randomInt(0, 10000)).padStart(4, '0');
const rank = s => FLOW.indexOf(s);

/** Creates or replaces a delivery assignment, with fresh OTPs, and tells the rider. */
export function assignDelivery(order, staff, by) {
  const prev = db.prepare('SELECT staff_id FROM delivery_assignments WHERE order_id=?').get(order.id);
  db.prepare(`INSERT INTO delivery_assignments (order_id, staff_id, pickup_otp, delivery_otp) VALUES (?,?,?,?)
    ON CONFLICT(order_id) DO UPDATE SET staff_id=excluded.staff_id, status='assigned', pickup_otp=excluded.pickup_otp, delivery_otp=excluded.delivery_otp,
      pickup_otp_attempts=0, delivery_otp_attempts=0, assigned_at=CURRENT_TIMESTAMP, accepted_at=NULL, started_at=NULL, arrived_restaurant_at=NULL, picked_up_at=NULL,
      out_at=NULL, arrived_customer_at=NULL, otp_verified_at=NULL, cash_collected_at=NULL, cash_collected_amount=NULL, proof_photo='', proof_signature='', proof_note='',
      proof_lat=NULL, proof_lng=NULL, proof_at=NULL, delivered_at=NULL, override_reason='', updated_at=CURRENT_TIMESTAMP`).run(order.id, staff.id, otp(), otp());
  logEvent(order.id, staff.id, 'assigned', { note: by ? `by ${by.name}` : '' });
  if (prev && prev.staff_id !== staff.id) notifyRider(prev.staff_id, { type: 'order_reassigned', title: `Order ${order.order_number} was reassigned`, body: 'It is no longer on your list.', order_id: order.id });
  const area = order.area_id ? db.prepare('SELECT name FROM delivery_areas WHERE id=?').get(order.area_id) : null;
  notifyRider(staff.id, { type: 'new_delivery', title: `New delivery ${order.order_number}`,
    body: `Pickup: ${getSetting('restaurant').name}${area ? ' ' + area.name : ''} · Deliver to: ${order.address || order.customer_name}`, order_id: order.id });
  emit('delivery_updated', { order_id: order.id, staff_id: staff.id, status: 'assigned' }, 'delivery.view');
}
export function unassignDelivery(order, reason = 'removed') {
  const d = db.prepare('SELECT staff_id FROM delivery_assignments WHERE order_id=?').get(order.id);
  if (!d) return;
  db.prepare('DELETE FROM delivery_assignments WHERE order_id=?').run(order.id);
  notifyRider(d.staff_id, { type: 'order_reassigned', title: `Order ${order.order_number} was ${reason}`, body: 'It is no longer on your list.', order_id: order.id });
}

function logEvent(orderId, staffId, step, { lat = null, lng = null, note = '', key = null } = {}) {
  db.prepare('INSERT INTO delivery_events (order_id, staff_id, step, lat, lng, note, idempotency_key) VALUES (?,?,?,?,?,?,?)').run(orderId, staffId, step, lat, lng, note, key);
}
const assignmentFor = orderId => db.prepare('SELECT * FROM delivery_assignments WHERE order_id=?').get(orderId);

/**
 * Runs one rider step. Steps are idempotent: repeating a step the server already recorded returns the
 * current state instead of failing, so a retry after a lost response is safe.
 */
export async function deliveryStep(rider, orderId, step, input = {}) {
  const rules = getSetting('riders');
  const o = getOrder(orderId); if (!o) throw notFound('Order not found.');
  const d = assignmentFor(o.id);
  if (!d || d.staff_id !== rider.id) throw forbidden('This delivery is not assigned to you.');
  if (input.key && db.prepare('SELECT 1 FROM delivery_events WHERE idempotency_key=?').get(`${rider.id}:${input.key}`)) return riderDelivery(o.id, rider.id);
  if (['cancelled', 'refunded'].includes(o.status)) throw conflict('This order was cancelled.');
  const at = { lat: numOrNull(input.lat), lng: numOrNull(input.lng) };
  const key = input.key ? `${rider.id}:${input.key}` : null;
  const move = (to, col, extra = '') => {
    db.prepare(`UPDATE delivery_assignments SET status=?, ${col}=COALESCE(${col}, CURRENT_TIMESTAMP)${extra}, updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(to, d.id);
    logEvent(o.id, rider.id, to, { ...at, key });
  };
  const done = target => rank(d.status) >= rank(target);
  const need = (...from) => { if (!from.includes(d.status)) throw conflict(`You can't do that now: this delivery is ${STEP_LABEL[d.status].toLowerCase()}.`); };

  switch (step) {
    case 'accept':
      if (done('accepted')) break;
      move('accepted', 'accepted_at');
      notifyAdmins({ type: 'delivery_accepted', title: `${rider.name} accepted ${o.order_number}`, link: `#/orders/${o.id}`, permission: 'delivery.view' });
      break;
    case 'start':
      if (done('to_restaurant')) break;
      need('accepted'); move('to_restaurant', 'started_at'); break;
    case 'arrive_restaurant':
      if (done('at_restaurant')) break;
      need('accepted', 'to_restaurant'); move('at_restaurant', 'arrived_restaurant_at'); break;
    case 'verify_pickup': {
      if (done('picked_up')) break;
      need('accepted', 'to_restaurant', 'at_restaurant');
      if (['new', 'confirmed', 'accepted'].includes(o.status)) throw conflict('The kitchen has not finished this order yet. Wait until it is being prepared or ready.');
      if (rules.require_pickup_otp) checkOtp(d, 'pickup', input.otp, rules.otp_max_attempts);
      if (o.status === 'preparing') changeStatus(o.id, 'ready', { note: `Handed to ${rider.name}` });
      move('picked_up', 'picked_up_at', ', arrived_restaurant_at=COALESCE(arrived_restaurant_at, CURRENT_TIMESTAMP)');
      break;
    }
    case 'start_delivery':
      if (done('out_for_delivery')) break;
      need('picked_up');
      changeStatus(o.id, 'out_for_delivery', { force: true, note: `Picked up by ${rider.name}` });
      move('out_for_delivery', 'out_at'); break;
    case 'arrive_customer':
      if (done('at_customer')) break;
      need('out_for_delivery'); move('at_customer', 'arrived_customer_at'); break;
    case 'verify_delivery':
      if (done('otp_verified')) break;
      need('out_for_delivery', 'at_customer');
      if (rules.require_delivery_otp) checkOtp(d, 'delivery', input.otp, rules.otp_max_attempts);
      move('otp_verified', 'otp_verified_at', ', arrived_customer_at=COALESCE(arrived_customer_at, CURRENT_TIMESTAMP)');
      break;
    case 'collect_cash': {
      if (d.cash_collected_at) break;
      need('out_for_delivery', 'at_customer', 'otp_verified');
      const due = cashDue(o);
      if (!due) throw badRequest('Nothing to collect: this order is paid.');
      db.prepare('UPDATE delivery_assignments SET cash_collected_at=CURRENT_TIMESTAMP, cash_collected_amount=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(due, d.id);
      logEvent(o.id, rider.id, 'cash_collected', { ...at, key, note: `₹${due}` });
      break;
    }
    case 'proof': {
      if (d.proof_at) break;
      need('out_for_delivery', 'at_customer', 'otp_verified');
      if (!input.photo && rules.require_proof_photo) throw badRequest('Take a delivery photo.');
      if (!input.signature && rules.require_signature) throw badRequest('Ask the customer to sign.');
      const photo = input.photo ? await savePrivateImage(input.photo, 'proof', { max: 1600, quality: 78 }) : '';
      const signature = input.signature ? await savePrivateImage(input.signature, 'signature', { max: 900, lossless: true }) : '';
      db.prepare('UPDATE delivery_assignments SET proof_photo=?, proof_signature=?, proof_note=?, proof_lat=?, proof_lng=?, proof_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?')
        .run(photo, signature, String(input.note || '').trim().slice(0, 500), at.lat, at.lng, d.id);
      logEvent(o.id, rider.id, 'proof', { ...at, key });
      break;
    }
    case 'deliver': {
      if (done('delivered')) break;
      if (rules.require_delivery_otp) need('otp_verified'); else need('out_for_delivery', 'at_customer', 'otp_verified');
      const fresh = assignmentFor(o.id);
      if (rules.require_proof_photo && !fresh.proof_photo) throw conflict('Submit the proof of delivery first.');
      if (rules.require_signature && !fresh.proof_signature) throw conflict('Get the customer signature first.');
      if (cashDue(o) && !fresh.cash_collected_at) throw conflict('Confirm the cash received first.');
      changeStatus(o.id, 'delivered', { force: true, note: `Delivered by ${rider.name}` });
      logEvent(o.id, rider.id, 'delivered', { ...at, key });
      break;
    }
    default: throw badRequest('Unknown step.');
  }
  emit('delivery_updated', { order_id: o.id, staff_id: rider.id, step }, 'delivery.view');
  return riderDelivery(o.id, rider.id);
}
const numOrNull = v => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v));

function checkOtp(d, kind, value, max) {
  const col = `${kind}_otp`, tries = `${kind}_otp_attempts`;
  if (d[tries] >= max) throw new HttpError(423, `Too many wrong codes. Ask the manager for a new ${kind} code.`);
  if (!/^\d{4}$/.test(String(value || ''))) throw badRequest('Enter the 4-digit code.');
  const ok = d[col] && crypto.timingSafeEqual(Buffer.from(String(value)), Buffer.from(d[col]));
  if (!ok) {
    db.prepare(`UPDATE delivery_assignments SET ${tries}=${tries}+1 WHERE id=?`).run(d.id);
    const left = max - d[tries] - 1;
    throw badRequest(left > 0 ? `Wrong code. ${left} ${left === 1 ? 'try' : 'tries'} left.` : `Wrong code. Ask the manager for a new ${kind} code.`);
  }
}
/** A manager issues a new OTP (resets attempts), e.g. after too many wrong entries. */
export function regenerateOtp(orderId, kind) {
  const d = assignmentFor(orderId); if (!d) throw badRequest('No delivery person is assigned.');
  db.prepare(`UPDATE delivery_assignments SET ${kind}_otp=?, ${kind}_otp_attempts=0, updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(otp(), d.id);
  return assignmentFor(orderId);
}
/** A manager completes pickup or delivery without OTP/proof (for example a customer who can't find their code). */
export function overrideStep(orderId, target, admin, reason) {
  const o = getOrder(orderId); if (!o) throw notFound('Order not found.');
  const d = assignmentFor(o.id); if (!d) throw badRequest('Assign a delivery person first.');
  if (['cancelled', 'refunded'].includes(o.status)) throw conflict('This order was cancelled.');
  const stamp = cols => cols.map(c => `${c}=COALESCE(${c}, CURRENT_TIMESTAMP)`).join(', ');
  if (target === 'picked_up') {
    if (rank(d.status) >= rank('picked_up')) return;
    if (['new', 'confirmed', 'accepted'].includes(o.status)) throw conflict('The kitchen has not finished this order yet.');
    if (o.status === 'preparing') changeStatus(o.id, 'ready', { admin });
    db.prepare(`UPDATE delivery_assignments SET status='picked_up', ${stamp(['accepted_at', 'picked_up_at'])}, override_reason=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(reason, d.id);
  } else if (target === 'out_for_delivery') {
    if (rank(d.status) >= rank('out_for_delivery')) return;
    if (['new', 'confirmed', 'accepted'].includes(o.status)) throw conflict('The kitchen has not finished this order yet.');
    changeStatus(o.id, 'out_for_delivery', { admin, force: true });
    db.prepare(`UPDATE delivery_assignments SET status='out_for_delivery', ${stamp(['accepted_at', 'picked_up_at', 'out_at'])}, override_reason=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(reason, d.id);
  } else if (target === 'delivered') {
    if (o.status === 'delivered') return;
    if (!['out_for_delivery', 'ready'].includes(o.status)) throw conflict('The order must be ready or out for delivery.');
    changeStatus(o.id, 'delivered', { admin, force: true });
    db.prepare(`UPDATE delivery_assignments SET override_reason=? WHERE id=?`).run(reason, d.id);
  } else throw badRequest('Unknown step.');
  logEvent(o.id, admin.id, target, { note: `Completed by ${admin.name}${reason ? ': ' + reason : ''}` });
  notifyRider(d.staff_id, { type: 'order_update', title: `${o.order_number}: ${STEP_LABEL[target].toLowerCase()} (by manager)`, body: reason, order_id: o.id });
}

/** Cash the rider must collect at the door. This is the customer's bill, not rider income. */
export const cashDue = o => (o.payment_method === 'cod' && o.payment_status !== 'paid' ? o.total : 0);

/** Rider rejects an assignment: it goes back to the managers to reassign. */
export function rejectDelivery(rider, orderId, reason) {
  const o = getOrder(orderId); if (!o) throw notFound('Order not found.');
  const d = assignmentFor(o.id);
  if (!d || d.staff_id !== rider.id) {
    // Already rejected (retry) or reassigned: nothing left to do.
    if (db.prepare('SELECT 1 FROM delivery_rejections WHERE order_id=? AND staff_id=?').get(o.id, rider.id)) return { ok: true };
    throw forbidden('This delivery is not assigned to you.');
  }
  if (d.status !== 'assigned') throw conflict('You already accepted this delivery. Call the manager if you can\'t do it.');
  db.transaction(() => {
    db.prepare('DELETE FROM delivery_assignments WHERE id=?').run(d.id);
    db.prepare('INSERT INTO delivery_rejections (order_id, staff_id, reason) VALUES (?,?,?)').run(o.id, rider.id, reason);
    logEvent(o.id, rider.id, 'rejected', { note: reason });
  })();
  notifyAdmins({ type: 'delivery_rejected', title: `${rider.name} rejected ${o.order_number}`, body: reason ? `Reason: ${reason}. Please reassign.` : 'Please reassign.', link: `#/orders/${o.id}`, permission: 'delivery.assign', data: { sound: true } });
  emit('delivery_updated', { order_id: o.id, staff_id: rider.id, status: 'rejected' }, 'delivery.view');
  return { ok: true };
}

// ---------- Rider-facing delivery view ----------
const DELIVERY_SQL = `SELECT o.*, d.id AS asg_id, d.status AS delivery_status, d.staff_id, d.assigned_at, d.accepted_at, d.started_at, d.arrived_restaurant_at, d.picked_up_at, d.out_at,
    d.arrived_customer_at, d.otp_verified_at, d.cash_collected_at, d.cash_collected_amount, d.proof_photo, d.proof_signature, d.proof_note, d.proof_at, d.delivered_at,
    d.pickup_otp_attempts, d.delivery_otp_attempts, a.name AS area_name, a.address AS area_address, a.phone AS area_phone, a.lat AS area_lat, a.lng AS area_lng, a.pickup_instructions
  FROM delivery_assignments d JOIN orders o ON o.id=d.order_id LEFT JOIN delivery_areas a ON a.id=o.area_id`;

export function shapeDelivery(r) {
  const rules = getSetting('riders'), rest = getSetting('restaurant');
  const due = cashDue(r);
  const status = r.status === 'cancelled' || r.status === 'refunded' ? 'cancelled' : r.delivery_status;
  const next = status === 'cancelled' ? [] : nextSteps(r, rules, due);
  return {
    order_id: r.id, order_number: r.order_number, order_status: r.status, status, status_label: status === 'cancelled' ? 'Cancelled' : STEP_LABEL[status], next,
    restaurant: { name: `${rest.name}${r.area_name ? ' ' + r.area_name : ''}`, address: r.area_address || rest.address, phone: r.area_phone || rest.phone,
      lat: r.area_lat, lng: r.area_lng, instructions: r.pickup_instructions || '' },
    customer: { name: r.customer_name, phone: r.customer_phone, address: r.address, landmark: r.landmark, lat: r.lat, lng: r.lng, instructions: r.notes || '' },
    items: db.prepare('SELECT name, size_label AS size, quantity FROM order_items WHERE order_id=? ORDER BY id').all(r.id),
    delivery_distance_km: r.distance_km, slot: r.slot_label ? { date: r.slot_date, label: r.slot_label, start: r.slot_start, end: r.slot_end } : null,
    payment: { method: r.payment_method, prepaid: r.payment_method === 'online' && ['paid', 'partially_refunded'].includes(r.payment_status), collect_amount: due || r.cash_collected_amount || 0,
      cash_collected: !!r.cash_collected_at, cash_collected_at: r.cash_collected_at },
    requirements: { pickup_otp: !!rules.require_pickup_otp, delivery_otp: !!rules.require_delivery_otp, proof_photo: !!rules.require_proof_photo, signature: !!rules.require_signature },
    proof: { submitted: !!r.proof_at, photo: !!r.proof_photo, signature: !!r.proof_signature, note: r.proof_note, at: r.proof_at },
    otp_attempts_left: { pickup: Math.max(0, rules.otp_max_attempts - r.pickup_otp_attempts), delivery: Math.max(0, rules.otp_max_attempts - r.delivery_otp_attempts) },
    times: { assigned: r.assigned_at, accepted: r.accepted_at, to_restaurant: r.started_at, at_restaurant: r.arrived_restaurant_at, picked_up: r.picked_up_at,
      out_for_delivery: r.out_at, at_customer: r.arrived_customer_at, otp_verified: r.otp_verified_at, delivered: r.delivered_at }
  };
}
function nextSteps(r, rules, due) {
  switch (r.delivery_status) {
    case 'assigned': return ['accept', 'reject'];
    case 'accepted': return ['start', 'arrive_restaurant'];
    case 'to_restaurant': return ['arrive_restaurant'];
    case 'at_restaurant': return ['verify_pickup'];
    case 'picked_up': return ['start_delivery'];
    case 'out_for_delivery': return ['arrive_customer'];
    case 'at_customer': case 'otp_verified': {
      const s = [];
      if (r.delivery_status === 'at_customer' && rules.require_delivery_otp) return ['verify_delivery'];
      if (due && !r.cash_collected_at) s.push('collect_cash');
      if (!r.proof_at) s.push('proof');
      if ((!due || r.cash_collected_at) && (r.proof_at || (!rules.require_proof_photo && !rules.require_signature))) s.push('deliver');
      return s;
    }
    default: return [];
  }
}
export function riderDelivery(orderId, riderId) {
  const r = db.prepare(`${DELIVERY_SQL} WHERE d.order_id=? AND d.staff_id=?`).get(orderId, riderId);
  if (!r) {
    const rej = db.prepare('SELECT 1 FROM delivery_rejections WHERE order_id=? AND staff_id=?').get(orderId, riderId);
    throw notFound(rej ? 'You rejected this delivery.' : 'This delivery is not assigned to you.');
  }
  return { ...shapeDelivery(r), timeline: db.prepare('SELECT step, note, created_at FROM delivery_events WHERE order_id=? ORDER BY id').all(orderId) };
}
export function riderDeliveries(riderId) {
  const rows = db.prepare(`${DELIVERY_SQL} WHERE d.staff_id=? AND ((d.status<>'delivered' AND o.status NOT IN ('cancelled','refunded','delivered','completed'))
      OR d.delivered_at >= datetime('now','-1 day') OR (o.status IN ('cancelled','refunded') AND o.updated_at >= datetime('now','-1 day')))
    ORDER BY o.slot_date, o.slot_start, o.id`).all(riderId).map(shapeDelivery);
  return {
    active: rows.filter(x => ACTIVE.includes(x.status)),
    new: rows.filter(x => x.status === 'assigned'),
    completed_today: rows.filter(x => x.status === 'delivered'),
    cancelled_today: rows.filter(x => x.status === 'cancelled')
  };
}
export function deliveryHistory(riderId, { status = 'all', from, to, page = 1, limit = 30 }) {
  const range = dayRange(from, to);
  const parts = [];
  if (status === 'all' || status === 'delivered') parts.push(`SELECT o.id AS order_id, o.order_number, 'delivered' AS status, d.delivered_at AS at, o.distance_km, o.address, a.name AS area_name
    FROM delivery_assignments d JOIN orders o ON o.id=d.order_id LEFT JOIN delivery_areas a ON a.id=o.area_id WHERE d.staff_id=@rid AND d.status='delivered' AND d.delivered_at BETWEEN @s AND @e`);
  if (status === 'all' || status === 'cancelled') parts.push(`SELECT o.id AS order_id, o.order_number, 'cancelled' AS status, o.updated_at AS at, o.distance_km, o.address, a.name AS area_name
    FROM delivery_assignments d JOIN orders o ON o.id=d.order_id LEFT JOIN delivery_areas a ON a.id=o.area_id WHERE d.staff_id=@rid AND o.status IN ('cancelled','refunded') AND o.updated_at BETWEEN @s AND @e`);
  if (status === 'all' || status === 'rejected') parts.push(`SELECT o.id AS order_id, o.order_number, 'rejected' AS status, r.created_at AS at, o.distance_km, o.address, a.name AS area_name
    FROM delivery_rejections r JOIN orders o ON o.id=r.order_id LEFT JOIN delivery_areas a ON a.id=o.area_id WHERE r.staff_id=@rid AND r.created_at BETWEEN @s AND @e`);
  const sql = parts.join(' UNION ALL ');
  const p = { rid: riderId, s: range.start, e: range.end };
  const total = db.prepare(`SELECT COUNT(*) n FROM (${sql})`).get(p).n;
  const rows = db.prepare(`SELECT * FROM (${sql}) ORDER BY at DESC LIMIT @limit OFFSET @offset`).all({ ...p, limit, offset: (page - 1) * limit });
  const rest = getSetting('restaurant').name;
  return { rows: rows.map(r => ({ ...r, pickup: `${rest}${r.area_name ? ' ' + r.area_name : ''}` })), total, page, limit };
}
/** UTC bounds for restaurant-local dates (defaults: last 30 days). */
export function dayRange(from, to) {
  const today = localParts().date;
  const f = from || new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10), t = to || today;
  return { start: sqlNow(localToDate(f, '00:00')), end: sqlNow(new Date(localToDate(t, '00:00').getTime() + 86_400_000 - 1000)), from: f, to: t };
}

// ---------- Online status and live location ----------
export const hasActiveDelivery = riderId => !!db.prepare(`SELECT 1 FROM delivery_assignments d JOIN orders o ON o.id=d.order_id
  WHERE d.staff_id=? AND d.status NOT IN ('assigned','delivered') AND o.status NOT IN ('cancelled','refunded','delivered','completed')`).get(riderId);
export function riderState(riderId) {
  return db.prepare('SELECT * FROM rider_state WHERE admin_id=?').get(riderId) || { admin_id: riderId, online: 0 };
}
export function setOnline(rider, online) {
  if (!online && hasActiveDelivery(rider.id)) throw conflict('Finish your active delivery before going offline.');
  db.prepare(`INSERT INTO rider_state (admin_id, online, online_since, updated_at) VALUES (?,?,CASE WHEN ? THEN CURRENT_TIMESTAMP END,CURRENT_TIMESTAMP)
    ON CONFLICT(admin_id) DO UPDATE SET online=excluded.online, online_since=CASE WHEN excluded.online AND NOT rider_state.online THEN CURRENT_TIMESTAMP WHEN excluded.online THEN rider_state.online_since END, updated_at=CURRENT_TIMESTAMP`)
    .run(rider.id, online ? 1 : 0, online ? 1 : 0);
  emit('rider_status', { admin_id: rider.id, name: rider.name, online: !!online }, 'riders.view');
  return riderState(rider.id);
}
/** Stores a batch of GPS points. Tracking only runs while online or on a delivery. */
export function recordLocations(rider, points) {
  const state = riderState(rider.id);
  if (!state.online && !hasActiveDelivery(rider.id)) throw conflict('Location sharing is off while you are offline.');
  const now = Date.now();
  const ok = points.filter(p => { const t = Date.parse(p.timestamp); return Number.isFinite(t) && t <= now + 5 * 60_000 && t >= now - 24 * 3_600_000; })
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  if (!ok.length) return { accepted: 0 };
  const ins = db.prepare('INSERT OR IGNORE INTO rider_locations (admin_id, lat, lng, accuracy, speed, heading, order_id, recorded_at) VALUES (?,?,?,?,?,?,?,?)');
  const validOrder = id => id && db.prepare('SELECT 1 FROM delivery_assignments WHERE order_id=? AND staff_id=?').get(id, rider.id) ? id : null;
  let accepted = 0;
  db.transaction(() => { for (const p of ok) accepted += ins.run(rider.id, p.latitude, p.longitude, p.accuracy ?? null, p.speed ?? null, p.heading ?? null, validOrder(p.orderId), sqlNow(new Date(p.timestamp))).changes; })();
  const last = ok[ok.length - 1];
  if (!state.location_at || Date.parse(last.timestamp) >= Date.parse(state.location_at.replace(' ', 'T') + 'Z')) {
    db.prepare(`INSERT INTO rider_state (admin_id, online, lat, lng, accuracy, speed, heading, location_at, order_id, updated_at) VALUES (?,0,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(admin_id) DO UPDATE SET lat=excluded.lat, lng=excluded.lng, accuracy=excluded.accuracy, speed=excluded.speed, heading=excluded.heading, location_at=excluded.location_at, order_id=excluded.order_id, updated_at=CURRENT_TIMESTAMP`)
      .run(rider.id, last.latitude, last.longitude, last.accuracy ?? null, last.speed ?? null, last.heading ?? null, sqlNow(new Date(last.timestamp)), validOrder(last.orderId));
    emit('rider_location', { admin_id: rider.id, lat: last.latitude, lng: last.longitude, accuracy: last.accuracy ?? null, at: last.timestamp }, 'riders.view');
  }
  return { accepted };
}
/** Distance travelled from GPS points, ignoring inaccurate fixes and impossible jumps. */
export function distanceKm(riderId, start, end) {
  const pts = db.prepare('SELECT lat, lng, accuracy, recorded_at FROM rider_locations WHERE admin_id=? AND recorded_at BETWEEN ? AND ? AND (accuracy IS NULL OR accuracy<=50) ORDER BY recorded_at').all(riderId, start, end);
  let km = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const d = haversineKm(a.lat, a.lng, b.lat, b.lng);
    const secs = (Date.parse(b.recorded_at.replace(' ', 'T') + 'Z') - Date.parse(a.recorded_at.replace(' ', 'T') + 'Z')) / 1000;
    if (d < 0.01 || secs <= 0 || d / (secs / 3600) > 150) continue; // jitter or GPS jump
    km += d;
  }
  return Math.round(km * 10) / 10;
}

// ---------- Operational statistics (no money) ----------
export function todayStats(riderId) {
  const r = dayRange(localParts().date, localParts().date);
  const q = sql => db.prepare(sql).get(riderId, r.start, r.end).n;
  const completed = q(`SELECT COUNT(*) n FROM delivery_assignments WHERE staff_id=? AND status='delivered' AND delivered_at BETWEEN ? AND ?`);
  const pending = db.prepare(`SELECT COUNT(*) n FROM delivery_assignments d JOIN orders o ON o.id=d.order_id WHERE d.staff_id=? AND d.status<>'delivered' AND o.status NOT IN ('cancelled','refunded','delivered','completed')`).get(riderId).n;
  return { deliveries: completed + pending, completed, pending, distance_km: distanceKm(riderId, r.start, r.end) };
}
export function performance(riderId, { from, to } = {}) {
  const r = dayRange(from, to);
  // Slot times are restaurant-local; convert to UTC for the on-time comparison.
  const off = Math.round((Date.parse(`${r.to}T00:00:00Z`) - localToDate(r.to, '00:00').getTime()) / 60000);
  const toUtc = `${off >= 0 ? '-' : '+'}${Math.abs(off)} minutes`;
  const done = db.prepare(`SELECT COUNT(*) n, AVG((julianday(d.delivered_at) - julianday(COALESCE(d.accepted_at, d.assigned_at))) * 1440) avg_min,
      SUM(CASE WHEN o.slot_end IS NULL OR d.delivered_at <= datetime(o.slot_date || ' ' || o.slot_end, ?) THEN 1 ELSE 0 END) on_time
    FROM delivery_assignments d JOIN orders o ON o.id=d.order_id WHERE d.staff_id=? AND d.status='delivered' AND d.delivered_at BETWEEN ? AND ?`).get(toUtc, riderId, r.start, r.end);
  const count = sql => db.prepare(sql).get(riderId, r.start, r.end).n;
  const assigned = count('SELECT COUNT(*) n FROM delivery_assignments WHERE staff_id=? AND assigned_at BETWEEN ? AND ?');
  const rejected = count('SELECT COUNT(*) n FROM delivery_rejections WHERE staff_id=? AND created_at BETWEEN ? AND ?');
  const cancelled = count(`SELECT COUNT(*) n FROM delivery_assignments d JOIN orders o ON o.id=d.order_id WHERE d.staff_id=? AND o.status IN ('cancelled','refunded') AND o.updated_at BETWEEN ? AND ?`);
  const rating = db.prepare(`SELECT AVG(v.rating) avg, COUNT(*) n FROM reviews v JOIN delivery_assignments d ON d.order_id=v.order_id WHERE d.staff_id=? AND v.created_at BETWEEN ? AND ?`).get(riderId, r.start, r.end);
  return {
    from: r.from, to: r.to, total_deliveries: assigned + rejected, completed: done.n, cancelled, rejected, on_time: done.on_time || 0,
    on_time_rate: done.n ? Math.round((done.on_time / done.n) * 100) : null, avg_delivery_minutes: done.avg_min == null ? null : Math.round(done.avg_min),
    distance_km: distanceKm(riderId, r.start, r.end), rating: rating.avg == null ? null : Math.round(rating.avg * 10) / 10, ratings_count: rating.n
  };
}

// ---------- Retention ----------
/** Keeps personal data only as long as it is useful: GPS 30 days, attendance selfies 90 days, read notifications 60 days. */
export async function cleanupRiderData() {
  db.prepare("DELETE FROM rider_locations WHERE recorded_at < datetime('now','-30 days')").run();
  db.prepare("DELETE FROM rider_notifications WHERE read_at IS NOT NULL AND created_at < datetime('now','-60 days')").run();
  const old = db.prepare("SELECT id, check_in_selfie, check_out_selfie FROM attendance WHERE created_at < datetime('now','-90 days') AND (check_in_selfie<>'' OR check_out_selfie<>'')").all();
  for (const a of old) {
    for (const f of [a.check_in_selfie, a.check_out_selfie]) { const p = privatePath(f); if (p) await fs.rm(p, { force: true }); }
    db.prepare("UPDATE attendance SET check_in_selfie='', check_out_selfie='' WHERE id=?").run(a.id);
  }
}
