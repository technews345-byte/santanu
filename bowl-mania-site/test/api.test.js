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

// ---------- Rider app ----------
const rapi = (method, url, body, tok) => {
  const headers = tok ? { Authorization: `Bearer ${tok}` } : {};
  let payload = body;
  if (body && !(body instanceof FormData)) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  return fetch(BASE + url, { method, headers, body: payload }).then(async r => ({ status: r.status, data: (r.headers.get('content-type') || '').includes('json') ? await r.json() : null }));
};
const jpeg = async (w = 400, h = 300, color = '#7cb342') => (await import('sharp')).default({ create: { width: w, height: h, channels: 3, background: color } }).jpeg().toBuffer();
const kitchenCode = async id => (await owner.get(`/api/admin/orders/${id}`)).data.assignment.pickup_otp;
let riderTok, riderId;

test('rider app: sign-in rules and profile', async () => {
  const roles = (await owner.get('/api/admin/staff')).data.roles;
  const riderRole = roles.find(r => r.key === 'delivery_staff');
  assert.equal(riderRole.is_rider, true); assert.equal(roles.find(r => r.key === 'owner')?.is_rider ?? false, false);
  const fields = { name: 'Bikash Rider', email: 'rider@bowlmania.test', phone: '9876500001', role_id: riderRole.id, password: 'RiderPass12' };
  // Delivery staff must have a profile photo.
  const noPhoto = await owner.post('/api/admin/staff', fields);
  assert.equal(noPhoto.status, 400); assert.match(noPhoto.data.error, /profile photo is required/);
  const fd = new FormData(); Object.entries(fields).forEach(([k, v]) => fd.append(k, String(v)));
  fd.append('photo', new Blob([await jpeg(500, 500, '#c59b6d')], { type: 'image/jpeg' }), 'face.jpg');
  const s = await owner.post('/api/admin/staff', fd);
  assert.equal(s.status, 201);
  riderId = s.data.id;
  const listed = (await owner.get('/api/admin/staff')).data.rows.find(x => x.id === riderId);
  assert.match(listed.photo_url, /^\/api\/admin\/files\/rider\//);
  assert.equal((await owner.get(listed.photo_url)).status, 200);
  // Other staff can't be switched to a delivery role without a photo.
  const kitchenStaff = (await owner.get('/api/admin/staff')).data.rows.find(x => x.email === 'kitchen@bowlmania.test');
  const switched = await owner.patch(`/api/admin/staff/${kitchenStaff.id}`, { name: kitchenStaff.name, email: kitchenStaff.email, phone: kitchenStaff.phone || '', role_id: riderRole.id, status: 'active' });
  assert.equal(switched.status, 400);
  assert.equal((await owner.patch(`/api/admin/riders/${riderId}`, { employee_id: 'BM-R01', vehicle_type: 'Scooter', vehicle_number: 'as06 ab 1234', joining_date: '2026-01-15' })).status, 200);
  assert.equal((await rapi('POST', '/api/rider/login', { email: 'rider@bowlmania.test', password: 'wrong-pass1' })).status, 401);
  assert.equal((await rapi('POST', '/api/rider/login', { email: 'kitchen@bowlmania.test', password: 'KitchenPass1' })).status, 403);
  const login = await rapi('POST', '/api/rider/login', { email: 'rider@bowlmania.test', password: 'RiderPass12' });
  assert.equal(login.status, 200); riderTok = login.data.token;
  assert.equal(login.data.rider.photo_url, '/api/rider/me/photo');
  assert.equal(login.data.rider.employee_id, 'BM-R01'); assert.equal(login.data.rider.vehicle_number, 'AS06 AB 1234'); assert.equal(login.data.rider.company, 'Bowl Mania');
  assert.equal((await rapi('GET', '/api/rider/me')).status, 401);
  assert.equal((await rapi('GET', '/api/rider/me', null, 'x'.repeat(40))).status, 401);
  // A rider cannot use the web admin to skip OTP and proof.
  const web = client(); await web.post('/api/auth/login', { email: 'rider@bowlmania.test', password: 'RiderPass12' });
  assert.equal((await web.get('/api/admin/orders')).status, 403);
  assert.equal((await web.patch('/api/admin/deliveries/1', { status: 'delivered' })).status, 403);
});

test('rider app: online, GPS, full COD delivery with OTPs, proof and cash; no earnings anywhere', async () => {
  assert.equal((await rapi('POST', '/api/rider/location', { points: [{ latitude: sonari.lat, longitude: sonari.lng, timestamp: new Date().toISOString() }] }, riderTok)).status, 409);
  assert.equal((await rapi('POST', '/api/rider/status', { online: true }, riderTok)).data.online, true);
  const t0 = Date.now() - 10 * 60_000;
  const pts = [0, 1, 2, 3].map(i => ({ latitude: sonari.lat + i * 0.005, longitude: sonari.lng, accuracy: 8, speed: 5, heading: 0, timestamp: new Date(t0 + i * 60_000).toISOString() }));
  assert.equal((await rapi('POST', '/api/rider/location', { points: pts }, riderTok)).data.accepted, 4);
  assert.equal((await rapi('POST', '/api/rider/location', { points: pts }, riderTok)).data.accepted, 0);
  const live = (await owner.get('/api/admin/riders')).data.rows.find(x => x.id === riderId);
  assert.equal(live.online, true); assert.ok(live.location);

  const o = (await guest.post('/api/orders', orderBody({ phone: '9855555555' }))).data;
  const id = (await owner.get(`/api/admin/orders?q=${o.order_number}`)).data.rows[0].id;
  for (const st of ['confirmed', 'preparing']) assert.equal((await owner.patch(`/api/admin/orders/${id}/status`, { status: st })).status, 200);
  assert.equal((await owner.put(`/api/admin/orders/${id}/assignment`, { staff_id: riderId })).status, 200);
  const sync = (await rapi('GET', '/api/rider/sync?after=0', null, riderTok)).data;
  assert.ok(sync.notifications.some(n => n.type === 'new_delivery' && n.order_id === id));

  let d = (await rapi('GET', `/api/rider/deliveries/${id}`, null, riderTok)).data;
  assert.equal(d.status, 'assigned'); assert.deepEqual(d.next, ['accept', 'reject']);
  assert.equal(d.payment.collect_amount, o.total); assert.equal(d.payment.prepaid, false);
  assert.equal(d.restaurant.name, 'Bowl Mania Sonari'); assert.equal(d.customer.phone, '9855555555');
  const json = JSON.stringify(d).toLowerCase();
  for (const word of ['delivery_fee', 'earning', 'commission', 'incentive', '"tip', 'payout', 'subtotal']) assert.ok(!json.includes(word), `rider view mentions ${word}`);

  const step = (s, extra = {}) => rapi('POST', `/api/rider/deliveries/${id}/step`, { step: s, ...extra }, riderTok);
  assert.equal((await step('start_delivery')).status, 409);
  assert.equal((await rapi('POST', `/api/rider/deliveries/${id}/accept`, { key: 'accept-key-1' }, riderTok)).data.status, 'accepted');
  assert.equal((await rapi('POST', `/api/rider/deliveries/${id}/accept`, { key: 'accept-key-1' }, riderTok)).status, 200);
  assert.equal((await rapi('POST', `/api/rider/status`, { online: false }, riderTok)).status, 409);
  assert.equal((await step('start')).data.status, 'to_restaurant');
  assert.equal((await step('arrive_restaurant')).data.status, 'at_restaurant');
  const code = await kitchenCode(id);
  assert.match(code, /^\d{4}$/);
  const wrong = code === '0000' ? '1111' : '0000';
  const bad = await step('verify_pickup', { otp: wrong });
  assert.equal(bad.status, 400); assert.match(bad.data.error, /Wrong code\. 4 tries left/);
  assert.equal((await step('verify_pickup', { otp: code })).data.status, 'picked_up');
  assert.equal((await owner.get(`/api/admin/orders/${id}`)).data.status, 'ready');
  assert.equal((await step('start_delivery')).data.status, 'out_for_delivery');
  const track = (await guest.get(`/api/track/${o.tracking_token}`)).data;
  assert.equal(track.status, 'out_for_delivery'); assert.equal(track.rider.first_name, 'Bikash'); assert.match(track.delivery_otp, /^\d{4}$/);
  assert.equal((await step('arrive_customer')).data.status, 'at_customer');
  assert.deepEqual((await step('arrive_customer')).data.next, ['verify_delivery']);
  assert.equal((await step('deliver')).status, 409);
  d = (await step('verify_delivery', { otp: track.delivery_otp })).data;
  assert.equal(d.status, 'otp_verified'); assert.deepEqual(d.next, ['collect_cash', 'proof']);
  assert.equal((await step('deliver')).status, 409);
  const fd = new FormData();
  fd.append('photo', new Blob([await jpeg()], { type: 'image/jpeg' }), 'door.jpg');
  fd.append('signature', new Blob([await (await import('sharp')).default({ create: { width: 600, height: 240, channels: 3, background: '#ffffff' } }).png().toBuffer()], { type: 'image/png' }), 'sign.png');
  fd.append('note', 'Handed to customer at the gate'); fd.append('lat', String(sonari.lat)); fd.append('lng', String(sonari.lng));
  d = (await rapi('POST', `/api/rider/deliveries/${id}/proof`, fd, riderTok)).data;
  assert.equal(d.proof.photo, true); assert.equal(d.proof.signature, true); assert.deepEqual(d.next, ['collect_cash']);
  d = (await step('collect_cash', { key: 'cash-key-1' })).data;
  assert.equal(d.payment.cash_collected, true); assert.deepEqual(d.next, ['deliver']);
  d = (await step('deliver', { key: 'deliver-key-1' })).data;
  assert.equal(d.status, 'delivered');
  assert.equal((await step('deliver', { key: 'deliver-key-1' })).status, 200);
  const full = (await owner.get(`/api/admin/orders/${id}`)).data;
  assert.equal(full.status, 'delivered'); assert.equal(full.payment_status, 'paid');
  assert.ok(full.assignment.proof_photo_url); assert.ok(full.delivery_events.some(e => e.step === 'cash_collected'));
  const img = await fetch(BASE + full.assignment.proof_photo_url, { headers: { Cookie: Object.entries(owner.jar).map(([k, v]) => `${k}=${v}`).join('; ') } });
  assert.equal(img.status, 200); assert.equal(img.headers.get('content-type'), 'image/webp');
  assert.equal((await fetch(BASE + full.assignment.proof_photo_url)).status, 401);
  assert.equal((await fetch(BASE + '/uploads/' + full.assignment.proof_photo)).status, 404);

  const home = (await rapi('GET', '/api/rider/home', null, riderTok)).data;
  assert.equal(home.today.completed, 1); assert.ok(home.today.distance_km > 1); assert.equal(home.active, null);
  const perf = (await rapi('GET', '/api/rider/performance', null, riderTok)).data;
  assert.equal(perf.completed, 1);
  const hist = (await rapi('GET', '/api/rider/deliveries/history?status=delivered', null, riderTok)).data;
  assert.equal(hist.rows[0].order_number, o.order_number);
  assert.equal((await rapi('POST', '/api/rider/status', { online: false }, riderTok)).data.online, false);

  const rv = await guest.post(`/api/track/${o.tracking_token}/review`, { rating: 5, comment: 'Fresh and tasty!' });
  assert.equal(rv.status, 201);
  const reviews = (await owner.get('/api/admin/reviews')).data.rows;
  await owner.patch(`/api/admin/reviews/${reviews[0].id}`, { featured: true });
  const pub = (await guest.get('/api/reviews')).data;
  assert.equal(pub[0].comment, 'Fresh and tasty!'); assert.equal(pub[0].customer_name, 'Priya');
  assert.equal((await rapi('GET', '/api/rider/performance', null, riderTok)).data.rating, 5);
});

test('rider app: reject, reassignment, cancellation, OTP lock-out and manager override', async () => {
  const o = (await guest.post('/api/orders', orderBody({ phone: '9855555566' }))).data;
  const id = (await owner.get(`/api/admin/orders?q=${o.order_number}`)).data.rows[0].id;
  await owner.patch(`/api/admin/orders/${id}/status`, { status: 'confirmed' });
  await owner.put(`/api/admin/orders/${id}/assignment`, { staff_id: riderId });
  assert.equal((await rapi('POST', `/api/rider/deliveries/${id}/reject`, { reason: 'Tyre puncture' }, riderTok)).status, 200);
  assert.equal((await rapi('POST', `/api/rider/deliveries/${id}/reject`, { reason: 'Tyre puncture' }, riderTok)).status, 200);
  const det = (await owner.get(`/api/admin/orders/${id}`)).data;
  assert.equal(det.assignment, null); assert.equal(det.rejections[0].reason, 'Tyre puncture');
  assert.equal((await rapi('GET', `/api/rider/deliveries/${id}`, null, riderTok)).status, 404);
  assert.equal((await rapi('GET', '/api/rider/deliveries/history?status=rejected', null, riderTok)).data.rows[0].status, 'rejected');

  await owner.put(`/api/admin/orders/${id}/assignment`, { staff_id: riderId });
  await rapi('POST', `/api/rider/deliveries/${id}/accept`, {}, riderTok);
  assert.equal((await rapi('POST', `/api/rider/deliveries/${id}/reject`, {}, riderTok)).status, 409);
  const step = (s, extra = {}) => rapi('POST', `/api/rider/deliveries/${id}/step`, { step: s, ...extra }, riderTok);
  await step('arrive_restaurant');
  assert.equal((await step('verify_pickup', { otp: await kitchenCode(id) })).status, 409); // kitchen hasn't started
  await owner.patch(`/api/admin/orders/${id}/status`, { status: 'preparing' });
  const code = await kitchenCode(id), wrong = code === '0000' ? '1111' : '0000';
  for (let i = 0; i < 5; i++) await step('verify_pickup', { otp: wrong });
  assert.equal((await step('verify_pickup', { otp: code })).status, 423);
  await owner.post(`/api/admin/orders/${id}/delivery/otp`, { kind: 'pickup' });
  assert.equal((await step('verify_pickup', { otp: await kitchenCode(id) })).data.status, 'picked_up');
  assert.equal((await owner.post(`/api/admin/orders/${id}/delivery/override`, { step: 'out_for_delivery', reason: 'Rider on the way' })).status, 200);
  assert.equal((await owner.post(`/api/admin/orders/${id}/delivery/override`, { step: 'delivered', reason: 'Customer lost code, verified by phone' })).status, 200);
  assert.equal((await owner.get(`/api/admin/orders/${id}`)).data.status, 'delivered');

  const c = (await guest.post('/api/orders', orderBody({ phone: '9855555577' }))).data;
  const cid = (await owner.get(`/api/admin/orders?q=${c.order_number}`)).data.rows[0].id;
  await owner.put(`/api/admin/orders/${cid}/assignment`, { staff_id: riderId });
  await owner.patch(`/api/admin/orders/${cid}/status`, { status: 'cancelled' });
  const n = (await rapi('GET', '/api/rider/notifications', null, riderTok)).data;
  assert.ok(n.rows.some(x => x.type === 'order_cancelled' && x.order_id === cid));
  assert.ok((await rapi('GET', '/api/rider/deliveries', null, riderTok)).data.cancelled_today.some(x => x.order_id === cid));
  assert.equal((await rapi('POST', `/api/rider/deliveries/${cid}/accept`, {}, riderTok)).status, 409);
  assert.equal((await rapi('POST', '/api/rider/notifications/read', {}, riderTok)).data.unread, 0);
});

test('rider app: attendance with selfie, breaks, shifts, leave', async () => {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
  const start = `${String(Math.max(0, h - 1)).padStart(2, '0')}:00`, end = h >= 23 ? '23:59' : `${String(h + 1).padStart(2, '0')}:59`;
  assert.equal((await owner.post('/api/admin/shifts', { rider_ids: [riderId], from: today, to: today, start_time: start, end_time: end })).data.created, 1);
  let a = (await rapi('GET', '/api/rider/attendance', null, riderTok)).data;
  assert.equal(a.state, 'not_checked_in'); assert.equal(a.shift.start_time, start);
  const fd = () => { const f = new FormData(); f.append('lat', String(sonari.lat)); f.append('lng', String(sonari.lng)); f.append('accuracy', '12'); return f; };
  assert.equal((await rapi('POST', '/api/rider/attendance/check-in', fd(), riderTok)).status, 400);
  const f1 = fd(); f1.append('selfie', new Blob([await jpeg(480, 640, '#caa07a')], { type: 'image/jpeg' }), 'selfie.jpg');
  a = (await rapi('POST', '/api/rider/attendance/check-in', f1, riderTok)).data;
  assert.equal(a.state, 'working'); assert.ok(a.attendance.check_in_selfie);
  const f2 = fd(); f2.append('selfie', new Blob([await jpeg(480, 640)], { type: 'image/jpeg' }), 'selfie.jpg');
  assert.equal((await rapi('POST', '/api/rider/attendance/check-in', f2, riderTok)).status, 409);
  assert.equal((await rapi('POST', '/api/rider/attendance/break/start', {}, riderTok)).data.state, 'on_break');
  assert.equal((await rapi('POST', '/api/rider/attendance/break/end', {}, riderTok)).data.state, 'working');
  const adm = (await owner.get('/api/admin/attendance')).data.rows.find(x => x.rider.id === riderId);
  assert.equal(adm.state, 'working'); assert.ok(adm.attendance.check_in_selfie.startsWith('/api/admin/files/selfie/'));
  assert.equal((await rapi('POST', '/api/rider/attendance/check-out', fd(), riderTok)).data.state, 'checked_out');
  // Checking in again on the same day: needs a selfie, reopens the day, and the gap is off duty (not a break).
  assert.equal((await rapi('POST', '/api/rider/attendance/check-in', fd(), riderTok)).status, 400);
  const f3 = fd(); f3.append('selfie', new Blob([await jpeg(480, 640, '#b98a66')], { type: 'image/jpeg' }), 'selfie.jpg');
  const again = await rapi('POST', '/api/rider/attendance/check-in', f3, riderTok);
  assert.equal(again.status, 200); assert.equal(again.data.state, 'working'); assert.equal(again.data.sessions, 2);
  assert.equal(again.data.attendance.check_out_at, null); assert.equal(again.data.breaks.length, 1);
  const f4 = fd(); f4.append('selfie', new Blob([await jpeg(480, 640)], { type: 'image/jpeg' }), 'selfie.jpg');
  assert.equal((await rapi('POST', '/api/rider/attendance/check-in', f4, riderTok)).status, 409);
  const adm2 = (await owner.get('/api/admin/attendance')).data.rows.find(x => x.rider.id === riderId);
  assert.equal(adm2.state, 'working'); assert.equal(adm2.gaps.length, 1); assert.ok(adm2.gaps[0].selfie.startsWith('/api/admin/files/selfie/'));
  assert.equal((await rapi('POST', '/api/rider/attendance/check-out', fd(), riderTok)).data.state, 'checked_out');
  const hist = (await rapi('GET', '/api/rider/attendance/history', null, riderTok)).data[0];
  assert.equal(hist.date, today); assert.equal(hist.sessions, 2); assert.ok(hist.worked_seconds >= 0);
  const tomorrow = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(Date.now() + 86_400_000));
  const lv = await rapi('POST', '/api/rider/leave', { from_date: tomorrow, to_date: tomorrow, reason: 'Family function' }, riderTok);
  assert.equal(lv.status, 201);
  assert.equal((await rapi('POST', '/api/rider/leave', { from_date: tomorrow, to_date: tomorrow, reason: 'Again' }, riderTok)).status, 409);
  assert.equal((await owner.patch(`/api/admin/leave/${lv.data.id}`, { status: 'approved' })).status, 200);
  assert.equal((await rapi('GET', '/api/rider/leave', null, riderTok)).data[0].status, 'approved');
});

test('rider app: support tickets, replies and emergency', async () => {
  const t = await rapi('POST', '/api/rider/support/tickets', { category: 'vehicle', message: 'Brake problem on my scooter', key: 'ticket-key-01' }, riderTok);
  assert.equal(t.status, 201); assert.equal(t.data.category_label, 'Vehicle issue');
  assert.equal((await rapi('POST', '/api/rider/support/tickets', { category: 'vehicle', message: 'Brake problem on my scooter', key: 'ticket-key-01' }, riderTok)).data.id, t.data.id);
  assert.equal((await owner.post(`/api/admin/support/${t.data.id}/messages`, { message: 'Use the spare scooter today.' })).status, 200);
  const view = (await rapi('GET', `/api/rider/support/tickets/${t.data.id}`, null, riderTok)).data;
  assert.equal(view.status, 'in_progress'); assert.equal(view.messages[1].body, 'Use the spare scooter today.');
  const em = await rapi('POST', '/api/rider/emergency', { type: 'accident', message: 'Minor fall near the market', lat: sonari.lat, lng: sonari.lng, key: 'emergency-key-1' }, riderTok);
  assert.equal(em.status, 201); assert.equal(em.data.emergency_number, '112');
  const list = (await owner.get('/api/admin/support')).data.rows;
  assert.equal(list[0].priority, 'urgent'); assert.equal(list[0].category, 'accident');
  const notes = (await owner.get('/api/admin/notifications')).data.rows;
  assert.ok(notes.some(n => n.type === 'rider_emergency' && /maps\.google\.com/.test(n.body)));
  assert.equal((await rapi('POST', '/api/rider/logout', {}, riderTok)).status, 200);
  assert.equal((await rapi('GET', '/api/rider/me', null, riderTok)).status, 401);
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

test('data deletion request and erasing a customer', async () => {
  const o = await guest.post('/api/orders', orderBody({ customer_name: 'Rahul Bora', phone: '9822233344', email: 'rahul@example.com' }));
  assert.equal(o.status, 201);
  assert.equal((await guest.post('/api/privacy/delete-request', { name: 'Rahul Bora', phone: '98222 33344' })).status, 201);
  // A number that never ordered gets the same answer, so the form cannot reveal who is a customer.
  assert.equal((await guest.post('/api/privacy/delete-request', { name: 'Someone', phone: '9700000001' })).status, 201);
  assert.equal((await guest.post('/api/privacy/delete-request', { name: 'Bad', phone: '123' })).status, 400);
  const req = (await owner.get('/api/admin/inquiries?kind=deletion')).data.rows.find(q => q.phone === '9822233344');
  assert.ok(req.customer_id, 'request is linked to the customer');
  assert.equal((await owner.post(`/api/admin/customers/${req.customer_id}/erase`, { confirm: 'nope' })).status, 400);
  const erased = await owner.post(`/api/admin/customers/${req.customer_id}/erase`, { confirm: 'ERASE' });
  assert.equal(erased.status, 200); assert.equal(erased.data.orders, 1);
  assert.equal((await owner.get(`/api/admin/customers/${req.customer_id}`)).status, 404);
  const order = (await owner.get(`/api/admin/orders?q=${o.data.order_number}`)).data.rows[0];
  assert.equal(order.customer_name, 'Deleted customer'); assert.equal(order.customer_phone, '');
  const full = (await owner.get(`/api/admin/orders/${order.id}`)).data;
  assert.equal(full.address, ''); assert.equal(full.lat, null); assert.equal(full.total, o.data.total);
  const done = (await owner.get('/api/admin/inquiries?kind=deletion')).data.rows.find(q => q.id === req.id);
  assert.equal(done.status, 'resolved');
  // Tracking and lookups no longer reveal anything about the person.
  assert.equal((await guest.post('/api/track/lookup', { order_number: o.data.order_number, phone: '9822233344' })).status, 404);
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
