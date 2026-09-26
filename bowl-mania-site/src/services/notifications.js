import { db } from '../db/index.js';
import { emit } from '../lib/events.js';

/** Stores an item in the admin notification center and pushes it live to signed-in staff who may see it. */
export function notifyAdmins({ type, title, body = '', link = '', permission = 'notifications.view', data = {} }) {
  const id = db.prepare('INSERT INTO notifications (type, title, body, link, permission) VALUES (?,?,?,?,?)').run(type, title, body, link, permission).lastInsertRowid;
  emit('notification', { id, type, title, body, link, created_at: new Date().toISOString(), ...data }, permission);
  return id;
}
