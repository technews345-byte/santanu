import express, { Router } from 'express';
import { db } from '../db/index.js';
import { ah, badRequest, notFound } from '../lib/errors.js';
import { parse, z, text, optPhone, optEmail } from '../lib/validate.js';
import { config, razorpayEnabled } from '../config.js';
import { log } from '../lib/logger.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { getSetting } from '../services/settings.js';
import { publicMenu } from '../services/menu.js';
import { activeAreas, quoteDelivery, upcomingSlots, restaurantStatus, feeFor } from '../services/delivery.js';
import { priceCart, activeOffers } from '../services/pricing.js';
import { createOrder, orderByToken, trackingView } from '../services/orders.js';
import { createPaymentOrder, verifyCheckout, markFailed, verifyWebhook, handleWebhook } from '../services/payments.js';
import { verifyWebhookSignature, applyStatusUpdates } from '../services/whatsapp.js';
import { notifyAdmins } from '../services/notifications.js';

const r = Router();
const orderLimit = rateLimit({ windowMs: 10 * 60_000, max: 20, message: 'Too many orders from this device. Please wait a few minutes.' });
const formLimit = rateLimit({ windowMs: 60 * 60_000, max: 10, message: 'Too many messages. Please try again later.' });
const trackLimit = rateLimit({ windowMs: 60_000, max: 60 });

const paymentOptions = () => {
  const p = getSetting('payments');
  return { online: !!(p.online_enabled && razorpayEnabled()), cod: !!p.cod_enabled, razorpay_key_id: p.online_enabled && razorpayEnabled() ? config.razorpay.keyId : null };
};
const publicArea = a => ({
  id: a.id, name: a.name, slug: a.slug, address: a.address, phone: a.phone, whatsapp: a.whatsapp,
  delivery_enabled: !!a.delivery_enabled, pickup_enabled: !!a.pickup_enabled, max_radius_km: a.max_radius_km,
  fee_rule: { base_distance_km: a.base_distance_km, base_charge: a.base_charge, extra_distance_km: a.extra_distance_km, extra_charge: a.extra_charge,
    examples: [1, 2, 3, 4].map(n => ({ upto_km: +(a.base_distance_km + (n - 1) * a.extra_distance_km).toFixed(1), fee: feeFor(a, a.base_distance_km + (n - 1) * a.extra_distance_km) })) },
  slots: db.prepare('SELECT label, days, start_time, end_time FROM delivery_slots WHERE area_id=? AND active=1 ORDER BY display_order, start_time').all(a.id)
});

// ---------- Site configuration ----------
r.get('/public/config', (req, res) => {
  const rest = getSetting('restaurant'), b = getSetting('business');
  res.set('Cache-Control', 'no-store');
  res.json({
    restaurant: rest,
    business: { min_order: b.min_order, tax_percent: b.tax_percent, currency: b.currency, accept_preorders: b.accept_preorders, timezone: b.timezone },
    status: restaurantStatus(), payments: paymentOptions(), areas: activeAreas().map(publicArea)
  });
});
r.get('/menu', (req, res) => { res.set('Cache-Control', 'no-store'); res.json(publicMenu()); });
r.get('/delivery/areas', (req, res) => res.json(activeAreas().map(publicArea)));
r.post('/delivery/calculate', ah(async (req, res) => {
  const b = parse(z.object({ lat: z.coerce.number(), lng: z.coerce.number() }), req.body);
  res.json(quoteDelivery(b.lat, b.lng));
}));
r.get('/public/slots', ah(async (req, res) => {
  const { area_id } = parse(z.object({ area_id: z.coerce.number().int().positive() }), req.query);
  res.json({ slots: upcomingSlots(area_id, 3), status: restaurantStatus() });
}));
r.get('/offers', (req, res) => res.json(activeOffers().map(o => ({ id: o.id, title: o.title, description: o.description, type: o.type, value: o.value, min_order: o.min_order, image: o.image, ends_at: o.ends_at }))));
r.get('/reviews', (req, res) => res.json(db.prepare(`SELECT customer_name, rating, comment, created_at, featured FROM reviews WHERE status='approved' ORDER BY featured DESC, id DESC LIMIT 12`).all()
  .map(v => ({ ...v, customer_name: v.customer_name.split(' ')[0] }))));
r.get('/gallery', (req, res) => res.json(db.prepare("SELECT id, kind, title, description, category, url, thumb_url, width, height FROM media WHERE active=1 ORDER BY display_order, id DESC LIMIT 60").all()));

// ---------- Checkout ----------
const cartSchema = z.object({
  items: z.array(z.object({ item_id: z.coerce.number().int().positive(), size_id: z.coerce.number().int().positive(), quantity: z.coerce.number().int().min(1).max(20) })).min(1).max(30),
  fulfilment: z.enum(['delivery', 'pickup']), area_id: z.coerce.number().int().positive().optional(),
  lat: z.coerce.number().optional(), lng: z.coerce.number().optional(), coupon_code: text(40).optional().default(''), phone: optPhone
});
r.post('/checkout/quote', ah(async (req, res) => {
  const b = parse(cartSchema, req.body);
  const q = priceCart(b);
  const { _offer, _coupon, ...pub } = q;
  res.json({ ...pub, slots: q.area ? upcomingSlots(q.area.id, 3) : [], payments: paymentOptions(), status: restaurantStatus() });
}));
r.post('/coupons/validate', ah(async (req, res) => {
  const b = parse(cartSchema.extend({ coupon_code: text(40, 1) }), req.body);
  const q = priceCart(b);
  res.json(q.coupon);
}));
r.post('/orders', orderLimit, ah(async (req, res) => {
  const order = createOrder(req.body, { source: 'website' });
  const base = { order_number: order.order_number, tracking_token: order.tracking_token, total: order.total, payment_method: order.payment_method };
  if (order.payment_method === 'online') {
    const pay = await createPaymentOrder(order);
    return res.status(201).json({ ...base, payment: { ...pay, name: getSetting('restaurant').name, description: `Order ${order.order_number}`,
      prefill: { name: order.customer_name, contact: '+91' + order.customer_phone, email: order.customer_email } } });
  }
  res.status(201).json(base);
}));
r.post('/payments/verify', ah(async (req, res) => {
  const b = parse(z.object({ razorpay_order_id: z.string().max(60), razorpay_payment_id: z.string().max(60), razorpay_signature: z.string().max(200) }), req.body);
  const { order } = await verifyCheckout(b);
  res.json({ ok: order.payment_status === 'paid', tracking_token: order.tracking_token, order_number: order.order_number });
}));
r.post('/payments/failed', ah(async (req, res) => {
  const b = parse(z.object({ razorpay_order_id: z.string().max(60), reason: text(300).optional().default('') }), req.body);
  markFailed(b.razorpay_order_id, b.reason || 'Payment failed or was cancelled');
  res.json({ ok: true });
}));

// ---------- Tracking ----------
const tokenParam = z.object({ token: z.string().regex(/^[\w-]{20,64}$/, 'Invalid tracking link.') });
r.get('/track/:token', trackLimit, ah(async (req, res) => {
  const { token } = parse(tokenParam, req.params);
  const o = orderByToken(token); if (!o) throw notFound('We could not find that order. Check your tracking link.');
  res.set('Cache-Control', 'no-store'); res.json(trackingView(o));
}));
// "Where's my order?" form: order number + the phone used to order → the private tracking link.
r.post('/track/lookup', trackLimit, ah(async (req, res) => {
  const b = parse(z.object({ order_number: z.string().trim().toUpperCase().max(20), phone: optPhone }), req.body);
  const o = db.prepare('SELECT tracking_token, customer_phone FROM orders WHERE order_number=?').get(b.order_number.startsWith('BM') ? b.order_number : 'BM' + b.order_number);
  if (!o || !b.phone || o.customer_phone !== b.phone) throw notFound('No order found with that order number and phone. Check both and try again.');
  res.json({ tracking_token: o.tracking_token });
}));
r.post('/track/:token/review', formLimit, ah(async (req, res) => {
  const { token } = parse(tokenParam, req.params);
  const b = parse(z.object({ rating: z.coerce.number().int().min(1).max(5), comment: text(1000).optional().default('') }), req.body);
  const o = orderByToken(token); if (!o) throw notFound('Order not found.');
  if (!['delivered', 'completed'].includes(o.status)) throw badRequest('You can review your order once it has been delivered.');
  if (db.prepare('SELECT 1 FROM reviews WHERE order_id=?').get(o.id)) throw badRequest('You have already reviewed this order. Thank you!');
  db.prepare('INSERT INTO reviews (order_id, customer_id, customer_name, rating, comment) VALUES (?,?,?,?,?)').run(o.id, o.customer_id, o.customer_name, b.rating, b.comment);
  notifyAdmins({ type: 'new_review', title: `New ${b.rating}★ review`, body: `${o.customer_name}: ${b.comment.slice(0, 80)}`, link: '#/reviews', permission: 'reviews.manage' });
  res.status(201).json({ ok: true });
}));

// ---------- Contact form ----------
r.post('/contact', formLimit, ah(async (req, res) => {
  const b = parse(z.object({ name: text(80, 1), phone: optPhone, email: optEmail, message: text(2000, 5), website: z.string().max(0).optional() }), req.body);
  if (!b.phone && !b.email) throw badRequest('Add a phone number or email so we can reply.');
  db.prepare('INSERT INTO inquiries (name, phone, email, message) VALUES (?,?,?,?)').run(b.name, b.phone, b.email, b.message);
  notifyAdmins({ type: 'inquiry', title: `New message from ${b.name}`, body: b.message.slice(0, 100), link: '#/inquiries', permission: 'inquiries.manage' });
  res.status(201).json({ ok: true });
}));

export default r;

// ---------- Webhooks (raw bodies, mounted before the JSON parser) ----------
export const webhooks = Router();
webhooks.post('/payments/webhook', express.raw({ type: '*/*', limit: '1mb' }), (req, res) => {
  const raw = req.body?.toString('utf8') || '';
  if (!verifyWebhook(raw, req.get('x-razorpay-signature'))) { log.warn('razorpay webhook rejected: bad signature'); return res.status(400).json({ error: 'Invalid signature' }); }
  let payload; try { payload = JSON.parse(raw); } catch { return res.status(400).json({ error: 'Invalid JSON' }); }
  const eventId = req.get('x-razorpay-event-id') || `${payload.event}:${payload.payload?.payment?.entity?.id || payload.payload?.refund?.entity?.id || payload.created_at}`;
  try { res.json(handleWebhook(eventId, payload)); }
  catch (e) { log.error('razorpay webhook failed', { eventId, error: e.message }); res.status(500).json({ error: 'Processing failed' }); }
});
webhooks.get('/whatsapp/webhook', (req, res) => {
  if (req.query['hub.mode'] === 'subscribe' && config.whatsapp.verifyToken && req.query['hub.verify_token'] === config.whatsapp.verifyToken) return res.send(String(req.query['hub.challenge'] || ''));
  res.sendStatus(403);
});
webhooks.post('/whatsapp/webhook', express.raw({ type: '*/*', limit: '1mb' }), (req, res) => {
  const raw = req.body?.toString('utf8') || '';
  if (!verifyWebhookSignature(raw, req.get('x-hub-signature-256'))) return res.sendStatus(401);
  try { applyStatusUpdates(JSON.parse(raw)); } catch (e) { log.warn('whatsapp webhook parse failed', { error: e.message }); }
  res.sendStatus(200);
});
