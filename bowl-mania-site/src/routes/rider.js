// API for the Bowl Mania Rider Android app. Delivery staff sign in with the staff account the owner creates
// in Admin > Staff & roles. The app sends `Authorization: Bearer <token>` (no cookies, so no CSRF).
// Riders are salaried employees: no response here contains rider pay, delivery fees, commission or tips.
// The only amount shown is the cash a customer must pay at the door (cash on delivery).
import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import { db } from '../db/index.js';
import { config } from '../config.js';
import { ah, unauthorized, forbidden, notFound, badRequest, conflict } from '../lib/errors.js';
import { parse, z, text, email, ymd } from '../lib/validate.js';
import { token, sha256 } from '../lib/ids.js';
import { sqlNow, localParts } from '../lib/time.js';
import { audit } from '../lib/audit.js';
import { hashPassword, verifyPassword } from '../services/passwords.js';
import { loadAdmin } from '../services/auth.js';
import { getSetting } from '../services/settings.js';
import { notifyAdmins } from '../services/notifications.js';
import { can } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import * as R from '../services/riders.js';
import * as A from '../services/attendance.js';

const r = Router();
const APP = 'Bowl Mania Rider app';
const loginLimit = rateLimit({ windowMs: 15 * 60_000, max: 10, key: req => req.ip + '|' + String(req.body?.email || '').toLowerCase(), message: 'Too many sign-in attempts. Try again in 15 minutes.' });
const otpLimit = rateLimit({ windowMs: 10 * 60_000, max: 30, key: req => 'otp|' + (req.admin?.id || req.ip), message: 'Too many code attempts. Please wait a few minutes.' });
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 2, fields: 20 } });
let dummyHash; hashPassword('timing-equaliser-2').then(h => { dummyHash = h; });
const expiry = () => sqlNow(new Date(Date.now() + config.refreshTtlDays * 86_400_000));
const num = z.union([z.literal(''), z.coerce.number()]).optional().transform(v => (v === '' || v == null ? null : v));
const lat = num.refine(v => v == null || (v >= -90 && v <= 90), 'Invalid latitude.');
const lng = num.refine(v => v == null || (v >= -180 && v <= 180), 'Invalid longitude.');
const key = z.string().trim().regex(/^[\w-]{8,64}$/, 'Invalid request key.').optional();

function profile(a) {
  const row = db.prepare('SELECT employee_id, vehicle_type, vehicle_number, joining_date, photo, created_at FROM admins WHERE id=?').get(a.id);
  const today = localParts().date;
  return {
    id: a.id, employee_id: row.employee_id, name: a.name, email: a.email, phone: a.phone || '', role: a.role_name,
    vehicle_type: row.vehicle_type, vehicle_number: row.vehicle_number, joining_date: row.joining_date || row.created_at.slice(0, 10),
    company: getSetting('restaurant').name, photo_url: row.photo ? '/api/rider/me/photo' : null
  };
}

function riderAuth(req, res, next) {
  const m = /^Bearer (\S{20,200})$/.exec(req.get('authorization') || '');
  if (!m) return next(unauthorized());
  const s = db.prepare('SELECT * FROM admin_sessions WHERE token_hash=?').get(sha256(m[1]));
  if (!s || s.revoked_at || s.expires_at < sqlNow() || s.user_agent !== APP) return next(unauthorized('Your session has ended. Please sign in again.'));
  const admin = loadAdmin(s.admin_id);
  if (!admin || admin.status !== 'active') return next(unauthorized('This account is disabled. Ask the owner to enable it.'));
  if (!can(admin, 'delivery.update')) return next(forbidden('This account is not a delivery account.'));
  // Sliding expiry: riders who use the app stay signed in. Written at most once a minute.
  if (!s.last_used_at || s.last_used_at < sqlNow(new Date(Date.now() - 60_000))) db.prepare('UPDATE admin_sessions SET last_used_at=CURRENT_TIMESTAMP, expires_at=? WHERE id=?').run(expiry(), s.id);
  req.admin = admin; req.session = { sid: s.id };
  next();
}

// ---------- Session ----------
r.post('/login', loginLimit, ah(async (req, res) => {
  const b = parse(z.object({ email, password: z.string().min(1, 'Enter your password.').max(200) }), req.body);
  const row = db.prepare('SELECT id, password_hash, status FROM admins WHERE email=?').get(b.email);
  const ok = await verifyPassword(b.password, row?.password_hash || dummyHash);
  if (!row || !ok) throw unauthorized('Wrong email or password.');
  if (row.status !== 'active') throw unauthorized('This account is disabled. Ask the owner to enable it.');
  const admin = loadAdmin(row.id);
  if (!can(admin, 'delivery.update')) throw forbidden('This app is for delivery staff. Ask the owner to give your account the Delivery Staff role.');
  const t = token(32);
  db.prepare('INSERT INTO admin_sessions (admin_id, token_hash, user_agent, ip, expires_at) VALUES (?,?,?,?,?)').run(admin.id, sha256(t), APP, req.ip || '', expiry());
  db.prepare('UPDATE admins SET last_login_at=CURRENT_TIMESTAMP WHERE id=?').run(admin.id);
  req.admin = admin; audit(req, 'login', 'admin', admin.id, `${admin.name} signed in to the rider app`);
  res.json({ token: t, rider: profile(admin) });
}));

r.use(riderAuth);

r.post('/logout', (req, res) => {
  db.prepare('UPDATE admin_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE id=?').run(req.session.sid);
  const t = String(req.body?.device_token || '');
  if (t) db.prepare('DELETE FROM rider_devices WHERE token=? AND admin_id=?').run(t, req.admin.id);
  res.json({ ok: true });
});
r.get('/me', (req, res) => res.json(profile(req.admin)));
r.get('/me/photo', (req, res, next) => {
  const p = R.privatePath(db.prepare('SELECT photo FROM admins WHERE id=?').get(req.admin.id)?.photo);
  if (!p || !fs.existsSync(p)) return next(notFound('No photo.'));
  res.set('Cache-Control', 'private, max-age=3600').type('image/webp').sendFile(p);
});
r.post('/device', ah(async (req, res) => {
  const b = parse(z.object({ token: z.string().trim().min(20).max(4096), platform: z.enum(['android']).optional().default('android') }), req.body);
  db.prepare(`INSERT INTO rider_devices (admin_id, token, platform) VALUES (?,?,?) ON CONFLICT(token) DO UPDATE SET admin_id=excluded.admin_id, updated_at=CURRENT_TIMESTAMP`).run(req.admin.id, b.token, b.platform);
  res.json({ ok: true });
}));
r.get('/config', (req, res) => {
  const rules = getSetting('riders'), rest = getSetting('restaurant');
  res.json({ company: rest.name, support_phone: rules.support_phone || rest.phone, emergency_number: '112', stale_location_minutes: rules.stale_location_minutes,
    requirements: { pickup_otp: rules.require_pickup_otp, delivery_otp: rules.require_delivery_otp, proof_photo: rules.require_proof_photo, signature: rules.require_signature, checkout_selfie: rules.checkout_selfie } });
});

// ---------- Home, sync, status and location ----------
const unread = id => db.prepare('SELECT COUNT(*) n FROM rider_notifications WHERE admin_id=? AND read_at IS NULL').get(id).n;
r.get('/home', (req, res) => {
  const list = R.riderDeliveries(req.admin.id);
  const state = R.riderState(req.admin.id);
  const att = A.attendanceToday(req.admin.id);
  res.set('Cache-Control', 'no-store').json({
    rider: { id: req.admin.id, name: req.admin.name }, online: !!state.online, online_since: state.online_since || null,
    today: R.todayStats(req.admin.id), active: list.active[0] || null, active_count: list.active.length, new_assignments: list.new,
    attendance: { state: att.state, on_leave: !!att.on_leave }, unread_notifications: unread(req.admin.id)
  });
});
// Lightweight poll used by the app's background service: new notifications since an id, and whether tracking should run.
r.get('/sync', ah(async (req, res) => {
  const q = parse(z.object({ after: z.coerce.number().int().min(0).optional().default(0) }), req.query);
  const state = R.riderState(req.admin.id);
  res.set('Cache-Control', 'no-store').json({
    online: !!state.online, tracking: !!state.online || R.hasActiveDelivery(req.admin.id), server_time: new Date().toISOString(),
    active_order_id: R.riderDeliveries(req.admin.id).active[0]?.order_id ?? null,
    notifications: db.prepare('SELECT id, type, title, body, order_id, ticket_id, read_at, created_at FROM rider_notifications WHERE admin_id=? AND id>? ORDER BY id LIMIT 50').all(req.admin.id, q.after),
    unread: unread(req.admin.id)
  });
}));
r.post('/status', ah(async (req, res) => {
  const b = parse(z.object({ online: z.boolean() }), req.body);
  if (b.online && !db.prepare("SELECT photo <> '' AS ok FROM admins WHERE id=?").get(req.admin.id)?.ok)
    throw conflict('Your profile photo is missing. Ask your manager to add it in the admin panel before you go online.');
  const s = R.setOnline(req.admin, b.online);
  audit(req, 'rider_status', 'admin', req.admin.id, `${req.admin.name} went ${b.online ? 'online' : 'offline'}`);
  res.json({ online: !!s.online, online_since: s.online_since || null });
}));
const point = z.object({ latitude: z.coerce.number().min(-90).max(90), longitude: z.coerce.number().min(-180).max(180), accuracy: z.coerce.number().min(0).max(100000).nullable().optional(),
  speed: z.coerce.number().min(0).max(200).nullable().optional(), heading: z.coerce.number().min(0).max(360).nullable().optional(), timestamp: z.string().max(40), orderId: z.coerce.number().int().positive().nullable().optional() });
r.post('/location', ah(async (req, res) => {
  const b = parse(z.object({ points: z.array(point).min(1).max(200) }), req.body);
  res.json(R.recordLocations(req.admin, b.points));
}));

// ---------- Deliveries ----------
r.get('/deliveries', (req, res) => res.set('Cache-Control', 'no-store').json(R.riderDeliveries(req.admin.id)));
r.get('/deliveries/history', ah(async (req, res) => {
  const q = parse(z.object({ status: z.enum(['all', 'delivered', 'cancelled', 'rejected']).optional().default('all'), from: ymd.optional(), to: ymd.optional(),
    page: z.coerce.number().int().min(1).optional().default(1) }), req.query);
  res.json(R.deliveryHistory(req.admin.id, q));
}));
const orderId = req => { const id = Number(req.params.orderId); if (!Number.isInteger(id) || id < 1) throw notFound('Order not found.'); return id; };
r.get('/deliveries/:orderId', ah(async (req, res) => res.set('Cache-Control', 'no-store').json(R.riderDelivery(orderId(req), req.admin.id))));
r.post('/deliveries/:orderId/accept', ah(async (req, res) => {
  const b = parse(z.object({ key, lat, lng }), req.body || {});
  res.json(await R.deliveryStep(req.admin, orderId(req), 'accept', b));
}));
r.post('/deliveries/:orderId/reject', ah(async (req, res) => {
  const b = parse(z.object({ reason: text(200).optional().default('') }), req.body || {});
  res.json(R.rejectDelivery(req.admin, orderId(req), b.reason));
}));
const STEPS = ['start', 'arrive_restaurant', 'verify_pickup', 'start_delivery', 'arrive_customer', 'verify_delivery', 'collect_cash', 'deliver'];
r.post('/deliveries/:orderId/step', otpLimit, ah(async (req, res) => {
  const b = parse(z.object({ step: z.enum(STEPS), otp: z.string().trim().max(8).optional(), key, lat, lng }), req.body);
  res.json(await R.deliveryStep(req.admin, orderId(req), b.step, b));
}));
r.post('/deliveries/:orderId/proof', upload.fields([{ name: 'photo', maxCount: 1 }, { name: 'signature', maxCount: 1 }]), ah(async (req, res) => {
  const b = parse(z.object({ note: text(500).optional().default(''), key, lat, lng }), req.body || {});
  res.json(await R.deliveryStep(req.admin, orderId(req), 'proof', { ...b, photo: req.files?.photo?.[0], signature: req.files?.signature?.[0] }));
}));
r.get('/performance', ah(async (req, res) => {
  const q = parse(z.object({ from: ymd.optional(), to: ymd.optional() }), req.query);
  res.json(R.performance(req.admin.id, q));
}));

// ---------- Notifications ----------
r.get('/notifications', ah(async (req, res) => {
  const q = parse(z.object({ before: z.coerce.number().int().positive().optional(), limit: z.coerce.number().int().min(1).max(100).optional().default(50) }), req.query);
  const rows = db.prepare(`SELECT id, type, title, body, order_id, ticket_id, read_at, created_at FROM rider_notifications WHERE admin_id=? ${q.before ? 'AND id<?' : ''} ORDER BY id DESC LIMIT ?`)
    .all(...[req.admin.id, q.before, q.limit].filter(v => v !== undefined));
  res.json({ rows, unread: unread(req.admin.id) });
}));
r.post('/notifications/read', ah(async (req, res) => {
  const b = parse(z.object({ ids: z.array(z.coerce.number().int().positive()).max(200).optional() }), req.body || {});
  if (b.ids?.length) db.prepare(`UPDATE rider_notifications SET read_at=CURRENT_TIMESTAMP WHERE admin_id=? AND read_at IS NULL AND id IN (${b.ids.map(() => '?').join(',')})`).run(req.admin.id, ...b.ids);
  else db.prepare('UPDATE rider_notifications SET read_at=CURRENT_TIMESTAMP WHERE admin_id=? AND read_at IS NULL').run(req.admin.id);
  res.json({ unread: unread(req.admin.id) });
}));
r.delete('/notifications', (req, res) => {
  db.prepare('DELETE FROM rider_notifications WHERE admin_id=? AND read_at IS NOT NULL').run(req.admin.id);
  res.json({ unread: unread(req.admin.id) });
});

// ---------- Attendance and leave ----------
r.get('/attendance', (req, res) => res.set('Cache-Control', 'no-store').json(A.attendanceToday(req.admin.id)));
const selfieUpload = upload.single('selfie');
r.post('/attendance/check-in', selfieUpload, ah(async (req, res) => {
  const b = parse(z.object({ lat, lng, accuracy: num }), req.body || {});
  res.json(await A.checkIn(req.admin, { ...b, selfie: req.file }));
}));
r.post('/attendance/check-out', selfieUpload, ah(async (req, res) => {
  const b = parse(z.object({ lat, lng }), req.body || {});
  res.json(await A.checkOut(req.admin, { ...b, selfie: req.file }));
}));
r.post('/attendance/break/start', (req, res, next) => { try { res.json(A.startBreak(req.admin)); } catch (e) { next(e); } });
r.post('/attendance/break/end', (req, res, next) => { try { res.json(A.endBreak(req.admin)); } catch (e) { next(e); } });
r.get('/attendance/history', ah(async (req, res) => {
  const q = parse(z.object({ from: ymd.optional(), to: ymd.optional() }), req.query);
  res.json(A.attendanceHistory(req.admin.id, q.from, q.to));
}));
r.get('/leave', (req, res) => res.json(db.prepare('SELECT id, from_date, to_date, reason, status, decided_at, created_at FROM leave_requests WHERE admin_id=? ORDER BY id DESC LIMIT 50').all(req.admin.id)));
r.post('/leave', ah(async (req, res) => {
  const b = parse(z.object({ from_date: ymd, to_date: ymd, reason: text(300, 3) }), req.body);
  res.status(201).json(A.requestLeave(req.admin, b));
}));
r.post('/leave/:id/cancel', (req, res, next) => {
  const l = db.prepare("SELECT * FROM leave_requests WHERE id=? AND admin_id=?").get(Number(req.params.id), req.admin.id);
  if (!l) return next(notFound('Leave request not found.'));
  if (l.status !== 'pending') return next(conflict('Only pending requests can be cancelled.'));
  db.prepare("UPDATE leave_requests SET status='cancelled' WHERE id=?").run(l.id);
  res.json({ ok: true });
});

// ---------- Support and safety ----------
const CATEGORIES = ['delivery', 'customer', 'restaurant', 'order', 'cod', 'vehicle', 'technical', 'emergency', 'accident', 'safety'];
const URGENT = new Set(['emergency', 'accident', 'safety']);
const CATEGORY_LABEL = { delivery: 'Delivery issue', customer: 'Customer issue', restaurant: 'Restaurant issue', order: 'Order issue', cod: 'Payment / COD issue',
  vehicle: 'Vehicle issue', technical: 'Technical problem', emergency: 'Emergency', accident: 'Accident', safety: 'Threat / safety issue' };
async function createTicket(req, b, file) {
  if (b.key) {
    const dup = db.prepare('SELECT id FROM support_tickets WHERE client_key=?').get(`${req.admin.id}:${b.key}`);
    if (dup) return dup.id;
  }
  if (b.order_id && !db.prepare('SELECT 1 FROM delivery_assignments WHERE order_id=? AND staff_id=? UNION SELECT 1 FROM delivery_rejections WHERE order_id=? AND staff_id=?').get(b.order_id, req.admin.id, b.order_id, req.admin.id)) throw badRequest('That order is not one of your deliveries.');
  const { savePrivateImage } = R;
  const attachment = file ? await savePrivateImage(file, 'support', { max: 1600, quality: 78 }) : '';
  const urgent = URGENT.has(b.category);
  const subject = `${CATEGORY_LABEL[b.category]}${b.order_id ? ' · ' + (db.prepare('SELECT order_number FROM orders WHERE id=?').get(b.order_id)?.order_number || '') : ''}`;
  const id = db.transaction(() => {
    const tid = db.prepare('INSERT INTO support_tickets (admin_id, order_id, category, subject, priority, lat, lng, client_key) VALUES (?,?,?,?,?,?,?,?)')
      .run(req.admin.id, b.order_id || null, b.category, subject, urgent ? 'urgent' : 'normal', b.lat, b.lng, b.key ? `${req.admin.id}:${b.key}` : null).lastInsertRowid;
    db.prepare('INSERT INTO support_messages (ticket_id, author_id, from_rider, body, attachment) VALUES (?,?,1,?,?)').run(tid, req.admin.id, b.message, attachment);
    return tid;
  })();
  const where = b.lat != null ? ` · Location: https://maps.google.com/?q=${b.lat},${b.lng}` : '';
  notifyAdmins({ type: urgent ? 'rider_emergency' : 'rider_support', title: `${urgent ? '🚨 ' : ''}${subject} from ${req.admin.name}`, body: `${b.message.slice(0, 120)}${where}`,
    link: `#/support/${id}`, permission: 'support.manage', data: { sound: urgent || undefined } });
  return id;
}
const ticketView = (id, riderId) => {
  const t = db.prepare('SELECT t.*, o.order_number FROM support_tickets t LEFT JOIN orders o ON o.id=t.order_id WHERE t.id=? AND t.admin_id=?').get(id, riderId);
  if (!t) throw notFound('Ticket not found.');
  const { client_key, admin_id, ...pub } = t;
  return { ...pub, category_label: CATEGORY_LABEL[t.category],
    messages: db.prepare(`SELECT m.id, m.from_rider, m.body, m.attachment <> '' AS has_attachment, m.created_at, a.name AS author FROM support_messages m LEFT JOIN admins a ON a.id=m.author_id WHERE m.ticket_id=? ORDER BY m.id`).all(id) };
};
const ticketSchema = z.object({ category: z.enum(CATEGORIES), message: text(2000, 3), order_id: z.union([z.literal(''), z.coerce.number().int().positive()]).optional().transform(v => v || null), key, lat, lng });
r.get('/support/tickets', (req, res) => res.json(db.prepare(`SELECT t.id, t.category, t.subject, t.status, t.priority, t.created_at, t.updated_at, o.order_number,
  (SELECT COUNT(*) FROM support_messages m WHERE m.ticket_id=t.id AND m.from_rider=0) AS replies FROM support_tickets t LEFT JOIN orders o ON o.id=t.order_id WHERE t.admin_id=? ORDER BY t.id DESC LIMIT 100`).all(req.admin.id)
  .map(t => ({ ...t, category_label: CATEGORY_LABEL[t.category] }))));
r.post('/support/tickets', upload.single('attachment'), ah(async (req, res) => {
  const b = parse(ticketSchema, req.body || {});
  res.status(201).json(ticketView(await createTicket(req, b, req.file), req.admin.id));
}));
r.get('/support/tickets/:id', ah(async (req, res) => res.json(ticketView(Number(req.params.id), req.admin.id))));
r.post('/support/tickets/:id/messages', upload.single('attachment'), ah(async (req, res) => {
  const t = ticketView(Number(req.params.id), req.admin.id);
  const b = parse(z.object({ message: text(2000, 1) }), req.body || {});
  const attachment = req.file ? await R.savePrivateImage(req.file, 'support', { max: 1600, quality: 78 }) : '';
  db.prepare('INSERT INTO support_messages (ticket_id, author_id, from_rider, body, attachment) VALUES (?,?,1,?,?)').run(t.id, req.admin.id, b.message, attachment);
  db.prepare("UPDATE support_tickets SET status=CASE WHEN status='resolved' THEN 'open' ELSE status END, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(t.id);
  notifyAdmins({ type: 'rider_support', title: `New message on ${t.subject} from ${req.admin.name}`, body: b.message.slice(0, 120), link: `#/support/${t.id}`, permission: 'support.manage' });
  res.status(201).json(ticketView(t.id, req.admin.id));
}));
r.post('/emergency', ah(async (req, res) => {
  const b = parse(z.object({ type: z.enum(['emergency', 'accident', 'safety']), message: text(1000).optional().default(''), order_id: z.union([z.literal(''), z.coerce.number().int().positive()]).optional().transform(v => v || null), key, lat, lng }), req.body || {});
  const id = await createTicket(req, { category: b.type, message: b.message || CATEGORY_LABEL[b.type], order_id: b.order_id, key: b.key, lat: b.lat, lng: b.lng });
  audit(req, 'emergency', 'support_ticket', id, `${req.admin.name} raised ${CATEGORY_LABEL[b.type]}`);
  const rules = getSetting('riders');
  res.status(201).json({ ticket_id: id, support_phone: rules.support_phone || getSetting('restaurant').phone, emergency_number: '112' });
}));

export default r;
