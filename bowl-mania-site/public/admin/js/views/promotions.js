import { get, post, patch, del } from '../api.js';
import { $, $$, esc, icon, rupee, num, badge, fmtDateTime, toLocalInput, toast, toastError, confirmDialog, formDialog, emptyState, errorState } from '../ui.js';
import { photoField, mountPhotoField } from './_photo.js';

const OFFER_TYPES = { percent: '% off', flat: 'Flat ₹ off', free_delivery: 'Free delivery', bogo: 'Buy 1 Get 1', combo: 'Combo saving' };
const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const couponState = c => !c.active ? 'off' : c.starts_at && c.starts_at > now() ? 'scheduled' : c.expires_at && c.expires_at < now() ? 'ended' : c.usage_limit != null && c.used_count >= c.usage_limit ? 'ended' : 'live';
const STATE_LABEL = { live: 'Active', scheduled: 'Scheduled', ended: 'Ended', off: 'Inactive' };

export async function render(view, ctx) {
  const isOffers = ctx.path === 'offers';
  const [menu, catsRes] = await Promise.all([get('/admin/menu').catch(() => ({ items: [], categories: [] })), Promise.resolve()]);
  const items = menu.items, cats = menu.categories;
  const picker = (name, selected, list, label, hint = '') => `<fieldset class="field"><legend>${label}</legend>${hint ? `<small>${hint}</small>` : ''}<div class="chips" style="max-height:120px;overflow:auto">${list.map(x => `<label class="chip" style="cursor:pointer"><input type="checkbox" name="${name}" value="${x.id}" data-type="list" ${selected.includes(x.id) ? 'checked' : ''} style="accent-color:var(--green)"> ${esc(x.name)}</label>`).join('')}</div></fieldset>`;
  view.innerHTML = `<div class="page-head"><div><h1>${isOffers ? 'Offers' : 'Coupons'}</h1><p>${isOffers ? 'Automatic deals applied at checkout during their schedule. The best offer applies; a coupon can stack on top.' : 'Codes customers enter at checkout. Every rule is checked on the server before a discount is given.'}</p></div>
    <div class="actions"><a class="btn btn-ghost btn-sm" href="#/${isOffers ? 'coupons' : 'offers'}">${isOffers ? 'Coupons' : 'Offers'}</a><button class="btn btn-primary btn-sm" id="add">${icon('plus')} ${isOffers ? 'Create offer' : 'Create coupon'}</button></div></div><div class="card" id="list"></div>`;

  async function load() {
    let rows; try { rows = await get(isOffers ? '/admin/offers' : '/admin/coupons'); } catch (e) { $('#list', view).innerHTML = errorState(e); $('[data-retry]', view).onclick = load; return; }
    const el = $('#list', view);
    if (!rows.length) { el.innerHTML = emptyState(isOffers ? 'gift' : 'ticket', isOffers ? 'No offers yet' : 'No coupons yet', isOffers ? 'Try Free Delivery above ₹299, or 10% off Protein Bowls this weekend.' : 'Create codes like WELCOME10 or SAVE50.'); return; }
    el.innerHTML = isOffers
      ? `<div class="table-wrap"><table class="table cards"><thead><tr><th>Offer</th><th>Type</th><th>Rule</th><th>Schedule</th><th class="r">Used</th><th>Status</th><th></th></tr></thead><tbody>${rows.map(o => `<tr data-id="${o.id}"><td class="primary"><b>${esc(o.title)}</b><span class="sub">${esc(o.description)}</span></td>
          <td data-label="Type">${OFFER_TYPES[o.type]}</td><td data-label="Rule">${o.type === 'percent' ? `${o.value}% off` : o.type === 'flat' ? `${rupee(o.value)} off` : o.type === 'combo' ? `Save ${rupee(o.value)}` : OFFER_TYPES[o.type]}${o.min_order ? ` · min ${rupee(o.min_order)}` : ''}${o.max_discount != null ? ` · max ${rupee(o.max_discount)}` : ''}</td>
          <td data-label="Schedule" class="small">${o.starts_at ? fmtDateTime(o.starts_at) : 'Now'} → ${o.ends_at ? fmtDateTime(o.ends_at) : 'No end'}</td><td class="r" data-label="Used">${num(o.times_used)}</td><td data-label="Status">${badge(o.state, STATE_LABEL[o.state])}</td><td class="r"><button class="btn btn-ghost btn-xs" data-edit>Edit</button></td></tr>`).join('')}</tbody></table></div>`
      : `<div class="table-wrap"><table class="table cards"><thead><tr><th>Code</th><th>Discount</th><th>Minimum</th><th>Valid</th><th class="r">Used</th><th class="r">Given</th><th>Status</th><th></th></tr></thead><tbody>${rows.map(c => { const st = couponState(c); return `<tr data-id="${c.id}"><td class="primary"><b class="code" style="font-size:.9rem">${esc(c.code)}</b><span class="sub">${esc(c.description)}</span></td>
          <td data-label="Discount">${c.discount_type === 'percent' ? `${c.value}%` : rupee(c.value)}${c.max_discount != null ? ` <span class="muted small">max ${rupee(c.max_discount)}</span>` : ''}</td><td data-label="Minimum">${c.min_order ? rupee(c.min_order) : '—'}</td>
          <td data-label="Valid" class="small">${c.starts_at ? fmtDateTime(c.starts_at) : 'Now'} → ${c.expires_at ? fmtDateTime(c.expires_at) : 'No expiry'}</td><td class="r" data-label="Used">${num(c.used_count)}${c.usage_limit != null ? ` / ${c.usage_limit}` : ''}</td><td class="r" data-label="Discount given">${rupee(c.total_discount)}</td>
          <td data-label="Status">${badge(st, STATE_LABEL[st])}</td><td class="r"><button class="btn btn-ghost btn-xs" data-edit>Edit</button></td></tr>`; }).join('')}</tbody></table></div>`;
    el.onclick = e => { const tr = e.target.closest('tr[data-id]'); if (tr && e.target.closest('[data-edit]')) edit(rows.find(r => r.id == tr.dataset.id)); };
  }
  function edit(x) {
    const fields = isOffers ? `
      <div class="grid-2"><label class="field"><span>Title (shown to customers)</span><input class="input" name="title" required maxlength="80" value="${esc(x?.title || '')}" placeholder="Free delivery over ₹299"></label>
        <label class="field"><span>Type</span><select class="select" name="type" id="otype">${Object.entries(OFFER_TYPES).map(([k, l]) => `<option value="${k}" ${k === (x?.type || 'percent') ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
      <label class="field"><span>Description</span><input class="input" name="description" maxlength="300" value="${esc(x?.description || '')}"></label>
      <div class="grid-3"><label class="field" id="valField"><span id="valLabel">Value</span><input class="input" name="value" type="number" min="0" data-type="number" value="${x?.value ?? ''}"></label>
        <label class="field"><span>Minimum order (₹)</span><input class="input" name="min_order" type="number" min="0" data-type="number" value="${x?.min_order ?? 0}"></label>
        <label class="field"><span>Maximum discount (₹)</span><input class="input" name="max_discount" type="number" min="0" value="${x?.max_discount ?? ''}" placeholder="No limit"></label></div>
      ${picker('item_ids', x?.item_ids || [], items, 'Items', 'BOGO/%/flat: limit to these items (none = all). Combo: all selected items must be in the cart.')}
      ${picker('category_ids', x?.category_ids || [], cats, 'Categories', 'Limit to these categories (none = all).')}
      <div class="grid-2"><label class="field"><span>Starts</span><input class="input" type="datetime-local" name="starts_at" value="${toLocalInput(x?.starts_at)}"><small>Empty = now</small></label>
        <label class="field"><span>Ends</span><input class="input" type="datetime-local" name="ends_at" value="${toLocalInput(x?.ends_at)}"><small>Empty = no end</small></label></div>
      ${photoField('image', x?.image || '', 'Banner image (optional)')}
      <label class="check"><input type="checkbox" name="active" ${x ? (x.active ? 'checked' : '') : 'checked'}> Active</label>`
      : `<div class="grid-2"><label class="field"><span>Code</span><input class="input" name="code" required maxlength="20" value="${esc(x?.code || '')}" style="text-transform:uppercase" placeholder="WELCOME10"></label>
        <label class="field"><span>Description</span><input class="input" name="description" maxlength="200" value="${esc(x?.description || '')}"></label>
        <label class="field"><span>Discount type</span><select class="select" name="discount_type"><option value="percent" ${x?.discount_type !== 'fixed' ? 'selected' : ''}>Percentage</option><option value="fixed" ${x?.discount_type === 'fixed' ? 'selected' : ''}>Fixed amount (₹)</option></select></label>
        <label class="field"><span>Value</span><input class="input" name="value" type="number" min="1" required data-type="number" value="${x?.value ?? ''}"></label>
        <label class="field"><span>Minimum order (₹)</span><input class="input" name="min_order" type="number" min="0" data-type="number" value="${x?.min_order ?? 0}"></label>
        <label class="field"><span>Maximum discount (₹)</span><input class="input" name="max_discount" type="number" min="0" value="${x?.max_discount ?? ''}" placeholder="No limit"></label>
        <label class="field"><span>Starts</span><input class="input" type="datetime-local" name="starts_at" value="${toLocalInput(x?.starts_at)}"></label>
        <label class="field"><span>Expires</span><input class="input" type="datetime-local" name="expires_at" value="${toLocalInput(x?.expires_at)}"></label>
        <label class="field"><span>Total uses allowed</span><input class="input" name="usage_limit" type="number" min="0" value="${x?.usage_limit ?? ''}" placeholder="Unlimited"></label>
        <label class="field"><span>Uses per customer</span><input class="input" name="per_customer_limit" type="number" min="0" value="${x?.per_customer_limit ?? ''}" placeholder="Unlimited"></label></div>
      ${picker('category_ids', x?.category_ids || [], cats, 'Applies to categories', 'None selected = whole order')}
      ${picker('item_ids', x?.item_ids || [], items, 'Applies to items', 'None selected = whole order')}
      <label class="check"><input type="checkbox" name="active" ${x ? (x.active ? 'checked' : '') : 'checked'}> Active</label>`;
    const base = isOffers ? '/admin/offers' : '/admin/coupons';
    const m = formDialog({ title: x ? `Edit ${isOffers ? x.title : x.code}` : isOffers ? 'Create offer' : 'Create coupon', size: 'wide', submit: 'Save',
      extraFooter: x ? '<button class="btn btn-danger-ghost" type="button" data-delete>Delete</button>' : '', fields,
      onMount: form => { if (!isOffers) return; mountPhotoField(form, 'image', 'banner');
        const sync = () => { const t = $('#otype', form).value; $('#valField', form).hidden = ['free_delivery', 'bogo'].includes(t); $('#valLabel', form).textContent = t === 'percent' ? 'Percent off' : t === 'combo' ? 'Saving (₹)' : 'Amount off (₹)'; };
        $('#otype', form).onchange = sync; sync(); },
      onSubmit: async v => { const body = { ...v, item_ids: (v.item_ids || []).map(Number), category_ids: (v.category_ids || []).map(Number), value: v.value ?? 0 };
        if (x) await patch(`${base}/${x.id}`, body); else await post(base, body); toast('Saved'); load(); } });
    $('[data-delete]', m.el)?.addEventListener('click', async () => {
      if (!(await confirmDialog({ title: 'Delete?', message: isOffers ? 'The offer stops applying immediately.' : 'Used coupons are turned off instead of deleted, so order history stays accurate.', confirm: 'Delete', danger: true }))) return;
      try { const r = await del(`${base}/${x.id}`); m.close(); toast(r.deactivated ? 'Coupon turned off (it has been used)' : 'Deleted'); load(); } catch (e) { toastError(e); } });
  }
  $('#add', view).onclick = () => edit(null);
  await load();
  if (ctx.query.new) edit(null);
}
