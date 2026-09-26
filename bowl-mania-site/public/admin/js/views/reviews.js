import { get, patch, del } from '../api.js';
import { $, $$, esc, icon, badge, stars, fmtDate, toast, toastError, confirmDialog, emptyState, errorState, pager } from '../ui.js';

export async function render(view) {
  const f = { status: '', page: 1 };
  view.innerHTML = `<div class="page-head"><div><h1>Reviews</h1><p>Customers can review an order from their tracking page once it's delivered. Approved reviews show on the website; featured ones show first.</p></div></div>
    <div class="row" style="margin-bottom:14px"><div class="chips" id="chips"></div><span class="spacer"></span><span id="avg" class="small muted"></span></div><div class="card" id="list"></div>`;
  async function load() {
    let r; try { r = await get('/admin/reviews', f); } catch (e) { $('#list', view).innerHTML = errorState(e); $('[data-retry]', view).onclick = load; return; }
    $('#chips', view).innerHTML = [['', 'All'], ['pending', `Waiting${r.stats.pending ? ` (${r.stats.pending})` : ''}`], ['approved', 'Approved'], ['hidden', 'Hidden']].map(([k, l]) => `<button class="chip" data-s="${k}" aria-pressed="${f.status === k}">${l}</button>`).join('');
    $$('[data-s]', view).forEach(b => b.onclick = () => { f.status = b.dataset.s; f.page = 1; load(); });
    $('#avg', view).innerHTML = r.stats.n ? `Average ${stars(Math.round(r.stats.avg))} <b>${r.stats.avg}</b> from ${r.stats.n} reviews` : '';
    const el = $('#list', view);
    if (!r.rows.length) { el.innerHTML = emptyState('star', 'No reviews here yet', 'Share tracking links with customers — they can rate their bowl after delivery.'); return; }
    el.innerHTML = r.rows.map(v => `<div class="review-card" data-id="${v.id}"><div class="row">${stars(v.rating)}<b>${esc(v.customer_name)}</b><span class="muted small">${fmtDate(v.created_at)}${v.order_number ? ' · ' + esc(v.order_number) : ''}</span><span class="spacer"></span>${badge(v.status)}${v.featured ? badge('ok', '★ Featured') : ''}</div>
      <p>${esc(v.comment) || '<span class="muted">No comment</span>'}</p>
      <div class="row">${v.status !== 'approved' ? '<button class="btn btn-soft btn-xs" data-act="approve">Approve</button>' : ''}${v.status !== 'hidden' ? '<button class="btn btn-ghost btn-xs" data-act="hide">Hide</button>' : ''}
        <button class="btn btn-ghost btn-xs" data-act="feature">${v.featured ? 'Unfeature' : '★ Feature on website'}</button><button class="btn btn-danger-ghost btn-xs" data-act="delete">Delete</button></div></div>`).join('');
    el.append(pager(r, p => { f.page = p; load(); }));
    el.onclick = async e => { const b = e.target.closest('[data-act]'); if (!b) return; const card = b.closest('[data-id]'), v = r.rows.find(x => x.id == card.dataset.id);
      try {
        if (b.dataset.act === 'delete') { if (!(await confirmDialog({ title: 'Delete this review?', message: 'This cannot be undone. To keep it off the website, hide it instead.', confirm: 'Delete', danger: true }))) return; await del(`/admin/reviews/${v.id}`); }
        else await patch(`/admin/reviews/${v.id}`, b.dataset.act === 'approve' ? { status: 'approved' } : b.dataset.act === 'hide' ? { status: 'hidden', featured: false } : { featured: !v.featured });
        toast('Review updated'); load();
      } catch (x) { toastError(x); } };
  }
  await load();
}
