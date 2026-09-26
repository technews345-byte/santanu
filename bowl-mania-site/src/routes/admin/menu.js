import { Router } from 'express';
import { db } from '../../db/index.js';
import { ah, notFound, badRequest } from '../../lib/errors.js';
import { parse, z, text, bool, imageUrl, idList } from '../../lib/validate.js';
import { audit, diff } from '../../lib/audit.js';
import { slugify } from '../../lib/ids.js';
import { requirePerm } from '../../middleware/auth.js';
import { hydrate } from '../../services/menu.js';
import { emit } from '../../lib/events.js';

const r = Router();
const uniqueSlug = (table, base, id = 0) => { let s = slugify(base), i = 2; while (db.prepare(`SELECT 1 FROM ${table} WHERE slug=? AND id<>?`).get(s, id)) s = `${slugify(base)}-${i++}`; return s; };
const menuChanged = () => emit('menu_changed', { at: Date.now() }, 'menu.view');

// ---------- Items ----------
const nutrition = z.object({
  calories: z.coerce.number().min(0).max(5000).optional(), protein_g: z.coerce.number().min(0).max(500).optional(),
  carbs_g: z.coerce.number().min(0).max(500).optional(), fat_g: z.coerce.number().min(0).max(500).optional(), fibre_g: z.coerce.number().min(0).max(500).optional()
}).partial().default({});
const itemSchema = z.object({
  name: text(80, 1), subtitle: text(60).optional().default(''), description: text(400).optional().default(''),
  ingredients: text(600).optional().default(''), nutrition, category_id: z.coerce.number().int().positive().nullable().optional(),
  diet: z.enum(['veg', 'egg', 'nonveg', 'both']).default('veg'), spicy: z.coerce.number().int().min(0).max(3).default(0),
  featured: bool.default(false), available: bool.default(true), active: bool.default(true), display_order: z.coerce.number().int().min(0).max(9999).optional(),
  image: imageUrl.default(''), tag: text(30).optional().default(''),
  sizes: z.array(z.object({ id: z.coerce.number().int().positive().optional(), label: text(30, 1), price: z.coerce.number().int('Use whole rupees.').min(1, 'Prices must be at least ₹1.').max(100000), active: bool.default(true) }))
    .min(1, 'Add at least one size with a price.').max(6)
});
const listItems = () => db.prepare(`SELECT m.*, c.name AS category_name,
    (SELECT COALESCE(SUM(oi.quantity),0) FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE oi.menu_item_id=m.id AND o.placed_at IS NOT NULL AND o.status NOT IN ('cancelled','refunded') AND o.created_at >= datetime('now','-30 days')) AS sold_30d
  FROM menu_items m LEFT JOIN categories c ON c.id=m.category_id ORDER BY m.display_order, m.id`).all().map(i => hydrate(i, { adminView: true }));

r.get('/menu', requirePerm('menu.view', 'menu.manage', 'menu.availability'), (req, res) => res.json({ items: listItems(), categories: db.prepare('SELECT * FROM categories ORDER BY display_order, id').all() }));

function saveSizes(itemId, sizes) {
  const keep = sizes.filter(s => s.id).map(s => s.id);
  // Remove sizes that were deleted in the editor (old orders keep their own copy of name and price).
  db.prepare(`DELETE FROM menu_item_sizes WHERE menu_item_id=? ${keep.length ? `AND id NOT IN (${keep.map(() => '?').join(',')})` : ''}`).run(itemId, ...keep);
  sizes.forEach((s, i) => {
    if (s.id && db.prepare('SELECT 1 FROM menu_item_sizes WHERE id=? AND menu_item_id=?').get(s.id, itemId))
      db.prepare('UPDATE menu_item_sizes SET label=?, price=?, active=?, display_order=? WHERE id=?').run(s.label, s.price, s.active ? 1 : 0, i, s.id);
    else db.prepare('INSERT INTO menu_item_sizes (menu_item_id, label, price, active, display_order) VALUES (?,?,?,?,?)').run(itemId, s.label, s.price, s.active ? 1 : 0, i);
  });
}
// "250 ml: ₹99 → ₹109" style summary of price/size edits.
function sizeChanges(before, after) {
  const parse = list => Object.fromEntries(list.map(x => { const m = x.match(/^(.*) ₹(\d+)(.*)$/); return [m[1], `₹${m[2]}${m[3]}`]; }));
  const b = parse(before), a = parse(after);
  return [...new Set([...Object.keys(b), ...Object.keys(a)])].filter(k => b[k] !== a[k])
    .map(k => !b[k] ? `added ${k} ${a[k]}` : !a[k] ? `removed ${k}` : `${k}: ${b[k]} → ${a[k]}`).join(', ');
}
const snapshot = id => { const i = hydrate(db.prepare('SELECT * FROM menu_items WHERE id=?').get(id), { adminView: true }); if (!i) return null;
  return { name: i.name, subtitle: i.subtitle, description: i.description, ingredients: i.ingredients, nutrition: i.nutrition, category_id: i.category_id, diet: i.diet, spicy: i.spicy, featured: i.featured, available: i.available, active: i.active, image: i.image, tag: i.tag, display_order: i.display_order, sizes: i.sizes.map(s => `${s.label} ₹${s.price}${s.active ? '' : ' (off)'}`) }; };

r.post('/menu', requirePerm('menu.manage'), ah(async (req, res) => {
  const b = parse(itemSchema, req.body);
  const id = db.transaction(() => {
    const order = b.display_order ?? (db.prepare('SELECT COALESCE(MAX(display_order),-1)+1 n FROM menu_items').get().n);
    const id = db.prepare(`INSERT INTO menu_items (category_id, name, slug, subtitle, description, ingredients, nutrition, diet, spicy, featured, available, active, display_order, image, tag)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(b.category_id ?? null, b.name, uniqueSlug('menu_items', b.name), b.subtitle, b.description, b.ingredients, JSON.stringify(b.nutrition),
      b.diet, b.spicy, b.featured ? 1 : 0, b.available ? 1 : 0, b.active ? 1 : 0, order, b.image, b.tag).lastInsertRowid;
    saveSizes(id, b.sizes); return id;
  })();
  audit(req, 'create', 'menu_item', id, `Added ${b.name}`, null, snapshot(id)); menuChanged();
  res.status(201).json(hydrate(db.prepare('SELECT * FROM menu_items WHERE id=?').get(id), { adminView: true }));
}));
r.patch('/menu/:id', requirePerm('menu.manage'), ah(async (req, res) => {
  const id = Number(req.params.id); const before = snapshot(id); if (!before) throw notFound('Menu item not found.');
  const b = parse(itemSchema, req.body);
  db.transaction(() => {
    db.prepare(`UPDATE menu_items SET category_id=?, name=?, slug=?, subtitle=?, description=?, ingredients=?, nutrition=?, diet=?, spicy=?, featured=?, available=?, active=?,
      display_order=COALESCE(?, display_order), image=?, tag=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(b.category_id ?? null, b.name, uniqueSlug('menu_items', b.name, id), b.subtitle, b.description, b.ingredients,
      JSON.stringify(b.nutrition), b.diet, b.spicy, b.featured ? 1 : 0, b.available ? 1 : 0, b.active ? 1 : 0, b.display_order ?? null, b.image, b.tag, id);
    saveSizes(id, b.sizes);
  })();
  const after = snapshot(id); const [o, n, keys] = diff(before, after);
  if (keys.length) audit(req, 'update', 'menu_item', id, `Edited ${after.name}: ${keys.map(k => k === 'sizes' ? sizeChanges(before.sizes, after.sizes) : k).join('; ')}`, o, n);
  menuChanged(); res.json(hydrate(db.prepare('SELECT * FROM menu_items WHERE id=?').get(id), { adminView: true }));
}));
// Quick toggles used by kitchen staff too.
r.patch('/menu/:id/availability', requirePerm('menu.availability', 'menu.manage'), ah(async (req, res) => {
  const b = parse(z.object({ available: bool.optional(), active: bool.optional(), featured: bool.optional() }), req.body);
  const id = Number(req.params.id); const it = db.prepare('SELECT * FROM menu_items WHERE id=?').get(id); if (!it) throw notFound('Menu item not found.');
  if ((b.active !== undefined || b.featured !== undefined) && !req.admin.permissions.includes('menu.manage')) throw badRequest('Your role can only change sold-out status.');
  const next = { available: b.available ?? !!it.available, active: b.active ?? !!it.active, featured: b.featured ?? !!it.featured };
  db.prepare('UPDATE menu_items SET available=?, active=?, featured=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(+next.available, +next.active, +next.featured, id);
  const [o, n, keys] = diff({ available: !!it.available, active: !!it.active, featured: !!it.featured }, next);
  if (keys.length) audit(req, 'update', 'menu_item', id, `${it.name}: ${keys.map(k => `${k} ${o[k]} → ${n[k]}`).join(', ')}`, o, n);
  menuChanged(); res.json({ ok: true, ...next });
}));
r.put('/menu/order', requirePerm('menu.manage'), ah(async (req, res) => {
  const { ids } = parse(z.object({ ids: idList }), req.body);
  db.transaction(() => ids.forEach((id, i) => db.prepare('UPDATE menu_items SET display_order=? WHERE id=?').run(i, id)))();
  audit(req, 'reorder', 'menu_item', null, 'Changed menu display order'); menuChanged(); res.json({ ok: true });
}));
r.delete('/menu/:id', requirePerm('menu.manage'), ah(async (req, res) => {
  const id = Number(req.params.id); const before = snapshot(id); if (!before) throw notFound('Menu item not found.');
  db.prepare('DELETE FROM menu_items WHERE id=?').run(id);
  audit(req, 'delete', 'menu_item', id, `Deleted ${before.name}`, before, null); menuChanged(); res.json({ ok: true });
}));

// ---------- Categories ----------
const catSchema = z.object({ name: text(60, 1), description: text(300).optional().default(''), image: imageUrl.default(''), active: bool.default(true), display_order: z.coerce.number().int().min(0).max(9999).optional() });
r.get('/categories', requirePerm('menu.view', 'menu.manage'), (req, res) => res.json(db.prepare('SELECT c.*, (SELECT COUNT(*) FROM menu_items WHERE category_id=c.id) AS item_count FROM categories c ORDER BY display_order, id').all()));
r.post('/categories', requirePerm('menu.manage'), ah(async (req, res) => {
  const b = parse(catSchema, req.body);
  const order = b.display_order ?? db.prepare('SELECT COALESCE(MAX(display_order),-1)+1 n FROM categories').get().n;
  const id = db.prepare('INSERT INTO categories (name, slug, description, image, active, display_order) VALUES (?,?,?,?,?,?)').run(b.name, uniqueSlug('categories', b.name), b.description, b.image, +b.active, order).lastInsertRowid;
  audit(req, 'create', 'category', id, `Added category ${b.name}`, null, b); menuChanged();
  res.status(201).json(db.prepare('SELECT * FROM categories WHERE id=?').get(id));
}));
r.patch('/categories/:id', requirePerm('menu.manage'), ah(async (req, res) => {
  const id = Number(req.params.id); const before = db.prepare('SELECT * FROM categories WHERE id=?').get(id); if (!before) throw notFound('Category not found.');
  const b = parse(catSchema, req.body);
  db.prepare('UPDATE categories SET name=?, slug=?, description=?, image=?, active=?, display_order=COALESCE(?, display_order), updated_at=CURRENT_TIMESTAMP WHERE id=?').run(b.name, uniqueSlug('categories', b.name, id), b.description, b.image, +b.active, b.display_order ?? null, id);
  const [o, n, keys] = diff({ name: before.name, description: before.description, image: before.image, active: !!before.active }, { name: b.name, description: b.description, image: b.image, active: b.active });
  if (keys.length) audit(req, 'update', 'category', id, `Edited category ${b.name}: ${keys.join(', ')}`, o, n);
  menuChanged(); res.json(db.prepare('SELECT * FROM categories WHERE id=?').get(id));
}));
r.put('/categories/order', requirePerm('menu.manage'), ah(async (req, res) => {
  const { ids } = parse(z.object({ ids: idList }), req.body);
  db.transaction(() => ids.forEach((id, i) => db.prepare('UPDATE categories SET display_order=? WHERE id=?').run(i, id)))();
  audit(req, 'reorder', 'category', null, 'Changed category order'); menuChanged(); res.json({ ok: true });
}));
r.delete('/categories/:id', requirePerm('menu.manage'), ah(async (req, res) => {
  const id = Number(req.params.id); const c = db.prepare('SELECT * FROM categories WHERE id=?').get(id); if (!c) throw notFound('Category not found.');
  const n = db.prepare('SELECT COUNT(*) n FROM menu_items WHERE category_id=?').get(id).n;
  if (n) throw badRequest(`Move the ${n} item${n > 1 ? 's' : ''} in ${c.name} to another category first.`);
  db.prepare('DELETE FROM categories WHERE id=?').run(id);
  audit(req, 'delete', 'category', id, `Deleted category ${c.name}`, c, null); menuChanged(); res.json({ ok: true });
}));
export default r;
