import { api, get, post, patch, onSignedOut } from './api.js';
import { $, $$, esc, icon, toast, toastError, initials, setTZ, ago, rupee, debounce } from './ui.js';

// ---------- Navigation model (permission-aware) ----------
export const NAV = [
  { group: 'Today', items: [
    { path: 'dashboard', label: 'Dashboard', icon: 'dashboard', perm: ['dashboard.view'] },
    { path: 'orders', label: 'Orders', icon: 'orders', perm: ['orders.view'], badge: 'orders' },
    { path: 'deliveries', label: 'Deliveries', icon: 'scooter', perm: ['delivery.view', 'delivery.assign'] },
    { path: 'my-deliveries', label: 'My deliveries', icon: 'scooter', perm: ['delivery.update'], hideIf: ['delivery.assign'] }
  ] },
  { group: 'Menu', items: [
    { path: 'menu', label: 'Menu', icon: 'bowl', perm: ['menu.view', 'menu.manage', 'menu.availability'] },
    { path: 'categories', label: 'Categories', icon: 'list', perm: ['menu.manage'] },
    { path: 'inventory', label: 'Inventory', icon: 'box', perm: ['inventory.manage'] }
  ] },
  { group: 'Guests', items: [
    { path: 'customers', label: 'Customers', icon: 'users', perm: ['customers.view'] },
    { path: 'reviews', label: 'Reviews', icon: 'star', perm: ['reviews.manage'] },
    { path: 'inquiries', label: 'Inquiries', icon: 'chat', perm: ['inquiries.manage'], badge: 'inquiries' }
  ] },
  { group: 'Money', items: [
    { path: 'payments', label: 'Payments', icon: 'card', perm: ['payments.view'] },
    { path: 'coupons', label: 'Coupons', icon: 'ticket', perm: ['promotions.manage'] },
    { path: 'offers', label: 'Offers', icon: 'gift', perm: ['promotions.manage'] }
  ] },
  { group: 'Insights', items: [
    { path: 'analytics', label: 'Analytics', icon: 'chart', perm: ['analytics.view'] },
    { path: 'reports', label: 'Reports', icon: 'file', perm: ['reports.export', 'payments.view', 'customers.view'] }
  ] },
  { group: 'Content', items: [
    { path: 'gallery', label: 'Gallery & videos', icon: 'image', perm: ['media.manage'] },
    { path: 'notifications', label: 'Notifications', icon: 'bell', perm: ['notifications.view', 'orders.view'] }
  ] },
  { group: 'Admin', items: [
    { path: 'delivery-areas', label: 'Delivery areas', icon: 'pin', perm: ['delivery.manage'] },
    { path: 'staff', label: 'Staff & roles', icon: 'shield', perm: ['staff.manage'] },
    { path: 'settings', label: 'Settings', icon: 'gear', perm: ['settings.manage'] },
    { path: 'audit', label: 'Audit log', icon: 'list', perm: ['audit.view'] }
  ] }
];
const VIEWS = {
  dashboard: () => import('./views/dashboard.js'), orders: () => import('./views/orders.js'), deliveries: () => import('./views/deliveries.js'),
  'my-deliveries': () => import('./views/deliveries.js'), menu: () => import('./views/menu.js'), categories: () => import('./views/categories.js'),
  inventory: () => import('./views/inventory.js'), customers: () => import('./views/customers.js'), reviews: () => import('./views/reviews.js'),
  inquiries: () => import('./views/inquiries.js'), payments: () => import('./views/payments.js'), coupons: () => import('./views/promotions.js'),
  offers: () => import('./views/promotions.js'), analytics: () => import('./views/analytics.js'), reports: () => import('./views/reports.js'),
  gallery: () => import('./views/gallery.js'), notifications: () => import('./views/notifications.js'), 'delivery-areas': () => import('./views/areas.js'),
  staff: () => import('./views/staff.js'), settings: () => import('./views/settings.js'), audit: () => import('./views/audit.js'), account: () => import('./views/account.js')
};

export const state = { admin: null, config: null, counts: { orders: 0, inquiries: 0 }, unread: 0, status: null };
export const can = (...perms) => perms.some(p => state.admin?.permissions.includes(p));
const allowed = item => can(...item.perm) && !(item.hideIf && can(...item.hideIf));
const homePath = () => NAV.flatMap(g => g.items).find(allowed)?.path || 'account';
export const go = path => { location.hash = '#/' + path; };
export const bus = new EventTarget(); // 'order' | 'notification' | 'menu' | 'status' events for views

// ---------- Auth screens ----------
function authLayout(inner) {
  $('#shell').hidden = true; $('#auth').hidden = false;
  const r = state.config?.restaurant || { name: 'Bowl Mania', tagline: 'Fresh like a new morning' };
  $('#auth').innerHTML = `<div class="auth-art"><img src="/assets/logo.jpg" alt="${esc(r.name)} logo">
      <div><span class="eyebrow" style="color:var(--lime)">${esc(r.tagline)}</span><h2>Run the kitchen, not the spreadsheet.</h2><p>Orders, menu, delivery and payments for ${esc(r.name)}, all in one place.</p></div></div>
    <div class="auth-form"><div class="auth-card">${inner}</div></div>`;
}
function showLogin(msg = '') {
  authLayout(`<div><span class="eyebrow">Staff sign in</span><h1>Welcome back</h1></div>
    ${msg ? `<div class="ok-box">${esc(msg)}</div>` : ''}
    <form id="loginForm" class="stack" novalidate>
      <label class="field"><span>Email</span><input class="input" name="email" type="email" autocomplete="username" required></label>
      <label class="field"><span>Password</span><input class="input" name="password" type="password" autocomplete="current-password" required></label>
      <div class="error-box" hidden></div>
      <button class="btn btn-primary" type="submit" style="height:48px">Sign in</button>
    </form>
    <a href="#/forgot" class="small">Forgot your password?</a>`);
  const f = $('#loginForm'); f.email.focus();
  f.onsubmit = async e => {
    e.preventDefault(); const err = $('.error-box', f), btn = $('button', f); err.hidden = true; btn.classList.add('is-loading');
    try { const r = await post('/auth/login', { email: f.email.value, password: f.password.value }); state.admin = r.admin; await startShell(); }
    catch (x) { err.textContent = x.message; err.hidden = false; }
    finally { btn.classList.remove('is-loading'); }
  };
}
function showForgot() {
  authLayout(`<div><span class="eyebrow">Password help</span><h1>Reset your password</h1><p class="muted">Enter your staff email. We'll send a reset link if email is set up; otherwise ask the owner to reset it from Staff.</p></div>
    <form id="forgotForm" class="stack" novalidate><label class="field"><span>Email</span><input class="input" name="email" type="email" required></label>
      <div class="error-box" hidden></div><div class="ok-box" hidden></div><button class="btn btn-primary" type="submit">Send reset link</button></form>
    <a href="#/login" class="small">Back to sign in</a>`);
  const f = $('#forgotForm');
  f.onsubmit = async e => { e.preventDefault(); const err = $('.error-box', f), ok = $('.ok-box', f); err.hidden = ok.hidden = true;
    try { const r = await post('/auth/forgot', { email: f.email.value }); ok.textContent = r.message; ok.hidden = false; } catch (x) { err.textContent = x.message; err.hidden = false; } };
}
function showReset(token) {
  authLayout(`<div><span class="eyebrow">Password help</span><h1>Choose a new password</h1><p class="muted">Use at least 10 characters with letters and numbers.</p></div>
    <form id="resetForm" class="stack" novalidate><label class="field"><span>New password</span><input class="input" name="password" type="password" autocomplete="new-password" required minlength="10"></label>
      <label class="field"><span>Repeat password</span><input class="input" name="again" type="password" autocomplete="new-password" required></label>
      <div class="error-box" hidden></div><button class="btn btn-primary" type="submit">Save new password</button></form>`);
  const f = $('#resetForm');
  f.onsubmit = async e => { e.preventDefault(); const err = $('.error-box', f); err.hidden = true;
    if (f.password.value !== f.again.value) { err.textContent = 'The two passwords do not match.'; err.hidden = false; return; }
    try { await post('/auth/reset', { token, password: f.password.value }); history.replaceState(null, '', '#/login'); showLogin('Password changed. Sign in with your new password.'); }
    catch (x) { err.textContent = x.message; err.hidden = false; } };
}

// ---------- Shell ----------
function renderNav() {
  const current = location.hash.replace(/^#\/?/, '').split(/[/?]/)[0] || homePath();
  $('#nav').innerHTML = NAV.map(g => { const items = g.items.filter(allowed); if (!items.length) return '';
    return `<div class="nav-group"><span>${esc(g.group)}</span>${items.map(i => `<a href="#/${i.path}" ${i.path === current ? 'aria-current="page"' : ''}>${icon(i.icon)}${esc(i.label)}${i.badge && state.counts[i.badge] ? `<em>${state.counts[i.badge]}</em>` : ''}</a>`).join('')}</div>`; }).join('');
  const quick = ['dashboard', 'orders', can('delivery.assign', 'delivery.view') ? 'deliveries' : 'my-deliveries', 'menu'].map(p => NAV.flatMap(g => g.items).find(i => i.path === p)).filter(i => i && allowed(i)).slice(0, 4);
  $('#bottomNav').innerHTML = quick.map(i => `<a href="#/${i.path}" ${i.path === current ? 'aria-current="page"' : ''}>${icon(i.icon)}<span>${esc(i.label.split(' ')[0])}</span>${i.badge && state.counts[i.badge] ? `<em>${state.counts[i.badge]}</em>` : ''}</a>`).join('')
    + `<button type="button" id="moreNav">${icon('more')}<span>More</span></button>`;
  $('#moreNav').onclick = openSidebar;
}
const openSidebar = () => { $('#sidebar').classList.add('open'); $('.scrim').hidden = false; };
const closeSidebar = () => { $('#sidebar').classList.remove('open'); $('.scrim').hidden = true; };

function renderProfile() {
  $('#profileName').textContent = state.admin.name; $('#profileRole').textContent = state.admin.role_name; $('#profileAvatar').textContent = initials(state.admin.name);
  $('#quickNewOrder').hidden = !can('orders.create');
}
function renderStatus() {
  const s = state.status; if (!s) return;
  const el = $('#statusSwitch'); const editable = can('settings.manage', 'orders.update');
  el.innerHTML = `<button class="status-btn ${s.open ? 'open' : ''}" type="button" ${editable ? '' : 'disabled'} aria-haspopup="true" aria-expanded="false"><span class="dot"></span>${s.open ? 'OPEN' : 'CLOSED'}<small>${s.mode === 'auto' ? '· auto' : '· manual'}</small></button>
    <div class="popover" hidden style="width:300px"><div class="pop-head"><b>Restaurant status</b></div><div class="menu-list" role="radiogroup">
      ${[['auto', 'Automatic', 'Open during delivery slots, pre-orders otherwise'], ['open', 'Open', 'Force open now'], ['closed', 'Closed', 'Stop all new website orders']].map(([k, t, d]) =>
        `<button type="button" role="radio" aria-checked="${s.mode === k}" data-mode="${k}"><span><b>${t}</b><small>${d}</small></span></button>`).join('')}</div></div>`;
  const btn = $('.status-btn', el), pop = $('.popover', el);
  btn.onclick = e => { e.stopPropagation(); pop.hidden = !pop.hidden; btn.setAttribute('aria-expanded', String(!pop.hidden)); };
  pop.onclick = async e => { const b = e.target.closest('[data-mode]'); if (!b) return;
    try { state.status = await patch('/admin/restaurant-status', { mode: b.dataset.mode }); renderStatus(); toast(`Restaurant set to ${b.querySelector('b').textContent}`); } catch (x) { toastError(x); } };
}
function tickClock() {
  const d = new Date();
  $('#clock').textContent = d.toLocaleString('en-IN', { timeZone: state.config?.business?.timezone || 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

// ---------- Notifications & live updates ----------
async function loadNotifications() {
  if (!can('notifications.view', 'orders.view')) { $('.bell-wrap').hidden = true; return; }
  try { const r = await get('/admin/notifications', { limit: 15 }); state.unread = r.unread; state.notifications = r.rows; renderBell(); } catch { /* shown on next refresh */ }
}
const NOTIF_ICON = { new_order: 'orders', payment_received: 'card', payment_failed: 'card', order_cancelled: 'orders', low_stock: 'box', inquiry: 'chat', new_review: 'star' };
function renderBell() {
  const c = $('#bellCount'); c.hidden = !state.unread; c.textContent = state.unread > 99 ? '99+' : state.unread;
  $('#bellPanel').innerHTML = `<div class="pop-head"><b>Notifications</b>${state.unread ? '<button class="btn-link small" data-readall>Mark all read</button>' : ''}</div>
    <div class="stack-sm" style="max-height:420px;overflow:auto">${(state.notifications || []).length ? state.notifications.map(n => `<a class="notif ${n.read_at ? '' : 'unread'}" href="${esc(n.link || '#/notifications')}" data-id="${n.id}">
      <span class="ic">${icon(NOTIF_ICON[n.type] || 'bell')}</span><span><b>${esc(n.title)}</b><p>${esc(n.body)}</p><time>${ago(n.created_at)}</time></span></a>`).join('') : '<p class="muted small" style="padding:10px">You are all caught up.</p>'}</div>
    <div style="padding:6px 10px"><a href="#/notifications" class="small">Open notification center</a></div>`;
}
let audioCtx;
function chime() {
  if (!state.config || state.soundOff) return;
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    const now = audioCtx.currentTime;
    [[880, 0], [1320, .16], [1760, .32]].forEach(([f, t]) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain(); o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0, now + t); g.gain.linearRampToValueAtTime(.25, now + t + .02); g.gain.exponentialRampToValueAtTime(.001, now + t + .45);
      o.connect(g).connect(audioCtx.destination); o.start(now + t); o.stop(now + t + .5);
    });
  } catch { /* audio blocked until the first click */ }
}
let es;
function connectLive() {
  es?.close();
  es = new EventSource('/api/admin/events');
  es.addEventListener('notification', e => {
    const n = JSON.parse(e.data);
    state.unread++; state.notifications = [{ ...n, read_at: null }, ...(state.notifications || [])].slice(0, 15); renderBell();
    $('#bellBtn').classList.remove('ring'); void $('#bellBtn').offsetWidth; $('#bellBtn').classList.add('ring');
    if (n.type === 'new_order' && n.order) {
      chime(); state.counts.orders++; renderNav();
      const o = n.order;
      toast(`NEW ORDER ${o.order_number} · ${o.customer_name} · ${rupee(o.total)} · ${o.fulfilment === 'pickup' ? 'Pickup' : 'Delivery'} · ${o.payment_status === 'paid' ? 'Paid' : 'Cash'}`, 'order', { action: 'Open', onAction: () => go(`orders/${o.id}`), timeout: 12000 });
      if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
        const bn = new Notification(`New order ${o.order_number}`, { body: `${o.customer_name} · ${rupee(o.total)}\n${o.items.join(', ')}`, icon: '/assets/logo.jpg', tag: o.order_number });
        bn.onclick = () => { window.focus(); go(`orders/${o.id}`); };
      }
      bus.dispatchEvent(new CustomEvent('order', { detail: o }));
    } else if (n.type === 'inquiry') { state.counts.inquiries++; renderNav(); }
    bus.dispatchEvent(new CustomEvent('notification', { detail: n }));
  });
  es.addEventListener('order_updated', e => bus.dispatchEvent(new CustomEvent('order', { detail: JSON.parse(e.data) })));
  es.addEventListener('menu_changed', () => bus.dispatchEvent(new Event('menu')));
  es.addEventListener('status_changed', e => { state.status = JSON.parse(e.data); renderStatus(); });
  es.onerror = () => { /* EventSource reconnects by itself; the session refresh below keeps cookies valid */ };
}
async function refreshCounts() {
  try {
    if (can('orders.view')) { const r = await get('/admin/orders', { status: 'new', limit: 1 }); state.counts.orders = r.counts?.new || 0; }
    if (can('inquiries.manage')) { const r = await get('/admin/inquiries', { status: 'new', limit: 1 }); state.counts.inquiries = r.counts?.new || 0; }
    renderNav();
  } catch { /* non-critical */ }
}

// ---------- Global search ----------
function setupSearch() {
  const input = $('#globalSearchInput'), box = $('#searchResults');
  const run = debounce(async () => {
    const q = input.value.trim(); if (q.length < 2) { box.hidden = true; return; }
    const [o, c] = await Promise.all([can('orders.view') ? get('/admin/orders', { q, limit: 6 }).catch(() => null) : null, can('customers.view') ? get('/admin/customers', { q, limit: 5 }).catch(() => null) : null]);
    const rows = [];
    if (o?.rows.length) rows.push('<h4>Orders</h4>' + o.rows.map(x => `<a href="#/orders/${x.id}"><span><b>${esc(x.order_number)}</b> · ${esc(x.customer_name)}</span><span class="muted">${rupee(x.total)}</span></a>`).join(''));
    if (c?.rows.length) rows.push('<h4>Customers</h4>' + c.rows.map(x => `<a href="#/customers/${x.id}"><span><b>${esc(x.name)}</b> · ${esc(x.phone)}</span><span class="muted">${x.orders_count} orders</span></a>`).join(''));
    box.innerHTML = rows.join('') || '<p class="muted small" style="padding:12px">No orders or customers match.</p>'; box.hidden = false;
  }, 250);
  input.addEventListener('input', run);
  input.addEventListener('focus', run);
  $('#globalSearch').onsubmit = e => { e.preventDefault(); const first = $('a', box); if (first) { location.hash = first.getAttribute('href'); box.hidden = true; input.blur(); } };
  box.addEventListener('click', () => { box.hidden = true; input.value = ''; });
}

// ---------- Router ----------
let cleanup = null, routeToken = 0;
async function route() {
  const [hash, qs = ''] = location.hash.replace(/^#\/?/, '').split('?');
  const [path, ...rest] = hash.split('/');
  if (!state.admin) {
    if (path === 'forgot') return showForgot();
    if (path === 'reset' && rest[0]) return showReset(rest[0]);
    return showLogin();
  }
  if (!path || path === 'login' || path === 'forgot' || path === 'reset') return go(homePath());
  const item = NAV.flatMap(g => g.items).find(i => i.path === path);
  if (item && !allowed(item)) { go(homePath()); toast("Your role doesn't include that page.", 'err'); return; }
  if (!VIEWS[path]) return go(homePath());
  closeSidebar(); renderNav();
  cleanup?.(); cleanup = null;
  const view = $('#view'); const token = ++routeToken;
  view.innerHTML = '<div class="stack"><span class="skel" style="height:34px;width:240px"></span><div class="kpis">' + '<span class="skel" style="height:110px"></span>'.repeat(3) + '</div></div>';
  try {
    const mod = await VIEWS[path]();
    if (token !== routeToken) return;
    cleanup = await mod.render(view, { path, params: rest, query: Object.fromEntries(new URLSearchParams(qs)) }) || null;
    document.title = `${item?.label || path.replace(/-/g, ' ')} · Bowl Mania Admin`;
    view.focus({ preventScroll: true }); scrollTo(0, 0);
  } catch (e) { console.error(e); view.innerHTML = `<div class="error-state"><span>${esc(e.message)}</span><button class="btn btn-ghost btn-sm" onclick="location.reload()">Reload</button></div>`; }
}

async function startShell() {
  $('#auth').hidden = true; $('#shell').hidden = false;
  renderProfile(); renderNav();
  state.status = await get('/admin/status').catch(() => null); renderStatus();
  tickClock(); setInterval(tickClock, 30_000);
  loadNotifications(); refreshCounts(); connectLive();
  if ('Notification' in window && Notification.permission === 'default' && can('orders.view')) {
    toast('Allow browser notifications to hear about new orders in other tabs.', 'ok', { action: 'Allow', onAction: () => Notification.requestPermission(), timeout: 9000 });
  }
  if (!location.hash || /^#\/(login|forgot|reset)/.test(location.hash)) go(homePath()); else route();
}

// ---------- Boot ----------
onSignedOut.fn = () => { if (!state.admin) return; state.admin = null; es?.close(); if (!/^#\/(login|forgot|reset)/.test(location.hash)) { history.replaceState(null, '', '#/login'); showLogin('Your session ended. Please sign in again.'); } };
document.addEventListener('click', e => {
  if (e.target.closest('[data-close-sidebar]')) closeSidebar();
  if (!e.target.closest('.status-switch')) $$('.status-switch .popover').forEach(p => { p.hidden = true; });
  if (!e.target.closest('.bell-wrap')) { $('#bellPanel').hidden = true; $('#bellBtn').setAttribute('aria-expanded', 'false'); }
  if (!e.target.closest('.global-search')) $('#searchResults').hidden = true;
  const n = e.target.closest('.notif[data-id]');
  if (n && !state.notifications?.find(x => x.id == n.dataset.id)?.read_at) { post('/admin/notifications/read', { ids: [Number(n.dataset.id)] }).then(loadNotifications).catch(() => {}); }
});
$('#openSidebar').onclick = openSidebar;
$('#bellBtn').onclick = e => { e.stopPropagation(); const p = $('#bellPanel'); p.hidden = !p.hidden; $('#bellBtn').setAttribute('aria-expanded', String(!p.hidden)); };
$('#bellPanel').addEventListener('click', async e => { if (e.target.closest('[data-readall]')) { await post('/admin/notifications/read', {}); loadNotifications(); } });
$('#logoutBtn').onclick = async () => { await post('/auth/logout').catch(() => {}); state.admin = null; es?.close(); history.replaceState(null, '', '#/login'); showLogin('You have been signed out.'); };
$('#quickNewOrder').onclick = () => go('orders/new');
window.addEventListener('hashchange', route);
setupSearch();

(async () => {
  try { state.config = await get('/public/config'); setTZ(state.config.business.timezone); } catch { /* login still works */ }
  try { state.soundOff = localStorage.getItem('bm-sound') === 'off'; } catch { /* login still works */ }
  // The readable CSRF cookie only exists after a sign-in, so skip the session check on a fresh browser.
  const hadSession = /(?:^|; )bm_csrf=/.test(document.cookie);
  try { if (!hadSession) throw new Error('signed out'); const r = await get('/auth/me'); state.admin = r.admin; await startShell(); }
  catch { route(); }
})();
