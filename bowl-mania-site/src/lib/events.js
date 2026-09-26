// In-process event bus feeding the admin Server-Sent Events stream.
// Each listener is an admin connection; events carry the permission needed to receive them.
const listeners = new Set();
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function emit(type, data, permission = 'orders.view') {
  for (const fn of listeners) { try { fn({ type, data, permission }); } catch { /* a closed stream is cleaned up by its own handler */ } }
}
export const listenerCount = () => listeners.size;
