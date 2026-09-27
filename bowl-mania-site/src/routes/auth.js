import { Router } from 'express';
import { db } from '../db/index.js';
import { config } from '../config.js';
import { ah, unauthorized, badRequest } from '../lib/errors.js';
import { parse, z, email } from '../lib/validate.js';
import { token, sha256 } from '../lib/ids.js';
import { sqlNow } from '../lib/time.js';
import { audit } from '../lib/audit.js';
import { log } from '../lib/logger.js';
import { hashPassword, verifyPassword, strongEnough, passwordRule } from '../services/passwords.js';
import { startSession, refreshSession, endSession, revokeAllSessions, loadAdmin, readAccess } from '../services/auth.js';
import { sendMail, mailConfigured } from '../services/mailer.js';
import { requireAuth, csrf } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';

const r = Router();
const loginLimit = rateLimit({ windowMs: 15 * 60_000, max: 10, key: req => req.ip + '|' + String(req.body?.email || '').toLowerCase(), message: 'Too many sign-in attempts. Try again in 15 minutes.' });
const forgotLimit = rateLimit({ windowMs: 60 * 60_000, max: 5, message: 'Too many reset requests. Try again later.' });
// A fixed hash so a wrong email takes as long as a wrong password.
let dummyHash; hashPassword('timing-equaliser-1').then(h => { dummyHash = h; });

const me = admin => ({ id: admin.id, name: admin.name, email: admin.email, phone: admin.phone, role: admin.role, role_name: admin.role_name, permissions: admin.permissions });

r.post('/login', loginLimit, ah(async (req, res) => {
  const { email: em, password } = parse(z.object({ email, password: z.string().min(1, 'Enter your password.').max(200) }), req.body);
  const row = db.prepare('SELECT id, password_hash, status FROM admins WHERE email=?').get(em);
  const ok = await verifyPassword(password, row?.password_hash || dummyHash);
  if (!row || !ok) throw unauthorized('Wrong email or password.');
  if (row.status !== 'active') throw unauthorized('This account is disabled. Ask the owner to enable it.');
  const admin = loadAdmin(row.id);
  const { csrf: c } = startSession(res, admin, req);
  req.admin = admin; audit(req, 'login', 'admin', admin.id, `${admin.name} signed in`);
  res.json({ admin: me(admin), csrf: c });
}));

r.post('/refresh', ah(async (req, res) => {
  const admin = refreshSession(req, res);
  if (!admin) { endSession(req, res); throw unauthorized('Your session has expired. Please sign in again.'); }
  res.json({ admin: me(admin) });
}));

r.post('/logout', ah(async (req, res) => {
  const s = readAccess(req); if (s) { req.admin = s.admin; req.session = { sid: s.sid }; audit(req, 'logout', 'admin', s.admin.id, `${s.admin.name} signed out`); }
  endSession(req, res); res.json({ ok: true });
}));

r.get('/me', requireAuth, (req, res) => res.json({ admin: me(req.admin) }));

r.post('/password', requireAuth, csrf, ah(async (req, res) => {
  const b = parse(z.object({ current: z.string().min(1), password: z.string() }), req.body);
  const row = db.prepare('SELECT password_hash FROM admins WHERE id=?').get(req.admin.id);
  if (!(await verifyPassword(b.current, row.password_hash))) throw badRequest('Your current password is wrong.');
  if (!strongEnough(b.password)) throw badRequest(passwordRule);
  db.prepare('UPDATE admins SET password_hash=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(await hashPassword(b.password), req.admin.id);
  revokeAllSessions(req.admin.id); startSession(res, req.admin, req);
  audit(req, 'password_change', 'admin', req.admin.id, 'Changed own password');
  res.json({ ok: true });
}));

r.post('/forgot', forgotLimit, ah(async (req, res) => {
  const { email: em } = parse(z.object({ email }), req.body);
  const a = db.prepare("SELECT id, name, email FROM admins WHERE email=? AND status='active'").get(em);
  if (a) {
    const t = token(32);
    db.prepare('INSERT INTO password_resets (admin_id, token_hash, expires_at) VALUES (?,?,?)').run(a.id, sha256(t), sqlNow(new Date(Date.now() + 3600_000)));
    const link = `${config.publicUrl}/admin/#/reset/${t}`;
    const sent = await sendMail({ to: a.email, subject: 'Reset your Bowl Mania admin password', text: `Hello ${a.name},\n\nUse this link within 1 hour to set a new password:\n${link}\n\nIf you didn't ask for this, ignore this email.` }).catch(e => { log.error('reset email failed', { error: e.message }); return false; });
    if (!sent && !config.isProd) log.warn('password reset link (SMTP not configured)', { email: a.email, link });
  }
  // Same answer whether or not the email exists, so accounts can't be discovered.
  res.json({ ok: true, message: mailConfigured() ? 'If that email belongs to a staff account, a reset link is on its way.' : 'If that email belongs to a staff account, ask the owner to reset your password from Staff (email sending is not set up).' });
}));

r.post('/reset', forgotLimit, ah(async (req, res) => {
  const b = parse(z.object({ token: z.string().min(20).max(200), password: z.string() }), req.body);
  const row = db.prepare('SELECT * FROM password_resets WHERE token_hash=?').get(sha256(b.token));
  if (!row || row.used_at || row.expires_at < sqlNow()) throw badRequest('This reset link has expired. Ask for a new one.');
  if (!strongEnough(b.password)) throw badRequest(passwordRule);
  const hash = await hashPassword(b.password);
  db.transaction(() => {
    db.prepare('UPDATE admins SET password_hash=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(hash, row.admin_id);
    db.prepare('UPDATE password_resets SET used_at=CURRENT_TIMESTAMP WHERE id=?').run(row.id);
    revokeAllSessions(row.admin_id);
  })();
  audit({ admin: { id: row.admin_id, name: loadAdmin(row.admin_id)?.name }, ip: req.ip }, 'password_reset', 'admin', row.admin_id, 'Reset password with emailed link');
  res.json({ ok: true });
}));

export default r;
