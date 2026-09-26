import { Router } from 'express';
import { db } from '../../db/index.js';
import { ah, notFound, badRequest } from '../../lib/errors.js';
import { parse, z, text, ymd } from '../../lib/validate.js';
import { audit } from '../../lib/audit.js';
import { requirePerm } from '../../middleware/auth.js';
import { localToDate, sqlNow, addDays } from '../../lib/time.js';
import { getOrder, changeStatus, createOrder, nextStatuses, STATUSES, STATUS_LABEL, trackingUrl } from '../../services/orders.js';
import { priceCart } from '../../services/pricing.js';
import { upcomingSlots } from '../../services/delivery.js';
import { paging, likeEsc } from './helpers.js';

const r = Router();

const listQuery = z.object({
  status: z.string().optional().default(''),       // comma list, or 'open'
  payment_status: z.string().optional().default(''),
  payment_method: z.enum(['', 'online', 'cod']).optional().default(''),
  area_id: z.coerce.number().int().optional(),
  fulfilment: z.enum(['', 'delivery', 'pickup']).optional().default(''),
  from: ymd.optional(), to: ymd.optional(),
  q: text(80).optional().default(''),
  customer_id: z.coerce.number().int().optional(),
  sort: z.enum(['created_at', 'total', 'status', 'order_number']).optional().default('created_at'),
  dir: z.enum(['asc', 'desc']).optional().default('desc')
});
/** Builds WHERE clause + params from list filters (shared by the list, the delivery board and exports). */
export function orderFilters(q) {
  const f = parse(listQuery, q);
  const where = ['1=1'], p = [];
  if (f.status === 'open') where.push("o.status NOT IN ('delivered','completed','cancelled','refunded')");
  else if (f.status) { const list = f.status.split(',').filter(s => STATUSES.includes(s)); if (list.length) { where.push(`o.status IN (${list.map(() => '?').join(',')})`); p.push(...list); } }
  if (f.payment_status) { where.push('o.payment_status=?'); p.push(f.payment_status); }
  if (f.payment_method) { where.push('o.payment_method=?'); p.push(f.payment_method); }
  if (f.area_id) { where.push('o.area_id=?'); p.push(f.area_id); }
  if (f.fulfilment) { where.push('o.fulfilment=?'); p.push(f.fulfilment); }
  if (f.customer_id) { where.push('o.customer_id=?'); p.push(f.customer_id); }
  if (f.from) { where.push('o.created_at>=?'); p.push(sqlNow(localToDate(f.from, '00:00'))); }
  if (f.to) { where.push('o.created_at<?'); p.push(sqlNow(localToDate(addDays(f.to, 1), '00:00'))); }
  if (f.q) {
    const digits = f.q.replace(/\D/g, '');
    where.push(`(o.order_number LIKE ? ESCAPE '\\' OR o.customer_name LIKE ? ESCAPE '\\'${digits.length >= 3 ? " OR o.customer_phone LIKE ? ESCAPE '\\'" : ''})`);
    p.push(likeEsc(f.q.toUpperCase()), likeEsc(f.q)); if (digits.length >= 3) p.push(likeEsc(digits));
  }
  // Online orders that were never paid stay out of the way unless asked for.
  if (!f.payment_status && !f.status) where.push("NOT (o.payment_method='online' AND o.payment_status IN ('created','failed') AND o.status='cancelled')");
  return { where: where.join(' AND '), params: p, sort: `o.${f.sort} ${f.dir.toUpperCase()}, o.id ${f.dir.toUpperCase()}` };
}

const LIST_COLS = `o.id, o.order_number, o.created_at, o.placed_at, o.customer_name, o.customer_phone, o.fulfilment, o.area_id, a.name AS area_name,
  o.distance_km, o.subtotal, o.discount, o.delivery_fee, o.tax, o.total, o.payment_method, o.payment_status, o.status, o.slot_date, o.slot_label, o.slot_start, o.slot_end,
  (SELECT SUM(quantity) FROM order_items WHERE order_id=o.id) AS quantity,
  (SELECT GROUP_CONCAT(quantity || '× ' || name || ' (' || size_label || ')', ', ') FROM order_items WHERE order_id=o.id) AS items_text,
  (SELECT ad.name FROM delivery_assignments d JOIN admins ad ON ad.id=d.staff_id WHERE d.order_id=o.id) AS rider_name`;

r.get('/orders', requirePerm('orders.view'), ah(async (req, res) => {
  const { where, params, sort } = orderFilters(req.query);
  const { page, limit, offset } = paging(req.query);
  const total = db.prepare(`SELECT COUNT(*) n FROM orders o WHERE ${where}`).get(...params).n;
  const rows = db.prepare(`SELECT ${LIST_COLS} FROM orders o LEFT JOIN delivery_areas a ON a.id=o.area_id WHERE ${where} ORDER BY ${sort} LIMIT ? OFFSET ?`).all(...params, limit, offset);
  const counts = Object.fromEntries(db.prepare("SELECT status, COUNT(*) n FROM orders o WHERE NOT (o.payment_method='online' AND o.payment_status IN ('created','failed') AND o.status='cancelled') GROUP BY status").all().map(x => [x.status, x.n]));
  res.json({ rows: rows.map(o => ({ ...o, next: nextStatuses(o) })), total, page, limit, counts });
}));

r.get('/orders/:id', requirePerm('orders.view'), ah(async (req, res) => {
  const o = getOrder(Number(req.params.id)); if (!o) throw notFound('Order not found.');
  const customer = o.customer_id ? db.prepare(`SELECT c.*, (SELECT COUNT(*) FROM orders WHERE customer_id=c.id AND placed_at IS NOT NULL) AS orders_count FROM customers c WHERE id=?`).get(o.customer_id) : null;
  res.json({
    ...o, next: nextStatuses(o), tracking_url: trackingUrl(o), customer,
    history: db.prepare('SELECT * FROM order_status_history WHERE order_id=? ORDER BY id').all(o.id),
    payments: db.prepare('SELECT * FROM payments WHERE order_id=? ORDER BY id').all(o.id),
    refunds: db.prepare('SELECT * FROM refunds WHERE order_id=? ORDER BY id').all(o.id),
    assignment: db.prepare('SELECT d.*, a.name AS staff_name, a.phone AS staff_phone FROM delivery_assignments d JOIN admins a ON a.id=d.staff_id WHERE d.order_id=?').get(o.id) || null,
    messages: db.prepare('SELECT id, event, status, error, created_at FROM notification_logs WHERE order_id=? ORDER BY id DESC').all(o.id)
  });
}));

r.patch('/orders/:id/status', requirePerm('orders.update', 'orders.kitchen', 'orders.cancel'), ah(async (req, res) => {
  const b = parse(z.object({ status: z.enum(STATUSES), note: text(300).optional().default('') }), req.body);
  const before = getOrder(Number(req.params.id)); if (!before) throw notFound('Order not found.');
  const o = changeStatus(before.id, b.status, { admin: req.admin, note: b.note });
  audit(req, 'status_change', 'order', o.order_number, `${o.order_number}: ${STATUS_LABEL[before.status]} → ${STATUS_LABEL[o.status]}`, { status: before.status }, { status: o.status });
  res.json({ ...o, next: nextStatuses(o) });
}));

r.patch('/orders/:id/notes', requirePerm('orders.update'), ah(async (req, res) => {
  const b = parse(z.object({ notes: text(500) }), req.body);
  const o = getOrder(Number(req.params.id)); if (!o) throw notFound('Order not found.');
  db.prepare('UPDATE orders SET notes=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(b.notes, o.id);
  audit(req, 'update', 'order', o.order_number, `Edited notes on ${o.order_number}`, { notes: o.notes }, { notes: b.notes });
  res.json({ ok: true });
}));

// Manual orders use the exact same pricing and creation path as the website.
r.post('/orders/quote', requirePerm('orders.create'), ah(async (req, res) => {
  const q = priceCart(req.body || {});
  const { _offer, _coupon, ...pub } = q;
  res.json({ ...pub, slots: q.area ? upcomingSlots(q.area.id, 3) : [] });
}));
r.post('/orders', requirePerm('orders.create'), ah(async (req, res) => {
  const body = { ...req.body };
  if (body.payment_method === 'online') throw badRequest('Staff orders are paid in cash or collected later. Choose cash on delivery.');
  const o = createOrder(body, { source: 'admin', admin: req.admin });
  audit(req, 'create', 'order', o.order_number, `Created manual order ${o.order_number} for ${o.customer_name} (₹${o.total})`, null, { total: o.total });
  res.status(201).json(o);
}));

// Delivery assignment lives with orders because staff assign from the order screen.
r.put('/orders/:id/assignment', requirePerm('delivery.assign'), ah(async (req, res) => {
  const b = parse(z.object({ staff_id: z.coerce.number().int().positive().nullable() }), req.body);
  const o = getOrder(Number(req.params.id)); if (!o) throw notFound('Order not found.');
  if (o.fulfilment !== 'delivery') throw badRequest('Pickup orders do not need a delivery person.');
  if (['delivered', 'completed', 'cancelled', 'refunded'].includes(o.status)) throw badRequest('This order is already closed.');
  const prev = db.prepare('SELECT d.staff_id, a.name FROM delivery_assignments d JOIN admins a ON a.id=d.staff_id WHERE d.order_id=?').get(o.id);
  if (b.staff_id == null) {
    db.prepare('DELETE FROM delivery_assignments WHERE order_id=?').run(o.id);
    audit(req, 'unassign', 'order', o.order_number, `Removed ${prev?.name || 'delivery person'} from ${o.order_number}`);
    return res.json({ ok: true, assignment: null });
  }
  const staff = db.prepare(`SELECT a.id, a.name FROM admins a JOIN role_permissions rp ON rp.role_id=a.role_id JOIN permissions p ON p.id=rp.permission_id
    WHERE a.id=? AND a.status='active' AND p.key='delivery.update'`).get(b.staff_id);
  if (!staff) throw badRequest('Choose an active staff member who can make deliveries.');
  db.prepare(`INSERT INTO delivery_assignments (order_id, staff_id) VALUES (?,?)
    ON CONFLICT(order_id) DO UPDATE SET staff_id=excluded.staff_id, status='assigned', assigned_at=CURRENT_TIMESTAMP, picked_up_at=NULL, updated_at=CURRENT_TIMESTAMP`).run(o.id, staff.id);
  audit(req, 'assign', 'order', o.order_number, `Assigned ${o.order_number} to ${staff.name}`, prev ? { staff: prev.name } : null, { staff: staff.name });
  res.json({ ok: true, assignment: db.prepare('SELECT d.*, a.name AS staff_name, a.phone AS staff_phone FROM delivery_assignments d JOIN admins a ON a.id=d.staff_id WHERE d.order_id=?').get(o.id) });
}));

export const statusMeta = { STATUSES, STATUS_LABEL };
export default r;
