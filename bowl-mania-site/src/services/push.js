// Firebase Cloud Messaging (HTTP v1) for the rider app. Optional: without FIREBASE_SERVICE_ACCOUNT the app
// still gets every notification through its own background sync, only a little later.
import jwt from 'jsonwebtoken';
import { db } from '../db/index.js';
import { config } from '../config.js';
import { log } from '../lib/logger.js';

let account = null, cached = { token: '', exp: 0 };
function serviceAccount() {
  if (account !== null) return account;
  try {
    const raw = config.firebaseServiceAccount.trim();
    account = raw ? JSON.parse(raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8')) : false;
  } catch (e) { log.error('FIREBASE_SERVICE_ACCOUNT is not valid JSON', { error: e.message }); account = false; }
  return account;
}
export const pushConfigured = () => !!serviceAccount();

async function accessToken() {
  if (cached.token && cached.exp > Date.now() + 60_000) return cached.token;
  const sa = serviceAccount();
  const now = Math.floor(Date.now() / 1000);
  const assertion = jwt.sign({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 },
    sa.private_key, { algorithm: 'RS256' });
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }) });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error_description || data.error || 'token request failed');
  cached = { token: data.access_token, exp: Date.now() + data.expires_in * 1000 };
  return cached.token;
}

/** Sends a data message to every device of a rider. Data-only, so the app builds the notification (with Accept/Reject). */
export async function pushToRider(adminId, data) {
  if (!pushConfigured()) return;
  const devices = db.prepare('SELECT id, token FROM rider_devices WHERE admin_id=?').all(adminId);
  if (!devices.length) return;
  try {
    const bearer = await accessToken();
    const payload = Object.fromEntries(Object.entries(data).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]));
    await Promise.all(devices.map(async d => {
      const r = await fetch(`https://fcm.googleapis.com/v1/projects/${serviceAccount().project_id}/messages:send`, {
        method: 'POST', headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: { token: d.token, data: payload, android: { priority: 'high', ttl: '600s' } } })
      });
      if (r.status === 404 || r.status === 400) {
        const body = await r.json().catch(() => ({}));
        if (/UNREGISTERED|INVALID_ARGUMENT/.test(JSON.stringify(body))) db.prepare('DELETE FROM rider_devices WHERE id=?').run(d.id);
      } else if (!r.ok) log.warn('push failed', { status: r.status });
    }));
  } catch (e) { log.warn('push failed', { error: e.message }); }
}
