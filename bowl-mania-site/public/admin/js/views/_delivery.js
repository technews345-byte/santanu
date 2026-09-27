// Delivery panel on the order page: rider, live step, pickup code for the kitchen, proof of delivery,
// rejections, and manager actions (new code, override) when the normal rider flow can't be completed.
import { get, put, post } from '../api.js';
import { $, esc, icon, badge, ago, fmtDateTime, rupee, toast, toastError, formDialog, confirmDialog, waLink } from '../ui.js';
import { can } from '../app.js';

export const DSTEP = {
  assigned: 'Assigned', accepted: 'Accepted', to_restaurant: 'Going to restaurant', at_restaurant: 'At restaurant', picked_up: 'Picked up',
  out_for_delivery: 'Out for delivery', at_customer: 'At customer', otp_verified: 'Code verified', delivered: 'Delivered',
  rejected: 'Rejected', cash_collected: 'Cash received', proof: 'Proof submitted'
};
const FLOW = ['assigned', 'accepted', 'to_restaurant', 'at_restaurant', 'picked_up', 'out_for_delivery', 'at_customer', 'otp_verified', 'delivered'];

export async function deliveryPanel(o, box, reload) {
  const a = o.assignment;
  const closed = ['delivered', 'completed', 'cancelled', 'refunded'].includes(o.status);
  const manage = can('delivery.assign');
  const parts = [];
  if (a) {
    const step = FLOW.indexOf(a.status);
    parts.push(`<div class="row"><span class="avatar">${esc(a.staff_name.split(' ').map(w => w[0]).join('').slice(0, 2))}</span>
      <div style="flex:1"><b>${esc(a.staff_name)}</b><span class="sub small muted" style="display:block">${badge(a.status === 'delivered' ? 'delivered' : 'out_for_delivery', DSTEP[a.status])} · assigned ${ago(a.assigned_at)}</span></div>
      ${a.staff_phone ? `<a class="icon-btn" href="tel:+91${esc(a.staff_phone)}" title="Call rider" aria-label="Call rider">${icon('phone')}</a>` : ''}</div>`);
    parts.push(`<div class="step-bar" role="img" aria-label="Delivery progress: ${esc(DSTEP[a.status])}">${FLOW.slice(1).map((s, i) => `<span class="${i + 1 <= step ? 'on' : ''}" title="${esc(DSTEP[s])}"></span>`).join('')}</div>`);
    if (!closed && step < FLOW.indexOf('picked_up')) {
      parts.push(`<div class="otp-box"><span class="small muted">Pickup code: the kitchen tells this to the rider at handover</span><b class="otp">${esc(a.pickup_otp)}</b>
        ${a.pickup_otp_attempts ? `<span class="small" style="color:var(--warn)">${a.pickup_otp_attempts} wrong ${a.pickup_otp_attempts === 1 ? 'try' : 'tries'}</span>` : ''}
        ${manage ? '<button class="btn-link small" data-newotp="pickup">New code</button>' : ''}</div>`);
    }
    if (!closed && step >= FLOW.indexOf('out_for_delivery') && step < FLOW.indexOf('otp_verified') && manage) {
      parts.push(`<div class="row small"><span class="muted">Delivery code is on the customer's tracking page.</span>${a.delivery_otp_attempts ? `<span style="color:var(--warn)">${a.delivery_otp_attempts} wrong</span>` : ''}
        <span class="spacer"></span><button class="btn-link small" data-reveal>Show code</button><button class="btn-link small" data-newotp="delivery">New code</button></div><b class="otp" id="dotp" hidden>${esc(a.delivery_otp)}</b>`);
    }
    if (o.payment_method === 'cod' && a.cash_collected_at) parts.push(`<div class="row small">${badge('paid', 'Cash received')} <span>${rupee(a.cash_collected_amount)} · ${fmtDateTime(a.cash_collected_at)}</span></div>`);
    if (a.proof_at) {
      parts.push(`<div class="proof"><span class="small muted">Proof of delivery · ${fmtDateTime(a.proof_at)}${a.proof_lat != null ? ` · <a href="https://www.google.com/maps?q=${a.proof_lat},${a.proof_lng}" target="_blank" rel="noopener">location</a>` : ''}</span>
        <div class="row">${a.proof_photo_url ? `<a href="${esc(a.proof_photo_url)}" target="_blank" rel="noopener"><img src="${esc(a.proof_photo_url)}" alt="Delivery photo" loading="lazy"></a>` : ''}
        ${a.proof_signature_url ? `<a href="${esc(a.proof_signature_url)}" target="_blank" rel="noopener"><img class="sig" src="${esc(a.proof_signature_url)}" alt="Customer signature" loading="lazy"></a>` : ''}</div>
        ${a.proof_note ? `<p class="small">“${esc(a.proof_note)}”</p>` : ''}</div>`);
    }
    if (a.override_reason) parts.push(`<p class="small" style="color:var(--warn)">Completed by a manager: ${esc(a.override_reason)}</p>`);
  } else parts.push(`<p class="muted small">No delivery person yet.</p>`);
  if (o.rejections?.length) parts.push(`<div class="small">${o.rejections.map(r => `<div>${badge('cancelled', 'Rejected')} <b>${esc(r.staff_name)}</b> ${r.reason ? '· ' + esc(r.reason) : ''} <span class="muted">${ago(r.created_at)}</span></div>`).join('')}</div>`);
  if (o.delivery_events?.length > 1) parts.push(`<details class="small"><summary>Delivery log (${o.delivery_events.length})</summary><ul class="plain">${o.delivery_events.map(e => `<li><span class="muted">${fmtDateTime(e.created_at)}</span> · ${esc(DSTEP[e.step] || e.step)}${e.by_name ? ` · ${esc(e.by_name)}` : ''}${e.note ? ` · ${esc(e.note)}` : ''}${e.lat != null ? ` · <a href="https://www.google.com/maps?q=${e.lat},${e.lng}" target="_blank" rel="noopener">map</a>` : ''}</li>`).join('')}</ul></details>`);
  box.innerHTML = parts.join('');

  $('[data-reveal]', box)?.addEventListener('click', e => { $('#dotp', box).hidden = false; e.target.remove(); });
  box.querySelectorAll('[data-newotp]').forEach(b => b.onclick = async () => {
    const kind = b.dataset.newotp;
    if (!(await confirmDialog({ title: `New ${kind} code?`, message: `The old ${kind} code stops working${kind === 'delivery' ? ' and the customer sees the new one on their tracking page' : ''}.`, confirm: 'Make new code' }))) return;
    try { await post(`/admin/orders/${o.id}/delivery/otp`, { kind }); toast('New code created'); reload(); } catch (x) { toastError(x); }
  });
  if (!manage || closed) return;
  const staff = await get('/admin/deliveries/staff').catch(() => []);
  const overrideTo = a && FLOW.indexOf(a.status) < FLOW.indexOf('picked_up') ? 'picked_up' : a && FLOW.indexOf(a.status) < FLOW.indexOf('out_for_delivery') ? 'out_for_delivery' : a ? 'delivered' : null;
  box.insertAdjacentHTML('beforeend', staff.length ? `<div class="row"><select class="select" id="staffSel" aria-label="Delivery person" style="flex:1"><option value="">Choose delivery person</option>${staff.map(s => `<option value="${s.id}" ${a?.staff_id === s.id ? 'selected' : ''}>${esc(s.name)} · ${s.active_count} active</option>`).join('')}</select>
      <button class="btn btn-primary btn-sm" id="assignBtn">${a ? 'Reassign' : 'Assign'}</button>${a ? '<button class="btn-link small" id="unassign">Remove</button>' : ''}</div>
      ${a ? `<div class="row"><a class="btn btn-ghost btn-xs" href="${waLink(a.staff_phone, `Delivery ${o.order_number}: ${o.customer_name}, ${o.address}`)}" target="_blank" rel="noopener">${icon('wa')} Message rider</a>
        ${overrideTo ? `<button class="btn btn-ghost btn-xs" id="override" title="Use only when the rider can't complete the step in the app">Mark ${esc(DSTEP[overrideTo].toLowerCase())}…</button>` : ''}</div>` : ''}`
    : `<p class="small muted">Add staff with the Delivery Staff role in <a href="#/staff">Staff & roles</a> to assign deliveries.</p>`);
  $('#assignBtn', box)?.addEventListener('click', async () => { const sid = $('#staffSel', box).value; if (!sid) return toast('Choose a delivery person first', 'err');
    try { await put(`/admin/orders/${o.id}/assignment`, { staff_id: Number(sid) }); toast('Delivery person assigned. They get a notification in the app.'); reload(); } catch (x) { toastError(x); } });
  $('#unassign', box)?.addEventListener('click', async () => { try { await put(`/admin/orders/${o.id}/assignment`, { staff_id: null }); reload(); } catch (x) { toastError(x); } });
  $('#override', box)?.addEventListener('click', () => formDialog({ title: `Mark ${DSTEP[overrideTo].toLowerCase()} without the rider app?`, size: 'narrow', submit: 'Confirm',
    fields: `<p class="small muted">This skips the ${overrideTo === 'delivered' ? 'delivery code and proof' : 'pickup code'} check. It is recorded in the audit log with your name.</p>
      <label class="field"><span>Reason</span><input class="input" name="reason" required minlength="3" maxlength="200" placeholder="${overrideTo === 'delivered' ? 'e.g. Customer lost the code; confirmed by phone' : 'e.g. Rider\'s phone is off'}"></label>`,
    onSubmit: async v => { await post(`/admin/orders/${o.id}/delivery/override`, { step: overrideTo, reason: v.reason }); toast('Updated'); reload(); } }));
}
