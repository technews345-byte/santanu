import jwt from 'jsonwebtoken';
import { db } from '../db/index.js';
import { config } from '../config.js';
import { token, sha256 } from '../lib/ids.js';
import { sqlNow } from '../lib/time.js';

export const COOKIES = { access: 'bm_at', refresh: 'bm_rt', csrf: 'bm_csrf' };
const base = () => ({ httpOnly: true, sameSite: 'strict', secure: config.isProd, path: '/' });

export function loadAdmin(id) {
  const a = db.prepare(`SELECT a.id, a.name, a.email, a.phone, a.status, a.role_id, r.key AS role, r.name AS role_name, r.rank
    FROM admins a JOIN roles r ON r.id=a.role_id WHERE a.id=?`).get(id);
  if (!a) return null;
  a.permissions = db.prepare(`SELECT p.key FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id WHERE rp.role_id=?`).all(a.role_id).map(r => r.key);
  return a;
}

function issueAccess(res, admin, sessionId) {
  const at = jwt.sign({ sub: admin.id, sid: sessionId }, config.jwtSecret, { expiresIn: `${config.accessTtlMin}m`, audience: 'bm-admin' });
  res.cookie(COOKIES.access, at, { ...base(), maxAge: config.accessTtlMin * 60_000 });
}
function issueCsrf(res) {
  const c = token(18);
  res.cookie(COOKIES.csrf, c, { ...base(), httpOnly: false, maxAge: config.refreshTtlDays * 86_400_000 });
  return c;
}

/** Creates a session row and sets access, refresh and CSRF cookies. */
export function startSession(res, admin, req) {
  const rt = token(32);
  const expires = new Date(Date.now() + config.refreshTtlDays * 86_400_000);
  const sid = db.prepare('INSERT INTO admin_sessions (admin_id, token_hash, user_agent, ip, expires_at) VALUES (?,?,?,?,?)')
    .run(admin.id, sha256(rt), String(req.get('user-agent') || '').slice(0, 200), req.ip || '', sqlNow(expires)).lastInsertRowid;
  db.prepare('UPDATE admins SET last_login_at=CURRENT_TIMESTAMP WHERE id=?').run(admin.id);
  issueAccess(res, admin, sid);
  res.cookie(COOKIES.refresh, rt, { ...base(), path: '/api/auth', maxAge: config.refreshTtlDays * 86_400_000 });
  return { sessionId: sid, csrf: issueCsrf(res) };
}

/** Rotates the refresh token. Returns the admin or null when the session is invalid. */
export function refreshSession(req, res) {
  const rt = req.cookies?.[COOKIES.refresh];
  if (!rt) return null;
  const s = db.prepare('SELECT * FROM admin_sessions WHERE token_hash=?').get(sha256(rt));
  if (!s || s.revoked_at || s.expires_at < sqlNow()) return null;
  const admin = loadAdmin(s.admin_id);
  if (!admin || admin.status !== 'active') return null;
  const next = token(32);
  db.prepare('UPDATE admin_sessions SET token_hash=?, last_used_at=CURRENT_TIMESTAMP WHERE id=?').run(sha256(next), s.id);
  issueAccess(res, admin, s.id);
  res.cookie(COOKIES.refresh, next, { ...base(), path: '/api/auth', maxAge: config.refreshTtlDays * 86_400_000 });
  if (!req.cookies?.[COOKIES.csrf]) issueCsrf(res);
  return admin;
}

export function endSession(req, res) {
  const rt = req.cookies?.[COOKIES.refresh];
  if (rt) db.prepare('UPDATE admin_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE token_hash=?').run(sha256(rt));
  if (req.session?.sid) db.prepare('UPDATE admin_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE id=?').run(req.session.sid);
  res.clearCookie(COOKIES.access, base());
  res.clearCookie(COOKIES.refresh, { ...base(), path: '/api/auth' });
  res.clearCookie(COOKIES.csrf, { ...base(), httpOnly: false });
}
export const revokeAllSessions = adminId => db.prepare('UPDATE admin_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE admin_id=? AND revoked_at IS NULL').run(adminId);

/** Verifies the access cookie. Returns { admin, sid } or null. */
export function readAccess(req) {
  const at = req.cookies?.[COOKIES.access];
  if (!at) return null;
  try {
    const p = jwt.verify(at, config.jwtSecret, { audience: 'bm-admin' });
    const s = db.prepare('SELECT revoked_at FROM admin_sessions WHERE id=?').get(p.sid);
    if (!s || s.revoked_at) return null;
    const admin = loadAdmin(p.sub);
    if (!admin || admin.status !== 'active') return null;
    return { admin, sid: p.sid };
  } catch { return null; }
}
