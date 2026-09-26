// End-to-end API tests. Razorpay and WhatsApp are replaced by local mock servers that behave like the real APIs.
// Run: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHmac } from 'node:crypto';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bm-test-'));
const RZP_SECRET = 'test_key_secret', RZP_WEBHOOK = 'test_webhook_secret', WA_APP_SECRET = 'wa_app_secret';
const mock = { orders: new Map(), payments: new Map(), whatsapp: [], refunds: [] };
let mockServer, app, server, BASE;

function startMock() {
  return new Promise(resolve => {
    mockServer = http.createServer((req, res) => {
      let body = ''; req.on('data', c => body += c); req.on('end', () => {
        const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
        const b = body ? JSON.parse(body) : {};
        if (req.method === 'POST' && req.url === '/rzp/orders') {
          assert.match(req.headers.authorization, /^Basic /);
          const id = 'order_' + (mock.orders.size + 1); mock.orders.set(id, b); return send(200, { id, amount: b.amount, currency: b.currency });
        }
        let m;
        if ((m = req.url.match(/^\/rzp\/payments\/([\w]+)$/)) && req.method === 'GET') return send(200, { id: m[1], method: 'upi', amount: mock.payments.get(m[1])?.amount, status: 'captured' });
        if ((m = req.url.match(/^\/rzp\/orders\/([\w]+)\/payments$/))) return send(200, { items: [...mock.payments.values()].filter(p => p.order_id === m[1]) });
        if ((m = req.url.match(/^\/rzp\/payments\/([\w]+)\/refund$/))) { mock.refunds.push({ payment: m[1], ...b }); return send(200, { id: 'rfnd_' + mock.refunds.length, status: 'processed', amount: b.amount }); }
        if (req.url === '/wa/PHONE123/messages') { mock.whatsapp.push(b); return send(200, { messages: [{ id: 'wamid.' + mock.whatsapp.length }] }); }
        send(404, { error: { description: 'not found' } });
      });
    }).listen(0, () => resolve(mockServer.address().port));
  });
}

// Minimal browser-like client with a cookie jar and CSRF header.
function client() {
  const jar = {};
  const call = async (method, url, body, extra = {}) => {
    const headers = { Cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; '), ...(extra.headers || {}) };
    if (jar.bm_csrf && !extra.noCsrf) headers['X-CSRF-Token'] = jar.bm_csrf;
    let payload = body;
    if (body && !(body instanceof FormData) && typeof body !== 'string') { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
    const r = await fetch(BASE + url, { method, headers, body: payload, redirect: 'manual' });
    for (const c of r.headers.getSetCookie()) { const [kv] = c.split(';'); const i = kv.indexOf('='); const k = kv.slice(0, i), v = kv.slice(i + 1); if (v) jar[k] = v; else delete jar[k]; }
    const type = r.headers.get('content-type') || '';
    const data = type.includes('json') ? await r.json() : type.includes('text') ? await r.text() : Buffer.from(await r.arrayBuffer());
    return { status: r.status, data, headers: r.headers };
  };
  return { jar, get: (u, o) => call('GET', u, null, o), post: (u, b, o) => call('POST', u, b, o), patch: (u, b, o) => call('PATCH', u, b, o), put: (u, b, o) => call('PUT', u, b, o), del: (u, o) => call('DELETE', u, null, o) };
}
const owner = client(), guest = client();
let menu, sonari;
const near = (km) => ({ lat: sonari.lat + km / 111.2, lng: sonari.lng }); // ~km north of the kitchen

before(async () => {
  const mp = await startMock();
  Object.assign(process.env, {
    NODE_ENV: 'test', DATABASE_FILE: path.join(tmp, 'test.db'), UPLOADS_DIR: path.join(tmp, 'uploads'), JWT_SECRET: 'jwt-test-secret', PUBLIC_URL: 'http://bowlmania.test',
    ADMIN_EMAIL: 'owner@bowlmania.test', ADMIN_PASSWORD: 'OwnerPass123',
    RAZORPAY_KEY_ID: 'rzp_test_abc', RAZORPAY_KEY_SECRET: RZP_SECRET, RAZORPAY_WEBHOOK_SECRET: RZP_WEBHOOK, RAZORPAY_API_BASE: `http://127.0.0.1:${mp}/rzp`,
    WHATSAPP_ACCESS_TOKEN: 'wa-token', WHATSAPP_PHONE_NUMBER_ID: 'PHONE123', WHATSAPP_API_BASE: `http://127.0.0.1:${mp}/wa`, WHATSAPP_APP_SECRET: WA_APP_SECRET, WHATSAPP_VERIFY_TOKEN: 'verify-me'
  });
  const { migrate } = await import('../src/db/index.js');
  const { seed } = await import('../src/db/seed.js');
  const { createApp } = await import('../src/app.js');
  migrate(); await seed();
  app = createApp();
  await new Promise(r => { server = app.listen(0, r); });
  BASE = `http://127.0.0.1:${server.address().port}`;
  const cfg = (await guest.get('/api/public/config')).data;
  sonari = (await import('../src/db/index.js')).db.prepare("SELECT * FROM delivery_areas WHERE slug='sonari'").get();
  menu = (await guest.get('/api/menu')).data;
  assert.equal(cfg.restaurant.name, 'Bowl Mania');
});
after(() => { server?.close(); mockServer?.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

const item = name => menu.items.find(i => i.name === name);
const line = (name, label, quantity = 1) => { const i = item(name); return { item_id: i.id, size_id: i.sizes.find(s => s.label === label).id, quantity }; };
const orderBody = (extra = {}) => ({ customer_name: 'Priya Das', phone: '9876543210', fulfilment: 'delivery', address: 'House 12, Station Road', ...near(1),
  items: [line('Morning Glow Bowl', '500 ml', 2)], payment_method: 'cod', ...extra });

test('seeded menu matches the poster prices', () => {
  assert.equal(menu.items.length, 6);
  assert.deepEqual(item('Morning Glow Bowl').sizes.map(s => [s.label, s.price]), [['250 ml', 99], ['500 ml', 149]]);
  assert.deepEqual(item('Super Protein Bowl').sizes.map(s => [s.label, s.price]), [['500 ml', 199], ['750 ml', 249]]);
});

test('delivery fee is calculated on the server with Haversine distance', async () => {
  const a = await guest.post('/api/delivery/calculate', near(1));
  assert.equal(a.data.eligible, true); assert.equal(a.data.fee, 10); assert.equal(a.data.area.slug, 'sonari');
  const b = await guest.post('/api/delivery/calculate', near(2.4));
  assert.equal(b.data.fee, 20);
  const c = await guest.post('/api/delivery/calculate', near(4.0));
  assert.equal(c.data.fee, 30);
  const far = await guest.post('/api/delivery/calculate', near(40));
  assert.equal(far.data.eligible, false);
  assert.match(far.data.message, /does not deliver/);
});

test('admin login, session and CSRF protection', async () => {
  const bad = await owner.post('/api/auth/login', { email: 'owner@bowlmania.test', password: 'nope-nope-1' });
  assert.equal(bad.status, 401);
  const ok = await owner.post('/api/auth/login', { email: 'owner@bowlmania.test', password: 'OwnerPass123' });
  assert.equal(ok.status, 200); assert.equal(ok.data.admin.role, 'super_admin');
  assert.ok(owner.jar.bm_at && owner.jar.bm_rt && owner.jar.bm_csrf);
  const me = await owner.get('/api/auth/me'); assert.equal(me.data.admin.email, 'owner@bowlmania.test');
  const noCsrf = await owner.patch('/api/admin/restaurant-status', { mode: 'auto' }, { noCsrf: true });
  assert.equal(noCsrf.status, 403);
  const anon = await guest.get('/api/admin/orders'); assert.equal(anon.status, 401);
  const refresh = await owner.post('/api/auth/refresh', {}); assert.equal(refresh.status, 200);
});

test('menu changes (price, availability, new item) reach the public menu', async () => {
  const mg = (await owner.get('/api/admin/menu')).data.items.find(i => i.name === 'Morning Glow Bowl');
  const body = { ...mg, sizes: mg.sizes.map(s => s.label === '250 ml' ? { ...s, price: 109 } : s) };
  const upd = await owner.patch(`/api/admin/menu/${mg.id}`, body);
  assert.equal(upd.status, 200);
  menu = (await guest.get('/api/menu')).data;
  assert.equal(item('Morning Glow Bowl').sizes[0].price, 109);
  const audit = (await owner.get('/api/admin/audit?entity=menu_item')).data.rows[0];
  assert.equal(audit.summary, 'Edited Morning Glow Bowl: 250 ml: ₹99 → ₹109');

  const cc = item('Chicken Crunch Bowl');
  await owner.patch(`/api/admin/menu/${cc.id}/availability`, { available: false });
  menu = (await guest.get('/api/menu')).data;
  assert.equal(item('Chicken Crunch Bowl').available, false);
  const soldOut = await guest.post('/api/orders', orderBody({ items: [line('Chicken Crunch Bowl', '250 ml')] }));
  assert.equal(soldOut.status, 400); assert.match(soldOut.data.error, /sold out/);
  await owner.patch(`/api/admin/menu/${cc.id}/availability`, { available: true });

  const created = await owner.post('/api/admin/menu', { name: 'Paneer Tikka Bowl', description: 'Paneer · Mint', diet: 'veg', category_id: mg.category_id, sizes: [{ label: '500 ml', price: 179 }] });
  assert.equal(created.status, 201);
  menu = (await guest.get('/api/menu')).data;
  assert.ok(item('Paneer Tikka Bowl'));
  assert.equal((await owner.del(`/api/admin/menu/${created.data.id}`)).status, 200);
  menu = (await guest.get('/api/menu')).data;
  assert.equal(item('Paneer Tikka Bowl'), undefined);
});

test('checkout ignores client prices and totals', async () => {
  const q = await guest.post('/api/checkout/quote', { items: [line('Morning Glow Bowl', '500 ml', 2)], fulfilment: 'delivery', ...near(1) });
  assert.equal(q.data.subtotal, 298); assert.equal(q.data.delivery_fee, 10); assert.equal(q.data.total, 308);
  const o = await guest.post('/api/orders', { ...orderBody(), total: 1, subtotal: 1, delivery_fee: 0, discount: 999 });
  assert.equal(o.status, 201); assert.equal(o.data.total, 308);
  assert.match(o.data.order_number, /^BM\d{8}\d{3}$/);
  const t = await guest.get(`/api/track/${o.data.tracking_token}`);
  assert.equal(t.data.status, 'new'); assert.equal(t.data.total, 308);
  assert.equal(t.data.customer_phone, undefined, 'tracking must not expose customer phone');
  assert.equal(t.data.address, undefined, 'tracking must not expose address');
  const bad = await guest.post('/api/orders', orderBody({ ...near(50) }));
  assert.equal(bad.status, 400);
});

test('coupons are validated on the server with limits', async () => {
  const c = await owner.post('/api/admin/coupons', { code: 'welcome10', discount_type: 'percent', value: 10, min_order: 200, max_discount: 50, per_customer_limit: 1 });
  assert.equal(c.status, 201); assert.equal(c.data.code, 'WELCOME10');
  const small = await guest.post('/api/checkout/quote', { items: [line('Morning Glow Bowl', '500 ml', 1)], fulfilment: 'pickup', area_id: sonari.id, coupon_code: 'WELCOME10' });
  assert.equal(small.data.coupon.valid, false); assert.match(small.data.coupon.message, /minimum order/);
  const ok = await guest.post('/api/orders', orderBody({ phone: '9811111111', coupon_code: 'welcome10' }));
  assert.equal(ok.status, 201); assert.equal(ok.data.total, 298 - 29 + 10);
  const again = await guest.post('/api/orders', orderBody({ phone: '9811111111', coupon_code: 'WELCOME10' }));
  assert.equal(again.status, 400); assert.match(again.data.error, /already used/);
});

test('automatic offers apply (free delivery above ₹250)', async () => {
  const o = await owner.post('/api/admin/offers', { title: 'Free delivery over ₹250', type: 'free_delivery', min_order: 250 });
  assert.equal(o.status, 201); assert.equal(o.data.state, 'live');
  const q = await guest.post('/api/checkout/quote', { items: [line('Morning Glow Bowl', '500 ml', 2)], fulfilment: 'delivery', ...near(1) });
  assert.equal(q.data.offer.discount, 10); assert.equal(q.data.total, 298);
  await owner.patch(`/api/admin/offers/${o.data.id}`, { ...o.data, active: false, starts_at: '', ends_at: '' });
});

test('role permissions: kitchen staff can only do kitchen work', async () => {
  const roles = (await owner.get('/api/admin/staff')).data.roles;
  const kitchen = roles.find(r => r.key === 'kitchen_staff');
  const s = await owner.post('/api/admin/staff', { name: 'Kiran Kitchen', email: 'kitchen@bowlmania.test', role_id: kitchen.id, password: 'KitchenPass1' });
  assert.equal(s.status, 201);
  const k = client();
  assert.equal((await k.post('/api/auth/login', { email: 'kitchen@bowlmania.test', password: 'KitchenPass1' })).status, 200);
  const o = (await guest.post('/api/orders', orderBody({ phone: '9822222222' }))).data;
  const id = (await owner.get(`/api/admin/orders?q=${o.order_number}`)).data.rows[0].id;
  assert.equal((await k.patch(`/api/admin/orders/${id}/status`, { status: 'confirmed' })).status, 403);
  assert.equal((await k.get('/api/admin/staff')).status, 403);
  const mg = (await owner.get('/api/admin/menu')).data.items[0];
  assert.equal((await k.patch(`/api/admin/menu/${mg.id}`, mg)).status, 403);
  assert.equal((await owner.patch(`/api/admin/orders/${id}/status`, { status: 'confirmed' })).status, 200);
  assert.equal((await k.patch(`/api/admin/orders/${id}/status`, { status: 'preparing' })).status, 200);
  assert.equal((await k.patch(`/api/admin/menu/${mg.id}/availability`, { available: true })).status, 200);
  const hist = (await owner.get(`/api/admin/orders/${id}`)).data.history.map(h => [h.to_status, h.admin_name]);
  assert.deepEqual(hist.slice(-2), [['confirmed', 'Owner'], ['preparing', 'Kiran Kitchen']]);
});

test('online payment: Razorpay order, signature verification, idempotent webhooks, refund', async () => {
  const cod = await owner.patch('/api/admin/settings/notifications', { ...(await owner.get('/api/admin/settings')).data.notifications, whatsapp_enabled: true });
  assert.equal(cod.status, 200);
  const r = await guest.post('/api/orders', orderBody({ phone: '9833333333', payment_method: 'online' }));
  assert.equal(r.status, 201); assert.equal(r.data.payment.key_id, 'rzp_test_abc');
  assert.equal(mock.orders.get(r.data.payment.razorpay_order_id).amount, r.data.total * 100);
  const orderId = r.data.payment.razorpay_order_id, paymentId = 'pay_TEST1';
  mock.payments.set(paymentId, { id: paymentId, order_id: orderId, amount: r.data.total * 100, status: 'captured', method: 'upi' });

  // Unpaid online orders cannot be confirmed.
  const row = (await owner.get(`/api/admin/orders?q=${r.data.order_number}&payment_status=created`)).data.rows[0];
  assert.equal((await owner.patch(`/api/admin/orders/${row.id}/status`, { status: 'confirmed' })).status, 409);

  const forged = await guest.post('/api/payments/verify', { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: 'deadbeef' });
  assert.equal(forged.status, 400);
  const sig = createHmac('sha256', RZP_SECRET).update(`${orderId}|${paymentId}`).digest('hex');
  const v = await guest.post('/api/payments/verify', { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: sig });
  assert.equal(v.data.ok, true);
  const t = (await guest.get(`/api/track/${r.data.tracking_token}`)).data;
  assert.equal(t.payment_status, 'paid');

  // Webhook: wrong signature rejected; the same event twice is processed once.
  const evt = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: paymentId, order_id: orderId, amount: r.data.total * 100, method: 'upi' } } } });
  const badHook = await fetch(BASE + '/api/payments/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': 'x' }, body: evt });
  assert.equal(badHook.status, 400);
  const hsig = createHmac('sha256', RZP_WEBHOOK).update(evt).digest('hex');
  for (let i = 0; i < 2; i++) {
    const h = await fetch(BASE + '/api/payments/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': hsig, 'x-razorpay-event-id': 'evt_1' }, body: evt });
    assert.equal(h.status, 200);
  }
  const { db } = await import('../src/db/index.js');
  assert.equal(db.prepare("SELECT COUNT(*) n FROM notifications WHERE type='new_order' AND title LIKE ?").get(`%${r.data.order_number}%`).n, 1, 'new-order alert fires once');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM webhook_events').get().n, 1);

  // WhatsApp message went out and its delivery receipt is recorded.
  await new Promise(res => setTimeout(res, 150));
  const sent = mock.whatsapp.find(m => m.to === '919833333333');
  assert.ok(sent, 'order_received WhatsApp message sent');
  const receipt = JSON.stringify({ entry: [{ changes: [{ value: { statuses: [{ id: 'wamid.' + (mock.whatsapp.indexOf(sent) + 1), status: 'delivered' }] } }] }] });
  const wh = await fetch(BASE + '/api/whatsapp/webhook', { method: 'POST', headers: { 'x-hub-signature-256': 'sha256=' + createHmac('sha256', WA_APP_SECRET).update(receipt).digest('hex') }, body: receipt });
  assert.equal(wh.status, 200);
  assert.equal(db.prepare('SELECT status FROM notification_logs WHERE provider_message_id=?').get('wamid.' + (mock.whatsapp.indexOf(sent) + 1)).status, 'delivered');

  const ref = await owner.post(`/api/admin/orders/${row.id}/refund`, { reason: 'Customer request' });
  assert.equal(ref.status, 200); assert.equal(ref.data.payment_status, 'refunded');
  assert.equal(mock.refunds[0].amount, r.data.total * 100);
});

test('payment failure webhook marks the order failed', async () => {
  const r = await guest.post('/api/orders', orderBody({ phone: '9844444444', payment_method: 'online' }));
  const evt = JSON.stringify({ event: 'payment.failed', payload: { payment: { entity: { id: 'pay_F', order_id: r.data.payment.razorpay_order_id, amount: 1, error_description: 'Card declined' } } } });
  const h = await fetch(BASE + '/api/payments/webhook', { method: 'POST', headers: { 'x-razorpay-signature': createHmac('sha256', RZP_WEBHOOK).update(evt).digest('hex'), 'x-razorpay-event-id': 'evt_fail' }, body: evt });
  assert.equal(h.status, 200);
  assert.equal((await guest.get(`/api/track/${r.data.tracking_token}`)).data.payment_status, 'failed');
});

test('delivery assignment and delivery staff flow; COD marked paid on delivery', async () => {
  const roles = (await owner.get('/api/admin/staff')).data.roles;
  const s = await owner.post('/api/admin/staff', { name: 'Bikash Rider', email: 'rider@bowlmania.test', phone: '9876500001', role_id: roles.find(r => r.key === 'delivery_staff').id, password: 'RiderPass12' });
  const o = (await guest.post('/api/orders', orderBody({ phone: '9855555555' }))).data;
  const id = (await owner.get(`/api/admin/orders?q=${o.order_number}`)).data.rows[0].id;
  for (const st of ['confirmed', 'preparing', 'ready']) assert.equal((await owner.patch(`/api/admin/orders/${id}/status`, { status: st })).status, 200);
  assert.equal((await owner.put(`/api/admin/orders/${id}/assignment`, { staff_id: s.data.id })).status, 200);
  const rider = client();
  await rider.post('/api/auth/login', { email: 'rider@bowlmania.test', password: 'RiderPass12' });
  const mine = (await rider.get('/api/admin/deliveries/mine')).data;
  assert.equal(mine.length, 1); assert.equal(mine[0].order_number, o.order_number);
  assert.equal((await rider.get('/api/admin/orders')).status, 403);
  for (const st of ['picked_up', 'out_for_delivery']) assert.equal((await rider.patch(`/api/admin/deliveries/${id}`, { status: st })).status, 200);
  const t = (await guest.get(`/api/track/${o.tracking_token}`)).data;
  assert.equal(t.status, 'out_for_delivery'); assert.equal(t.rider.first_name, 'Bikash');
  assert.equal((await rider.patch(`/api/admin/deliveries/${id}`, { status: 'delivered' })).status, 200);
  const d = (await owner.get(`/api/admin/orders/${id}`)).data;
  assert.equal(d.status, 'delivered'); assert.equal(d.payment_status, 'paid');

  const rv = await guest.post(`/api/track/${o.tracking_token}/review`, { rating: 5, comment: 'Fresh and tasty!' });
  assert.equal(rv.status, 201);
  const reviews = (await owner.get('/api/admin/reviews')).data.rows;
  await owner.patch(`/api/admin/reviews/${reviews[0].id}`, { featured: true });
  const pub = (await guest.get('/api/reviews')).data;
  assert.equal(pub[0].comment, 'Fresh and tasty!'); assert.equal(pub[0].customer_name, 'Priya');
});

test('manual staff order uses the same pricing', async () => {
  const o = await owner.post('/api/admin/orders', { customer_name: 'Walk-in Guest', phone: '9866666666', fulfilment: 'pickup', area_id: sonari.id, items: [line('Super Protein Bowl', '750 ml')], payment_method: 'cod', total: 5 });
  assert.equal(o.status, 201); assert.equal(o.data.total, 249); assert.equal(o.data.source, 'admin');
});

test('dashboard, analytics and exports use real data', async () => {
  const d = (await owner.get('/api/admin/dashboard?preset=today')).data;
  assert.ok(d.kpis.orders >= 4); assert.ok(d.kpis.revenue > 0); assert.equal(d.series.today.length, 24);
  const a = (await owner.get('/api/admin/analytics?preset=last30')).data;
  assert.ok(a.top_items.length); assert.equal(a.series.length, 30);
  const csv = await owner.get('/api/admin/reports/orders?format=csv&from=2020-01-01');
  assert.equal(csv.status, 200); assert.match(csv.data, /Order ID,Date\/time,Customer/);
  const xlsx = await owner.get('/api/admin/reports/revenue?format=xlsx&preset=last7');
  assert.equal(xlsx.status, 200); assert.equal(xlsx.data.subarray(0, 2).toString(), 'PK');
});

test('restaurant can be closed from the admin', async () => {
  await owner.patch('/api/admin/restaurant-status', { mode: 'closed' });
  const r = await guest.post('/api/orders', orderBody({ phone: '9877777777' }));
  assert.equal(r.status, 400);
  await owner.patch('/api/admin/restaurant-status', { mode: 'auto' });
});

test('contact form, inquiries, notifications and live events', async () => {
  const ev = await fetch(BASE + '/api/admin/events', { headers: { Cookie: Object.entries(owner.jar).map(([k, v]) => `${k}=${v}`).join('; ') } });
  const reader = ev.body.getReader();
  const got = (async () => { let s = ''; while (!s.includes('event: notification')) { const { value } = await reader.read(); s += new TextDecoder().decode(value); } return s; })();
  assert.equal((await guest.post('/api/contact', { name: 'Asha', phone: '9888888888', message: 'Do you cater for office lunch?' })).status, 201);
  assert.match(await got, /New message from Asha/); await reader.cancel();
  const inq = (await owner.get('/api/admin/inquiries')).data.rows[0];
  assert.equal((await owner.patch(`/api/admin/inquiries/${inq.id}`, { reply: 'Yes! Call us.' })).data.status, 'resolved');
  const n = (await owner.get('/api/admin/notifications')).data;
  assert.ok(n.unread > 0);
  await owner.post('/api/admin/notifications/read', {});
  assert.equal((await owner.get('/api/admin/notifications')).data.unread, 0);
});

test('media upload is optimised to WebP', async () => {
  const sharp = (await import('sharp')).default;
  const png = await sharp({ create: { width: 2400, height: 1600, channels: 3, background: '#7cb342' } }).png().toBuffer();
  const fd = new FormData(); fd.append('file', new Blob([png], { type: 'image/png' }), 'bowl.png'); fd.append('title', 'Green bowl'); fd.append('category', 'food');
  const r = await owner.post('/api/admin/media', fd);
  assert.equal(r.status, 201); assert.equal(r.data.mime, 'image/webp'); assert.equal(r.data.width, 1600);
  const img = await fetch(BASE + r.data.url); assert.equal(img.status, 200);
});

test('password reset link works once and logout ends the session', async () => {
  const { db } = await import('../src/db/index.js');
  const { sha256 } = await import('../src/lib/ids.js');
  const t = 'reset-token-for-tests-0123456789';
  const kid = db.prepare("SELECT id FROM admins WHERE email='kitchen@bowlmania.test'").get().id;
  db.prepare("INSERT INTO password_resets (admin_id, token_hash, expires_at) VALUES (?, ?, datetime('now','+1 hour'))").run(kid, sha256(t));
  assert.equal((await guest.post('/api/auth/reset', { token: t, password: 'NewKitchen99' })).status, 200);
  assert.equal((await guest.post('/api/auth/reset', { token: t, password: 'NewKitchen99' })).status, 400);
  assert.equal((await client().post('/api/auth/login', { email: 'kitchen@bowlmania.test', password: 'NewKitchen99' })).status, 200);
  await owner.post('/api/auth/logout', {});
  assert.equal((await owner.get('/api/auth/me')).status, 401);
});
