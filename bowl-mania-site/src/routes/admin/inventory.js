import { Router } from 'express';
import { db } from '../../db/index.js';
import { ah, notFound } from '../../lib/errors.js';
import { parse, z, text } from '../../lib/validate.js';
import { audit, diff } from '../../lib/audit.js';
import { requirePerm } from '../../middleware/auth.js';
import { notifyAdmins } from '../../services/notifications.js';

const r = Router();
const level = i => i.quantity <= 0 ? 'out' : i.quantity <= i.min_quantity ? 'low' : 'ok';
const schema = z.object({ name: text(60, 1), unit: text(15, 1), quantity: z.coerce.number().min(0).max(1e6), min_quantity: z.coerce.number().min(0).max(1e6),
  supplier: text(80).optional().default(''), cost: z.coerce.number().min(0).max(1e6).default(0), notes: text(300).optional().default('') });
function warnIfLow(before, after) {
  const was = before ? level(before) : 'ok', now = level(after);
  if (now !== 'ok' && now !== was) notifyAdmins({ type: 'low_stock', title: `${after.name} is ${now === 'out' ? 'out of stock' : 'running low'}`,
    body: `${after.quantity} ${after.unit} left (minimum ${after.min_quantity} ${after.unit})`, link: '#/inventory', permission: 'inventory.manage' });
}
r.get('/inventory', requirePerm('inventory.manage'), (req, res) => res.json(db.prepare('SELECT * FROM inventory_items ORDER BY name').all().map(i => ({ ...i, level: level(i) }))));
r.post('/inventory', requirePerm('inventory.manage'), ah(async (req, res) => {
  const b = parse(schema, req.body);
  const id = db.prepare('INSERT INTO inventory_items (name, unit, quantity, min_quantity, supplier, cost, notes) VALUES (?,?,?,?,?,?,?)').run(b.name, b.unit, b.quantity, b.min_quantity, b.supplier, b.cost, b.notes).lastInsertRowid;
  audit(req, 'create', 'inventory', id, `Added stock item ${b.name}`, null, b); warnIfLow(null, b); res.status(201).json({ id });
}));
r.patch('/inventory/:id', requirePerm('inventory.manage'), ah(async (req, res) => {
  const before = db.prepare('SELECT * FROM inventory_items WHERE id=?').get(Number(req.params.id)); if (!before) throw notFound('Stock item not found.');
  const b = parse(schema, req.body);
  db.prepare('UPDATE inventory_items SET name=?, unit=?, quantity=?, min_quantity=?, supplier=?, cost=?, notes=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(b.name, b.unit, b.quantity, b.min_quantity, b.supplier, b.cost, b.notes, before.id);
  const [o, n, keys] = diff(before, b); if (keys.length) audit(req, 'update', 'inventory', before.id, `${b.name}: ${keys.map(k => `${k} ${o[k]} → ${n[k]}`).join(', ')}`, o, n);
  warnIfLow(before, b); res.json({ ok: true });
}));
// Quick +/- adjustments from the stock list.
r.post('/inventory/:id/adjust', requirePerm('inventory.manage'), ah(async (req, res) => {
  const { delta } = parse(z.object({ delta: z.coerce.number().min(-1e6).max(1e6) }), req.body);
  const before = db.prepare('SELECT * FROM inventory_items WHERE id=?').get(Number(req.params.id)); if (!before) throw notFound('Stock item not found.');
  const quantity = Math.max(0, Math.round((before.quantity + delta) * 1000) / 1000);
  db.prepare('UPDATE inventory_items SET quantity=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(quantity, before.id);
  audit(req, 'adjust', 'inventory', before.id, `${before.name}: ${before.quantity} → ${quantity} ${before.unit}`, { quantity: before.quantity }, { quantity });
  warnIfLow(before, { ...before, quantity }); res.json({ quantity, level: level({ ...before, quantity }) });
}));
r.delete('/inventory/:id', requirePerm('inventory.manage'), ah(async (req, res) => {
  const i = db.prepare('SELECT * FROM inventory_items WHERE id=?').get(Number(req.params.id)); if (!i) throw notFound('Stock item not found.');
  db.prepare('DELETE FROM inventory_items WHERE id=?').run(i.id); audit(req, 'delete', 'inventory', i.id, `Removed stock item ${i.name}`, i, null); res.json({ ok: true });
}));
export default r;
