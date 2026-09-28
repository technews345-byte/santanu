// Admin API for rider operations: live map, rider profiles and performance, attendance,
// leave, rider support tickets and private files (proof photos, signatures, selfies).
import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import { db } from '../../db/index.js';
import { ah, notFound, badRequest, forbidden } from '../../lib/errors.js';
import { parse, z, text, ymd } from '../../lib/validate.js';
import { audit } from '../../lib/audit.js';
import { requirePerm, can } from '../../middleware/auth.js';
import { localParts } from '../../lib/time.js';
import { getSetting } from '../../services/settings.js';
import * as R from '../../services/riders.js';

const r = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1 } });
const RIDERS = `SELECT a.id, a.name, a.email, a.phone, a.status, a.employee_id, a.vehicle_type, a.vehicle_number, a.joining_date, a.photo <> '' AS has_photo, a.last_login_at
  FROM admins a JOIN role_permissions rp ON rp.role_id=a.role_id JOIN permissions p ON p.id=rp.permission_id WHERE p.key='delivery.update'
    AND NOT EXISTS (SELECT 1 FROM role_permissions x JOIN permissions px ON px.id=x.permission_id WHERE x.role_id=a.role_id AND px.key='delivery.assign')`;
// Riders are staff who make deliveries but don't manage them (managers and owners also hold delivery.update).

function liveRow(a) {
  const s = R.riderState(a.id);
  const stale = getSetting('riders').stale_location_minutes;
  const current = db.prepare(`SELECT o.id, o.order_number, o.status AS order_status, d.status, o.lat, o.lng, o.address, ar.name AS area_name, ar.lat AS area_lat, ar.lng AS area_lng
    FROM delivery_assignments d JOIN orders o ON o.id=d.order_id LEFT JOIN delivery_areas ar ON ar.id=o.area_id
    WHERE d.staff_id=? AND d.status<>'delivered' AND o.status NOT IN ('cancelled','refunded','delivered','completed') ORDER BY d.status='assigned', d.assigned_at LIMIT 1`).get(a.id);
  const age = s.location_at ? Math.round((Date.now() - Date.parse(s.location_at.replace(' ', 'T') + 'Z')) / 1000) : null;
  const att = db.prepare('SELECT check_in_at, check_out_at FROM attendance WHERE admin_id=? AND date=?').get(a.id, localParts().date);
  return {
    ...a, online: !!s.online, online_since: s.online_since || null,
    photo_url: a.has_photo ? fileUrl(db.prepare('SELECT photo FROM admins WHERE id=?').get(a.id).photo) : null,
    location: s.lat != null ? { lat: s.lat, lng: s.lng, accuracy: s.accuracy, speed: s.speed, heading: s.heading, at: s.location_at, age_seconds: age, stale: age == null || age > stale * 60 } : null,
    current: current ? { ...current, status_label: R.STEP_LABEL[current.status] } : null,
    active_count: db.prepare(`SELECT COUNT(*) n FROM delivery_assignments d JOIN orders o ON o.id=d.order_id WHERE d.staff_id=? AND d.status<>'delivered' AND o.status NOT IN ('cancelled','refunded','delivered','completed')`).get(a.id).n,
    attendance: att ? (att.check_out_at ? 'checked_out' : 'working') : 'not_checked_in'
  };
}

// ---------- Live operations ----------
r.get('/riders', requirePerm('riders.view', 'delivery.assign'), (req, res) => {
  const rows = db.prepare(`${RIDERS} ORDER BY a.status='active' DESC, a.name`).all().map(liveRow);
  res.set('Cache-Control', 'no-store').json({ rows, stale_minutes: getSetting('riders').stale_location_minutes,
    kitchens: db.prepare('SELECT id, name, lat, lng FROM delivery_areas WHERE active=1').all() });
});
r.get('/riders/:id', requirePerm('riders.view'), ah(async (req, res) => {
  const a = db.prepare(`${RIDERS} AND a.id=?`).get(Number(req.params.id)); if (!a) throw notFound('Rider not found.');
  const q = parse(z.object({ from: ymd.optional(), to: ymd.optional() }), req.query);
  res.json({
    ...liveRow(a), today: R.todayStats(a.id), performance: R.performance(a.id, q),
    history: R.deliveryHistory(a.id, { status: 'all', from: q.from, to: q.to, page: 1, limit: 50 }).rows,
    attendance: db.prepare('SELECT id, date, status, check_in_at, check_out_at, check_in_selfie, check_out_selfie FROM attendance WHERE admin_id=? ORDER BY date DESC LIMIT 14').all(a.id)
      .map(x => ({ ...x, check_in_selfie: fileUrl(x.check_in_selfie), check_out_selfie: fileUrl(x.check_out_selfie) })),
    photo_url: a.has_photo ? fileUrl(db.prepare('SELECT photo FROM admins WHERE id=?').get(a.id).photo) : null
  });
}));
r.get('/riders/:id/track', requirePerm('riders.view'), ah(async (req, res) => {
  const q = parse(z.object({ date: ymd.optional() }), req.query);
  const day = R.dayRange(q.date || localParts().date, q.date || localParts().date);
  res.json(db.prepare('SELECT lat, lng, accuracy, speed, order_id, recorded_at FROM rider_locations WHERE admin_id=? AND recorded_at BETWEEN ? AND ? ORDER BY recorded_at LIMIT 5000').all(Number(req.params.id), day.start, day.end));
}));
r.patch('/riders/:id', requirePerm('riders.manage'), ah(async (req, res) => {
  const a = db.prepare(`${RIDERS} AND a.id=?`).get(Number(req.params.id)); if (!a) throw notFound('Rider not found.');
  const b = parse(z.object({ employee_id: text(40), vehicle_type: text(40), vehicle_number: text(20).transform(v => v.toUpperCase()), joining_date: z.union([z.literal(''), ymd]).transform(v => v || null) }), req.body);
  db.prepare('UPDATE admins SET employee_id=?, vehicle_type=?, vehicle_number=?, joining_date=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(b.employee_id, b.vehicle_type, b.vehicle_number, b.joining_date, a.id);
  audit(req, 'update', 'rider', a.id, `Edited rider details of ${a.name}`, { employee_id: a.employee_id, vehicle_number: a.vehicle_number }, { employee_id: b.employee_id, vehicle_number: b.vehicle_number });
  res.json({ ok: true });
}));
r.post('/riders/:id/photo', requirePerm('riders.manage'), upload.single('photo'), ah(async (req, res) => {
  const a = db.prepare(`${RIDERS} AND a.id=?`).get(Number(req.params.id)); if (!a) throw notFound('Rider not found.');
  const name = await R.savePrivateImage(req.file, 'rider', { max: 600, quality: 80 });
  db.prepare('UPDATE admins SET photo=? WHERE id=?').run(name, a.id);
  audit(req, 'update', 'rider', a.id, `Changed photo of ${a.name}`);
  res.json({ photo_url: fileUrl(name) });
}));
r.post('/riders/:id/offline', requirePerm('delivery.assign'), ah(async (req, res) => {
  const a = db.prepare(`${RIDERS} AND a.id=?`).get(Number(req.params.id)); if (!a) throw notFound('Rider not found.');
  R.setOnline(a, false);
  R.notifyRider(a.id, { type: 'system', title: 'You were set offline by a manager' });
  audit(req, 'rider_status', 'admin', a.id, `Set ${a.name} offline`);
  res.json({ ok: true });
}));

// ---------- Attendance and leave ----------
r.get('/attendance', requirePerm('attendance.view'), ah(async (req, res) => {
  const q = parse(z.object({ date: ymd.optional(), rider_id: z.coerce.number().int().positive().optional() }), req.query);
  const date = q.date || localParts().date;
  const riders = db.prepare(`${RIDERS} AND a.status='active' ${q.rider_id ? 'AND a.id=?' : ''} ORDER BY a.name`).all(...(q.rider_id ? [q.rider_id] : []));
  const rows = riders.map(a => {
    const at = db.prepare('SELECT * FROM attendance WHERE admin_id=? AND date=?').get(a.id, date);
    const leave = db.prepare("SELECT * FROM leave_requests WHERE admin_id=? AND status='approved' AND ? BETWEEN from_date AND to_date").get(a.id, date);
    const breaks = at ? db.prepare("SELECT started_at, ended_at FROM attendance_breaks WHERE attendance_id=? AND kind='break' ORDER BY id").all(at.id) : [];
    // Earlier check-outs of the day and the check-ins that followed them.
    const gaps = at ? db.prepare("SELECT started_at AS checked_out_at, ended_at AS checked_in_at, selfie, lat, lng FROM attendance_breaks WHERE attendance_id=? AND kind='off' ORDER BY id").all(at.id)
      .map(g => ({ ...g, selfie: fileUrl(g.selfie) })) : [];
    return { rider: { id: a.id, name: a.name, employee_id: a.employee_id }, leave: leave ? { reason: leave.reason } : null, breaks, gaps,
      attendance: at ? { ...at, check_in_selfie: fileUrl(at.check_in_selfie), check_out_selfie: fileUrl(at.check_out_selfie) } : null,
      state: leave ? 'on_leave' : !at ? 'not_checked_in' : at.check_out_at ? 'checked_out' : breaks.some(x => !x.ended_at) ? 'on_break' : 'working' };
  });
  res.json({ date, rows });
}));
r.get('/leave', requirePerm('riders.manage', 'attendance.view'), ah(async (req, res) => {
  const q = parse(z.object({ status: z.enum(['', 'pending', 'approved', 'rejected', 'cancelled']).optional().default('') }), req.query);
  res.json(db.prepare(`SELECT l.*, a.name AS rider_name, d.name AS decided_by_name FROM leave_requests l JOIN admins a ON a.id=l.admin_id LEFT JOIN admins d ON d.id=l.decided_by
    ${q.status ? 'WHERE l.status=?' : ''} ORDER BY l.status='pending' DESC, l.from_date DESC LIMIT 200`).all(...(q.status ? [q.status] : [])));
}));
r.patch('/leave/:id', requirePerm('riders.manage'), ah(async (req, res) => {
  const b = parse(z.object({ status: z.enum(['approved', 'rejected']) }), req.body);
  const l = db.prepare('SELECT l.*, a.name FROM leave_requests l JOIN admins a ON a.id=l.admin_id WHERE l.id=?').get(Number(req.params.id)); if (!l) throw notFound('Leave request not found.');
  if (l.status !== 'pending') throw badRequest('This request was already decided.');
  db.prepare('UPDATE leave_requests SET status=?, decided_by=?, decided_at=CURRENT_TIMESTAMP WHERE id=?').run(b.status, req.admin.id, l.id);
  R.notifyRider(l.admin_id, { type: 'attendance', title: `Leave ${b.status}`, body: `${l.from_date}${l.to_date !== l.from_date ? ' to ' + l.to_date : ''}` });
  audit(req, 'update', 'leave', l.id, `${b.status === 'approved' ? 'Approved' : 'Rejected'} leave for ${l.name} (${l.from_date}–${l.to_date})`);
  res.json({ ok: true });
}));

// ---------- Rider support ----------
r.get('/support', requirePerm('support.manage'), ah(async (req, res) => {
  const q = parse(z.object({ status: z.enum(['', 'open', 'in_progress', 'resolved']).optional().default('') }), req.query);
  res.json({
    rows: db.prepare(`SELECT t.*, a.name AS rider_name, a.phone AS rider_phone, o.order_number,
        (SELECT body FROM support_messages WHERE ticket_id=t.id ORDER BY id LIMIT 1) AS first_message
      FROM support_tickets t JOIN admins a ON a.id=t.admin_id LEFT JOIN orders o ON o.id=t.order_id ${q.status ? 'WHERE t.status=?' : ''}
      ORDER BY t.status='resolved', t.priority='urgent' DESC, t.id DESC LIMIT 200`).all(...(q.status ? [q.status] : [])),
    counts: Object.fromEntries(db.prepare('SELECT status, COUNT(*) n FROM support_tickets GROUP BY status').all().map(x => [x.status, x.n]))
  });
}));
const ticket = id => {
  const t = db.prepare('SELECT t.*, a.name AS rider_name, a.phone AS rider_phone, o.order_number FROM support_tickets t JOIN admins a ON a.id=t.admin_id LEFT JOIN orders o ON o.id=t.order_id WHERE t.id=?').get(id);
  if (!t) throw notFound('Ticket not found.');
  return { ...t, messages: db.prepare('SELECT m.*, a.name AS author FROM support_messages m LEFT JOIN admins a ON a.id=m.author_id WHERE ticket_id=? ORDER BY m.id').all(id)
    .map(m => ({ ...m, attachment_url: fileUrl(m.attachment) })) };
};
r.get('/support/:id', requirePerm('support.manage'), ah(async (req, res) => res.json(ticket(Number(req.params.id)))));
r.post('/support/:id/messages', requirePerm('support.manage'), ah(async (req, res) => {
  const t = ticket(Number(req.params.id));
  const b = parse(z.object({ message: text(2000, 1), status: z.enum(['open', 'in_progress', 'resolved']).optional() }), req.body);
  db.prepare('INSERT INTO support_messages (ticket_id, author_id, from_rider, body) VALUES (?,?,0,?)').run(t.id, req.admin.id, b.message);
  db.prepare('UPDATE support_tickets SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(b.status || (t.status === 'open' ? 'in_progress' : t.status), t.id);
  R.notifyRider(t.admin_id, { type: 'support', title: `Reply on "${t.subject}"`, body: b.message.slice(0, 140), ticket_id: t.id, order_id: t.order_id });
  audit(req, 'reply', 'support_ticket', t.id, `Replied to ${t.rider_name}: ${t.subject}`);
  res.json(ticket(t.id));
}));
r.patch('/support/:id', requirePerm('support.manage'), ah(async (req, res) => {
  const t = ticket(Number(req.params.id));
  const b = parse(z.object({ status: z.enum(['open', 'in_progress', 'resolved']) }), req.body);
  db.prepare('UPDATE support_tickets SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(b.status, t.id);
  if (b.status === 'resolved') R.notifyRider(t.admin_id, { type: 'support', title: `Resolved: ${t.subject}`, ticket_id: t.id });
  audit(req, 'update', 'support_ticket', t.id, `${t.subject}: ${b.status.replace('_', ' ')}`);
  res.json(ticket(t.id));
}));

// ---------- Private files ----------
const fileUrl = name => (name ? `/api/admin/files/${name}` : null);
const FILE_PERMS = { proof: ['orders.view', 'delivery.view'], signature: ['orders.view', 'delivery.view'], selfie: ['attendance.view'], rider: ['riders.view', 'staff.manage', 'delivery.assign'], support: ['support.manage'] };
r.get('/files/:kind/:month/:file', (req, res, next) => {
  const name = `${req.params.kind}/${req.params.month}/${req.params.file}`;
  const p = R.privatePath(name);
  if (!p) return next(notFound());
  if (!(FILE_PERMS[req.params.kind] || []).some(x => can(req.admin, x))) return next(forbidden());
  if (!fs.existsSync(p)) return next(notFound('File not found.'));
  res.set({ 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff' }).type('image/webp').sendFile(p);
});

export default r;
