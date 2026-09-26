import { timingSafeEqual } from 'node:crypto';
import { readAccess, COOKIES } from '../services/auth.js';
import { unauthorized, forbidden } from '../lib/errors.js';

export function requireAuth(req, res, next) {
  const s = readAccess(req);
  if (!s) return next(unauthorized('Your session has expired. Please sign in again.'));
  req.admin = s.admin; req.session = { sid: s.sid };
  next();
}
/** Double-submit CSRF check for state-changing requests made with cookie auth. */
export function csrf(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const a = Buffer.from(String(req.get('x-csrf-token') || '')), b = Buffer.from(String(req.cookies?.[COOKIES.csrf] || ''));
  if (!a.length || a.length !== b.length || !timingSafeEqual(a, b)) return next(forbidden('Security check failed. Refresh the page and try again.'));
  next();
}
export const can = (admin, perm) => !!admin?.permissions?.includes(perm);
/** Requires at least one of the given permissions. */
export const requirePerm = (...perms) => (req, res, next) =>
  perms.some(p => can(req.admin, p)) ? next() : next(forbidden());
