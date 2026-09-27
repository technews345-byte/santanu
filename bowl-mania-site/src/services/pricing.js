// The single source of truth for what an order costs. Browsers only send ids and quantities.
import { db, json } from '../db/index.js';
import { badRequest } from '../lib/errors.js';
import { sqlNow } from '../lib/time.js';
import { getSetting } from './settings.js';
import { quoteDelivery, getArea } from './delivery.js';

function loadLines(items) {
  if (!Array.isArray(items) || !items.length) throw badRequest('Add at least one bowl to your order.');
  if (items.length > 30) throw badRequest('Too many different items in one order.');
  const merged = new Map();
  for (const it of items) {
    const key = `${it.item_id}|${it.size_id}`;
    merged.set(key, { ...it, quantity: (merged.get(key)?.quantity || 0) + it.quantity });
  }
  const q = db.prepare(`SELECT m.id AS item_id, m.name, m.category_id, m.available, m.active, c.active AS cat_active,
      s.id AS size_id, s.label AS size_label, s.price, s.active AS size_active
    FROM menu_items m JOIN menu_item_sizes s ON s.menu_item_id=m.id LEFT JOIN categories c ON c.id=m.category_id
    WHERE m.id=? AND s.id=?`);
  return [...merged.values()].map(it => {
    const row = q.get(it.item_id, it.size_id);
    if (!row || !row.active || !row.size_active || row.cat_active === 0) throw badRequest('One of the bowls in your order is no longer on the menu. Please refresh the menu.');
    if (!row.available) throw badRequest(`${row.name} is sold out right now. Please remove it and try again.`);
    if (it.quantity > 20) throw badRequest(`You can order up to 20 of ${row.name} at a time.`);
    return { item_id: row.item_id, size_id: row.size_id, category_id: row.category_id, name: row.name, size_label: row.size_label, unit_price: row.price, quantity: it.quantity, line_total: row.price * it.quantity };
  });
}

const inWindow = (start, end, now = sqlNow()) => (!start || start <= now) && (!end || end >= now);
const eligibleLines = (lines, itemIds, catIds) => (!itemIds.length && !catIds.length) ? lines
  : lines.filter(l => itemIds.includes(l.item_id) || catIds.includes(l.category_id));

function offerDiscount(o, lines, subtotal, deliveryFee) {
  if (subtotal < o.min_order) return 0;
  const itemIds = json(o.item_ids, []), catIds = json(o.category_ids, []);
  const el = eligibleLines(lines, itemIds, catIds);
  const elSum = el.reduce((s, l) => s + l.line_total, 0);
  let d = 0;
  if (o.type === 'percent') d = Math.floor(elSum * o.value / 100);
  else if (o.type === 'flat') d = elSum > 0 ? o.value : 0;
  else if (o.type === 'free_delivery') d = deliveryFee;
  else if (o.type === 'bogo') {
    // Buy one get one: every second unit (cheapest units free) among eligible items.
    const units = el.flatMap(l => Array(l.quantity).fill(l.unit_price)).sort((a, b) => a - b);
    d = units.slice(0, Math.floor(units.length / 2)).reduce((s, p) => s + p, 0);
  } else if (o.type === 'combo') {
    d = itemIds.length && itemIds.every(id => lines.some(l => l.item_id === id)) ? o.value : 0;
  }
  if (o.max_discount != null) d = Math.min(d, o.max_discount);
  return Math.max(0, d);
}

export function activeOffers() {
  return db.prepare('SELECT * FROM offers WHERE active=1 ORDER BY display_order, id').all().filter(o => inWindow(o.starts_at, o.ends_at));
}

/** Validates a coupon for a cart. Returns { coupon, discount } or { error }. */
export function checkCoupon(code, lines, subtotal, customerPhone) {
  const c = db.prepare('SELECT * FROM coupons WHERE code=?').get(String(code).trim());
  if (!c || !c.active) return { error: 'That coupon code is not valid.' };
  const now = sqlNow();
  if (c.starts_at && c.starts_at > now) return { error: 'That coupon is not active yet.' };
  if (c.expires_at && c.expires_at < now) return { error: 'That coupon has expired.' };
  if (c.usage_limit != null && db.prepare('SELECT COUNT(*) n FROM coupon_usage WHERE coupon_id=?').get(c.id).n >= c.usage_limit) return { error: 'That coupon has been fully used.' };
  if (c.per_customer_limit != null && customerPhone) {
    const used = db.prepare('SELECT COUNT(*) n FROM coupon_usage u JOIN customers cu ON cu.id=u.customer_id WHERE u.coupon_id=? AND cu.phone=?').get(c.id, customerPhone).n;
    if (used >= c.per_customer_limit) return { error: "You've already used this coupon." };
  }
  if (subtotal < c.min_order) return { error: `Add ₹${c.min_order - subtotal} more to use this coupon (minimum order ₹${c.min_order}).` };
  const el = eligibleLines(lines, json(c.item_ids, []), json(c.category_ids, []));
  const base = el.reduce((s, l) => s + l.line_total, 0);
  if (!base) return { error: "This coupon doesn't apply to the bowls in your order." };
  let d = c.discount_type === 'percent' ? Math.floor(base * c.value / 100) : Math.min(c.value, base);
  if (c.max_discount != null) d = Math.min(d, c.max_discount);
  return { coupon: c, discount: d };
}

/**
 * Prices a cart. strict=true (order creation) turns every soft problem into an error.
 * input: { items:[{item_id,size_id,quantity}], fulfilment, area_id, lat, lng, coupon_code, phone }
 */
export function priceCart(input, { strict = false } = {}) {
  const b = getSetting('business');
  const lines = loadLines(input.items);
  const subtotal = lines.reduce((s, l) => s + l.line_total, 0);
  const warnings = [];
  if (subtotal < (b.min_order || 0)) {
    const m = `Minimum order is ₹${b.min_order}. Add ₹${b.min_order - subtotal} more.`;
    if (strict) throw badRequest(m); warnings.push(m);
  }

  let delivery = { fee: 0 }, area = null;
  if (input.fulfilment === 'delivery') {
    delivery = quoteDelivery(input.lat, input.lng);
    if (!delivery.eligible) { if (strict) throw badRequest(delivery.message); warnings.push(delivery.message); }
    area = delivery.area ? getArea(delivery.area.id) : null;
    delivery.fee = delivery.eligible ? delivery.fee : 0;
  } else {
    area = input.area_id ? getArea(input.area_id) : null;
    if (!area || !area.active || !area.pickup_enabled) { const m = 'Choose a pickup location.'; if (strict) throw badRequest(m); warnings.push(m); area = null; }
  }

  // Best automatic offer wins; a coupon can stack on top.
  let offer = null, offerDisc = 0;
  for (const o of activeOffers()) {
    const d = offerDiscount(o, lines, subtotal, delivery.fee);
    if (d > offerDisc) { offer = o; offerDisc = d; }
  }
  let coupon = null, couponDisc = 0, couponMsg = '';
  if (input.coupon_code) {
    const r = checkCoupon(input.coupon_code, lines, subtotal, input.phone);
    if (r.error) { if (strict) throw badRequest(r.error); couponMsg = r.error; }
    else { coupon = r.coupon; couponDisc = r.discount; }
  }
  const maxDisc = subtotal + delivery.fee;
  if (offerDisc + couponDisc > maxDisc) couponDisc = Math.max(0, maxDisc - offerDisc);
  const discount = offerDisc + couponDisc;
  const taxable = Math.max(0, subtotal - Math.min(discount, subtotal));
  const tax = Math.round(taxable * (Number(b.tax_percent) || 0) / 100);
  const total = Math.max(0, subtotal - discount + delivery.fee + tax);

  return {
    lines, subtotal,
    offer: offer ? { id: offer.id, title: offer.title, type: offer.type, discount: offerDisc } : null,
    coupon: input.coupon_code ? { code: coupon?.code || String(input.coupon_code).toUpperCase(), valid: !!coupon, discount: couponDisc, message: couponMsg || (coupon ? `Coupon applied: ₹${couponDisc} off` : '') } : null,
    discount, tax, tax_percent: Number(b.tax_percent) || 0,
    delivery: input.fulfilment === 'delivery' ? { eligible: !!delivery.eligible, distance_km: delivery.distance_km ?? null, fee: delivery.fee, message: delivery.message || '' } : null,
    delivery_fee: delivery.fee, area: area ? { id: area.id, name: area.name, slug: area.slug } : null,
    total, warnings,
    _offer: offer, _coupon: coupon
  };
}
