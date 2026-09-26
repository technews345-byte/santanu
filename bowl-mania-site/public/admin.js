const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rupee = n => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;

const STATUSES = {
  new: ['New', '--s-new'], confirmed: ['Confirmed', '--s-confirmed'], preparing: ['Preparing', '--s-preparing'],
  out_for_delivery: ['Out for delivery', '--s-out'], completed: ['Completed', '--s-done'], cancelled: ['Cancelled', '--s-cancel']
};
const NEXT = { new: 'confirmed', confirmed: 'preparing', preparing: 'out_for_delivery', out_for_delivery: 'completed' };
const NEXT_LABEL = { new: 'Confirm', confirmed: 'Start preparing', preparing: 'Send out', out_for_delivery: 'Mark delivered' };
const AREAS = { sonari: 'Sonari', nazira: 'Nazira', pickup: 'Self pickup' };
const PHOTOS = ['morning-glow', 'bean-vitality', 'grill-power', 'chicken-crunch', 'sprout', 'super-protein', 'hero-bowl'].map(n => `assets/bowls/${n}.jpg`);
const TITLES = { dashboard: 'Dashboard', orders: 'Orders', menu: 'Menu', riders: 'Delivery partners', reports: 'Reports', customers: 'Customers' };
const DAY = 864e5;

/* ---------- Data sources ---------- */
// Live site: the Express API. Preview link: the artifact's own document store.
function apiStore() {
  let token = ''; try { token = localStorage.getItem('bowlAdminToken') || ''; } catch {}
  const setToken = t => { token = t; try { t ? localStorage.setItem('bowlAdminToken', t) : localStorage.removeItem('bowlAdminToken'); } catch {} };
  async function call(path, opts = {}) {
    const r = await fetch('/api/admin' + path, { ...opts, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token } });
    if (r.status === 401) { setToken(''); show(); throw new Error('Please sign in again.'); }
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'Something went wrong. Try again.');
    return d;
  }
  return {
    kind: 'api',
    signedIn: () => !!token,
    async login(password) {
      const r = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Sign in failed');
      setToken(d.token);
    },
    logout: () => setToken(''),
    orders: () => call('/orders'),
    setStatus: (id, status) => call('/orders/' + id, { method: 'PATCH', body: JSON.stringify({ status }) }),
    menu: () => call('/menu'),
    saveItem: item => item.id != null
      ? call('/menu/' + item.id, { method: 'PUT', body: JSON.stringify(item) })
      : call('/menu', { method: 'POST', body: JSON.stringify(item) }),
    deleteItem: id => call('/menu/' + id, { method: 'DELETE' }),
    riders: () => call('/riders'),
    saveRider: r => r.id != null
      ? call('/riders/' + r.id, { method: 'PUT', body: JSON.stringify(r) })
      : call('/riders', { method: 'POST', body: JSON.stringify(r) }),
    deleteRider: id => call('/riders/' + id, { method: 'DELETE' }),
    setRider: (orderId, riderId) => call('/orders/' + orderId + '/rider', { method: 'PATCH', body: JSON.stringify({ riderId }) })
  };
}
function dbStore(db) {
  const rows = snap => snap.docs.map(d => ({ ...d.data(), id: d.id }));
  const fail = e => { throw new Error(e?.code === 'invalid_argument' ? "You don't have permission to change this." : 'Could not save. Try again.'); };
  return {
    kind: 'db',
    signedIn: () => true,
    orders: async () => rows(await db.collection('orders').orderBy('created_at', 'desc').limit(500).get()),
    async setStatus(id, status) {
      const snap = await db.doc('orders/' + id).get();
      const history = [...(snap.data()?.history || []), { status, at: new Date().toISOString() }];
      return db.doc('orders/' + id).update({ status, history }).catch(fail);
    },
    setRider: (orderId, riderId) => db.doc('orders/' + orderId).update({ rider_id: riderId ?? null }).catch(fail),
    riders: async () => rows(await db.collection('riders').orderBy('name').get()),
    saveRider(r) {
      const { id, ...body } = r;
      return (id != null ? db.doc('riders/' + id) : db.collection('riders').doc()).set(body).catch(fail);
    },
    async deleteRider(id) {
      await db.doc('riders/' + id).delete().catch(fail);
      await Promise.all(orders.filter(o => String(o.rider_id) === String(id) && !['completed', 'cancelled'].includes(o.status))
        .map(o => db.doc('orders/' + o.id).update({ rider_id: null }).catch(() => {})));
    },
    menu: async () => rows(await db.collection('menu').orderBy('sort').get()),
    async saveItem(item) {
      const { id, ...body } = item;
      if (id != null) {
        const prev = await db.doc('menu/' + id).get();
        return db.doc('menu/' + id).set({ ...body, sort: prev.data()?.sort ?? Date.now() }).catch(fail);
      }
      return db.collection('menu').doc().set({ ...body, sort: Date.now() }).catch(fail);
    },
    deleteItem: id => db.doc('menu/' + id).delete().catch(fail)
  };
}

/* ---------- State ---------- */
let lastOrderList = [], lastReport = null, lastCustomers = [];
let store, orders = [], menu = [], riders = [], view = 'dashboard', orderFilter = 'all', editing = null;

const when = s => { if (!s) return new Date(NaN); return new Date(/T/.test(s) ? s : s.replace(' ', 'T') + 'Z'); };
const fmtTime = d => isNaN(d) ? '' : d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const isToday = d => d.toDateString() === new Date().toDateString();
const statusVar = s => (STATUSES[s] || ['', '--muted'])[1];

function toast(msg, err) {
  const t = $('#toast'); t.textContent = msg; t.classList.toggle('err', !!err); t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2600);
}

/* ---------- Boot & auth ---------- */
async function boot() {
  const framed = !!window.claude?.use;
  const db = framed ? await window.claude.use('db') : null;
  if (framed && !db) { $('#unavailable').hidden = false; return; }
  store = db ? dbStore(db) : apiStore();
  if (store.kind === 'db') {
    $('#previewNote').hidden = false; $('#logout').hidden = true;
    $('#siteLink').href = 'https://claude.ai/artifact/YDuC1522yZUHX4zDeaWqhh';
  }
  show();
}
function show() {
  const inside = store.signedIn();
  $('#login').hidden = inside; $('#app').hidden = !inside;
  if (inside) load(); else $('#password').focus();
}
$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault(); $('#loginMsg').textContent = '';
  try { await store.login($('#password').value); $('#password').value = ''; show(); }
  catch (err) { $('#loginMsg').textContent = err.message; }
});
$('#logout').addEventListener('click', () => { store.logout?.(); show(); });

async function load(quiet) {
  try {
    [orders, menu, riders] = await Promise.all([store.orders(), store.menu(), store.riders()]);
    linkRiders();
    $('#updated').textContent = 'Updated ' + new Date().toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
    render();
  } catch (err) { if (!quiet) toast(err.message || 'Could not load data.', true); }
}
$('#refresh').addEventListener('click', () => load());
setInterval(() => { if (store?.signedIn() && !document.hidden && $('#editor').hidden) load(true); }, 60000);

const digitsOf = p => String(p || '').replace(/\D/g, '').slice(-10);
function linkRiders() {
  orders.forEach(o => {
    const r = riders.find(x => o.rider_id != null && String(x.id) === String(o.rider_id));
    o.rider = r || (o.rider_name ? { name: o.rider_name, phone: o.rider_phone } : null);
  });
}

/* ---------- Navigation ---------- */
function go(v) {
  view = v;
  $$('.nav button').forEach(b => b.dataset.view === v ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current'));
  $$('.view').forEach(s => s.hidden = s.id !== 'view-' + v);
  $('#viewTitle').textContent = TITLES[v];
  $('#addBowl').hidden = v !== 'menu';
  $('#addRider').hidden = v !== 'riders';
  $('#exportBtn').hidden = !['orders', 'reports', 'customers'].includes(v);
  render();
  scrollTo(0, 0);
}
$$('[data-view]').forEach(b => b.addEventListener('click', () => go(b.dataset.view)));
document.addEventListener('click', e => { const g = e.target.closest('[data-goto]'); if (g) go(g.dataset.goto); });

function render() {
  const fresh = orders.filter(o => o.status === 'new').length;
  $('#newBadge').hidden = !fresh; $('#newBadge').textContent = fresh;
  ({ dashboard: renderDashboard, orders: renderOrders, menu: renderMenu, riders: renderRiders, reports: renderReports, customers: renderCustomers })[view]();
}

/* ---------- Dashboard ---------- */
function renderDashboard() {
  const live = orders.filter(o => o.status !== 'cancelled');
  const today = live.filter(o => isToday(when(o.created_at)));
  const month = live.filter(o => Date.now() - when(o.created_at) < 30 * DAY);
  const open = orders.filter(o => !['completed', 'cancelled'].includes(o.status));
  const fresh = orders.filter(o => o.status === 'new');
  const avg = month.length ? month.reduce((s, o) => s + o.total, 0) / month.length : 0;
  $('#tiles').innerHTML = [
    ["Today's orders", today.length, `${fresh.length} waiting to confirm`, fresh.length > 0],
    ["Today's sales", rupee(today.reduce((s, o) => s + o.total, 0)), 'Excludes cancelled'],
    ['Open orders', open.length, 'Not yet delivered'],
    ['Average order', rupee(avg), 'Last 30 days']
  ].map(([k, v, sub, alert]) => `<div class="tile${alert ? ' alert' : ''}"><span>${k}</span><b>${v}</b><small>${sub}</small></div>`).join('');

  const att = open.slice().sort((a, b) => when(a.created_at) - when(b.created_at)).slice(0, 8);
  $('#attention').innerHTML = att.length ? att.map(o => `<div class="att">
      <b>#${esc(o.id)} · ${esc(o.customer_name)} <span class="pill" style="--c:var(${statusVar(o.status)})">${esc(STATUSES[o.status]?.[0] || o.status)}</span></b>
      ${NEXT[o.status] ? `<button class="btn small primary" data-advance="${esc(o.id)}">${NEXT_LABEL[o.status]}</button>` : '<span></span>'}
      <span class="muted small">${esc(AREAS[o.area] || o.area)} · ${(n => n + (n === 1 ? ' bowl' : ' bowls'))(o.items.reduce((s, i) => s + i.quantity, 0))} · ${rupee(o.total)} · ${fmtTime(when(o.created_at))}</span>
    </div>`).join('') : '<p class="empty-note">All caught up. New orders will appear here.</p>';

  const bowls = {};
  month.forEach(o => o.items.forEach(i => { const b = bowls[i.name] ||= { qty: 0, rev: 0 }; b.qty += i.quantity; b.rev += i.price * i.quantity; }));
  const top = Object.entries(bowls).sort((a, b) => b[1].qty - a[1].qty).slice(0, 6);
  $('#topBowls').innerHTML = top.length
    ? `<thead><tr><th>Bowl</th><th class="r">Sold</th><th class="r">Sales</th></tr></thead><tbody>${top.map(([n, b]) => `<tr><td>${esc(n)}</td><td class="r">${b.qty}</td><td class="r">${rupee(b.rev)}</td></tr>`).join('')}</tbody>`
    : '<tbody><tr><td class="muted">No sales in the last 30 days yet.</td></tr></tbody>';

  const areas = Object.keys(AREAS).map(k => { const list = month.filter(o => o.area === k); return [AREAS[k], list.length, list.reduce((s, o) => s + o.total, 0)]; });
  $('#byArea').innerHTML = `<thead><tr><th>Location</th><th class="r">Orders</th><th class="r">Sales</th></tr></thead><tbody>${areas.map(([n, c, r]) => `<tr><td>${n}</td><td class="r">${c}</td><td class="r">${rupee(r)}</td></tr>`).join('')}</tbody>`;
}

async function setStatus(id, status) {
  try {
    await store.setStatus(id, status);
    const o = orders.find(x => String(x.id) === String(id)); if (o) o.status = status;
    toast(`Order #${id} → ${STATUSES[status][0]}`); render();
  } catch (err) { toast(err.message, true); }
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-advance]'); if (!b) return;
  const o = orders.find(x => String(x.id) === b.dataset.advance); if (!o || !NEXT[o.status]) return;
  if (NEXT[o.status] === 'out_for_delivery' && o.area !== 'pickup' && !o.rider) { toast('Assign a delivery partner first', true); if (view !== 'orders') go('orders'); return; }
  setStatus(o.id, NEXT[o.status]);
});

/* ---------- Orders ---------- */
function renderOrders() {
  $('#tabs').innerHTML = [['all', 'All', orders.length], ...Object.entries(STATUSES).map(([k, [l]]) => [k, l, orders.filter(o => o.status === k).length])]
    .map(([k, l, n]) => `<button role="tab" data-f="${k}" aria-selected="${k === orderFilter}">${l}<em>${n}</em></button>`).join('');
  const q = $('#orderSearch').value.trim().toLowerCase();
  const list = orders.filter(o => (orderFilter === 'all' || o.status === orderFilter) &&
    (!q || `#${o.id} ${o.customer_name} ${o.phone}`.toLowerCase().includes(q)));
  lastOrderList = list;
  $('#orders').innerHTML = list.length ? list.map(o => {
    const digits = String(o.phone).replace(/\D/g, '').slice(-10);
    return `<article class="order" style="--c:var(${statusVar(o.status)})">
      <div>
        <h3>#${esc(o.id)} · ${esc(o.customer_name)}<small>${fmtTime(when(o.created_at))}</small></h3>
        <p><a href="tel:+91${digits}">${esc(o.phone)}</a> · <a href="https://wa.me/91${digits}?text=${encodeURIComponent(customerMsg(o))}" target="_blank" rel="noopener">WhatsApp customer</a></p>
        <p><b>${esc(AREAS[o.area] || o.area)}</b>${o.area === 'pickup' ? '' : ' · ' + esc(o.address)}</p>
        ${o.notes ? `<p class="muted">Note: ${esc(o.notes)}</p>` : ''}
      </div>
      <ul>
        ${o.items.map(i => `<li><span>${i.quantity} × ${esc(i.name)} <span class="muted">(${esc(i.size)})</span></span><span>${rupee(i.price * i.quantity)}</span></li>`).join('')}
        <li class="muted"><span>Delivery</span><span>${rupee(o.delivery_charge)}</span></li>
        <li class="sum"><span>Total</span><span>${rupee(o.total)}</span></li>
      </ul>
      <div class="side-col">
        <span class="pill">${esc(STATUSES[o.status]?.[0] || o.status)}</span>
        <select data-status="${esc(o.id)}" aria-label="Change status of order ${esc(o.id)}">${Object.entries(STATUSES).map(([k, [l]]) => `<option value="${k}"${k === o.status ? ' selected' : ''}>${l}</option>`).join('')}</select>
        ${NEXT[o.status] ? `<button class="btn small primary" data-advance="${esc(o.id)}">${NEXT_LABEL[o.status]}</button>` : ''}
        ${o.area === 'pickup' ? '' : riderPicker(o)}
      </div>
    </article>`;
  }).join('') : `<div class="empty">${orders.length ? 'No orders match this view.' : 'No orders yet. New orders from the website will appear here.'}</div>`;
}
$('#tabs').addEventListener('click', e => { const b = e.target.closest('[data-f]'); if (b) { orderFilter = b.dataset.f; renderOrders(); } });
$('#orderSearch').addEventListener('input', renderOrders);
$('#orders').addEventListener('change', async e => {
  const s = e.target.closest('[data-status]'); if (s) return setStatus(s.dataset.status, s.value);
  const r = e.target.closest('[data-rider]'); if (!r) return;
  const o = orders.find(x => String(x.id) === r.dataset.rider);
  const riderId = r.value === '' ? null : (store.kind === 'api' ? Number(r.value) : r.value);
  try { await store.setRider(o.id, riderId); o.rider_id = riderId; linkRiders(); toast(o.rider ? `${o.rider.name} will deliver order #${o.id}` : `Order #${o.id} unassigned`); renderOrders(); }
  catch (err) { toast(err.message, true); renderOrders(); }
});

function riderPicker(o) {
  const done = ['completed', 'cancelled'].includes(o.status);
  const options = riders.filter(r => r.active || String(r.id) === String(o.rider_id))
    .sort((a, b) => (b.area === o.area) - (a.area === o.area) || a.name.localeCompare(b.name));
  const lines = o.items.map(i => `${i.quantity} x ${i.name} (${i.size})`).join('\n');
  const msg = `Bowl Mania delivery #${o.id}\nCustomer: ${o.customer_name}\nPhone: ${o.phone}\nAddress: ${AREAS[o.area] || o.area}, ${o.address}\n\n${lines}\n\nCollect: ${rupee(o.total)}${o.notes ? '\nNote: ' + o.notes : ''}`;
  return `<label class="rider-pick">Delivery partner
      <select data-rider="${esc(o.id)}"${done ? ' disabled' : ''}><option value="">Not assigned</option>${options.map(r => `<option value="${esc(r.id)}"${String(r.id) === String(o.rider_id) ? ' selected' : ''}>${esc(r.name)} · ${esc(AREAS[r.area])}</option>`).join('')}</select>
    </label>
    ${o.rider?.phone && !done ? `<a class="btn small ghost" href="https://wa.me/91${digitsOf(o.rider.phone)}?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">Send to ${esc(o.rider.name.split(' ')[0])} on WhatsApp</a>` : ''}
    ${!riders.length ? '<button type="button" class="linkish small" data-goto="riders">Add delivery partners</button>' : ''}`;
}
function customerMsg(o) {
  const first = String(o.customer_name).split(' ')[0];
  if (o.status === 'out_for_delivery' && o.rider) return `Hi ${first}, your Bowl Mania order #${o.id} is on the way with ${o.rider.name} (${o.rider.phone}). Enjoy your bowl!`;
  if (o.status === 'confirmed') return `Hi ${first}, your Bowl Mania order #${o.id} is confirmed. Total ${rupee(o.total)}. We'll let you know when it's on the way.`;
  if (o.status === 'completed') return `Hi ${first}, thank you for ordering from Bowl Mania! We hope you enjoyed your bowl.`;
  return `Hi ${first}, this is Bowl Mania about your order #${o.id}.`;
}

/* ---------- Menu ---------- */
const dietMark = d => d === 'both' ? '<i class="diet veg"></i><i class="diet nonveg"></i>' : `<i class="diet ${d === 'nonveg' ? 'nonveg' : 'veg'}"></i>`;
function renderMenu() {
  $('#menuList').innerHTML = menu.length ? menu.map(m => `<article class="m-row${m.active ? '' : ' off'}">
      <img src="${esc(m.image)}" alt="" loading="lazy">
      <div>
        <h3>${dietMark(m.diet)}${esc(m.name)}</h3>
        <p>${esc(m.description)}</p>
        <div class="chips">${(m.prices || []).map(p => `<span>${esc(p.size)} · ${rupee(p.price)}</span>`).join('')}</div>
      </div>
      <div class="m-actions">
        <label class="switch"><input type="checkbox" data-toggle="${esc(m.id)}"${m.active ? ' checked' : ''}><i></i>${m.active ? 'On menu' : 'Hidden'}</label>
        <button class="btn small ghost" data-edit="${esc(m.id)}">Edit</button>
      </div>
    </article>`).join('') : '<div class="empty">No bowls yet. Add your first bowl.</div>';
}
$('#menuList').addEventListener('change', async e => {
  const t = e.target.closest('[data-toggle]'); if (!t) return;
  const m = menu.find(x => String(x.id) === t.dataset.toggle);
  try { await store.saveItem({ ...m, active: t.checked }); m.active = t.checked; toast(`${m.name} ${t.checked ? 'is back on the menu' : 'is hidden from the menu'}`); renderMenu(); }
  catch (err) { t.checked = !t.checked; toast(err.message, true); }
});
$('#menuList').addEventListener('click', e => { const b = e.target.closest('[data-edit]'); if (b) openEditor(menu.find(x => String(x.id) === b.dataset.edit)); });
$('#addBowl').addEventListener('click', () => openEditor(null));

/* ---------- Bowl editor ---------- */
const editor = $('#editor');
function sizeRow(p = { size: '', price: '' }) {
  return `<div class="size-row"><input aria-label="Size" placeholder="e.g. 500 ml" value="${esc(p.size)}" data-size maxlength="30"><span class="price-in"><input aria-label="Price in rupees" type="number" min="1" step="1" inputmode="numeric" value="${esc(p.price)}" data-price></span><button type="button" class="icon-btn" data-remove aria-label="Remove size">×</button></div>`;
}
function openEditor(item) {
  editing = item;
  $('#editorTitle').textContent = item ? 'Edit bowl' : 'Add a bowl';
  $('#f-name').value = item?.name || '';
  $('#f-desc').value = item?.description || '';
  $(`#f-diet-${item?.diet || 'veg'}`).checked = true;
  $('#sizes').innerHTML = (item?.prices?.length ? item.prices : [{ size: '250 ml', price: '' }, { size: '500 ml', price: '' }]).map(sizeRow).join('');
  const img = item?.image || PHOTOS[0];
  $('#photos').innerHTML = PHOTOS.map((p, i) => `<label><input type="radio" name="photo" id="photo-${i}" value="${p}"${p === img ? ' checked' : ''}><img src="${p}" alt="Photo option ${i + 1}"></label>`).join('');
  $('#f-image').value = PHOTOS.includes(img) ? '' : img;
  $('#f-active').checked = item ? !!item.active : true;
  $('#deleteItem').hidden = !item; $('#deleteItem').classList.remove('armed'); $('#deleteItem').textContent = 'Delete bowl';
  $('#editorMsg').textContent = '';
  editor.hidden = false; document.body.style.overflow = 'hidden';
  setTimeout(() => $('#f-name').focus(), 30);
}
function closeEditor() { editor.hidden = true; document.body.style.overflow = ''; editing = null; }
editor.addEventListener('click', e => { if (e.target === editor || e.target.closest('[data-close]')) closeEditor(); });
addEventListener('keydown', e => { if (e.key === 'Escape' && !editor.hidden) closeEditor(); });
$('#addSize').addEventListener('click', () => { $('#sizes').insertAdjacentHTML('beforeend', sizeRow()); $('#sizes .size-row:last-child [data-size]').focus(); });
$('#sizes').addEventListener('click', e => { const b = e.target.closest('[data-remove]'); if (b) b.closest('.size-row').remove(); });
$('#photos').addEventListener('change', () => { $('#f-image').value = ''; });

$('#itemForm').addEventListener('submit', async e => {
  e.preventDefault();
  const prices = $$('.size-row').map(r => ({ size: $('[data-size]', r).value.trim(), price: Number($('[data-price]', r).value) })).filter(p => p.size || p.price);
  const custom = $('#f-image').value.trim();
  const item = {
    id: editing?.id ?? null,
    name: $('#f-name').value.trim(),
    description: $('#f-desc').value.trim(),
    diet: $('input[name="diet"]:checked').value,
    image: custom || $('input[name="photo"]:checked')?.value || PHOTOS[0],
    active: $('#f-active').checked,
    prices
  };
  const msg = $('#editorMsg');
  if (!item.name) { msg.textContent = 'Give the bowl a name.'; return $('#f-name').focus(); }
  if (!prices.length || prices.some(p => !p.size || !(p.price > 0))) { msg.textContent = 'Each size needs a name and a price above ₹0.'; return; }
  if (custom && !/^https:\/\//.test(custom)) { msg.textContent = 'Photo links must start with https://'; return $('#f-image').focus(); }
  const btn = $('#saveItem'); btn.disabled = true; btn.textContent = 'Saving…';
  try {
    if (item.id == null) delete item.id;
    await store.saveItem(item);
    closeEditor(); toast(`Saved ${item.name}`);
    menu = await store.menu(); renderMenu();
  } catch (err) { msg.textContent = err.message; }
  finally { btn.disabled = false; btn.textContent = 'Save'; }
});

$('#deleteItem').addEventListener('click', async e => {
  const b = e.currentTarget;
  if (!b.classList.contains('armed')) { b.classList.add('armed'); b.textContent = 'Click again to delete'; return; }
  const name = editing.name;
  try { await store.deleteItem(editing.id); closeEditor(); toast(`Deleted ${name}`); menu = await store.menu(); renderMenu(); }
  catch (err) { $('#editorMsg').textContent = err.message; }
});

/* ---------- Delivery partners ---------- */
let editingRider = null;
function renderRiders() {
  const today = o => isToday(when(o.created_at));
  $('#riderList').innerHTML = riders.length ? riders.map(r => {
    const mine = orders.filter(o => String(o.rider_id) === String(r.id));
    const now = mine.filter(o => o.status === 'out_for_delivery').length;
    const doneToday = mine.filter(o => o.status === 'completed' && today(o)).length;
    const done30 = mine.filter(o => o.status === 'completed' && Date.now() - when(o.created_at) < 30 * DAY).length;
    const initials = r.name.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
    return `<article class="rider${r.active ? '' : ' off'}">
      <div class="rider-top"><span class="avatar">${esc(initials)}</span><div><b>${esc(r.name)}</b><span class="muted">${esc(AREAS[r.area])} · <a class="linkish" href="https://wa.me/91${digitsOf(r.phone)}" target="_blank" rel="noopener">${esc(r.phone)}</a></span></div></div>
      <div class="rider-stats"><div><b>${now}</b><span>On the way</span></div><div><b>${doneToday}</b><span>Delivered today</span></div><div><b>${done30}</b><span>Last 30 days</span></div></div>
      <div class="rider-actions">
        <label class="switch"><input type="checkbox" data-rider-toggle="${esc(r.id)}"${r.active ? ' checked' : ''}><i></i>${r.active ? 'On duty' : 'Off duty'}</label>
        <button class="btn small ghost" data-rider-edit="${esc(r.id)}">Edit</button>
      </div>
    </article>`;
  }).join('') : '<div class="empty">No delivery partners yet. Add your riders to assign them to orders.</div>';
}
$('#riderList').addEventListener('change', async e => {
  const t = e.target.closest('[data-rider-toggle]'); if (!t) return;
  const r = riders.find(x => String(x.id) === t.dataset.riderToggle);
  try { await store.saveRider({ ...r, active: t.checked }); r.active = t.checked; toast(`${r.name} is ${t.checked ? 'on' : 'off'} duty`); renderRiders(); }
  catch (err) { t.checked = !t.checked; toast(err.message, true); }
});
$('#riderList').addEventListener('click', e => { const b = e.target.closest('[data-rider-edit]'); if (b) openRider(riders.find(x => String(x.id) === b.dataset.riderEdit)); });
$('#addRider').addEventListener('click', () => openRider(null));
const riderEditor = $('#riderEditor');
function openRider(r) {
  editingRider = r;
  $('#riderTitle').textContent = r ? 'Edit delivery partner' : 'Add delivery partner';
  $('#r-name').value = r?.name || ''; $('#r-phone').value = r?.phone || '';
  $(`#r-area-${r?.area || 'sonari'}`).checked = true;
  $('#r-active').checked = r ? !!r.active : true;
  $('#deleteRider').hidden = !r; $('#deleteRider').classList.remove('armed'); $('#deleteRider').textContent = 'Remove';
  $('#riderMsg').textContent = '';
  riderEditor.hidden = false; document.body.style.overflow = 'hidden';
  setTimeout(() => $('#r-name').focus(), 30);
}
function closeRider() { riderEditor.hidden = true; document.body.style.overflow = ''; editingRider = null; }
riderEditor.addEventListener('click', e => { if (e.target === riderEditor || e.target.closest('[data-close-rider]')) closeRider(); });
addEventListener('keydown', e => { if (e.key === 'Escape' && !riderEditor.hidden) closeRider(); });
$('#riderForm').addEventListener('submit', async e => {
  e.preventDefault();
  const r = { name: $('#r-name').value.trim(), phone: $('#r-phone').value.trim(), area: $('input[name="rarea"]:checked').value, active: $('#r-active').checked };
  if (editingRider) r.id = editingRider.id;
  const msg = $('#riderMsg');
  if (!r.name) { msg.textContent = "Enter the delivery partner's name."; return $('#r-name').focus(); }
  if (digitsOf(r.phone).length !== 10) { msg.textContent = 'Enter a 10-digit mobile number.'; return $('#r-phone').focus(); }
  const btn = $('#saveRider'); btn.disabled = true;
  try { await store.saveRider(r); closeRider(); toast(`Saved ${r.name}`); riders = await store.riders(); linkRiders(); renderRiders(); }
  catch (err) { msg.textContent = err.message; }
  finally { btn.disabled = false; }
});
$('#deleteRider').addEventListener('click', async e => {
  const b = e.currentTarget;
  if (!b.classList.contains('armed')) { b.classList.add('armed'); b.textContent = 'Click again to remove'; return; }
  const name = editingRider.name;
  try { await store.deleteRider(editingRider.id); closeRider(); toast(`Removed ${name}`); await load(true); }
  catch (err) { $('#riderMsg').textContent = err.message; }
});

/* ---------- Reports ---------- */
let range = 'week', offset = 0;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function periodBounds(r, off) {
  const n = new Date(); let start, end, buckets = [], label;
  if (r === 'day') {
    start = new Date(n.getFullYear(), n.getMonth(), n.getDate() + off); end = new Date(start); end.setDate(end.getDate() + 1);
    for (let h = 0; h < 24; h++) buckets.push({ label: h === 0 ? '12a' : h < 12 ? h + 'a' : h === 12 ? '12p' : (h - 12) + 'p', long: `${h % 12 || 12}:00 ${h < 12 ? 'AM' : 'PM'}`, test: d => d.getHours() === h });
    label = off === 0 ? 'Today' : off === -1 ? 'Yesterday' : start.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  } else if (r === 'week') {
    const dow = (n.getDay() + 6) % 7; // Monday first
    start = new Date(n.getFullYear(), n.getMonth(), n.getDate() - dow + off * 7); end = new Date(start); end.setDate(end.getDate() + 7);
    for (let i = 0; i < 7; i++) { const d = new Date(start); d.setDate(d.getDate() + i); buckets.push({ label: d.toLocaleDateString('en-IN', { weekday: 'short' }), long: d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' }), test: x => x.toDateString() === d.toDateString() }); }
    const last = new Date(end); last.setDate(last.getDate() - 1);
    label = off === 0 ? 'This week' : `${start.getDate()} ${MONTHS[start.getMonth()]} – ${last.getDate()} ${MONTHS[last.getMonth()]}`;
  } else if (r === 'month') {
    start = new Date(n.getFullYear(), n.getMonth() + off, 1); end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    const days = new Date(end - 1).getDate();
    for (let i = 1; i <= days; i++) buckets.push({ label: String(i), long: `${i} ${MONTHS[start.getMonth()]}`, test: x => x.getDate() === i });
    label = `${start.toLocaleDateString('en-IN', { month: 'long' })} ${start.getFullYear()}`;
  } else {
    start = new Date(n.getFullYear() + off, 0, 1); end = new Date(start.getFullYear() + 1, 0, 1);
    MONTHS.forEach((m, i) => buckets.push({ label: m, long: `${m} ${start.getFullYear()}`, test: x => x.getMonth() === i }));
    label = String(start.getFullYear());
  }
  return { start, end, buckets, label };
}
function summarize(list) {
  const ok = list.filter(o => o.status !== 'cancelled'), cancelled = list.filter(o => o.status === 'cancelled');
  const earnings = ok.reduce((s, o) => s + o.total, 0), delivery = ok.reduce((s, o) => s + (o.delivery_charge || 0), 0);
  return { ok, cancelled, earnings, delivery, food: earnings - delivery, count: ok.length, avg: ok.length ? earnings / ok.length : 0, bowls: ok.reduce((s, o) => s + o.items.reduce((t, i) => t + i.quantity, 0), 0) };
}
function delta(cur, prev) {
  if (!prev) return cur ? '<span class="delta up">New</span> vs previous' : 'No change';
  const p = Math.round((cur - prev) / prev * 100);
  return `<span class="delta ${p >= 0 ? 'up' : 'down'}">${p >= 0 ? '▲' : '▼'} ${Math.abs(p)}%</span> vs previous`;
}
function renderReports() {
  $$('#rangeTabs [data-range]').forEach(b => b.setAttribute('aria-selected', b.dataset.range === range));
  const P = periodBounds(range, offset), Q = periodBounds(range, offset - 1);
  const inP = (b, o) => { const d = when(o.created_at); return d >= b.start && d < b.end; };
  const list = orders.filter(o => inP(P, o)), prev = summarize(orders.filter(o => inP(Q, o))), S = summarize(list);
  $('#periodLabel').textContent = P.label;
  $('#nextPeriod').disabled = offset >= 0;
  $('#repTiles').innerHTML = [
    ['Total earnings', rupee(S.earnings), delta(S.earnings, prev.earnings)],
    ['Food sales', rupee(S.food), `${S.bowls} ${S.bowls === 1 ? 'bowl' : 'bowls'} sold`],
    ['Delivery charges', rupee(S.delivery), 'Collected from customers'],
    ['Orders', S.count, delta(S.count, prev.count)],
    ['Average order', rupee(S.avg), `Previous ${rupee(prev.avg)}`],
    ['Cancelled', S.cancelled.length, S.cancelled.length ? `${rupee(S.cancelled.reduce((s, o) => s + o.total, 0))} not earned` : 'None']
  ].map(([k, v, sub]) => `<div class="tile"><span>${k}</span><b>${v}</b><small>${sub}</small></div>`).join('');

  const series = P.buckets.map(b => { const os = S.ok.filter(o => b.test(when(o.created_at))); return { ...b, value: os.reduce((s, o) => s + o.total, 0), orders: os.length }; });
  $('#chartTitle').textContent = `Earnings by ${range === 'day' ? 'hour' : range === 'year' ? 'month' : 'day'}`;
  $('#chartSub').textContent = `${P.label} · ₹ incl. delivery`;
  drawChart(series);
  $('#chartTable').innerHTML = `<thead><tr><th>${range === 'day' ? 'Hour' : range === 'year' ? 'Month' : 'Day'}</th><th class="r">Orders</th><th class="r">Earnings</th></tr></thead><tbody>${series.map(b => `<tr><td>${b.long}</td><td class="r">${b.orders}</td><td class="r">${rupee(b.value)}</td></tr>`).join('')}</tbody>`;

  const bowls = {};
  S.ok.forEach(o => o.items.forEach(i => { const b = bowls[i.name] ||= { qty: 0, rev: 0 }; b.qty += i.quantity; b.rev += i.price * i.quantity; }));
  const top = Object.entries(bowls).sort((a, b) => b[1].rev - a[1].rev);
  $('#repBowls').innerHTML = top.length ? `<thead><tr><th>Bowl</th><th class="r">Sold</th><th class="r">Sales</th></tr></thead><tbody>${top.map(([n, b]) => `<tr><td>${esc(n)}</td><td class="r">${b.qty}</td><td class="r">${rupee(b.rev)}</td></tr>`).join('')}</tbody>` : '<tbody><tr><td class="muted">No sales in this period.</td></tr></tbody>';
  $('#repAreas').innerHTML = `<thead><tr><th>Location</th><th class="r">Orders</th><th class="r">Earnings</th></tr></thead><tbody>${Object.keys(AREAS).map(k => { const a = S.ok.filter(o => o.area === k); return `<tr><td>${AREAS[k]}</td><td class="r">${a.length}</td><td class="r">${rupee(a.reduce((s, o) => s + o.total, 0))}</td></tr>`; }).join('')}</tbody>`;
  const byRider = {};
  S.ok.filter(o => o.rider && o.status === 'completed').forEach(o => { const r = byRider[o.rider.name] ||= { n: 0, fees: 0, cash: 0 }; r.n++; r.fees += o.delivery_charge || 0; r.cash += o.total; });
  const rr = Object.entries(byRider).sort((a, b) => b[1].n - a[1].n);
  lastReport = { P, S, prev, series, top, rr, list };
  $('#repRiders').innerHTML = rr.length ? `<thead><tr><th>Partner</th><th class="r">Deliveries</th><th class="r">Delivery fees</th><th class="r">Order value</th></tr></thead><tbody>${rr.map(([n, r]) => `<tr><td>${esc(n)}</td><td class="r">${r.n}</td><td class="r">${rupee(r.fees)}</td><td class="r">${rupee(r.cash)}</td></tr>`).join('')}</tbody>` : '<tbody><tr><td class="muted">No completed deliveries with a partner in this period.</td></tr></tbody>';
}
function niceMax(v) { if (v <= 0) return 100; const p = 10 ** Math.floor(Math.log10(v)); const m = [1, 2, 2.5, 5, 10].find(x => x * p >= v); return m * p; }
function drawChart(series) {
  const box = $('#chart'), W = box.clientWidth || 600, H = box.clientHeight || 260;
  const pad = { l: 56, r: 8, t: 12, b: 26 }, iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const max = niceMax(Math.max(...series.map(s => s.value)));
  const ticks = [0, .25, .5, .75, 1].map(f => max * f);
  const band = iw / series.length, bw = Math.max(2, Math.min(24, band - 2));
  const y = v => pad.t + ih - v / max * ih;
  const every = Math.ceil(series.length / Math.max(4, Math.floor(iw / 44)));
  const barPath = (x, v) => {
    const top = y(v), h = pad.t + ih - top; if (h <= 0) return '';
    const r = Math.min(4, h, bw / 2), base = pad.t + ih;
    return `M${x},${base}V${top + r}Q${x},${top} ${x + r},${top}H${x + bw - r}Q${x + bw},${top} ${x + bw},${top + r}V${base}Z`;
  };
  box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Earnings chart">
    ${ticks.map(t => `<line class="grid" x1="${pad.l}" x2="${W - pad.r}" y1="${y(t)}" y2="${y(t)}"/><text class="axis" x="${pad.l - 8}" y="${y(t) + 4}" text-anchor="end">₹${Math.round(t).toLocaleString('en-IN')}</text>`).join('')}
    ${series.map((s, i) => { const x = pad.l + i * band + (band - bw) / 2; return `<rect class="hit" data-i="${i}" x="${pad.l + i * band}" y="${pad.t}" width="${band}" height="${ih}"/><path class="bar" d="${barPath(x, s.value)}"/>${i % every === 0 ? `<text class="axis" x="${x + bw / 2}" y="${H - 6}" text-anchor="middle">${s.label}</text>` : ''}`; }).join('')}
  </svg>`;
  const tip = $('#chartTip');
  $$('.hit', box).forEach(h => {
    h.addEventListener('mousemove', e => { const s = series[h.dataset.i]; tip.innerHTML = `<b>${s.long}</b>${rupee(s.value)} · ${s.orders} ${s.orders === 1 ? 'order' : 'orders'}`; tip.hidden = false; tip.style.left = Math.min(e.clientX + 14, innerWidth - tip.offsetWidth - 8) + 'px'; tip.style.top = (e.clientY - tip.offsetHeight - 12) + 'px'; });
    h.addEventListener('mouseleave', () => { tip.hidden = true; });
  });
}
$('#rangeTabs').addEventListener('click', e => { const b = e.target.closest('[data-range]'); if (b) { range = b.dataset.range; offset = 0; renderReports(); } });
$('#prevPeriod').addEventListener('click', () => { offset--; renderReports(); });
$('#nextPeriod').addEventListener('click', () => { if (offset < 0) { offset++; renderReports(); } });
let resizeT; addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => { if (view === 'reports') renderReports(); }, 150); });

/* ---------- Customers ---------- */
function renderCustomers() {
  const map = new Map();
  orders.slice().sort((a, b) => when(a.created_at) - when(b.created_at)).forEach(o => {
    const key = String(o.phone).replace(/\D/g, '').slice(-10);
    const c = map.get(key) || { name: o.customer_name, phone: o.phone, digits: key, count: 0, spent: 0, last: null, area: o.area };
    c.name = o.customer_name; c.area = o.area; c.last = when(o.created_at);
    if (o.status !== 'cancelled') { c.count++; c.spent += o.total; }
    map.set(key, c);
  });
  const q = $('#custSearch').value.trim().toLowerCase();
  const list = [...map.values()].filter(c => !q || `${c.name} ${c.phone}`.toLowerCase().includes(q)).sort((a, b) => b.spent - a.spent);
  lastCustomers = list;
  $('#customers').innerHTML = list.length
    ? `<thead><tr><th>Customer</th><th>Phone</th><th>Location</th><th class="r">Orders</th><th class="r">Spent</th><th class="r">Last order</th></tr></thead><tbody>${list.map(c => `<tr>
        <td><b>${esc(c.name)}</b>${c.count >= 3 ? ' <span class="pill" style="--c:var(--s-done)">Regular</span>' : ''}</td>
        <td><a class="linkish" href="https://wa.me/91${c.digits}" target="_blank" rel="noopener">${esc(c.phone)}</a></td>
        <td>${esc(AREAS[c.area] || c.area)}</td><td class="r">${c.count}</td><td class="r">${rupee(c.spent)}</td><td class="r">${c.last ? c.last.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''}</td></tr>`).join('')}</tbody>`
    : `<tbody><tr><td class="muted" style="padding:20px 16px">${orders.length ? 'No customers match your search.' : 'Customers appear here after their first order.'}</td></tr></tbody>`;
}
$('#custSearch').addEventListener('input', renderCustomers);

/* ---------- Excel export ---------- */
let xlsxLib;
function loadXlsx() {
  return xlsxLib ||= new Promise((resolve, reject) => {
    const sc = document.createElement('script');
    sc.src = 'vendor/xlsx.full.min.js'; // SheetJS 0.18.5, bundled so export works offline
    sc.onload = () => resolve(window.XLSX);
    sc.onerror = () => { xlsxLib = null; reject(new Error('Could not load the Excel exporter. Refresh the page and try again.')); };
    document.head.append(sc);
  });
}
async function saveWorkbook(filename, sheets) {
  const X = await loadXlsx();
  const wb = X.utils.book_new();
  sheets.forEach(({ name, rows }) => {
    const ws = X.utils.aoa_to_sheet(rows);
    ws['!cols'] = Array.from({ length: Math.max(...rows.map(r => r.length)) }, (_, c) => ({ wch: Math.min(48, Math.max(8, ...rows.map(r => String(r[c] ?? '').length + 2))) }));
    X.utils.book_append_sheet(wb, ws, name.slice(0, 31));
  });
  const blob = new Blob([X.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const dl = window.claude?.use ? await window.claude.use('downloads') : null;
  if (dl) {
    try { await dl.save({ filename, data: blob }); toast('Excel file saved'); }
    catch (e) { if (e?.code !== 'declined') toast(e?.message || 'Could not save the file.', true); }
    return;
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  toast('Excel file downloaded');
}
const pad2 = n => String(n).padStart(2, '0');
const ymd = d => isNaN(d) ? '' : `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const hm = d => isNaN(d) ? '' : `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
function orderRows(list) {
  return [['Order #', 'Date', 'Time', 'Customer', 'Phone', 'Location', 'Address', 'Items', 'Bowls', 'Food (₹)', 'Delivery (₹)', 'Total (₹)', 'Status', 'Delivery partner', 'Notes'],
    ...list.map(o => { const d = when(o.created_at); return [
      isNaN(Number(o.id)) ? o.id : Number(o.id), ymd(d), hm(d), o.customer_name, o.phone, AREAS[o.area] || o.area, o.area === 'pickup' ? '' : o.address,
      o.items.map(i => `${i.quantity} x ${i.name} (${i.size})`).join('; '), o.items.reduce((s, i) => s + i.quantity, 0),
      o.subtotal ?? o.total - (o.delivery_charge || 0), o.delivery_charge || 0, o.total, STATUSES[o.status]?.[0] || o.status, o.rider?.name || '', o.notes || ''
    ]; })];
}
$('#exportBtn').addEventListener('click', async e => {
  const btn = e.currentTarget; btn.disabled = true; btn.textContent = 'Preparing…';
  const stamp = ymd(new Date());
  try {
    if (view === 'orders') {
      await saveWorkbook(`bowl-mania-orders-${stamp}.xlsx`, [{ name: 'Orders', rows: orderRows(lastOrderList) }]);
    } else if (view === 'customers') {
      await saveWorkbook(`bowl-mania-customers-${stamp}.xlsx`, [{ name: 'Customers', rows: [['Customer', 'Phone', 'Location', 'Orders', 'Spent (₹)', 'Last order'],
        ...lastCustomers.map(c => [c.name, c.phone, AREAS[c.area] || c.area, c.count, c.spent, ymd(c.last)])] }]);
    } else if (view === 'reports' && lastReport) {
      const { P, S, prev, series, top, rr, list } = lastReport;
      const unit = range === 'day' ? 'Hour' : range === 'year' ? 'Month' : 'Day';
      const last = new Date(P.end - 1);
      await saveWorkbook(`bowl-mania-${range}-report-${ymd(P.start)}.xlsx`, [
        { name: 'Summary', rows: [['Bowl Mania sales report', ''], ['Period', P.label], ['From', ymd(P.start)], ['To', ymd(last)], ['', ''],
          ['Measure', 'This period', 'Previous period'],
          ['Total earnings (₹)', S.earnings, prev.earnings], ['Food sales (₹)', S.food, prev.food], ['Delivery charges (₹)', S.delivery, prev.delivery],
          ['Orders', S.count, prev.count], ['Bowls sold', S.bowls, prev.bowls], ['Average order (₹)', Math.round(S.avg), Math.round(prev.avg)],
          ['Cancelled orders', S.cancelled.length, prev.cancelled.length]] },
        { name: `By ${unit.toLowerCase()}`, rows: [[unit, 'Orders', 'Earnings (₹)'], ...series.map(b => [b.long, b.orders, b.value])] },
        { name: 'Orders', rows: orderRows(list) },
        { name: 'Bowls sold', rows: [['Bowl', 'Quantity', 'Sales (₹)'], ...top.map(([n, b]) => [n, b.qty, b.rev])] },
        { name: 'Locations', rows: [['Location', 'Orders', 'Earnings (₹)'], ...Object.keys(AREAS).map(k => { const a = S.ok.filter(o => o.area === k); return [AREAS[k], a.length, a.reduce((s, o) => s + o.total, 0)]; })] },
        { name: 'Delivery partners', rows: [['Partner', 'Deliveries', 'Delivery fees (₹)', 'Order value (₹)'], ...rr.map(([n, r]) => [n, r.n, r.fees, r.cash])] }
      ]);
    }
  } catch (err) { toast(err.message, true); }
  finally { btn.disabled = false; btn.textContent = 'Export to Excel'; }
});

boot();
