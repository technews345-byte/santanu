const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rupee = n => `₹${Number(n).toLocaleString('en-IN')}`;
const STATUSES = {
  new: ['New', '#c47f00'], confirmed: ['Confirmed', '#1d6fb8'], preparing: ['Preparing', '#7a4bc2'],
  out_for_delivery: ['Out for delivery', '#0f8a8a'], completed: ['Completed', '#1e8a3c'], cancelled: ['Cancelled', '#b3261e']
};
const AREAS = { sonari: 'Sonari', nazira: 'Nazira', pickup: 'Self pickup' };

let token = ''; try { token = localStorage.getItem('bowlAdminToken') || ''; } catch {}
let orders = [], filter = 'all';

function show() {
  $('#login').hidden = !!token; $('#dashboard').hidden = !token;
  if (token) loadOrders(); else $('#password').focus();
}

$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault(); $('#loginMsg').textContent = '';
  const r = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: $('#password').value }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { $('#loginMsg').textContent = d.error || 'Sign in failed'; return; }
  token = d.token; try { localStorage.setItem('bowlAdminToken', token); } catch {}
  $('#password').value = ''; show();
});

function logout() { try { localStorage.removeItem('bowlAdminToken'); } catch {} token = ''; show(); }
$('#logout').addEventListener('click', logout);
$('#refresh').addEventListener('click', () => loadOrders());
$('#search').addEventListener('input', render);

async function loadOrders() {
  const r = await fetch('/api/admin/orders', { headers: { Authorization: 'Bearer ' + token } });
  if (r.status === 401) return logout();
  orders = await r.json();
  $('#updated').textContent = 'Updated ' + new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  render();
}

function render() {
  const today = new Date().toISOString().slice(0, 10);
  const todays = orders.filter(o => (o.created_at || '').startsWith(today) && o.status !== 'cancelled');
  const open = orders.filter(o => !['completed', 'cancelled'].includes(o.status));
  $('#stats').innerHTML = [
    ['Open orders', open.length], ['New', orders.filter(o => o.status === 'new').length],
    ["Today's orders", todays.length], ["Today's revenue", rupee(todays.reduce((s, o) => s + o.total, 0))]
  ].map(([k, v]) => `<div class="stat"><span>${k}</span><b>${v}</b></div>`).join('');

  $('#tabs').innerHTML = [['all', 'All', orders.length], ...Object.entries(STATUSES).map(([k, [l]]) => [k, l, orders.filter(o => o.status === k).length])]
    .map(([k, l, n]) => `<button role="tab" data-f="${k}" aria-selected="${k === filter}">${l}<em>${n}</em></button>`).join('');

  const q = $('#search').value.trim().toLowerCase();
  const list = orders.filter(o => (filter === 'all' || o.status === filter) &&
    (!q || `#${o.id} ${o.customer_name} ${o.phone}`.toLowerCase().includes(q)));

  $('#orders').innerHTML = list.length ? list.map(o => {
    const [label, color] = STATUSES[o.status] || [o.status, '#888'];
    const when = new Date((o.created_at || '').replace(' ', 'T') + 'Z');
    return `<article class="order" style="--c:${color}">
      <div>
        <h3>#${o.id} · ${esc(o.customer_name)} <small>${isNaN(when) ? '' : when.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</small></h3>
        <p><a href="tel:${esc(o.phone)}">${esc(o.phone)}</a> · <a href="https://wa.me/91${esc(String(o.phone).replace(/\D/g, '').slice(-10))}" target="_blank" rel="noopener">WhatsApp</a></p>
        <p><b>${esc(AREAS[o.area] || o.area)}</b> — ${esc(o.address)}</p>
        ${o.notes ? `<p class="muted">Note: ${esc(o.notes)}</p>` : ''}
      </div>
      <ul>
        ${o.items.map(i => `<li><span>${i.quantity} × ${esc(i.name)} <span class="muted">(${esc(i.size)})</span></span><span>${rupee(i.price * i.quantity)}</span></li>`).join('')}
        <li class="muted"><span>Delivery</span><span>${rupee(o.delivery_charge)}</span></li>
        <li class="sum"><span>Total</span><span>${rupee(o.total)}</span></li>
      </ul>
      <div class="side">
        <span class="pill">${esc(label)}</span>
        <select data-id="${o.id}" aria-label="Change status">${Object.entries(STATUSES).map(([k, [l]]) => `<option value="${k}" ${k === o.status ? 'selected' : ''}>${l}</option>`).join('')}</select>
      </div>
    </article>`;
  }).join('') : `<div class="empty">${orders.length ? 'No orders match this view.' : 'No orders yet — new orders will appear here.'}</div>`;
}

$('#tabs').addEventListener('click', e => { const b = e.target.closest('[data-f]'); if (b) { filter = b.dataset.f; render(); } });
$('#orders').addEventListener('change', async e => {
  const sel = e.target.closest('select[data-id]'); if (!sel) return;
  const r = await fetch('/api/admin/orders/' + sel.dataset.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ status: sel.value }) });
  if (r.status === 401) return logout();
  loadOrders();
});
setInterval(() => { if (token && !document.hidden) loadOrders(); }, 60000);
show();
