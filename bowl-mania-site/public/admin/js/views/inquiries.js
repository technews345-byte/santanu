import { get, patch } from '../api.js';
import { $, $$, esc, icon, badge, fmtDateTime, ago, toast, formDialog, emptyState, errorState, pager, waLink } from '../ui.js';
import { state, bus } from '../app.js';

const LABEL = { new: 'New', in_progress: 'In progress', resolved: 'Resolved' };
export async function render(view) {
  const f = { status: '', page: 1 };
  view.innerHTML = `<div class="page-head"><div><h1>Inquiries</h1><p>Messages sent from the website contact form.</p></div></div><div class="chips" id="chips" style="margin-bottom:14px"></div><div class="card" id="list"></div>`;
  async function load() {
    let r; try { r = await get('/admin/inquiries', f); } catch (e) { $('#list', view).innerHTML = errorState(e); $('[data-retry]', view).onclick = load; return; }
    state.counts.inquiries = r.counts.new || 0;
    $('#chips', view).innerHTML = [['', 'All'], ...Object.entries(LABEL)].map(([k, l]) => `<button class="chip" data-s="${k}" aria-pressed="${f.status === k}">${l}${k ? ` <em>${r.counts[k] || 0}</em>` : ''}</button>`).join('');
    $$('[data-s]', view).forEach(b => b.onclick = () => { f.status = b.dataset.s; f.page = 1; load(); });
    const el = $('#list', view);
    if (!r.rows.length) { el.innerHTML = emptyState('chat', 'No messages', 'Messages from the contact form on the website will appear here.'); return; }
    el.innerHTML = r.rows.map(q => `<div class="review-card" data-id="${q.id}"><div class="row"><b>${esc(q.name)}</b><span class="muted small">${ago(q.created_at)}</span><span class="spacer"></span>${badge(q.status, LABEL[q.status])}</div>
      <p class="small muted">${q.phone ? esc(q.phone) : ''}${q.phone && q.email ? ' · ' : ''}${q.email ? esc(q.email) : ''}</p><p>${esc(q.message)}</p>
      ${q.reply ? `<p class="small" style="border-left:3px solid var(--lime);padding-left:10px"><b>Reply${q.admin_name ? ' by ' + esc(q.admin_name) : ''}:</b> ${esc(q.reply)} <span class="muted">${fmtDateTime(q.replied_at)}</span></p>` : ''}
      <div class="row"><button class="btn btn-soft btn-xs" data-reply>${icon('chat')} Reply</button>${q.status !== 'in_progress' && q.status !== 'resolved' ? '<button class="btn btn-ghost btn-xs" data-st="in_progress">Mark in progress</button>' : ''}${q.status !== 'resolved' ? '<button class="btn btn-ghost btn-xs" data-st="resolved">Mark resolved</button>' : '<button class="btn btn-ghost btn-xs" data-st="new">Reopen</button>'}</div></div>`).join('');
    el.append(pager(r, p => { f.page = p; load(); }));
    el.onclick = async e => { const card = e.target.closest('[data-id]'); if (!card) return; const q = r.rows.find(x => x.id == card.dataset.id);
      const st = e.target.closest('[data-st]'); if (st) { await patch(`/admin/inquiries/${q.id}`, { status: st.dataset.st }); toast(`Marked ${LABEL[st.dataset.st].toLowerCase()}`); return load(); }
      if (e.target.closest('[data-reply]')) reply(q); };
  }
  function reply(q) {
    formDialog({ title: `Reply to ${q.name}`, submit: 'Save & open', fields: `<blockquote class="small muted" style="margin:0;border-left:3px solid var(--line);padding-left:10px">${esc(q.message)}</blockquote>
      <label class="field"><span>Your reply</span><textarea class="textarea" name="reply" required maxlength="2000">${esc(q.reply || `Hi ${q.name.split(' ')[0]}, thank you for contacting Bowl Mania! `)}</textarea></label>
      <fieldset class="field"><legend>Send it by</legend><div class="seg">${q.phone ? '<label><input type="radio" name="via" value="wa" checked><span>WhatsApp</span></label>' : ''}${q.email ? `<label><input type="radio" name="via" value="email" ${q.phone ? '' : 'checked'}><span>Email</span></label>` : ''}</div>
        <small>The reply is saved here and the message opens in WhatsApp or your email app, ready to send.</small></fieldset>`,
      onSubmit: async v => { await patch(`/admin/inquiries/${q.id}`, { reply: v.reply, status: 'resolved' });
        const url = v.via === 'email' ? `mailto:${encodeURIComponent(q.email)}?subject=${encodeURIComponent('Re: your message to Bowl Mania')}&body=${encodeURIComponent(v.reply)}` : waLink(q.phone, v.reply);
        window.open(url, '_blank', 'noopener'); toast('Reply saved'); load(); } });
  }
  await load();
  const on = e => { if (e.detail?.type === 'inquiry') load(); }; bus.addEventListener('notification', on);
  return () => bus.removeEventListener('notification', on);
}
