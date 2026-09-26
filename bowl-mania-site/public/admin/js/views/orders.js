import { get, post, patch, put } from '../api.js';
import { $, $$, esc, icon, rupee, num, statusBadge, payBadge, badge, fmtDateTime, fmtTime, fmtDate, ago, toast, toastError, confirmDialog, formDialog, modal,
  emptyState, errorState, pager, debounce, copyText, waLink, STATUS, PAY, download } from '../ui.js';
import { can, go, bus, state } from '../app.js';
import { imgSrc } from './_photo.js';

export async function render(view, ctx) {
  if (ctx.params[0] === 'new') return manualOrder(view);
  if (ctx.params[0]) return detail(view, Number(ctx.params[0]));
  return list(view, ctx);
}

// ---------- List ----------
const filters = { status: '', payment_status: '', payment_method: '', area_id: '', fulfilment: '', from: '', to: '', q: '', sort: 'created_at', dir: 'desc', page: 1 };
async function list(view, ctx) {
  if (ctx.query.status) { filters.status = ctx.query.status; filters.page = 1; }
  const areas = state.config?.areas || [];
  view.innerHTML = `<div class="page-head"><div><h1>Orders</h1><p>Confirm, prepare and dispatch orders. New orders appear here instantly.</p></div>
    <div class="actions">${can('reports.export') ? `<button class="btn btn-ghost btn-sm" id="exportCsv">${icon('download')} CSV</button><button class="btn btn-ghost btn-sm" id="exportXlsx">${icon('download')} Excel</button>` : ''}
      ${can('orders.create') ? `<a class="btn btn-primary btn-sm" href="#/orders/new">${icon('plus')} New order</a>` : ''}</div></div>
    <div class="chips scroll-x" id="statusChips" style="margin-bottom:12px"></div>
    <div class="toolbar collapsible" id="toolbar">
      <input class="input search" id="q" type="search" placeholder="Order ID, customer name or phone" value="${esc(filters.q)}" aria-label="Search orders">
      <button class="btn btn-ghost btn-sm filters-toggle" type="button" id="filtersToggle" aria-expanded="false">Filters</button>
      <select class="select" id="payment_status" aria-label="Payment status"><option value="">Any payment</option>${Object.entries(PAY).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
      <select class="select" id="payment_method" aria-label="Payment method"><option value="">Online & cash</option><option value="online">Online</option><option value="cod">Cash on delivery</option></select>
      <select class="select" id="area_id" aria-label="Location"><option value="">All locations</option>${areas.map(a => `<option value="${a.id}">${esc(a.name)}</option>`).join('')}</select>
      <select class="select" id="fulfilment" aria-label="Delivery or pickup"><option value="">Delivery & pickup</option><option value="delivery">Delivery</option><option value="pickup">Pickup</option></select>
      <input class="input" type="date" id="from" aria-label="From date" value="${filters.from}"><input class="input" type="date" id="to" aria-label="To date" value="${filters.to}">
      <button class="btn-link small" id="clear">Clear filters</button>
    </div>
    <div class="card" id="listCard"></div>`;
  for (const k of ['payment_status', 'payment_method', 'area_id', 'fulfilment']) { $('#' + k, view).value = filters[k]; $('#' + k, view).onchange = e => { filters[k] = e.target.value; filters.page = 1; load(); }; }
  for (const k of ['from', 'to']) $('#' + k, view).onchange = e => { filters[k] = e.target.value; filters.page = 1; load(); };
  $('#filtersToggle', view).onclick = e => { const t = $('#toolbar', view); t.classList.toggle('open'); e.target.setAttribute('aria-expanded', t.classList.contains('open')); };
  $('#q', view).oninput = debounce(e => { filters.q = e.target.value.trim(); filters.page = 1; load(); }, 300);
  $('#clear', view).onclick = () => { Object.assign(filters, { status: '', payment_status: '', payment_method: '', area_id: '', fulfilment: '', from: '', to: '', q: '', page: 1 }); list(view, { query: {} }); };
  const exp = fmt => download('/api/admin/reports/orders?' + new URLSearchParams({ ...Object.fromEntries(Object.entries(filters).filter(([k, v]) => v !== '' && k !== 'page')), format: fmt }));
  $('#exportCsv', view)?.addEventListener('click', () => exp('csv'));
  $('#exportXlsx', view)?.addEventListener('click', () => exp('xlsx'));

  async function load() {
    const card = $('#listCard', view);
    card.style.opacity = .6;
    let r;
    try { r = await get('/admin/orders', { ...filters }); } catch (e) { card.innerHTML = errorState(e); $('[data-retry]', card).onclick = load; card.style.opacity = 1; return; }
    card.style.opacity = 1;
    const c = r.counts || {}, all = Object.values(c).reduce((s, n) => s + n, 0), open = ['new', 'confirmed', 'accepted', 'preparing', 'ready', 'out_for_delivery'].reduce((s, k) => s + (c[k] || 0), 0);
    $('#statusChips', view).innerHTML = [['', 'All', all], ['open', 'Open', open], ...Object.entries(STATUS).filter(([k]) => k !== 'accepted' || c.accepted).map(([k, l]) => [k, l, c[k] || 0])]
      .map(([k, l, n]) => `<button class="chip" data-s="${k}" aria-pressed="${filters.status === k}">${l} <em>${num(n)}</em></button>`).join('');
    $$('#statusChips [data-s]', view).forEach(b => b.onclick = () => { filters.status = b.dataset.s; filters.page = 1; load(); });
    if (!r.rows.length) { card.innerHTML = emptyState('orders', 'No orders match', 'Try another status or clear the filters.'); return; }
    const th = (key, label, cls = '') => `<th class="${cls}"><button data-sort="${key}">${label}${filters.sort === key ? (filters.dir === 'desc' ? ' ↓' : ' ↑') : ''}</button></th>`;
    card.innerHTML = `<div class="table-wrap"><table class="table cards"><thead><tr>${th('order_number', 'Order')}${th('created_at', 'Date/time')}<th>Customer</th><th>Items</th><th class="r">Qty</th><th class="r">Subtotal</th><th class="r">Delivery</th><th class="r">Discount</th>${th('total', 'Total', 'r')}<th>Payment</th><th>Area</th><th class="r">Km</th>${th('status', 'Status')}<th></th></tr></thead><tbody>
      ${r.rows.map(o => `<tr class="clickable" data-id="${o.id}">
        <td class="primary"><b>${esc(o.order_number)}</b><span class="sub">${o.fulfilment === 'pickup' ? 'Pickup' : 'Delivery'}${o.slot_label ? ' · ' + esc(o.slot_label) : ''}</span></td>
        <td data-label="Placed" class="nowrap">${fmtDateTime(o.created_at)}</td>
        <td data-label="Customer"><b>${esc(o.customer_name)}</b><span class="sub">${esc(o.customer_phone)}</span></td>
        <td data-label="Items" class="items" title="${esc(o.items_text)}">${esc(o.items_text)}</td>
        <td data-label="Qty" class="r">${num(o.quantity)}</td><td data-label="Subtotal" class="r">${rupee(o.subtotal)}</td><td data-label="Delivery" class="r">${rupee(o.delivery_fee)}</td>
        <td data-label="Discount" class="r">${o.discount ? '−' + rupee(o.discount) : '—'}</td><td data-label="Total" class="r strong">${rupee(o.total)}</td>
        <td data-label="Payment">${payBadge(o.payment_status, o.payment_method)}</td><td data-label="Area">${esc(o.area_name || '—')}</td>
        <td data-label="Distance" class="r">${o.distance_km != null ? o.distance_km : '—'}</td>
        <td data-label="Status">${statusBadge(o.status)}${o.rider_name ? `<span class="sub">${icon('scooter')} ${esc(o.rider_name)}</span>` : ''}</td>
        <td class="r nowrap">${o.next.filter(s => s !== 'cancelled').slice(0, 1).map(s => canMove(s) ? `<button class="btn btn-soft btn-xs" data-move="${s}" data-oid="${o.id}">${esc(STATUS[s])}</button>` : '').join('')}</td></tr>`).join('')}
      </tbody></table></div>`;
    card.append(pager(r, p => { filters.page = p; load(); }));
    $$('[data-sort]', card).forEach(b => b.onclick = e => { e.stopPropagation(); const k = b.dataset.sort; filters.dir = filters.sort === k && filters.dir === 'desc' ? 'asc' : 'desc'; filters.sort = k; load(); });
    $$('tr[data-id]', card).forEach(tr => tr.onclick = e => { if (!e.target.closest('button')) go(`orders/${tr.dataset.id}`); });
    $$('[data-move]', card).forEach(b => b.onclick = async e => { e.stopPropagation(); b.classList.add('is-loading');
      try { await patch(`/admin/orders/${b.dataset.oid}/status`, { status: b.dataset.move }); toast(`Order moved to ${STATUS[b.dataset.move]}`); load(); } catch (x) { toastError(x); b.classList.remove('is-loading'); } });
  }
  await load();
  const onOrder = debounce(load, 400);
  bus.addEventListener('order', onOrder);
  return () => bus.removeEventListener('order', onOrder);
}
const canMove = s => can('orders.update') || (s === 'cancelled' && can('orders.cancel')) || (['accepted', 'preparing', 'ready'].includes(s) && can('orders.kitchen'));

// ---------- Detail ----------
const FLOW = [['new', 'Order placed'], ['paid', 'Payment confirmed'], ['confirmed', 'Order confirmed'], ['preparing', 'Preparing'], ['ready', 'Ready'], ['out_for_delivery', 'Out for delivery'], ['delivered', 'Delivered']];
async function detail(view, id) {
  let o;
  async function load() {
    try { o = await get(`/admin/orders/${id}`); } catch (e) { view.innerHTML = `<a class="back" href="#/orders">${icon('back')} Orders</a>` + errorState(e); $('[data-retry]', view).onclick = load; return; }
    draw();
  }
  function timeline() {
    const at = {}; o.history.forEach(h => { at[h.to_status] ||= h.created_at; if (h.note === 'Payment confirmed') at.paid = h.created_at; });
    if (o.payment_method === 'online' && o.payment_status === 'paid') at.paid ||= o.payments.find(p => p.status === 'paid' || p.paid_at)?.paid_at || o.placed_at;
    let steps = FLOW.filter(([k]) => !(k === 'paid' && o.payment_method === 'cod') && !(k === 'out_for_delivery' && o.fulfilment === 'pickup'));
    if (o.fulfilment === 'pickup') steps = steps.map(s => s[0] === 'delivered' ? ['completed', 'Picked up'] : s);
    const order = ['new', 'paid', 'confirmed', 'accepted', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'completed'];
    const reached = k => at[k] || (k === 'paid' ? o.payment_status === 'paid' : order.indexOf(o.status) >= order.indexOf(k) && !['cancelled', 'refunded'].includes(o.status));
    const cancelled = ['cancelled', 'refunded'].includes(o.status);
    return `<ol class="timeline">${steps.map(([k, l], i) => { const done = reached(k); const cur = done && !reached(steps[i + 1]?.[0]);
      return `<li class="${done ? 'done' : ''} ${cur && !cancelled ? 'current' : ''}"><span class="dot">${done ? icon('check') : ''}</span><div><b>${l}</b><small>${at[k] ? fmtDateTime(at[k]) : done ? '' : 'Pending'}</small></div></li>`; }).join('')}
      ${cancelled ? `<li class="done"><span class="dot" style="background:var(--err);border-color:var(--err)">${icon('close')}</span><div><b>${STATUS[o.status]}</b><small>${fmtDateTime(at[o.status])}</small></div></li>` : ''}</ol>`;
  }
  function draw() {
    const paid = o.payments.find(p => p.provider === 'razorpay');
    const closed = ['delivered', 'completed', 'cancelled', 'refunded'].includes(o.status);
    const actions = o.next.filter(canMove).map(s => `<button class="btn ${s === 'cancelled' ? 'btn-danger-ghost' : 'btn-primary'} btn-sm" data-move="${s}">${s === 'cancelled' ? 'Cancel order' : 'Mark ' + esc(STATUS[s].toLowerCase())}</button>`).join('');
    const msg = `Hello ${o.customer_name.split(' ')[0]}, this is Bowl Mania about your order ${o.order_number}. Track it here: ${o.tracking_url}`;
    view.innerHTML = `<a class="back" href="#/orders">${icon('back')} Orders</a>
      <div class="order-hero card card-pad"><div><span class="eyebrow">${o.source === 'admin' ? 'Staff order' : 'Website order'} · ${fmtDateTime(o.created_at)}</span>
        <h1>${esc(o.order_number)}</h1><div class="row" style="margin-top:8px">${statusBadge(o.status)}${payBadge(o.payment_status, o.payment_method)}${badge('plain', o.fulfilment === 'pickup' ? 'Pickup' : 'Delivery', 'plain')}</div></div>
        <div class="stack-sm" style="justify-items:end"><div class="status-actions">${actions || (closed ? '<span class="muted small">This order is closed.</span>' : '')}</div>
          ${o.slot_label ? `<span class="small muted">${icon('clock')} ${esc(o.slot_label)} · ${fmtDate(o.slot_date + 'T12:00:00Z')} ${esc(o.slot_start || '')}–${esc(o.slot_end || '')} · ETA ${fmtTime(o.estimated_at)}</span>` : ''}</div></div>
      <div class="cols-2" style="margin-top:18px">
        <div class="stack">
          <div class="card"><div class="card-head"><h2>Items</h2><span class="muted small">${(n => `${num(n)} bowl${n === 1 ? '' : 's'}`)(o.items.reduce((s, i) => s + i.quantity, 0))}</span></div><div class="card-body lines">
            ${o.items.map(i => `<div class="ln"><span>${i.quantity} × <b>${esc(i.name)}</b> <span class="muted">(${esc(i.size_label)}) · ${rupee(i.unit_price)}</span></span><span class="num">${rupee(i.line_total)}</span></div>`).join('')}
            <div class="ln"><span class="muted">Subtotal</span><span class="num">${rupee(o.subtotal)}</span></div>
            ${o.offer_discount ? `<div class="ln disc"><span>Offer · ${esc(o.offer_title)}</span><span class="num">−${rupee(o.offer_discount)}</span></div>` : ''}
            ${o.coupon_discount ? `<div class="ln disc"><span>Coupon ${esc(o.coupon_code)}</span><span class="num">−${rupee(o.coupon_discount)}</span></div>` : ''}
            <div class="ln"><span class="muted">Delivery fee${o.distance_km != null ? ` · ${o.distance_km} km` : ''}</span><span class="num">${rupee(o.delivery_fee)}</span></div>
            ${o.tax ? `<div class="ln"><span class="muted">Tax</span><span class="num">${rupee(o.tax)}</span></div>` : ''}
            <div class="ln total"><span>Total</span><span class="num">${rupee(o.total)}</span></div>
            ${o.notes ? `<p style="margin-top:10px" class="small"><b>Special instructions:</b> ${esc(o.notes)}</p>` : ''}</div></div>
          <div class="card"><div class="card-head"><h2>Payment</h2>${o.payment_method === 'online' && can('payments.view') && paid ? `<button class="btn btn-ghost btn-xs" id="reconcile">Check with Razorpay</button>` : ''}</div><div class="card-body">
            <dl class="kv"><dt>Method</dt><dd>${o.payment_method === 'cod' ? 'Cash on delivery' : 'Online (Razorpay)' + (paid?.method ? ' · ' + esc(paid.method.toUpperCase()) : '')}</dd>
              <dt>Status</dt><dd>${payBadge(o.payment_status)}</dd>
              ${paid ? `<dt>Razorpay order</dt><dd class="code">${esc(paid.razorpay_order_id || '—')}</dd><dt>Payment ID</dt><dd class="code">${esc(paid.razorpay_payment_id || '—')}</dd><dt>Paid at</dt><dd>${fmtDateTime(paid.paid_at) || '—'}</dd>${paid.error ? `<dt>Note</dt><dd style="color:var(--err)">${esc(paid.error)}</dd>` : ''}` : ''}
              ${o.refunds.length ? `<dt>Refunds</dt><dd>${o.refunds.map(r => `${rupee(r.amount)} ${badge(r.status)} <span class="muted small">${fmtDateTime(r.created_at)}</span>`).join('<br>')}</dd>` : ''}</dl>
            ${can('payments.refund') && ['paid', 'partially_refunded'].includes(o.payment_status) && o.payment_method === 'online' ? `<button class="btn btn-danger-ghost btn-sm" id="refund" style="margin-top:12px">Refund payment</button>` : ''}</div></div>
          <div class="card"><div class="card-head"><h2>History</h2></div><div class="card-body"><div class="table-wrap"><table class="table"><tbody>${o.history.map(h => `<tr><td class="nowrap">${fmtDateTime(h.created_at)}</td><td>${h.from_status && h.from_status !== h.to_status ? `${esc(STATUS[h.from_status])} → ` : ''}<b>${esc(STATUS[h.to_status])}</b>${h.note ? ` <span class="muted">· ${esc(h.note)}</span>` : ''}</td><td class="muted">${esc(h.admin_name || '')}</td></tr>`).join('')}</tbody></table></div>
            ${o.messages.length ? `<h3 style="margin:14px 0 6px">WhatsApp messages</h3>${o.messages.map(m => `<div class="row small"><span>${esc(m.event.replace(/_/g, ' '))}</span>${badge(m.status)}<span class="muted">${fmtDateTime(m.created_at)}</span>${m.error ? `<span class="muted">${esc(m.error)}</span>` : ''}</div>`).join('')}` : ''}</div></div>
        </div>
        <div class="stack">
          <div class="card card-pad">${timeline()}</div>
          <div class="card"><div class="card-head"><h2>Customer</h2>${o.customer && can('customers.view') ? `<a class="small" href="#/customers/${o.customer.id}">Profile</a>` : ''}</div><div class="card-body stack-sm">
            <b>${esc(o.customer_name)}</b>${o.customer ? `<span class="muted small">${num(o.customer.orders_count)} order${o.customer.orders_count === 1 ? '' : 's'} so far${o.customer.status === 'blocked' ? ' · blocked' : ''}</span>` : ''}
            <div class="row"><a class="btn btn-ghost btn-xs" href="tel:+91${esc(o.customer_phone)}">${icon('phone')} ${esc(o.customer_phone)}</a><a class="btn btn-ghost btn-xs" href="${waLink(o.customer_phone, msg)}" target="_blank" rel="noopener">${icon('wa')} WhatsApp</a></div>
            ${o.customer_email ? `<span class="small">${esc(o.customer_email)}</span>` : ''}
            ${o.fulfilment === 'delivery' ? `<dl class="kv" style="margin-top:6px"><dt>Address</dt><dd>${esc(o.address)}${o.landmark ? `<br><span class="muted">${esc(o.landmark)}</span>` : ''}</dd><dt>Area</dt><dd>${esc(o.area_name || '')}</dd>
              <dt>Distance</dt><dd>${o.distance_km ?? '—'} km</dd>${o.lat != null ? `<dt>GPS</dt><dd><a href="https://www.google.com/maps?q=${o.lat},${o.lng}" target="_blank" rel="noopener">${Number(o.lat).toFixed(5)}, ${Number(o.lng).toFixed(5)}</a></dd>` : ''}</dl>` : `<span class="small">Pickup at <b>${esc(o.area_name || '')}</b></span>`}</div></div>
          ${o.fulfilment === 'delivery' ? `<div class="card"><div class="card-head"><h2>Delivery</h2></div><div class="card-body stack-sm" id="assignBox"></div></div>` : ''}
          <div class="card"><div class="card-head"><h2>Tracking link</h2></div><div class="card-body stack-sm"><div class="copy-field"><input class="input" readonly value="${esc(o.tracking_url)}" aria-label="Tracking link"><button class="icon-btn" id="copyLink" title="Copy">${icon('copy')}</button></div>
            <a class="btn btn-soft btn-sm" href="${waLink(o.customer_phone, `Track your Bowl Mania order ${o.order_number}: ${o.tracking_url}`)}" target="_blank" rel="noopener">${icon('wa')} Send tracking link</a></div></div>
        </div></div>`;
    $$('[data-move]', view).forEach(b => b.onclick = () => move(b.dataset.move, b));
    $('#copyLink', view).onclick = () => copyText(o.tracking_url);
    $('#reconcile', view)?.addEventListener('click', async e => { e.target.classList.add('is-loading'); try { const r = await post(`/admin/orders/${o.id}/reconcile`); toast(r.found === 'captured' ? 'Payment confirmed by Razorpay' : r.found === 'failed' ? 'Razorpay reports the payment failed' : 'No completed payment found yet'); load(); } catch (x) { toastError(x); e.target.classList.remove('is-loading'); } });
    $('#refund', view)?.addEventListener('click', () => refund());
    if (o.fulfilment === 'delivery') assignBox();
  }
  async function move(to, btn) {
    if (to === 'cancelled') {
      const reason = await confirmDialog({ title: `Cancel ${o.order_number}?`, message: `The customer will be told on WhatsApp.${o.payment_status === 'paid' && o.payment_method === 'online' ? ' This order was paid online — issue the refund from the Payment section afterwards.' : ''}`, confirm: 'Cancel order', danger: true, input: { label: 'Reason (optional)', placeholder: 'e.g. Out of stock' } });
      if (reason === false) return;
      return doMove(to, typeof reason === 'string' ? reason : '');
    }
    btn?.classList.add('is-loading'); await doMove(to, '');
  }
  async function doMove(to, note) {
    try { await patch(`/admin/orders/${o.id}/status`, { status: to, note }); toast(`${o.order_number} → ${STATUS[to]}`); await load(); } catch (x) { toastError(x); draw(); }
  }
  async function refund() {
    const max = (o.payments.find(p => p.provider === 'razorpay')?.amount || o.total) - (o.payments.find(p => p.provider === 'razorpay')?.refunded_amount || 0);
    formDialog({ title: `Refund ${o.order_number}`, size: 'narrow', submit: 'Issue refund',
      fields: `<p class="small muted">Refunds go back to the customer's original payment method through Razorpay (usually 5–7 working days).</p>
        <label class="field"><span>Amount (₹)</span><input class="input" name="amount" type="number" data-type="number" min="1" max="${max}" value="${max}" required><small>Up to ${rupee(max)}</small></label>
        <label class="field"><span>Reason</span><input class="input" name="reason" maxlength="200" placeholder="e.g. Order cancelled"></label>`,
      onSubmit: async v => { const ok = await confirmDialog({ title: 'Confirm refund', message: `Refund ${rupee(v.amount)} to ${esc(o.customer_name)}? This can't be undone.`, confirm: 'Refund now', danger: true });
        if (!ok) return false; await post(`/admin/orders/${o.id}/refund`, v); toast('Refund issued'); load(); } });
  }
  async function assignBox() {
    const box = $('#assignBox', view); const a = o.assignment;
    const closed = ['delivered', 'completed', 'cancelled', 'refunded'].includes(o.status);
    box.innerHTML = a ? `<div class="row"><span class="avatar">${esc(a.staff_name.split(' ').map(w => w[0]).join('').slice(0, 2))}</span><div><b>${esc(a.staff_name)}</b><span class="sub small muted" style="display:block">${badge(a.status, a.status.replace(/_/g, ' '))} · assigned ${ago(a.assigned_at)}</span></div></div>` : '<p class="muted small">No delivery person assigned yet.</p>';
    if (!can('delivery.assign') || closed) return;
    const staff = await get('/admin/deliveries/staff').catch(() => []);
    box.insertAdjacentHTML('beforeend', staff.length ? `<div class="row"><select class="select" id="staffSel" aria-label="Delivery person" style="flex:1"><option value="">Choose delivery person</option>${staff.map(s => `<option value="${s.id}" ${a?.staff_id === s.id ? 'selected' : ''}>${esc(s.name)} · ${s.active_count} active</option>`).join('')}</select>
      <button class="btn btn-primary btn-sm" id="assignBtn">${a ? 'Reassign' : 'Assign'}</button>${a ? '<button class="btn-link small" id="unassign">Remove</button>' : ''}</div>
      ${a ? `<a class="btn btn-ghost btn-xs" href="${waLink(a.staff_phone, `Delivery ${o.order_number}\n${o.customer_name} · ${o.customer_phone}\n${o.address}${o.landmark ? ' (' + o.landmark + ')' : ''}\n${o.lat != null ? `https://www.google.com/maps?q=${o.lat},${o.lng}\n` : ''}${o.items.map(i => `${i.quantity} x ${i.name} (${i.size_label})`).join('\n')}\n${o.payment_status === 'paid' ? 'PAID ONLINE' : 'Collect ' + rupee(o.total)}`)}" target="_blank" rel="noopener">${icon('wa')} Send details to ${esc(a.staff_name.split(' ')[0])}</a>` : ''}`
      : `<p class="small muted">Add staff with the Delivery Staff role in <a href="#/staff">Staff & roles</a> to assign deliveries.</p>`);
    $('#assignBtn', view)?.addEventListener('click', async () => { const sid = $('#staffSel', view).value; if (!sid) return toast('Choose a delivery person first', 'err');
      try { await put(`/admin/orders/${o.id}/assignment`, { staff_id: Number(sid) }); toast('Delivery person assigned'); load(); } catch (x) { toastError(x); } });
    $('#unassign', view)?.addEventListener('click', async () => { try { await put(`/admin/orders/${o.id}/assignment`, { staff_id: null }); load(); } catch (x) { toastError(x); } });
  }
  await load();
  const onOrder = e => { if (e.detail?.id === id) load(); };
  bus.addEventListener('order', onOrder);
  return () => bus.removeEventListener('order', onOrder);
}

// ---------- Manual order ----------
async function manualOrder(view) {
  const [menu, cfg] = await Promise.all([get('/menu'), get('/public/config')]);
  const cart = new Map();
  let quote = null;
  view.innerHTML = `<a class="back" href="#/orders">${icon('back')} Orders</a><div class="page-head"><div><h1>New manual order</h1><p>For phone and walk-in orders. Prices, offers and delivery fees are calculated exactly like the website.</p></div></div>
    <div class="cols-2"><div class="stack">
      <div class="card"><div class="card-head"><h2>Items</h2><input class="input" id="itemSearch" type="search" placeholder="Search menu" style="max-width:220px" aria-label="Search menu"></div><div class="card-body" id="menuPick"></div></div>
    </div><form class="stack" id="moForm" novalidate>
      <div class="card card-pad stack"><h2>Customer</h2>
        <div class="grid-2"><label class="field"><span>Phone</span><input class="input" name="phone" inputmode="tel" required placeholder="10-digit mobile" id="moPhone"></label><label class="field"><span>Name</span><input class="input" name="customer_name" required></label></div>
        <label class="field"><span>Email (optional)</span><input class="input" name="email" type="email"></label>
        <div class="seg" role="radiogroup" aria-label="Fulfilment"><label><input type="radio" name="fulfilment" value="delivery" checked><span>Delivery</span></label><label><input type="radio" name="fulfilment" value="pickup"><span>Pickup</span></label></div>
        <div id="deliveryFields" class="stack">
          <label class="field"><span>Address</span><textarea class="textarea" name="address" rows="2" style="min-height:64px"></textarea></label>
          <label class="field"><span>Landmark</span><input class="input" name="landmark"></label>
          <label class="field"><span>Location (Google Maps link or "lat, lng")</span><input class="input" name="loc" placeholder="https://maps.google.com/?q=27.03,95.02" id="locInput"><small>Needed to calculate distance and delivery charge. Ask the customer to share their location on WhatsApp.</small></label>
        </div>
        <label class="field" id="pickupField" hidden><span>Pickup at</span><select class="select" name="area_id">${cfg.areas.filter(a => a.pickup_enabled).map(a => `<option value="${a.id}">${esc(a.name)}</option>`).join('')}</select></label>
        <label class="field"><span>Time slot</span><select class="select" name="slot_key" id="slotSel"><option value="">Add items to see slots</option></select></label>
        <div class="grid-2"><label class="field"><span>Payment</span><select class="select" name="payment_method"><option value="cod">Cash on delivery / at counter</option></select></label><label class="field"><span>Coupon</span><input class="input" name="coupon_code" style="text-transform:uppercase"></label></div>
        <label class="field"><span>Special instructions</span><input class="input" name="notes" maxlength="500"></label>
      </div>
      <div class="card card-pad stack"><h2>Summary</h2><div id="moSummary" class="lines"><p class="muted small">Add items to see the total.</p></div><div class="form-error" hidden></div>
        <button class="btn btn-primary" type="submit" id="moSubmit" style="height:48px">Create order</button></div>
    </form></div>`;
  const form = $('#moForm', view);
  const drawMenu = () => { const q = $('#itemSearch', view).value.toLowerCase();
    $('#menuPick', view).innerHTML = menu.items.filter(i => !q || i.name.toLowerCase().includes(q)).map(i => `<div class="row" style="padding:10px 0;border-bottom:1px solid var(--line-2)"><img class="thumb" src="${imgSrc(i.image)}" alt=""><div style="flex:1;min-width:0"><b>${esc(i.name)}</b>${i.available ? '' : ' ' + badge('out', 'Sold out')}<div class="row" style="gap:6px;margin-top:4px">${i.sizes.map(s => { const k = `${i.id}|${s.id}`, qn = cart.get(k)?.quantity || 0;
      return `<span class="row" style="gap:4px;border:1px solid var(--line);border-radius:999px;padding:2px 4px 2px 10px"><span class="small">${esc(s.label)} ${rupee(s.price)}</span><button type="button" class="icon-btn" style="width:28px;height:28px" data-dec="${k}" ${qn ? '' : 'disabled'} aria-label="Remove one">−</button><b class="num" style="min-width:14px;text-align:center">${qn}</b><button type="button" class="icon-btn" style="width:28px;height:28px" data-inc="${k}" ${i.available ? '' : 'disabled'} aria-label="Add one">+</button></span>`; }).join('')}</div></div></div>`).join('') || '<p class="muted">No items match.</p>';
  };
  $('#itemSearch', view).oninput = drawMenu;
  $('#menuPick', view).onclick = e => { const b = e.target.closest('[data-inc],[data-dec]'); if (!b) return; const k = b.dataset.inc || b.dataset.dec, [item_id, size_id] = k.split('|').map(Number);
    const cur = cart.get(k)?.quantity || 0, n = cur + (b.dataset.inc ? 1 : -1); if (n <= 0) cart.delete(k); else cart.set(k, { item_id, size_id, quantity: Math.min(20, n) }); drawMenu(); requote(); };
  const parseLoc = v => { const m = String(v).match(/(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/) || String(v).match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/) || String(v).match(/@(-?\d+\.\d+),(-?\d+\.\d+)/); return m ? { lat: Number(m[1]), lng: Number(m[2]) } : {}; };
  const body = () => { const f = new FormData(form); const loc = parseLoc(f.get('loc') || ''); const pickup = f.get('fulfilment') === 'pickup';
    return { customer_name: f.get('customer_name'), phone: f.get('phone'), email: f.get('email'), fulfilment: f.get('fulfilment'), area_id: pickup ? Number(f.get('area_id')) : undefined,
      address: pickup ? '' : f.get('address'), landmark: f.get('landmark'), ...(pickup ? {} : loc), slot_key: f.get('slot_key'), payment_method: 'cod', coupon_code: f.get('coupon_code'), notes: f.get('notes'), items: [...cart.values()] }; };
  const requote = debounce(async () => {
    const b = body(); const sum = $('#moSummary', view);
    if (!b.items.length) { sum.innerHTML = '<p class="muted small">Add items to see the total.</p>'; return; }
    try { quote = await post('/admin/orders/quote', { items: b.items, fulfilment: b.fulfilment, area_id: b.area_id, lat: b.lat, lng: b.lng, coupon_code: b.coupon_code, phone: (d => d.length === 10 ? d : '')(String(b.phone || '').replace(/\D/g, '').slice(-10)) }); }
    catch (x) { sum.innerHTML = `<p style="color:var(--err)" class="small">${esc(x.message)}</p>`; return; }
    sum.innerHTML = `${quote.lines.map(l => `<div class="ln"><span>${l.quantity} × ${esc(l.name)} (${esc(l.size_label)})</span><span class="num">${rupee(l.line_total)}</span></div>`).join('')}
      <div class="ln"><span class="muted">Subtotal</span><span class="num">${rupee(quote.subtotal)}</span></div>
      ${quote.offer ? `<div class="ln disc"><span>${esc(quote.offer.title)}</span><span class="num">−${rupee(quote.offer.discount)}</span></div>` : ''}
      ${quote.coupon ? `<div class="ln ${quote.coupon.valid ? 'disc' : ''}"><span>Coupon ${esc(quote.coupon.code)}${quote.coupon.valid ? '' : ` <span style="color:var(--err)">· ${esc(quote.coupon.message)}</span>`}</span><span class="num">${quote.coupon.valid ? '−' + rupee(quote.coupon.discount) : ''}</span></div>` : ''}
      ${quote.delivery ? `<div class="ln"><span class="muted">Delivery ${quote.delivery.eligible ? `· ${quote.delivery.distance_km} km · ${esc(quote.area?.name || '')}` : `<span style="color:var(--err)">· ${esc(quote.delivery.message)}</span>`}</span><span class="num">${rupee(quote.delivery_fee)}</span></div>` : ''}
      ${quote.tax ? `<div class="ln"><span class="muted">Tax</span><span class="num">${rupee(quote.tax)}</span></div>` : ''}
      <div class="ln total"><span>Total</span><span class="num">${rupee(quote.total)}</span></div>${quote.warnings.map(w => `<p class="small" style="color:var(--warn)">${esc(w)}</p>`).join('')}`;
    const sel = $('#slotSel', view), prev = sel.value;
    sel.innerHTML = quote.slots.length ? quote.slots.map(s => `<option value="${esc(s.key)}">${esc(s.display)}</option>`).join('') : '<option value="">No slots available</option>';
    if (quote.slots.some(s => s.key === prev)) sel.value = prev;
  }, 300);
  form.addEventListener('input', e => { if (e.target.name !== 'slot_key' && e.target.name !== 'notes') requote(); });
  form.addEventListener('change', e => { if (e.target.name === 'fulfilment') { const p = e.target.value === 'pickup'; $('#deliveryFields', view).hidden = p; $('#pickupField', view).hidden = !p; requote(); } });
  // Look up a returning customer by phone to fill in their details.
  $('#moPhone', view).addEventListener('change', async e => {
    const d = e.target.value.replace(/\D/g, '').slice(-10); if (d.length !== 10 || !can('customers.view')) return;
    const r = await get('/admin/customers', { q: d, limit: 1 }).catch(() => null); const c = r?.rows?.[0]; if (!c) return;
    if (!form.customer_name.value) form.customer_name.value = c.name; if (!form.email.value) form.email.value = c.email || '';
    const full = await get(`/admin/customers/${c.id}`).catch(() => null); const a = full?.addresses?.[0];
    if (a && !form.address.value) { form.address.value = a.address; form.landmark.value = a.landmark; if (a.lat != null) form.loc.value = `${a.lat}, ${a.lng}`; requote(); }
    toast(`Returning customer: ${c.name} (${c.orders_count} orders)`);
  });
  form.onsubmit = async e => { e.preventDefault(); const err = $('.form-error', form); err.hidden = true;
    const b = body(); if (!b.items.length) { err.textContent = 'Add at least one item.'; err.hidden = false; return; }
    const btn = $('#moSubmit', view); btn.classList.add('is-loading');
    try { const o = await post('/admin/orders', { ...b, phone: b.phone }); toast(`Order ${o.order_number} created`); go(`orders/${o.id}`); }
    catch (x) { err.textContent = x.message; err.hidden = false; } finally { btn.classList.remove('is-loading'); } };
  drawMenu();
}
