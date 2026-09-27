// Rider support tickets and emergencies raised from the Bowl Mania Rider app.
import { get, post, patch } from '../api.js';
import { $, $$, esc, icon, badge, ago, fmtDateTime, toast, toastError, emptyState, errorState } from '../ui.js';
import { go, bus, state } from '../app.js';

const LABEL = { open: 'Open', in_progress: 'In progress', resolved: 'Resolved' };
const URGENT = new Set(['emergency', 'accident', 'safety']);

export async function render(view, ctx) {
  if (ctx.params[0]) return detail(view, Number(ctx.params[0]));
  const f = { status: '' };
  view.innerHTML = `<div class="page-head"><div><h1>Rider support</h1><p>Issues and emergencies from delivery staff. Emergencies are listed first.</p></div></div>
    <div class="chips" id="chips" style="margin-bottom:14px"></div><div class="card" id="list"><span class="skel" style="height:180px"></span></div>`;
  async function load() {
    let r; try { r = await get('/admin/support', f); } catch (e) { $('#list', view).innerHTML = errorState(e); $('[data-retry]', view).onclick = load; return; }
    state.counts.support = r.counts.open || 0;
    $('#chips', view).innerHTML = [['', 'All'], ...Object.entries(LABEL)].map(([k, l]) => `<button class="chip" data-s="${k}" aria-pressed="${f.status === k}">${l}${k ? ` <em>${r.counts[k] || 0}</em>` : ''}</button>`).join('');
    $$('[data-s]', view).forEach(b => b.onclick = () => { f.status = b.dataset.s; load(); });
    $('#list', view).innerHTML = r.rows.length ? `<div class="table-wrap"><table class="table cards"><thead><tr><th>Issue</th><th>Rider</th><th>Order</th><th>Status</th><th>Raised</th></tr></thead><tbody>
      ${r.rows.map(t => `<tr class="clickable ${t.priority === 'urgent' && t.status !== 'resolved' ? 'urgent-row' : ''}" data-id="${t.id}"><td class="primary"><b>${t.priority === 'urgent' ? '🚨 ' : ''}${esc(t.subject)}</b><span class="sub">${esc((t.first_message || '').slice(0, 90))}</span></td>
        <td data-label="Rider">${esc(t.rider_name)}</td><td data-label="Order">${t.order_number ? esc(t.order_number) : '—'}</td><td data-label="Status">${badge(t.status, LABEL[t.status])}</td><td data-label="Raised">${ago(t.created_at)}</td></tr>`).join('')}</tbody></table></div>`
      : emptyState('chat', 'No support tickets', 'Riders raise issues and emergencies from the Support and Safety screens in the app.');
    $$('tr[data-id]', view).forEach(tr => tr.onclick = () => go(`support/${tr.dataset.id}`));
  }
  await load();
  const on = e => { if (/rider_(support|emergency)/.test(e.detail?.type || '')) load(); };
  bus.addEventListener('notification', on);
  return () => bus.removeEventListener('notification', on);
}

async function detail(view, id) {
  const back = `<a class="back" href="#/support">${icon('back')} Rider support</a>`;
  let t;
  async function load() {
    try { t = await get(`/admin/support/${id}`); } catch (e) { view.innerHTML = back + errorState(e, false); return; }
    const urgent = URGENT.has(t.category);
    view.innerHTML = `${back}<div class="card card-pad order-hero ${urgent && t.status !== 'resolved' ? 'urgent-hero' : ''}"><div><h1>${urgent ? '🚨 ' : ''}${esc(t.subject)}</h1>
        <p class="muted">${esc(t.rider_name)} · ${fmtDateTime(t.created_at)}${t.order_number ? ` · order <a href="#/orders/${t.order_id}">${esc(t.order_number)}</a>` : ''}</p></div>
      <div class="row">${badge(t.status, LABEL[t.status])}${t.rider_phone ? `<a class="btn btn-primary btn-sm" href="tel:+91${esc(t.rider_phone)}">${icon('phone')} Call ${esc(t.rider_name.split(' ')[0])}</a>` : ''}
        ${t.lat != null ? `<a class="btn btn-ghost btn-sm" href="https://www.google.com/maps?q=${t.lat},${t.lng}" target="_blank" rel="noopener">${icon('pin')} Location</a>` : ''}
        ${t.status !== 'resolved' ? '<button class="btn btn-soft btn-sm" data-st="resolved">Mark resolved</button>' : '<button class="btn btn-ghost btn-sm" data-st="open">Reopen</button>'}</div></div>
      <div class="card" style="margin-top:16px"><div class="card-body stack">${t.messages.map(m => `<div class="msg ${m.from_rider ? '' : 'mine'}"><div class="small muted">${esc(m.author || (m.from_rider ? t.rider_name : 'Staff'))} · ${fmtDateTime(m.created_at)}</div>
          <p>${esc(m.body)}</p>${m.attachment_url ? `<a href="${esc(m.attachment_url)}" target="_blank" rel="noopener"><img class="attach" src="${esc(m.attachment_url)}" alt="Attachment" loading="lazy"></a>` : ''}</div>`).join('')}
        <form id="reply" class="stack-sm"><label class="field"><span>Reply to ${esc(t.rider_name.split(' ')[0])} <em>(shown in the app)</em></span><textarea class="textarea" name="message" required maxlength="2000" rows="3"></textarea></label>
          <div class="row"><button class="btn btn-primary btn-sm" type="submit">Send reply</button><label class="check small"><input type="checkbox" name="resolve"> Mark resolved</label></div></form></div></div>`;
    $$('[data-st]', view).forEach(b => b.onclick = async () => { try { await patch(`/admin/support/${id}`, { status: b.dataset.st }); toast(`Ticket ${LABEL[b.dataset.st].toLowerCase()}`); load(); } catch (x) { toastError(x); } });
    $('#reply', view).onsubmit = async e => {
      e.preventDefault(); const fm = e.target; const message = fm.message.value.trim(); if (!message) return;
      try { await post(`/admin/support/${id}/messages`, { message, ...(fm.resolve.checked ? { status: 'resolved' } : {}) }); toast('Reply sent to the rider'); load(); } catch (x) { toastError(x); }
    };
  }
  await load();
}
