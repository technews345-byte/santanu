import { Router } from 'express';
import { db } from '../../db/index.js';
import { ah, notFound, badRequest, forbidden } from '../../lib/errors.js';
import { parse, z, text, bool, hhmm, ymd } from '../../lib/validate.js';
import { audit, diff } from '../../lib/audit.js';
import { slugify } from '../../lib/ids.js';
import { requirePerm, can } from '../../middleware/auth.js';
import { localParts } from '../../lib/time.js';
import { changeStatus, getOrder, STATUS_LABEL } from '../../services/orders.js';
import { restaurantStatus, upcomingSlots, feeFor } from '../../services/delivery.js';

const r = Router();

// ---------- Areas & slots ----------
const slotSchema = z.object({ id: z.coerce.number().int().positive().optional(), label: text(40, 1), days: z.string().regex(/^[0-6]{1,7}$/, 'Pick at least one day.').default('0123456'), start_time: hhmm, end_time: hhmm, active: bool.default(true) })
  .refine(s => s.start_time < s.end_time, { message: 'A slot must end after it starts.' });
const areaSchema = z.object({
  name: text(60, 1), address: text(300).optional().default(''), phone: text(20).optional().default(''), whatsapp: text(20).optional().default(''),
  lat: z.coerce.number().min(-90).max(90), lng: z.coerce.number().min(-180).max(180),
  max_radius_km: z.coerce.number().min(0.5).max(100), base_distance_km: z.coerce.number().min(0.1).max(50), base_charge: z.coerce.number().int().min(0).max(10000),
  extra_distance_km: z.coerce.number().min(0.1).max(50), extra_charge: z.coerce.number().int().min(0).max(10000),
  delivery_enabled: bool.default(true), pickup_enabled: bool.default(true), active: bool.default(true),
  slots: z.array(slotSchema).max(12).default([])
});
const areaFull = id => {
  const a = db.prepare('SELECT * FROM delivery_areas WHERE id=?').get(id); if (!a) return null;
  return { ...a, delivery_enabled: !!a.delivery_enabled, pickup_enabled: !!a.pickup_enabled, active: !!a.active,
    slots: db.prepare('SELECT * FROM delivery_slots WHERE area_id=? ORDER BY display_order, start_time').all(id).map(s => ({ ...s, active: !!s.active })) };
};
r.get('/delivery/areas', requirePerm('delivery.view', 'delivery.manage'), (req, res) =>
  res.json(db.prepare('SELECT id FROM delivery_areas ORDER BY display_order, id').all().map(a => {
    const full = areaFull(a.id);
    return { ...full, upcoming: upcomingSlots(a.id, 2).slice(0, 3), fee_examples: [1, 2, 3, 4, 5, 6].map(km => ({ km, fee: km <= full.max_radius_km ? feeFor(full, km) : null })) };
  })));
function saveSlots(areaId, slots) {
  const keep = slots.filter(s => s.id).map(s => s.id);
  db.prepare(`DELETE FROM delivery_slots WHERE area_id=? ${keep.length ? `AND id NOT IN (${keep.map(() => '?').join(',')})` : ''}`).run(areaId, ...keep);
  slots.forEach((s, i) => {
    if (s.id && db.prepare('SELECT 1 FROM delivery_slots WHERE id=? AND area_id=?').get(s.id, areaId))
      db.prepare('UPDATE delivery_slots SET label=?, days=?, start_time=?, end_time=?, active=?, display_order=? WHERE id=?').run(s.label, s.days, s.start_time, s.end_time, +s.active, i, s.id);
    else db.prepare('INSERT INTO delivery_slots (area_id, label, days, start_time, end_time, active, display_order) VALUES (?,?,?,?,?,?,?)').run(areaId, s.label, s.days, s.start_time, s.end_time, +s.active, i);
  });
}
const areaSnap = a => a && ({ name: a.name, lat: a.lat, lng: a.lng, max_radius_km: a.max_radius_km, base_distance_km: a.base_distance_km, base_charge: a.base_charge, extra_distance_km: a.extra_distance_km, extra_charge: a.extra_charge,
  delivery_enabled: a.delivery_enabled, pickup_enabled: a.pickup_enabled, active: a.active, phone: a.phone, whatsapp: a.whatsapp, address: a.address,
  slots: a.slots.map(s => `${s.label} ${s.start_time}-${s.end_time} [${s.days}]${s.active ? '' : ' off'}`) });
r.post('/delivery/areas', requirePerm('delivery.manage'), ah(async (req, res) => {
  const b = parse(areaSchema, req.body);
  let slug = slugify(b.name), i = 2; while (db.prepare('SELECT 1 FROM delivery_areas WHERE slug=?').get(slug)) slug = `${slugify(b.name)}-${i++}`;
  const id = db.transaction(() => {
    const id = db.prepare(`INSERT INTO delivery_areas (name, slug, address, phone, whatsapp, lat, lng, max_radius_km, base_distance_km, base_charge, extra_distance_km, extra_charge, delivery_enabled, pickup_enabled, active, display_order)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, (SELECT COALESCE(MAX(display_order),-1)+1 FROM delivery_areas))`).run(b.name, slug, b.address, b.phone, b.whatsapp, b.lat, b.lng, b.max_radius_km, b.base_distance_km, b.base_charge, b.extra_distance_km, b.extra_charge, +b.delivery_enabled, +b.pickup_enabled, +b.active).lastInsertRowid;
    saveSlots(id, b.slots); return id;
  })();
  audit(req, 'create', 'delivery_area', id, `Added delivery area ${b.name}`, null, areaSnap(areaFull(id)));
  res.status(201).json(areaFull(id));
}));
r.patch('/delivery/areas/:id', requirePerm('delivery.manage'), ah(async (req, res) => {
  const id = Number(req.params.id); const before = areaFull(id); if (!before) throw notFound('Delivery area not found.');
  const b = parse(areaSchema, req.body);
  db.transaction(() => {
    db.prepare(`UPDATE delivery_areas SET name=?, address=?, phone=?, whatsapp=?, lat=?, lng=?, max_radius_km=?, base_distance_km=?, base_charge=?, extra_distance_km=?, extra_charge=?,
      delivery_enabled=?, pickup_enabled=?, active=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(b.name, b.address, b.phone, b.whatsapp, b.lat, b.lng, b.max_radius_km, b.base_distance_km, b.base_charge, b.extra_distance_km, b.extra_charge, +b.delivery_enabled, +b.pickup_enabled, +b.active, id);
    saveSlots(id, b.slots);
  })();
  const [o, n, keys] = diff(areaSnap(before), areaSnap(areaFull(id)));
  if (keys.length) audit(req, 'update', 'delivery_area', id, `Edited ${b.name}: ${keys.join(', ')}`, o, n);
  res.json(areaFull(id));
}));
r.delete('/delivery/areas/:id', requirePerm('delivery.manage'), ah(async (req, res) => {
  const id = Number(req.params.id); const a = areaFull(id); if (!a) throw notFound('Delivery area not found.');
  if (db.prepare('SELECT COUNT(*) n FROM orders WHERE area_id=?').get(id).n) throw badRequest(`${a.name} has orders, so it can't be deleted. Turn it off instead.`);
  db.prepare('DELETE FROM delivery_areas WHERE id=?').run(id);
  audit(req, 'delete', 'delivery_area', id, `Deleted delivery area ${a.name}`, areaSnap(a), null); res.json({ ok: true });
}));

// ---------- Holidays & special hours ----------
r.get('/delivery/calendar', requirePerm('delivery.view', 'delivery.manage'), (req, res) => {
  const today = localParts().date;
  res.json({
    holidays: db.prepare('SELECT h.*, a.name AS area_name FROM holidays h LEFT JOIN delivery_areas a ON a.id=h.area_id WHERE date>=? ORDER BY date').all(today),
    special_hours: db.prepare('SELECT s.*, a.name AS area_name FROM special_hours s LEFT JOIN delivery_areas a ON a.id=s.area_id WHERE date>=? ORDER BY date, start_time').all(today)
  });
});
r.post('/delivery/holidays', requirePerm('delivery.manage'), ah(async (req, res) => {
  const b = parse(z.object({ date: ymd, area_id: z.coerce.number().int().positive().nullable().optional(), note: text(120).optional().default('') }), req.body);
  const id = db.prepare('INSERT INTO holidays (date, area_id, note) VALUES (?,?,?)').run(b.date, b.area_id ?? null, b.note).lastInsertRowid;
  audit(req, 'create', 'holiday', id, `Closed on ${b.date}${b.note ? ' — ' + b.note : ''}`, null, b); res.status(201).json({ id });
}));
r.delete('/delivery/holidays/:id', requirePerm('delivery.manage'), ah(async (req, res) => {
  const h = db.prepare('SELECT * FROM holidays WHERE id=?').get(Number(req.params.id)); if (!h) throw notFound();
  db.prepare('DELETE FROM holidays WHERE id=?').run(h.id); audit(req, 'delete', 'holiday', h.id, `Removed closure on ${h.date}`, h, null); res.json({ ok: true });
}));
r.post('/delivery/special-hours', requirePerm('delivery.manage'), ah(async (req, res) => {
  const b = parse(z.object({ date: ymd, area_id: z.coerce.number().int().positive().nullable().optional(), start_time: hhmm, end_time: hhmm, note: text(60).optional().default('') }).refine(x => x.start_time < x.end_time, { message: 'Special hours must end after they start.' }), req.body);
  const id = db.prepare('INSERT INTO special_hours (date, area_id, start_time, end_time, note) VALUES (?,?,?,?,?)').run(b.date, b.area_id ?? null, b.start_time, b.end_time, b.note).lastInsertRowid;
  audit(req, 'create', 'special_hours', id, `Special hours ${b.date} ${b.start_time}-${b.end_time}`, null, b); res.status(201).json({ id });
}));
r.delete('/delivery/special-hours/:id', requirePerm('delivery.manage'), ah(async (req, res) => {
  const h = db.prepare('SELECT * FROM special_hours WHERE id=?').get(Number(req.params.id)); if (!h) throw notFound();
  db.prepare('DELETE FROM special_hours WHERE id=?').run(h.id); audit(req, 'delete', 'special_hours', h.id, `Removed special hours on ${h.date}`, h, null); res.json({ ok: true });
}));
r.get('/status', (req, res) => res.json(restaurantStatus()));

// ---------- Delivery board ----------
const BOARD = `SELECT o.id, o.order_number, o.customer_name, o.customer_phone, o.address, o.landmark, o.lat, o.lng, o.distance_km, o.delivery_fee, o.total,
    o.payment_method, o.payment_status, o.status, o.slot_date, o.slot_label, o.slot_start, o.slot_end, o.estimated_at, a.name AS area_name,
    d.status AS delivery_status, d.staff_id, s.name AS staff_name, s.phone AS staff_phone, d.assigned_at, d.picked_up_at, d.delivered_at,
    (SELECT GROUP_CONCAT(quantity || '× ' || name || ' (' || size_label || ')', ', ') FROM order_items WHERE order_id=o.id) AS items_text
  FROM orders o LEFT JOIN delivery_areas a ON a.id=o.area_id LEFT JOIN delivery_assignments d ON d.order_id=o.id LEFT JOIN admins s ON s.id=d.staff_id`;
r.get('/deliveries', requirePerm('delivery.view', 'delivery.assign'), (req, res) => {
  res.json({
    active: db.prepare(`${BOARD} WHERE o.fulfilment='delivery' AND o.placed_at IS NOT NULL AND o.status NOT IN ('delivered','completed','cancelled','refunded') ORDER BY o.slot_date, o.slot_start, o.id`).all(),
    done_today: db.prepare(`${BOARD} WHERE o.fulfilment='delivery' AND d.status='delivered' AND d.delivered_at >= datetime('now','-1 day') ORDER BY d.delivered_at DESC`).all(),
    staff: deliveryStaff()
  });
});
export const deliveryStaff = () => db.prepare(`SELECT a.id, a.name, a.phone,
    (SELECT COUNT(*) FROM delivery_assignments d JOIN orders o ON o.id=d.order_id WHERE d.staff_id=a.id AND d.status<>'delivered' AND o.status NOT IN ('cancelled','refunded')) AS active_count
  FROM admins a JOIN role_permissions rp ON rp.role_id=a.role_id JOIN permissions p ON p.id=rp.permission_id WHERE p.key='delivery.update' AND a.status='active' ORDER BY a.name`).all();
r.get('/deliveries/staff', requirePerm('delivery.assign', 'delivery.view'), (req, res) => res.json(deliveryStaff()));

// Delivery staff see and update only their own jobs.
r.get('/deliveries/mine', requirePerm('delivery.update'), (req, res) =>
  res.json(db.prepare(`${BOARD} WHERE d.staff_id=? AND (d.status<>'delivered' OR d.delivered_at >= datetime('now','-1 day')) AND o.status NOT IN ('cancelled','refunded') ORDER BY d.status='delivered', o.slot_date, o.slot_start`).all(req.admin.id)));
r.patch('/deliveries/:orderId', requirePerm('delivery.update', 'delivery.assign'), ah(async (req, res) => {
  const b = parse(z.object({ status: z.enum(['picked_up', 'out_for_delivery', 'delivered']) }), req.body);
  const o = getOrder(Number(req.params.orderId)); if (!o) throw notFound('Order not found.');
  const d = db.prepare('SELECT * FROM delivery_assignments WHERE order_id=?').get(o.id);
  if (!d) throw badRequest('Assign a delivery person first.');
  if (d.staff_id !== req.admin.id && !can(req.admin, 'delivery.assign')) throw forbidden('This delivery is assigned to someone else.');
  if (b.status === 'picked_up') {
    if (!['ready', 'preparing'].includes(o.status)) throw badRequest(`The order is ${STATUS_LABEL[o.status]}, not ready for pickup.`);
    db.prepare("UPDATE delivery_assignments SET status='picked_up', picked_up_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(d.id);
  } else {
    // out_for_delivery and delivered move the order itself, which triggers customer notifications.
    changeStatus(o.id, b.status, { admin: req.admin, force: b.status === 'out_for_delivery' && ['ready', 'preparing'].includes(o.status) });
  }
  audit(req, 'delivery_update', 'order', o.order_number, `${o.order_number} delivery: ${b.status.replace(/_/g, ' ')}`, { delivery: d.status }, { delivery: b.status });
  res.json({ ok: true });
}));
export default r;
