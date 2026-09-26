import { Router } from 'express';
import { db, json } from '../../db/index.js';
import { ah, notFound, badRequest } from '../../lib/errors.js';
import { parse, z, text, bool, idList, imageUrl } from '../../lib/validate.js';
import { audit, diff } from '../../lib/audit.js';
import { requirePerm } from '../../middleware/auth.js';
import { localToDate, sqlNow } from '../../lib/time.js';

const r = Router();
// Admin sends local "YYYY-MM-DDTHH:MM"; stored as UTC SQL time so comparisons with CURRENT_TIMESTAMP work.
const localDT = z.union([z.literal(''), z.null(), z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Use a valid date and time.')]).optional()
  .transform(v => v ? sqlNow(localToDate(v.slice(0, 10), v.slice(11, 16))) : null);
const optInt = z.union([z.literal(''), z.null(), z.coerce.number().int().min(0)]).optional().transform(v => v === '' || v == null ? null : v);
const withJson = row => row && ({ ...row, active: !!row.active, item_ids: json(row.item_ids, []), category_ids: json(row.category_ids, []) });

// ---------- Coupons ----------
const couponSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,20}$/, 'Codes use 3-20 letters, numbers, - or _.'),
  description: text(200).optional().default(''), discount_type: z.enum(['percent', 'fixed']), value: z.coerce.number().int().min(1),
  min_order: z.coerce.number().int().min(0).default(0), max_discount: optInt, starts_at: localDT, expires_at: localDT,
  usage_limit: optInt, per_customer_limit: optInt, category_ids: idList, item_ids: idList, active: bool.default(true)
}).refine(c => c.discount_type !== 'percent' || c.value <= 100, { message: 'A percentage discount cannot be more than 100%.' })
  .refine(c => !c.starts_at || !c.expires_at || c.starts_at < c.expires_at, { message: 'The coupon must expire after it starts.' });
r.get('/coupons', requirePerm('promotions.manage'), (req, res) => res.json(db.prepare(`SELECT c.*, (SELECT COUNT(*) FROM coupon_usage WHERE coupon_id=c.id) AS used_count,
  (SELECT COALESCE(SUM(discount),0) FROM coupon_usage WHERE coupon_id=c.id) AS total_discount FROM coupons c ORDER BY c.active DESC, c.id DESC`).all().map(withJson)));
const saveCoupon = (b, id) => {
  const vals = [b.code, b.description, b.discount_type, b.value, b.min_order, b.max_discount, b.starts_at, b.expires_at, b.usage_limit, b.per_customer_limit, JSON.stringify(b.category_ids), JSON.stringify(b.item_ids), +b.active];
  if (id) return db.prepare(`UPDATE coupons SET code=?, description=?, discount_type=?, value=?, min_order=?, max_discount=?, starts_at=?, expires_at=?, usage_limit=?, per_customer_limit=?, category_ids=?, item_ids=?, active=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(...vals, id);
  return db.prepare(`INSERT INTO coupons (code, description, discount_type, value, min_order, max_discount, starts_at, expires_at, usage_limit, per_customer_limit, category_ids, item_ids, active) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(...vals).lastInsertRowid;
};
r.post('/coupons', requirePerm('promotions.manage'), ah(async (req, res) => {
  const b = parse(couponSchema, req.body);
  if (db.prepare('SELECT 1 FROM coupons WHERE code=?').get(b.code)) throw badRequest(`The code ${b.code} is already in use.`);
  const id = saveCoupon(b); audit(req, 'create', 'coupon', id, `Created coupon ${b.code}`, null, b);
  res.status(201).json(withJson(db.prepare('SELECT * FROM coupons WHERE id=?').get(id)));
}));
r.patch('/coupons/:id', requirePerm('promotions.manage'), ah(async (req, res) => {
  const id = Number(req.params.id); const before = withJson(db.prepare('SELECT * FROM coupons WHERE id=?').get(id)); if (!before) throw notFound('Coupon not found.');
  const b = parse(couponSchema, req.body);
  if (db.prepare('SELECT 1 FROM coupons WHERE code=? AND id<>?').get(b.code, id)) throw badRequest(`The code ${b.code} is already in use.`);
  saveCoupon(b, id); const [o, n, keys] = diff(before, b);
  if (keys.length) audit(req, 'update', 'coupon', id, `Edited coupon ${b.code}: ${keys.join(', ')}`, o, n);
  res.json(withJson(db.prepare('SELECT * FROM coupons WHERE id=?').get(id)));
}));
r.delete('/coupons/:id', requirePerm('promotions.manage'), ah(async (req, res) => {
  const c = db.prepare('SELECT * FROM coupons WHERE id=?').get(Number(req.params.id)); if (!c) throw notFound('Coupon not found.');
  if (db.prepare('SELECT COUNT(*) n FROM coupon_usage WHERE coupon_id=?').get(c.id).n) {
    db.prepare('UPDATE coupons SET active=0, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(c.id);
    audit(req, 'deactivate', 'coupon', c.id, `Turned off coupon ${c.code} (it has been used, so it is kept for records)`);
    return res.json({ ok: true, deactivated: true });
  }
  db.prepare('DELETE FROM coupons WHERE id=?').run(c.id); audit(req, 'delete', 'coupon', c.id, `Deleted coupon ${c.code}`, c, null); res.json({ ok: true });
}));

// ---------- Offers ----------
const offerSchema = z.object({
  title: text(80, 1), description: text(300).optional().default(''), type: z.enum(['percent', 'flat', 'free_delivery', 'bogo', 'combo']),
  value: z.coerce.number().int().min(0).default(0), min_order: z.coerce.number().int().min(0).default(0), max_discount: optInt,
  item_ids: idList, category_ids: idList, starts_at: localDT, ends_at: localDT, active: bool.default(true), image: imageUrl.default('')
}).refine(o => !['percent', 'flat', 'combo'].includes(o.type) || o.value > 0, { message: 'Enter the discount amount.' })
  .refine(o => o.type !== 'percent' || o.value <= 100, { message: 'A percentage cannot be more than 100%.' })
  .refine(o => o.type !== 'combo' || o.item_ids.length >= 2, { message: 'Pick at least two items for a combo.' })
  .refine(o => !o.starts_at || !o.ends_at || o.starts_at < o.ends_at, { message: 'The offer must end after it starts.' });
const offerRow = id => { const o = withJson(db.prepare('SELECT * FROM offers WHERE id=?').get(id)); if (!o) return null; const now = sqlNow();
  o.state = !o.active ? 'off' : o.starts_at && o.starts_at > now ? 'scheduled' : o.ends_at && o.ends_at < now ? 'ended' : 'live'; return o; };
r.get('/offers', requirePerm('promotions.manage'), (req, res) => res.json(db.prepare('SELECT id FROM offers ORDER BY display_order, id DESC').all().map(o => {
  const row = offerRow(o.id); row.times_used = db.prepare("SELECT COUNT(*) n FROM orders WHERE offer_id=? AND placed_at IS NOT NULL").get(o.id).n; return row; })));
const saveOffer = (b, id) => {
  const vals = [b.title, b.description, b.type, b.value, b.min_order, b.max_discount, JSON.stringify(b.item_ids), JSON.stringify(b.category_ids), b.starts_at, b.ends_at, +b.active, b.image];
  if (id) return db.prepare('UPDATE offers SET title=?, description=?, type=?, value=?, min_order=?, max_discount=?, item_ids=?, category_ids=?, starts_at=?, ends_at=?, active=?, image=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').run(...vals, id);
  return db.prepare('INSERT INTO offers (title, description, type, value, min_order, max_discount, item_ids, category_ids, starts_at, ends_at, active, image) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(...vals).lastInsertRowid;
};
r.post('/offers', requirePerm('promotions.manage'), ah(async (req, res) => {
  const b = parse(offerSchema, req.body); const id = saveOffer(b);
  audit(req, 'create', 'offer', id, `Created offer ${b.title}`, null, b); res.status(201).json(offerRow(id));
}));
r.patch('/offers/:id', requirePerm('promotions.manage'), ah(async (req, res) => {
  const id = Number(req.params.id); const before = offerRow(id); if (!before) throw notFound('Offer not found.');
  const b = parse(offerSchema, req.body); saveOffer(b, id);
  const [o, n, keys] = diff(before, b); if (keys.length) audit(req, 'update', 'offer', id, `Edited offer ${b.title}: ${keys.join(', ')}`, o, n);
  res.json(offerRow(id));
}));
r.delete('/offers/:id', requirePerm('promotions.manage'), ah(async (req, res) => {
  const o = offerRow(Number(req.params.id)); if (!o) throw notFound('Offer not found.');
  db.prepare('DELETE FROM offers WHERE id=?').run(o.id); audit(req, 'delete', 'offer', o.id, `Deleted offer ${o.title}`, o, null); res.json({ ok: true });
}));
export default r;
