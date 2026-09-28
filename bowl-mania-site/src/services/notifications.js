import { db } from '../db/index.js';
import { emit } from '../lib/events.js';
import { pushToStaff, shouldPush } from './webpush.js';

/** Stores an item in the admin notification center and pushes it live to signed-in staff who may see it. */
export function notifyAdmins({ type, title, body = '', link = '', permission = 'notifications.view', data = {} }) {
  const id = db.prepare('INSERT INTO notifications (type, title, body, link, permission) VALUES (?,?,?,?,?)').run(type, title, body, link, permission).lastInsertRowid;
  emit('notification', { id, type, title, body, link, created_at: new Date().toISOString(), ...data }, permission);
  // Important events also reach staff phones even when the admin panel is closed.
  if (shouldPush(type)) pushToStaff(permission, { title, body, url: `/admin/${link || '#/notifications'}`, tag: `admin-${type}-${id}`, kind: 'admin', urgent: type === 'new_order' || type === 'rider_emergency' });
  return id;
}
