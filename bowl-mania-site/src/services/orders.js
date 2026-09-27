import { db } from '../db/index.js';
import { badRequest, forbidden, notFound, conflict } from '../lib/errors.js';
import { parse, z, phone10, optEmail, text } from '../lib/validate.js';
import { token } from '../lib/ids.js';
import { localParts, sqlNow } from '../lib/time.js';
import { priceCart } from './pricing.js';
import { upcomingSlots, restaurantStatus, estimateFor } from './delivery.js';
import { getSetting } from './settings.js';
import { razorpayEnabled, config } from '../config.js';
import { hooks } from './hooks.js';

export const STATUSES = ['new', 'confirmed', 'accepted', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'completed', 'cancelled', 'refunded'];
export const STATUS_LABEL = { new: 'New', confirmed: 'Confirmed', accepted: 'Accepted', preparing: 'Preparing', ready: 'Ready', out_for_delivery: 'Out for delivery', delivered: 'Delivered', completed: 'Completed', cancelled: 'Cancelled', refunded: 'Refunded' };
// Allowed next states. Refunds are recorded by the payments service, not by hand.
const NEXT = {
  new: ['confirmed', 'accepted', 'cancelled'],
  confirmed: ['accepted', 'preparing', 'cancelled'],
  accepted: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['out_for_delivery', 'delivered', 'completed', 'cancelled'],
  out_for_delivery: ['delivered'],
  delivered: ['completed'],
  completed: [], cancelled: [], refunded: []
};
const KITCHEN = new Set(['accepted', 'preparing', 'ready']);
// Delivery orders go ready → out for delivery → delivered; pickup orders go ready → completed.
export const nextStatuses = (o) => (NEXT[o.status] || []).filter(s => o.fulfilment === 'pickup'
  ? !['out_for_delivery', 'delivered'].includes(s)
  : !(o.status === 'ready' && ['delivered', 'completed'].includes(s)));

const orderInput = z.object({
  customer_name: text(80, 1),
  phone: phone10,
  email: optEmail,
  fulfilment: z.enum(['delivery', 'pickup']),
  area_id: z.coerce.number().int().positive().optional(),
  address: text(500).optional().default(''),
  landmark: text(200).optional().default(''),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  slot_key: z.string().max(40).optional().default(''),
  items: z.array(z.object({ item_id: z.coerce.number().int().positive(), size_id: z.coerce.number().int().positive(), quantity: z.coerce.number().int().min(1).max(20) })).min(1, 'Add at least one bowl.').max(30),
  coupon_code: text(40).optional().default(''),
  payment_method: z.enum(['online', 'cod']),
  notes: text(500).optional().default('')
});

function nextOrderNumber() {
  const d = localParts().date.replace(/-/g, '');
  const last = db.prepare("SELECT order_number FROM orders WHERE order_number LIKE ? ORDER BY id DESC LIMIT 1").get(`BM${d}%`);
  const seq = last ? Number(last.order_number.slice(10)) + 1 : 1;
  return `BM${d}${String(seq).padStart(3, '0')}`;
}

function upsertCustomer(name, phone, email) {
  const c = db.prepare('SELECT * FROM customers WHERE phone=?').get(phone);
  if (c) {
    if (c.status === 'blocked') throw forbidden('We are unable to accept orders from this number. Please contact us.');
    db.prepare("UPDATE customers SET name=?, email=CASE WHEN ?<>'' THEN ? ELSE email END, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(name, email, email, c.id);
    return c.id;
  }
  return db.prepare('INSERT INTO customers (name, phone, email) VALUES (?,?,?)').run(name, phone, email).lastInsertRowid;
}

/**
 * Creates an order exactly the same way for the website and for staff (manual orders).
 * Returns the stored order; online orders come back with payment_status 'created' until Razorpay confirms.
 */
export function createOrder(raw, { source = 'website', admin = null } = {}) {
  const input = parse(orderInput, raw);
  const status = restaurantStatus();
  if (source === 'website' && status.mode === 'closed') throw badRequest(getSetting('business').closed_message || 'We are closed right now.');
  if (input.fulfilment === 'delivery' && (input.lat == null || input.lng == null)) throw badRequest('Share your delivery location so we can calculate distance and delivery charge.');
  if (input.fulfilment === 'delivery' && !input.address) throw badRequest('Enter your delivery address.');

  const pay = getSetting('payments');
  if (input.payment_method === 'online' && !(pay.online_enabled && razorpayEnabled())) throw badRequest('Online payment is not available right now. Please choose cash on delivery.');
  if (input.payment_method === 'cod' && !pay.cod_enabled && source === 'website') throw badRequest('Cash on delivery is not available right now. Please pay online.');

  const q = priceCart({ ...input, phone: input.phone }, { strict: true });
  const slots = upcomingSlots(q.area.id, 3);
  if (!slots.length) throw badRequest(`${q.area.name} has no delivery slots in the next few days.`);
  const slot = input.slot_key ? slots.find(s => s.key === input.slot_key) : slots[0];
  if (!slot) throw badRequest('That time slot is no longer available. Please choose another one.');
  if (source === 'website' && !slot.current && !getSetting('business').accept_preorders) throw badRequest('We only take orders during delivery hours.');

  const isOnline = input.payment_method === 'online';
  const order = db.transaction(() => {
    const customerId = upsertCustomer(input.customer_name, input.phone, input.email);
    if (input.fulfilment === 'delivery') {
      const addr = db.prepare('SELECT id FROM customer_addresses WHERE customer_id=? AND address=?').get(customerId, input.address);
      if (addr) db.prepare('UPDATE customer_addresses SET lat=?, lng=?, landmark=?, area_id=?, last_used_at=CURRENT_TIMESTAMP WHERE id=?').run(input.lat, input.lng, input.landmark, q.area.id, addr.id);
      else db.prepare('INSERT INTO customer_addresses (customer_id, address, landmark, lat, lng, area_id) VALUES (?,?,?,?,?,?)').run(customerId, input.address, input.landmark, input.lat, input.lng, q.area.id);
    }
    const number = nextOrderNumber();
    const id = db.prepare(`INSERT INTO orders (order_number, tracking_token, customer_id, customer_name, customer_phone, customer_email, fulfilment, area_id,
        address, landmark, lat, lng, distance_km, slot_date, slot_label, slot_start, slot_end, subtotal, offer_id, offer_title, offer_discount,
        coupon_id, coupon_code, coupon_discount, discount, delivery_fee, tax, total, payment_method, payment_status, status, notes, source, created_by, estimated_at, placed_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      number, token(24), customerId, input.customer_name, input.phone, input.email, input.fulfilment, q.area.id,
      input.fulfilment === 'delivery' ? input.address : '', input.landmark, input.lat ?? null, input.lng ?? null, q.delivery?.distance_km ?? null,
      slot.date, slot.label, slot.start_time, slot.end_time, q.subtotal, q.offer?.id ?? null, q.offer?.title ?? '', q.offer?.discount ?? 0,
      q._coupon?.id ?? null, q._coupon?.code ?? '', q.coupon?.discount ?? 0, q.discount, q.delivery_fee, q.tax, q.total,
      input.payment_method, isOnline ? 'created' : 'pending', 'new', input.notes, source, admin?.id ?? null,
      estimateFor(slot.starts_at, input.fulfilment), isOnline ? null : sqlNow()
    ).lastInsertRowid;
    const li = db.prepare('INSERT INTO order_items (order_id, menu_item_id, size_id, category_id, name, size_label, unit_price, quantity, line_total) VALUES (?,?,?,?,?,?,?,?,?)');
    q.lines.forEach(l => li.run(id, l.item_id, l.size_id, l.category_id, l.name, l.size_label, l.unit_price, l.quantity, l.line_total));
    if (q._coupon) db.prepare('INSERT INTO coupon_usage (coupon_id, order_id, customer_id, discount) VALUES (?,?,?,?)').run(q._coupon.id, id, customerId, q.coupon.discount);
    db.prepare('INSERT INTO order_status_history (order_id, from_status, to_status, note, admin_id, admin_name) VALUES (?,?,?,?,?,?)')
      .run(id, null, 'new', source === 'admin' ? 'Order created by staff' : 'Order placed', admin?.id ?? null, admin?.name ?? '');
    if (!isOnline) db.prepare("INSERT INTO payments (order_id, provider, method, amount, status) VALUES (?,?,?,?, 'pending')").run(id, 'cod', 'cash', q.total);
    return getOrder(id);
  })();
  if (!isOnline) hooks.orderPlaced(order);
  return order;
}

export function getOrder(id) {
  const o = db.prepare(`SELECT o.*, a.name AS area_name FROM orders o LEFT JOIN delivery_areas a ON a.id=o.area_id WHERE o.id=?`).get(id);
  if (!o) return null;
  o.items = db.prepare('SELECT * FROM order_items WHERE order_id=? ORDER BY id').all(id);
  return o;
}
export const orderByToken = t => { const r = db.prepare('SELECT id FROM orders WHERE tracking_token=?').get(t); return r ? getOrder(r.id) : null; };
export const trackingUrl = o => `${config.publicUrl}/track/${o.tracking_token}`;

/**
 * Moves an order to a new status with permission and flow checks, history, and side effects.
 * `admin` null means a system action (payment webhook, delivery app).
 */
export function changeStatus(orderId, to, { admin = null, note = '', force = false } = {}) {
  const o = getOrder(orderId);
  if (!o) throw notFound('Order not found.');
  if (!STATUSES.includes(to)) throw badRequest('Unknown status.');
  if (o.status === to) return o;
  if (!force && !nextStatuses(o).includes(to)) throw conflict(`An order that is ${STATUS_LABEL[o.status]} can't be moved to ${STATUS_LABEL[to]}.`);
  if (admin) {
    const p = admin.permissions;
    const allowed = p.includes('orders.update') || (to === 'cancelled' && p.includes('orders.cancel')) || (KITCHEN.has(to) && p.includes('orders.kitchen'))
      || (['out_for_delivery', 'delivered'].includes(to) && p.includes('delivery.update'));
    if (!allowed) throw forbidden(`Your role can't move orders to ${STATUS_LABEL[to]}.`);
  }
  if (o.payment_method === 'online' && !['paid', 'refunded', 'partially_refunded'].includes(o.payment_status) && !['cancelled'].includes(to)) {
    throw conflict('This order has not been paid online yet. Wait for the payment, or cancel the order.');
  }
  db.transaction(() => {
    db.prepare('UPDATE orders SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(to, o.id);
    db.prepare('INSERT INTO order_status_history (order_id, from_status, to_status, note, admin_id, admin_name) VALUES (?,?,?,?,?,?)')
      .run(o.id, o.status, to, note, admin?.id ?? null, admin?.name ?? 'System');
    if (to === 'cancelled') db.prepare('DELETE FROM coupon_usage WHERE order_id=?').run(o.id);
    if (to === 'delivered' || (to === 'completed' && o.fulfilment === 'pickup')) {
      // Cash is collected at the door or counter.
      if (o.payment_method === 'cod' && o.payment_status === 'pending') {
        db.prepare("UPDATE orders SET payment_status='paid' WHERE id=?").run(o.id);
        db.prepare("UPDATE payments SET status='paid', paid_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE order_id=? AND provider='cod'").run(o.id);
      }
    }
    const asg = db.prepare('SELECT * FROM delivery_assignments WHERE order_id=?').get(o.id);
    if (asg && to === 'out_for_delivery' && asg.status !== 'out_for_delivery') db.prepare("UPDATE delivery_assignments SET status='out_for_delivery', picked_up_at=COALESCE(picked_up_at, CURRENT_TIMESTAMP), updated_at=CURRENT_TIMESTAMP WHERE id=?").run(asg.id);
    if (asg && to === 'delivered') db.prepare("UPDATE delivery_assignments SET status='delivered', delivered_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(asg.id);
  })();
  const updated = getOrder(o.id);
  hooks.statusChanged(updated, o.status, to, admin);
  return updated;
}

/** Public, non-sensitive view for the tracking page. */
export function trackingView(o) {
  const history = db.prepare('SELECT to_status, created_at FROM order_status_history WHERE order_id=? ORDER BY id').all(o.id);
  const assignment = db.prepare(`SELECT d.status, a.name FROM delivery_assignments d JOIN admins a ON a.id=d.staff_id WHERE d.order_id=?`).get(o.id);
  const r = getSetting('restaurant');
  return {
    order_number: o.order_number, restaurant: r.name, status: o.status, status_label: STATUS_LABEL[o.status],
    fulfilment: o.fulfilment, area: o.area_name, distance_km: o.distance_km, delivery_fee: o.delivery_fee,
    subtotal: o.subtotal, discount: o.discount, tax: o.tax, total: o.total, payment_method: o.payment_method, payment_status: o.payment_status,
    slot: o.slot_label ? { date: o.slot_date, label: o.slot_label, start: o.slot_start, end: o.slot_end } : null,
    estimated_at: o.estimated_at, placed_at: o.placed_at, created_at: o.created_at,
    items: o.items.map(i => ({ name: i.name, size: i.size_label, quantity: i.quantity, line_total: i.line_total })),
    history: history.map(h => ({ status: h.to_status, at: h.created_at })),
    rider: assignment && ['out_for_delivery', 'picked_up'].includes(assignment.status) && o.status === 'out_for_delivery' ? { first_name: assignment.name.split(' ')[0] } : null,
    contact: { phone: db.prepare('SELECT phone FROM delivery_areas WHERE id=?').get(o.area_id)?.phone || r.phone },
    can_review: ['delivered', 'completed'].includes(o.status) && !db.prepare('SELECT 1 FROM reviews WHERE order_id=?').get(o.id)
  };
}
