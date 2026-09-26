import { Router } from 'express';
import { db } from '../../db/index.js';
import { ah, notFound } from '../../lib/errors.js';
import { parse, z, text, bool } from '../../lib/validate.js';
import { audit } from '../../lib/audit.js';
import { requirePerm, can } from '../../middleware/auth.js';
import { paging } from './helpers.js';

const r = Router();
// ---------- Reviews ----------
r.get('/reviews', requirePerm('reviews.manage'), ah(async (req, res) => {
  const f = parse(z.object({ status: z.enum(['', 'pending', 'approved', 'hidden']).optional().default(''), rating: z.coerce.number().int().min(1).max(5).optional() }), req.query);
  const { page, limit, offset } = paging(req.query);
  const where = ['1=1'], p = [];
  if (f.status) { where.push('r.status=?'); p.push(f.status); }
  if (f.rating) { where.push('r.rating=?'); p.push(f.rating); }
  const total = db.prepare(`SELECT COUNT(*) n FROM reviews r WHERE ${where.join(' AND ')}`).get(...p).n;
  const rows = db.prepare(`SELECT r.*, o.order_number FROM reviews r LEFT JOIN orders o ON o.id=r.order_id WHERE ${where.join(' AND ')} ORDER BY r.id DESC LIMIT ? OFFSET ?`).all(...p, limit, offset);
  const stats = db.prepare("SELECT COUNT(*) n, ROUND(AVG(rating),2) avg, SUM(status='pending') pending FROM reviews").get();
  res.json({ rows, total, page, limit, stats });
}));
r.patch('/reviews/:id', requirePerm('reviews.manage'), ah(async (req, res) => {
  const b = parse(z.object({ status: z.enum(['pending', 'approved', 'hidden']).optional(), featured: bool.optional() }), req.body);
  const v = db.prepare('SELECT * FROM reviews WHERE id=?').get(Number(req.params.id)); if (!v) throw notFound('Review not found.');
  const next = { status: b.status ?? v.status, featured: b.featured ?? !!v.featured };
  if (next.featured && next.status !== 'approved') next.status = 'approved';
  db.prepare('UPDATE reviews SET status=?, featured=? WHERE id=?').run(next.status, +next.featured, v.id);
  audit(req, 'update', 'review', v.id, `Review by ${v.customer_name}: ${next.status}${next.featured ? ', featured' : ''}`, { status: v.status, featured: !!v.featured }, next);
  res.json({ ok: true, ...next });
}));
r.delete('/reviews/:id', requirePerm('reviews.manage'), ah(async (req, res) => {
  const v = db.prepare('SELECT * FROM reviews WHERE id=?').get(Number(req.params.id)); if (!v) throw notFound('Review not found.');
  db.prepare('DELETE FROM reviews WHERE id=?').run(v.id); audit(req, 'delete', 'review', v.id, `Deleted review by ${v.customer_name}`, v, null); res.json({ ok: true });
}));

// ---------- Inquiries ----------
r.get('/inquiries', requirePerm('inquiries.manage'), ah(async (req, res) => {
  const f = parse(z.object({ status: z.enum(['', 'new', 'in_progress', 'resolved']).optional().default('') }), req.query);
  const { page, limit, offset } = paging(req.query);
  const where = f.status ? 'WHERE i.status=?' : '', p = f.status ? [f.status] : [];
  res.json({
    rows: db.prepare(`SELECT i.*, a.name AS admin_name FROM inquiries i LEFT JOIN admins a ON a.id=i.admin_id ${where} ORDER BY i.status='resolved', i.id DESC LIMIT ? OFFSET ?`).all(...p, limit, offset),
    total: db.prepare(`SELECT COUNT(*) n FROM inquiries i ${where}`).get(...p).n, page, limit,
    counts: Object.fromEntries(db.prepare('SELECT status, COUNT(*) n FROM inquiries GROUP BY status').all().map(x => [x.status, x.n]))
  });
}));
r.patch('/inquiries/:id', requirePerm('inquiries.manage'), ah(async (req, res) => {
  const b = parse(z.object({ status: z.enum(['new', 'in_progress', 'resolved']).optional(), reply: text(2000).optional() }), req.body);
  const q = db.prepare('SELECT * FROM inquiries WHERE id=?').get(Number(req.params.id)); if (!q) throw notFound('Message not found.');
  const reply = b.reply ?? q.reply, status = b.status ?? (b.reply ? 'resolved' : q.status);
  db.prepare(`UPDATE inquiries SET status=?, reply=?, replied_at=CASE WHEN ?<>reply THEN CURRENT_TIMESTAMP ELSE replied_at END, admin_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(status, reply, reply, req.admin.id, q.id);
  audit(req, 'update', 'inquiry', q.id, `Message from ${q.name}: ${status}${b.reply ? ' (replied)' : ''}`, { status: q.status }, { status });
  res.json({ ok: true, status });
}));

// ---------- Notification center ----------
const visible = admin => db.prepare('SELECT DISTINCT permission FROM notifications').all().map(x => x.permission).filter(p => can(admin, p));
r.get('/notifications', requirePerm('notifications.view', 'orders.view'), ah(async (req, res) => {
  const perms = visible(req.admin);
  if (!perms.length) return res.json({ rows: [], unread: 0 });
  const ph = perms.map(() => '?').join(',');
  const { limit } = paging(req.query);
  res.json({
    rows: db.prepare(`SELECT * FROM notifications WHERE permission IN (${ph}) ORDER BY id DESC LIMIT ?`).all(...perms, limit),
    unread: db.prepare(`SELECT COUNT(*) n FROM notifications WHERE read_at IS NULL AND permission IN (${ph})`).get(...perms).n
  });
}));
r.post('/notifications/read', requirePerm('notifications.view', 'orders.view'), ah(async (req, res) => {
  const b = parse(z.object({ ids: z.array(z.coerce.number().int()).max(500).optional() }), req.body);
  const perms = visible(req.admin); if (!perms.length) return res.json({ ok: true });
  const ph = perms.map(() => '?').join(',');
  if (b.ids?.length) db.prepare(`UPDATE notifications SET read_at=CURRENT_TIMESTAMP WHERE read_at IS NULL AND id IN (${b.ids.map(() => '?').join(',')}) AND permission IN (${ph})`).run(...b.ids, ...perms);
  else db.prepare(`UPDATE notifications SET read_at=CURRENT_TIMESTAMP WHERE read_at IS NULL AND permission IN (${ph})`).run(...perms);
  res.json({ ok: true });
}));
r.get('/notification-logs', requirePerm('settings.manage', 'orders.update'), ah(async (req, res) => {
  const { page, limit, offset } = paging(req.query);
  res.json({ rows: db.prepare('SELECT l.*, o.order_number FROM notification_logs l LEFT JOIN orders o ON o.id=l.order_id ORDER BY l.id DESC LIMIT ? OFFSET ?').all(limit, offset),
    total: db.prepare('SELECT COUNT(*) n FROM notification_logs').get().n, page, limit });
}));
export default r;
