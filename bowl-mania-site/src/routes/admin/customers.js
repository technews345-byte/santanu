import { Router } from 'express';
import { db } from '../../db/index.js';
import { ah, notFound } from '../../lib/errors.js';
import { parse, z, text, optEmail } from '../../lib/validate.js';
import { audit, diff } from '../../lib/audit.js';
import { requirePerm } from '../../middleware/auth.js';
import { paging, likeEsc } from './helpers.js';

const r = Router();
// "Placed" orders: COD orders and online orders whose payment went through.
const PLACED = "o.placed_at IS NOT NULL";
const AGG = `COUNT(o.id) FILTER (WHERE ${PLACED} AND o.status NOT IN ('cancelled','refunded')) AS orders_count,
  COALESCE(SUM(o.total) FILTER (WHERE ${PLACED} AND o.status NOT IN ('cancelled','refunded')),0) AS total_spent,
  COUNT(o.id) FILTER (WHERE o.status='cancelled' AND ${PLACED}) AS cancelled_count,
  MIN(o.created_at) FILTER (WHERE ${PLACED}) AS first_order_at, MAX(o.created_at) FILTER (WHERE ${PLACED}) AS last_order_at,
  (SELECT a.name FROM orders x LEFT JOIN delivery_areas a ON a.id=x.area_id WHERE x.customer_id=c.id ORDER BY x.id DESC LIMIT 1) AS last_area`;

r.get('/customers', requirePerm('customers.view'), ah(async (req, res) => {
  const f = parse(z.object({ q: text(80).optional().default(''), status: z.enum(['', 'active', 'blocked']).optional().default(''), segment: z.enum(['', 'new', 'repeat', 'inactive']).optional().default(''),
    sort: z.enum(['last_order_at', 'total_spent', 'orders_count', 'name', 'created_at']).optional().default('last_order_at'), dir: z.enum(['asc', 'desc']).optional().default('desc') }), req.query);
  const { page, limit, offset } = paging(req.query);
  const where = ['1=1'], p = [];
  if (f.q) { const d = f.q.replace(/\D/g, ''); where.push(`(c.name LIKE ? ESCAPE '\\' OR c.email LIKE ? ESCAPE '\\'${d.length >= 3 ? " OR c.phone LIKE ? ESCAPE '\\'" : ''})`); p.push(likeEsc(f.q), likeEsc(f.q)); if (d.length >= 3) p.push(likeEsc(d)); }
  if (f.status) { where.push('c.status=?'); p.push(f.status); }
  const having = { new: 'orders_count=1', repeat: 'orders_count>=2', inactive: "last_order_at < datetime('now','-30 days')" }[f.segment];
  const base = `SELECT c.*, ${AGG} FROM customers c LEFT JOIN orders o ON o.customer_id=c.id WHERE ${where.join(' AND ')} GROUP BY c.id ${having ? 'HAVING ' + having : ''}`;
  const total = db.prepare(`SELECT COUNT(*) n FROM (${base})`).get(...p).n;
  const rows = db.prepare(`${base} ORDER BY ${f.sort} ${f.dir} NULLS LAST, c.id DESC LIMIT ? OFFSET ?`).all(...p, limit, offset);
  res.json({ rows, total, page, limit });
}));

r.get('/customers/:id', requirePerm('customers.view'), ah(async (req, res) => {
  const id = Number(req.params.id);
  const c = db.prepare(`SELECT c.*, ${AGG} FROM customers c LEFT JOIN orders o ON o.customer_id=c.id WHERE c.id=? GROUP BY c.id`).get(id);
  if (!c) throw notFound('Customer not found.');
  res.json({
    ...c,
    addresses: db.prepare('SELECT a.*, d.name AS area_name FROM customer_addresses a LEFT JOIN delivery_areas d ON d.id=a.area_id WHERE customer_id=? ORDER BY last_used_at DESC').all(id),
    orders: db.prepare(`SELECT o.id, o.order_number, o.created_at, o.total, o.status, o.payment_method, o.payment_status, o.fulfilment,
      (SELECT GROUP_CONCAT(quantity || '× ' || name, ', ') FROM order_items WHERE order_id=o.id) AS items_text FROM orders o WHERE customer_id=? AND (${PLACED} OR o.payment_status IN ('failed','created')) ORDER BY o.id DESC LIMIT 100`).all(id),
    payments: db.prepare('SELECT p.*, o.order_number FROM payments p JOIN orders o ON o.id=p.order_id WHERE o.customer_id=? ORDER BY p.id DESC LIMIT 100').all(id),
    favourites: db.prepare(`SELECT oi.name, SUM(oi.quantity) AS qty FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE o.customer_id=? AND ${PLACED} AND o.status NOT IN ('cancelled','refunded') GROUP BY oi.name ORDER BY qty DESC LIMIT 5`).all(id),
    reviews: db.prepare('SELECT rating, comment, created_at, status FROM reviews WHERE customer_id=? ORDER BY id DESC').all(id)
  });
}));

r.patch('/customers/:id', requirePerm('customers.manage'), ah(async (req, res) => {
  const id = Number(req.params.id); const c = db.prepare('SELECT * FROM customers WHERE id=?').get(id); if (!c) throw notFound('Customer not found.');
  const b = parse(z.object({ name: text(80, 1), email: optEmail, status: z.enum(['active', 'blocked']), notes: text(1000).optional().default('') }), req.body);
  db.prepare('UPDATE customers SET name=?, email=?, status=?, notes=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(b.name, b.email, b.status, b.notes, id);
  const [o, n, keys] = diff({ name: c.name, email: c.email, status: c.status, notes: c.notes }, b);
  if (keys.length) audit(req, 'update', 'customer', id, `Edited customer ${b.name}: ${keys.join(', ')}`, o, n);
  res.json({ ok: true });
}));
export default r;
