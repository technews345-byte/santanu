import { get, patch, put } from '../api.js';
import { $, $$, esc, icon, rupee, statusBadge, badge, fmtTime, ago, toast, toastError, emptyState, errorState, waLink, confirmDialog } from '../ui.js';
import { can, bus } from '../app.js';

const DSTEP = { assigned: 'Assigned', picked_up: 'Picked up', out_for_delivery: 'Out for delivery', delivered: 'Delivered' };
const mapLink = o => o.lat != null ? `https://www.google.com/maps/dir/?api=1&destination=${o.lat},${o.lng}` : `https://www.google.com/maps/search/${encodeURIComponent(o.address)}`;

export async function render(view, ctx) {
  const mine = ctx.path === 'my-deliveries';
  async function load() {
    let data;
    try { data = mine ? { active: await get('/admin/deliveries/mine') } : await get('/admin/deliveries'); }
    catch (e) { view.querySelector('#board').innerHTML = errorState(e); $('[data-retry]', view).onclick = load; return; }
    const active = mine ? data.active.filter(o => o.delivery_status !== 'delivered') : data.active;
    const done = mine ? data.active.filter(o => o.delivery_status === 'delivered') : data.done_today;
    const card = o => {
      const next = { assigned: 'picked_up', picked_up: 'out_for_delivery', out_for_delivery: 'delivered' }[o.delivery_status];
      const cash = o.payment_status !== 'paid';
      return `<article class="delivery-card">
        <div class="top"><div><b>${esc(o.order_number)}</b><span class="small muted" style="display:block">${esc(o.slot_label || '')} ${o.slot_start ? esc(o.slot_start) + '–' + esc(o.slot_end) : ''} · ETA ${fmtTime(o.estimated_at)}</span></div>${statusBadge(o.status)}</div>
        <div><b>${esc(o.customer_name)}</b> · <a href="tel:+91${esc(o.customer_phone)}">${esc(o.customer_phone)}</a><p class="small">${esc(o.address)}${o.landmark ? ` <span class="muted">(${esc(o.landmark)})</span>` : ''}</p></div>
        <p class="small muted">${esc(o.items_text || '')}</p>
        <div class="row small"><span>${o.distance_km ?? '—'} km · ${esc(o.area_name || '')}</span><span class="spacer"></span>${cash ? `<b style="color:var(--warn)">Collect ${rupee(o.total)}</b>` : badge('paid', 'Paid online')}</div>
        ${!mine ? `<div class="row small">${o.staff_name ? `${icon('scooter')} <b>${esc(o.staff_name)}</b> ${badge(o.delivery_status, DSTEP[o.delivery_status])}` : '<span class="muted">Not assigned</span>'}</div>` : ''}
        <div class="row">
          <a class="btn btn-ghost btn-xs" href="${mapLink(o)}" target="_blank" rel="noopener">${icon('pin')} Directions</a>
          <a class="btn btn-ghost btn-xs" href="${waLink(o.customer_phone, `Hi ${o.customer_name.split(' ')[0]}, this is your Bowl Mania delivery for order ${o.order_number}.`)}" target="_blank" rel="noopener">${icon('wa')} Customer</a>
          <span class="spacer"></span>
          ${!mine && can('delivery.assign') ? `<select class="select" data-assign="${o.id}" style="width:auto;height:32px;font-size:.8rem" aria-label="Assign delivery person"><option value="">${o.staff_id ? 'Reassign…' : 'Assign…'}</option>${data.staff.map(s => `<option value="${s.id}" ${s.id === o.staff_id ? 'selected' : ''}>${esc(s.name)} (${s.active_count})</option>`).join('')}</select>` : ''}
          ${o.staff_id && next && (mine || can('delivery.assign')) ? `<button class="btn btn-primary btn-xs" data-step="${next}" data-id="${o.id}">${esc(DSTEP[next])}</button>` : ''}
        </div></article>`;
    };
    view.querySelector('#board').innerHTML = active.length ? `<div class="board">${active.map(card).join('')}</div>` : emptyState('scooter', mine ? 'No deliveries assigned to you' : 'No active deliveries', mine ? 'New jobs appear here when the team assigns them to you.' : 'Delivery orders appear here once they are placed.');
    view.querySelector('#done').innerHTML = done.length ? `<h2 style="margin:26px 0 12px">Delivered in the last 24 hours</h2><div class="card"><div class="table-wrap"><table class="table cards"><thead><tr><th>Order</th><th>Customer</th><th>Delivered by</th><th>Time</th><th class="r">Fee</th></tr></thead><tbody>${done.map(o => `<tr><td class="primary"><b>${esc(o.order_number)}</b></td><td data-label="Customer">${esc(o.customer_name)}</td><td data-label="By">${esc(o.staff_name || '')}</td><td data-label="Time">${ago(o.delivered_at)}</td><td class="r" data-label="Fee">${rupee(o.delivery_fee)}</td></tr>`).join('')}</tbody></table></div></div>` : '';
    $$('[data-assign]', view).forEach(s => s.onchange = async () => { if (!s.value) return;
      try { await put(`/admin/orders/${s.dataset.assign}/assignment`, { staff_id: Number(s.value) }); toast('Delivery person assigned'); load(); } catch (x) { toastError(x); load(); } });
    $$('[data-step]', view).forEach(b => b.onclick = async () => {
      if (b.dataset.step === 'delivered' && !(await confirmDialog({ title: 'Mark as delivered?', message: 'Confirm the customer has received the order. Cash orders are marked as paid.', confirm: 'Delivered' }))) return;
      b.classList.add('is-loading');
      try { await patch(`/admin/deliveries/${b.dataset.id}`, { status: b.dataset.step }); toast(DSTEP[b.dataset.step]); load(); } catch (x) { toastError(x); b.classList.remove('is-loading'); } });
  }
  view.innerHTML = `<div class="page-head"><div><h1>${mine ? 'My deliveries' : 'Deliveries'}</h1><p>${mine ? 'Your assigned orders. Update each step so the customer can follow along.' : 'Assign drivers and follow every delivery in real time.'}</p></div>
    <div class="actions"><button class="btn btn-ghost btn-sm" id="refresh">Refresh</button></div></div><div id="board"><span class="skel" style="height:200px"></span></div><div id="done"></div>`;
  $('#refresh', view).onclick = load;
  await load();
  const on = () => load(); bus.addEventListener('order', on);
  const t = setInterval(load, 60_000);
  return () => { bus.removeEventListener('order', on); clearInterval(t); };
}
