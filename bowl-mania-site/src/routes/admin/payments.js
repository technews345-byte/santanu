import { Router } from 'express';
import { db } from '../../db/index.js';
import { ah, notFound } from '../../lib/errors.js';
import { parse, z, text, ymd } from '../../lib/validate.js';
import { audit } from '../../lib/audit.js';
import { requirePerm } from '../../middleware/auth.js';
import { localToDate, sqlNow, addDays } from '../../lib/time.js';
import { reconcile, refund } from '../../services/payments.js';
import { getOrder } from '../../services/orders.js';
import { paging, likeEsc } from './helpers.js';

const r = Router();
export function paymentFilters(q) {
  const f = parse(z.object({ status: z.string().optional().default(''), provider: z.enum(['', 'razorpay', 'cod']).optional().default(''), q: text(80).optional().default(''), from: ymd.optional(), to: ymd.optional() }), q);
  const where = ['1=1'], p = [];
  if (f.status) { where.push('p.status=?'); p.push(f.status); }
  if (f.provider) { where.push('p.provider=?'); p.push(f.provider); }
  if (f.from) { where.push('p.created_at>=?'); p.push(sqlNow(localToDate(f.from, '00:00'))); }
  if (f.to) { where.push('p.created_at<?'); p.push(sqlNow(localToDate(addDays(f.to, 1), '00:00'))); }
  if (f.q) { where.push("(o.order_number LIKE ? ESCAPE '\\' OR o.customer_name LIKE ? ESCAPE '\\' OR p.razorpay_payment_id LIKE ? ESCAPE '\\' OR p.razorpay_order_id LIKE ? ESCAPE '\\')"); p.push(...Array(4).fill(likeEsc(f.q))); }
  return { where: where.join(' AND '), params: p };
}
r.get('/payments', requirePerm('payments.view'), ah(async (req, res) => {
  const { where, params } = paymentFilters(req.query);
  const { page, limit, offset } = paging(req.query);
  const total = db.prepare(`SELECT COUNT(*) n FROM payments p JOIN orders o ON o.id=p.order_id WHERE ${where}`).get(...params).n;
  const rows = db.prepare(`SELECT p.*, o.order_number, o.customer_name, o.customer_phone, o.status AS order_status FROM payments p JOIN orders o ON o.id=p.order_id WHERE ${where} ORDER BY p.id DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);
  const sums = db.prepare(`SELECT p.status, p.provider, COUNT(*) n, SUM(p.amount) amount, SUM(p.refunded_amount) refunded FROM payments p JOIN orders o ON o.id=p.order_id WHERE ${where} GROUP BY p.status, p.provider`).all(...params);
  res.json({ rows, total, page, limit, sums });
}));
r.get('/payments/:id', requirePerm('payments.view'), ah(async (req, res) => {
  const p = db.prepare('SELECT p.*, o.order_number, o.customer_name, o.customer_phone FROM payments p JOIN orders o ON o.id=p.order_id WHERE p.id=?').get(Number(req.params.id));
  if (!p) throw notFound('Payment not found.');
  res.json({ ...p, refunds: db.prepare('SELECT r.*, a.name AS admin_name FROM refunds r LEFT JOIN admins a ON a.id=r.admin_id WHERE payment_id=? ORDER BY id').all(p.id) });
}));
r.post('/orders/:id/reconcile', requirePerm('payments.view'), ah(async (req, res) => {
  const o = getOrder(Number(req.params.id)); if (!o) throw notFound('Order not found.');
  const out = await reconcile(o.id);
  audit(req, 'reconcile', 'payment', o.order_number, `Checked Razorpay for ${o.order_number}: ${out.found}`);
  res.json({ found: out.found, payment_status: out.order.payment_status });
}));
r.post('/orders/:id/refund', requirePerm('payments.refund'), ah(async (req, res) => {
  const b = parse(z.object({ amount: z.coerce.number().int().positive().optional(), reason: text(200).optional().default('') }), req.body);
  const o = getOrder(Number(req.params.id)); if (!o) throw notFound('Order not found.');
  const after = await refund(o.id, b.amount, b.reason, req.admin);
  audit(req, 'refund', 'payment', o.order_number, `Refunded ₹${b.amount ?? o.total} on ${o.order_number}${b.reason ? ' — ' + b.reason : ''}`, { payment_status: o.payment_status }, { payment_status: after.payment_status });
  res.json({ payment_status: after.payment_status, status: after.status });
}));
export default r;
