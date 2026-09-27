import { Router } from 'express';
import { db } from '../../db/index.js';
import { ah } from '../../lib/errors.js';
import { parse, z, text, bool, imageUrl } from '../../lib/validate.js';
import { audit, diff } from '../../lib/audit.js';
import { requirePerm } from '../../middleware/auth.js';
import { getSetting, setSetting } from '../../services/settings.js';
import { config, razorpayEnabled, whatsappConfigured } from '../../config.js';
import { mailConfigured } from '../../services/mailer.js';
import { WA_EVENTS } from '../../services/whatsapp.js';
import { restaurantStatus } from '../../services/delivery.js';
import { emit } from '../../lib/events.js';

const r = Router();
const url = z.union([z.literal(''), z.string().trim().url('Use a full https:// link.').max(300)]).optional().default('');
const SCHEMAS = {
  restaurant: z.object({ name: text(60, 1), tagline: text(120), logo: imageUrl, phone: text(20), whatsapp: z.string().trim().regex(/^\d{10,13}$/, 'Use the WhatsApp number with country code, digits only (e.g. 918099026415).'),
    email: z.union([z.literal(''), z.string().email('Enter a valid email.')]), address: text(300), instagram: url, facebook: url, youtube: url }),
  business: z.object({ status_mode: z.enum(['auto', 'open', 'closed']), closed_message: text(200), accept_preorders: bool, min_order: z.coerce.number().int().min(0).max(100000),
    tax_percent: z.coerce.number().min(0).max(28), currency: z.literal('INR'), timezone: z.string().max(40).refine(tz => { try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; } }, 'Unknown timezone.'),
    prep_minutes: z.coerce.number().int().min(0).max(240), delivery_minutes: z.coerce.number().int().min(0).max(240), order_cutoff_minutes: z.coerce.number().int().min(0).max(120) }),
  payments: z.object({ online_enabled: bool, cod_enabled: bool }).refine(p => p.online_enabled || p.cod_enabled, { message: 'Keep at least one payment method on.' }),
  notifications: z.object({ whatsapp_enabled: bool, browser_sound: bool,
    templates: z.object(Object.fromEntries(WA_EVENTS.map(e => [e, z.object({ enabled: bool, template_name: z.string().trim().regex(/^[a-z0-9_]*$/, 'Template names use lowercase letters, numbers and _.').max(60), language: z.string().max(10), body: text(1000, 1) })]))) })
};

r.get('/settings', requirePerm('settings.manage'), (req, res) => res.json({
  ...Object.fromEntries(Object.keys(SCHEMAS).map(k => [k, getSetting(k)])),
  integrations: {
    razorpay: { configured: razorpayEnabled(), key_id: config.razorpay.keyId ? config.razorpay.keyId.slice(0, 12) + '…' : '', mode: config.razorpay.keyId.startsWith('rzp_live') ? 'live' : config.razorpay.keyId ? 'test' : '',
      webhook_configured: !!config.razorpay.webhookSecret, webhook_url: `${config.publicUrl}/api/payments/webhook` },
    whatsapp: { configured: whatsappConfigured(), webhook_configured: !!(config.whatsapp.verifyToken && config.whatsapp.appSecret), webhook_url: `${config.publicUrl}/api/whatsapp/webhook` },
    email: { configured: mailConfigured() }
  },
  events: WA_EVENTS, status: restaurantStatus()
}));
r.patch('/settings/:group', requirePerm('settings.manage'), ah(async (req, res) => {
  const schema = SCHEMAS[req.params.group]; if (!schema) return res.status(404).json({ error: 'Unknown settings group.' });
  const before = getSetting(req.params.group);
  const b = parse(schema, req.body);
  const after = setSetting(req.params.group, b);
  const [o, n, keys] = diff(before, after);
  if (keys.length) audit(req, 'update', 'settings', req.params.group, `Changed ${req.params.group} settings: ${keys.join(', ')}`, o, n);
  if (req.params.group === 'business') emit('status_changed', restaurantStatus(), 'dashboard.view');
  res.json(after);
}));
// Quick OPEN / CLOSED / AUTO switch in the top bar (available to order managers too).
r.patch('/restaurant-status', requirePerm('settings.manage', 'orders.update'), ah(async (req, res) => {
  const { mode } = parse(z.object({ mode: z.enum(['auto', 'open', 'closed']) }), req.body);
  const before = getSetting('business').status_mode;
  setSetting('business', { status_mode: mode });
  audit(req, 'update', 'settings', 'business', `Restaurant status: ${before} → ${mode}`, { status_mode: before }, { status_mode: mode });
  const st = restaurantStatus(); emit('status_changed', st, 'orders.view'); res.json(st);
}));
export default r;
