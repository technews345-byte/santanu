import { Router } from 'express';
import { db } from '../../db/index.js';
import { ah, notFound, badRequest, forbidden } from '../../lib/errors.js';
import { parse, z, text, email, optPhone } from '../../lib/validate.js';
import { audit, diff } from '../../lib/audit.js';
import { requirePerm } from '../../middleware/auth.js';
import { hashPassword, strongEnough, passwordRule } from '../../services/passwords.js';
import { revokeAllSessions } from '../../services/auth.js';
import { paging } from './helpers.js';

const r = Router();
const roleOf = id => db.prepare('SELECT * FROM roles WHERE id=?').get(id);
// Only a super admin can create, change or remove super admins, or edit role permissions.
const guardRole = (req, role) => { if (role.key === 'super_admin' && req.admin.role !== 'super_admin') throw forbidden('Only a Super Admin can manage Super Admin accounts.'); };

r.get('/staff', requirePerm('staff.manage'), (req, res) => res.json({
  rows: db.prepare(`SELECT a.id, a.name, a.email, a.phone, a.status, a.last_login_at, a.created_at, a.role_id, r.key AS role, r.name AS role_name FROM admins a JOIN roles r ON r.id=a.role_id ORDER BY a.status, r.rank DESC, a.name`).all(),
  roles: db.prepare('SELECT id, key, name, description, rank FROM roles ORDER BY rank DESC').all()
}));
const staffSchema = z.object({ name: text(80, 1), email, phone: optPhone, role_id: z.coerce.number().int().positive(), status: z.enum(['active', 'disabled']).default('active'), password: z.string().max(200).optional().default('') });
r.post('/staff', requirePerm('staff.manage'), ah(async (req, res) => {
  const b = parse(staffSchema, req.body);
  const role = roleOf(b.role_id); if (!role) throw badRequest('Choose a role.'); guardRole(req, role);
  if (!strongEnough(b.password)) throw badRequest(passwordRule);
  if (db.prepare('SELECT 1 FROM admins WHERE email=?').get(b.email)) throw badRequest('A staff account with that email already exists.');
  const id = db.prepare('INSERT INTO admins (name, email, phone, role_id, status, password_hash) VALUES (?,?,?,?,?,?)').run(b.name, b.email, b.phone, b.role_id, b.status, await hashPassword(b.password)).lastInsertRowid;
  audit(req, 'create', 'staff', id, `Added ${b.name} as ${role.name}`, null, { name: b.name, email: b.email, role: role.name });
  res.status(201).json({ id });
}));
r.patch('/staff/:id', requirePerm('staff.manage'), ah(async (req, res) => {
  const id = Number(req.params.id);
  const a = db.prepare('SELECT a.*, r.key AS role, r.name AS role_name FROM admins a JOIN roles r ON r.id=a.role_id WHERE a.id=?').get(id); if (!a) throw notFound('Staff member not found.');
  const b = parse(staffSchema, req.body);
  const role = roleOf(b.role_id); if (!role) throw badRequest('Choose a role.');
  guardRole(req, role); guardRole(req, { key: a.role });
  if (id === req.admin.id && (b.status !== 'active' || b.role_id !== a.role_id)) throw badRequest("You can't disable yourself or change your own role.");
  if (a.role === 'super_admin' && (role.key !== 'super_admin' || b.status !== 'active') &&
      db.prepare("SELECT COUNT(*) n FROM admins a JOIN roles r ON r.id=a.role_id WHERE r.key='super_admin' AND a.status='active'").get().n <= 1) throw badRequest('Keep at least one active Super Admin.');
  if (db.prepare('SELECT 1 FROM admins WHERE email=? AND id<>?').get(b.email, id)) throw badRequest('Another staff account uses that email.');
  if (b.password && !strongEnough(b.password)) throw badRequest(passwordRule);
  db.prepare('UPDATE admins SET name=?, email=?, phone=?, role_id=?, status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(b.name, b.email, b.phone, b.role_id, b.status, id);
  if (b.password) db.prepare('UPDATE admins SET password_hash=? WHERE id=?').run(await hashPassword(b.password), id);
  if (b.password || b.status !== 'active' || b.role_id !== a.role_id) revokeAllSessions(id);
  const [o, n, keys] = diff({ name: a.name, email: a.email, phone: a.phone, role: a.role_name, status: a.status }, { name: b.name, email: b.email, phone: b.phone, role: role.name, status: b.status });
  if (b.password) keys.push('password');
  if (keys.length) audit(req, 'update', 'staff', id, `Edited ${b.name}: ${keys.join(', ')}`, o, n);
  res.json({ ok: true });
}));
r.delete('/staff/:id', requirePerm('staff.manage'), ah(async (req, res) => {
  const id = Number(req.params.id);
  const a = db.prepare('SELECT a.*, r.key AS role FROM admins a JOIN roles r ON r.id=a.role_id WHERE a.id=?').get(id); if (!a) throw notFound('Staff member not found.');
  if (id === req.admin.id) throw badRequest("You can't remove your own account.");
  guardRole(req, { key: a.role });
  const history = db.prepare('SELECT (SELECT COUNT(*) FROM delivery_assignments WHERE staff_id=?) n').get(id).n;
  if (history) { db.prepare("UPDATE admins SET status='disabled', updated_at=CURRENT_TIMESTAMP WHERE id=?").run(id); revokeAllSessions(id);
    audit(req, 'disable', 'staff', id, `Disabled ${a.name} (kept for delivery history)`); return res.json({ ok: true, disabled: true }); }
  db.prepare('DELETE FROM admins WHERE id=?').run(id); audit(req, 'delete', 'staff', id, `Removed ${a.name}`, { name: a.name, email: a.email }, null); res.json({ ok: true });
}));

// ---------- Roles & permissions ----------
r.get('/roles', requirePerm('staff.manage'), (req, res) => {
  const perms = db.prepare('SELECT id, key, grp, description FROM permissions ORDER BY id').all();
  const roles = db.prepare('SELECT * FROM roles ORDER BY rank DESC').all().map(ro => ({ ...ro,
    permissions: db.prepare('SELECT p.key FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id WHERE rp.role_id=?').all(ro.id).map(x => x.key),
    staff_count: db.prepare('SELECT COUNT(*) n FROM admins WHERE role_id=?').get(ro.id).n }));
  res.json({ roles, permissions: perms, can_edit: req.admin.role === 'super_admin' });
});
r.put('/roles/:id/permissions', requirePerm('staff.manage'), ah(async (req, res) => {
  if (req.admin.role !== 'super_admin') throw forbidden('Only a Super Admin can change role permissions.');
  const role = roleOf(Number(req.params.id)); if (!role) throw notFound('Role not found.');
  if (role.key === 'super_admin') throw badRequest('Super Admin always has every permission.');
  const { permissions } = parse(z.object({ permissions: z.array(z.string().max(60)).max(100) }), req.body);
  const valid = db.prepare('SELECT id, key FROM permissions').all().filter(p => permissions.includes(p.key));
  const before = db.prepare('SELECT p.key FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id WHERE rp.role_id=?').all(role.id).map(x => x.key);
  db.transaction(() => { db.prepare('DELETE FROM role_permissions WHERE role_id=?').run(role.id); valid.forEach(p => db.prepare('INSERT INTO role_permissions (role_id, permission_id) VALUES (?,?)').run(role.id, p.id)); })();
  const added = valid.map(p => p.key).filter(k => !before.includes(k)), removed = before.filter(k => !valid.some(p => p.key === k));
  audit(req, 'update', 'role', role.id, `${role.name} permissions: ${[...added.map(a => '+' + a), ...removed.map(x => '−' + x)].join(', ') || 'no change'}`, before, valid.map(p => p.key));
  res.json({ ok: true });
}));

// ---------- Audit log ----------
r.get('/audit', requirePerm('audit.view'), ah(async (req, res) => {
  const f = parse(z.object({ entity: z.string().max(40).optional().default(''), admin_id: z.coerce.number().int().optional(), q: text(80).optional().default('') }), req.query);
  const { page, limit, offset } = paging(req.query);
  const where = ['1=1'], p = [];
  if (f.entity) { where.push('entity=?'); p.push(f.entity); }
  if (f.admin_id) { where.push('admin_id=?'); p.push(f.admin_id); }
  if (f.q) { where.push("summary LIKE ? ESCAPE '\\'"); p.push(`%${f.q.replace(/[\\%_]/g, m => '\\' + m)}%`); }
  res.json({ rows: db.prepare(`SELECT * FROM audit_logs WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...p, limit, offset),
    total: db.prepare(`SELECT COUNT(*) n FROM audit_logs WHERE ${where.join(' AND ')}`).get(...p).n, page, limit,
    entities: db.prepare('SELECT DISTINCT entity FROM audit_logs ORDER BY entity').all().map(x => x.entity) });
}));
export default r;
