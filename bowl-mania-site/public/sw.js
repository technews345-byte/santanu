// Bowl Mania service worker: shows push notifications (new orders for staff, order updates for customers)
// and opens the right page when one is tapped. It does not cache pages.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', event => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { title: 'Bowl Mania', body: event.data?.text() || '' }; }
  const urgent = !!d.urgent;
  event.waitUntil(self.registration.showNotification(d.title || 'Bowl Mania', {
    body: d.body || '',
    icon: '/assets/logo.jpg',
    badge: '/assets/logo.jpg',
    tag: d.tag || undefined,
    renotify: !!d.tag,
    requireInteraction: urgent,
    vibrate: urgent ? [300, 120, 300, 120, 600] : [200, 100, 200],
    data: { url: d.url || '/' }
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // Reuse an open tab of the same section (admin or website) when there is one.
    const same = wins.find(w => new URL(w.url).pathname.startsWith('/admin') === new URL(url).pathname.startsWith('/admin'));
    if (same) { await same.focus(); return same.navigate(url).catch(() => self.clients.openWindow(url)); }
    return self.clients.openWindow(url);
  })());
});
