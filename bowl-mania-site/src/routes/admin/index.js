import { Router } from 'express';
import { requireAuth, csrf, can } from '../../middleware/auth.js';
import { subscribe } from '../../lib/events.js';
import { ah } from '../../lib/errors.js';
import { parse, z, pushSubscription } from '../../lib/validate.js';
import { saveStaffSubscription, removeStaffSubscription, pushToAdmin } from '../../services/webpush.js';
import orders from './orders.js';
import menu from './menu.js';
import customers from './customers.js';
import payments from './payments.js';
import delivery from './delivery.js';
import promotions from './promotions.js';
import engagement from './engagement.js';
import media from './media.js';
import inventory from './inventory.js';
import analytics from './analytics.js';
import staff from './staff.js';
import settings from './settings.js';
import riders from './riders.js';

const r = Router();
r.use(requireAuth, csrf);

// Server-Sent Events: new orders, status changes and notifications arrive without refreshing.
r.get('/events', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  res.write(`retry: 5000\nevent: hello\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`);
  const admin = req.admin;
  const off = subscribe(ev => { if (can(admin, ev.permission)) res.write(`event: ${ev.type}\ndata: ${JSON.stringify(ev.data)}\n\n`); });
  const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
  req.on('close', () => { off(); clearInterval(ping); });
});

// This device receives push alerts (new orders etc.) for the signed-in staff member.
r.post('/push', ah(async (req, res) => {
  saveStaffSubscription(req.admin.id, parse(pushSubscription(), req.body || {}), req.get('user-agent'));
  res.status(201).json({ ok: true });
}));
r.delete('/push', ah(async (req, res) => {
  removeStaffSubscription(req.admin.id, parse(z.object({ endpoint: z.string().max(1000) }), req.body || {}).endpoint);
  res.json({ ok: true });
}));
r.post('/push/test', ah(async (req, res) => {
  pushToAdmin(req.admin.id, { title: 'Order alerts are on ✅', body: 'New orders will appear here even when the admin panel is closed.', url: '/admin/#/orders', tag: 'admin-test', kind: 'admin' });
  res.json({ ok: true });
}));

r.use(orders, menu, customers, payments, delivery, promotions, engagement, media, inventory, analytics, staff, settings, riders);
export default r;
