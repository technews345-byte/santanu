import { get, patch } from '../api.js';
import { $, $$, esc, icon, rupee, num, badge, statusBadge, payBadge, stars, fmtDate, fmtDateTime, ago, toast, formDialog, emptyState, errorState, pager, debounce, waLink, download, initials } from '../ui.js';
import { can, go } from '../app.js';

const f = { q: '', segment: '', status: '', sort: 'last_order_at', dir: 'desc', page: 1 };
export async function render(view, ctx) {
  if (ctx.params[0]) return profile(view, Number(ctx.params[0]));
  view.innerHTML = `<div class="page-head"><div><h1>Customers</h1><p>Everyone who has ordered, with their spend and history.</p></div>
    <div class="actions">${can('reports.export', 'customers.view') ? `<button class="btn btn-ghost btn-sm" id="exp">${icon('download')} Excel</button>` : ''}</div></div>
    <div class="toolbar"><input class="input search" id="q" type="search" placeholder="Name, phone or email" value="${esc(f.q)}" aria-label="Search customers">
      <div class="seg" role="group" aria-label="Segment">${[['', 'All'], ['new', 'One order'], ['repeat', 'Repeat'], ['inactive', 'Inactive 30+ days']].map(([k, l]) => `<button type="button" data-seg="${k}" aria-pressed="${f.segment === k}">${l}</button>`).join('')}</div>
      <select class="select" id="status" aria-label="Status"><option value="">Any status</option><option value="active">Active</option><option value="blocked">Blocked</option></select>
      <select class="select" id="sort" aria-label="Sort"><option value="last_order_at">Recent order</option><option value="total_spent">Top spenders</option><option value="orders_count">Most orders</option><option value="created_at">Newest</option><option value="name">Name</option></select></div>
    <div class="card" id="list"></div>`;
  $('#status', view).value = f.status; $('#sort', view).value = f.sort;
  $('#q', view).oninput = debounce(e => { f.q = e.target.value.trim(); f.page = 1; load(); }, 300);
  $('#status', view).onchange = e => { f.status = e.target.value; f.page = 1; load(); };
  $('#sort', view).onchange = e => { f.sort = e.target.value; f.dir = e.target.value === 'name' ? 'asc' : 'desc'; load(); };
  $$('[data-seg]', view).forEach(b => b.onclick = () => { f.segment = b.dataset.seg; f.page = 1; $$('[data-seg]', view).forEach(x => x.setAttribute('aria-pressed', x === b)); load(); });
  $('#exp', view)?.addEventListener('click', () => download('/api/admin/reports/customers?format=xlsx'));
  async function load() {
    const el = $('#list', view); let r;
    try { r = await get('/admin/customers', f); } catch (e) { el.innerHTML = errorState(e); $('[data-retry]', el).onclick = load; return; }
    if (!r.rows.length) { el.innerHTML = emptyState('users', 'No customers found', f.q ? 'Try a different search.' : 'Customers appear after their first order.'); return; }
    el.innerHTML = `<div class="table-wrap"><table class="table cards"><thead><tr><th>Customer</th><th>Phone</th><th>Email</th><th class="r">Orders</th><th class="r">Total spent</th><th>First order</th><th>Last order</th><th>Location</th><th>Status</th></tr></thead><tbody>
      ${r.rows.map(c => `<tr class="clickable" data-id="${c.id}"><td class="primary"><div class="row" style="gap:10px;flex-wrap:nowrap"><span class="avatar">${esc(initials(c.name))}</span><b>${esc(c.name)}</b>${c.orders_count >= 3 ? badge('ok', 'Regular') : ''}</div></td>
        <td data-label="Phone">${esc(c.phone)}</td><td data-label="Email">${esc(c.email || '—')}</td><td class="r" data-label="Orders">${num(c.orders_count)}</td><td class="r strong" data-label="Spent">${rupee(c.total_spent)}</td>
        <td data-label="First order">${fmtDate(c.first_order_at) || '—'}</td><td data-label="Last order">${c.last_order_at ? ago(c.last_order_at) : '—'}</td><td data-label="Location">${esc(c.last_area || '—')}</td><td data-label="Status">${badge(c.status)}</td></tr>`).join('')}</tbody></table></div>`;
    el.append(pager(r, p => { f.page = p; load(); }));
    $$('tr[data-id]', el).forEach(tr => tr.onclick = () => go(`customers/${tr.dataset.id}`));
  }
  await load();
}

async function profile(view, id) {
  let c;
  try { c = await get(`/admin/customers/${id}`); } catch (e) { view.innerHTML = `<a class="back" href="#/customers">${icon('back')} Customers</a>` + errorState(e, false); return; }
  view.innerHTML = `<a class="back" href="#/customers">${icon('back')} Customers</a>
    <div class="card card-pad order-hero"><div class="row" style="gap:14px"><span class="avatar lg">${esc(initials(c.name))}</span><div><h1>${esc(c.name)}</h1><p class="muted">${esc(c.phone)}${c.email ? ' · ' + esc(c.email) : ''} · customer since ${fmtDate(c.first_order_at || c.created_at)}</p></div></div>
      <div class="row">${badge(c.status)}<a class="btn btn-ghost btn-sm" href="tel:+91${esc(c.phone)}">${icon('phone')} Call</a><a class="btn btn-ghost btn-sm" href="${waLink(c.phone)}" target="_blank" rel="noopener">${icon('wa')} WhatsApp</a>${can('customers.manage') ? '<button class="btn btn-soft btn-sm" id="editC">Edit</button>' : ''}</div></div>
    <div class="kpis" style="margin-top:16px"><div class="kpi"><span>Total spent</span><b>${rupee(c.total_spent)}</b></div><div class="kpi"><span>Orders</span><b>${num(c.orders_count)}</b><small>${num(c.cancelled_count)} cancelled</small></div><div class="kpi"><span>Average order</span><b>${rupee(c.orders_count ? c.total_spent / c.orders_count : 0)}</b><small>Last order ${c.last_order_at ? ago(c.last_order_at) : '—'}</small></div></div>
    <div class="cols-2" style="margin-top:18px"><div class="stack">
      <div class="card"><div class="card-head"><h2>Order history</h2></div>${c.orders.length ? `<div class="table-wrap"><table class="table cards"><thead><tr><th>Order</th><th>Date</th><th>Items</th><th>Status</th><th>Payment</th><th class="r">Total</th></tr></thead><tbody>
        ${c.orders.map(o => `<tr class="clickable" data-o="${o.id}"><td class="primary"><b>${esc(o.order_number)}</b></td><td data-label="Date">${fmtDateTime(o.created_at)}</td><td data-label="Items" class="items">${esc(o.items_text)}</td><td data-label="Status">${statusBadge(o.status)}</td><td data-label="Payment">${payBadge(o.payment_status, o.payment_method)}</td><td class="r strong" data-label="Total">${rupee(o.total)}</td></tr>`).join('')}</tbody></table></div>` : emptyState('orders', 'No orders yet')}</div>
      <div class="card"><div class="card-head"><h2>Payments</h2></div>${c.payments.length ? `<div class="table-wrap"><table class="table cards"><tbody>${c.payments.map(p => `<tr><td class="primary"><b>${esc(p.order_number)}</b><span class="sub">${p.provider === 'cod' ? 'Cash' : 'Razorpay ' + esc(p.method || '')}</span></td><td data-label="Status">${badge(p.status)}</td><td data-label="Date">${fmtDateTime(p.paid_at || p.created_at)}</td><td class="r" data-label="Amount">${rupee(p.amount)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="card-body muted small">No payments.</p>'}</div>
    </div><div class="stack">
      <div class="card card-pad"><h2 style="margin-bottom:10px">Favourite bowls</h2>${c.favourites.length ? c.favourites.map(x => `<div class="row small" style="justify-content:space-between;padding:4px 0"><span>${esc(x.name)}</span><b class="num">${x.qty}×</b></div>`).join('') : '<p class="muted small">No orders yet.</p>'}</div>
      <div class="card card-pad"><h2 style="margin-bottom:10px">Addresses</h2>${c.addresses.length ? c.addresses.map(a => `<div style="padding:6px 0;border-bottom:1px dashed var(--line)"><p class="small">${esc(a.address)}${a.landmark ? ` <span class="muted">(${esc(a.landmark)})</span>` : ''}</p><p class="tiny muted">${esc(a.area_name || '')}${a.lat != null ? ` · <a href="https://www.google.com/maps?q=${a.lat},${a.lng}" target="_blank" rel="noopener">map</a>` : ''} · used ${ago(a.last_used_at)}</p></div>`).join('') : '<p class="muted small">Pickup only.</p>'}</div>
      ${c.reviews.length ? `<div class="card card-pad"><h2 style="margin-bottom:10px">Reviews</h2>${c.reviews.map(r => `<p>${stars(r.rating)} <span class="muted small">${fmtDate(r.created_at)}</span></p><p class="small">${esc(r.comment)}</p>`).join('')}</div>` : ''}
      ${c.notes ? `<div class="card card-pad"><h2 style="margin-bottom:6px">Notes</h2><p class="small">${esc(c.notes)}</p></div>` : ''}
    </div></div>`;
  $$('[data-o]', view).forEach(tr => tr.onclick = () => go(`orders/${tr.dataset.o}`));
  $('#editC', view)?.addEventListener('click', () => formDialog({ title: `Edit ${c.name}`, submit: 'Save',
    fields: `<label class="field"><span>Name</span><input class="input" name="name" required value="${esc(c.name)}"></label><label class="field"><span>Email</span><input class="input" type="email" name="email" value="${esc(c.email)}"></label>
      <label class="field"><span>Status</span><select class="select" name="status"><option value="active" ${c.status === 'active' ? 'selected' : ''}>Active</option><option value="blocked" ${c.status === 'blocked' ? 'selected' : ''}>Blocked — can't place website orders</option></select></label>
      <label class="field"><span>Private notes</span><textarea class="textarea" name="notes" maxlength="1000">${esc(c.notes)}</textarea></label>`,
    onSubmit: async v => { await patch(`/admin/customers/${c.id}`, v); toast('Customer updated'); profile(view, id); } }));
}
