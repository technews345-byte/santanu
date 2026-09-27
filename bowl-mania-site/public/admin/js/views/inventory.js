import { get, post, patch, del } from '../api.js';
import { $, $$, esc, icon, rupee, badge, fmtDateTime, toast, toastError, confirmDialog, formDialog, emptyState, errorState } from '../ui.js';

const LEVEL = { ok: ['ok', 'In stock'], low: ['low', 'Low stock'], out: ['out', 'Out of stock'] };
export async function render(view) {
  let rows = [], show = '';
  view.innerHTML = `<div class="page-head"><div><h1>Inventory</h1><p>Track ingredients. You'll get a notification when something runs low.</p></div>
    <div class="actions"><button class="btn btn-primary btn-sm" id="add">${icon('plus')} Add ingredient</button></div></div>
    <div class="chips" id="chips" style="margin-bottom:12px"></div><div class="card" id="list"></div>`;
  async function load() {
    try { rows = await get('/admin/inventory'); } catch (e) { $('#list', view).innerHTML = errorState(e); $('[data-retry]', view).onclick = load; return; }
    const count = l => rows.filter(r => r.level === l).length;
    $('#chips', view).innerHTML = [['', 'All', rows.length], ['low', 'Low stock', count('low')], ['out', 'Out of stock', count('out')], ['ok', 'In stock', count('ok')]].map(([k, l, n]) => `<button class="chip" data-f="${k}" aria-pressed="${show === k}">${l} <em>${n}</em></button>`).join('');
    $$('[data-f]', view).forEach(b => b.onclick = () => { show = b.dataset.f; load(); });
    const list = rows.filter(r => !show || r.level === show);
    const el = $('#list', view);
    if (!list.length) { el.innerHTML = emptyState('box', rows.length ? 'Nothing here' : 'No ingredients tracked yet', rows.length ? '' : 'Add ingredients like chicken, paneer, sprouts, fruit and nuts with a minimum level.'); return; }
    el.innerHTML = `<div class="table-wrap"><table class="table cards"><thead><tr><th>Ingredient</th><th class="r">In stock</th><th class="r">Minimum</th><th>Status</th><th>Supplier</th><th class="r">Cost / unit</th><th class="r">Stock value</th><th>Updated</th><th></th></tr></thead><tbody>
      ${list.map(i => `<tr data-id="${i.id}"><td class="primary"><b>${esc(i.name)}</b>${i.notes ? `<span class="sub">${esc(i.notes)}</span>` : ''}</td>
        <td class="r" data-label="In stock"><div class="row" style="justify-content:flex-end;gap:4px"><button class="icon-btn" style="width:28px;height:28px" data-adj="-1" aria-label="Use 1 ${esc(i.unit)}">−</button><b class="num">${+i.quantity} ${esc(i.unit)}</b><button class="icon-btn" style="width:28px;height:28px" data-adj="1" aria-label="Add 1 ${esc(i.unit)}">+</button></div></td>
        <td class="r" data-label="Minimum">${+i.min_quantity} ${esc(i.unit)}</td><td data-label="Status">${badge(...LEVEL[i.level])}</td><td data-label="Supplier">${esc(i.supplier || '—')}</td>
        <td class="r" data-label="Cost">${i.cost ? rupee(i.cost) : '—'}</td><td class="r" data-label="Value">${i.cost ? rupee(i.cost * i.quantity) : '—'}</td><td data-label="Updated" class="small muted">${fmtDateTime(i.updated_at)}</td>
        <td class="r"><button class="btn btn-ghost btn-xs" data-edit>Edit</button></td></tr>`).join('')}</tbody></table></div>`;
    el.onclick = async e => { const tr = e.target.closest('tr[data-id]'); if (!tr) return; const it = rows.find(r => r.id == tr.dataset.id);
      if (e.target.closest('[data-edit]')) return edit(it);
      const b = e.target.closest('[data-adj]'); if (!b) return;
      try { await post(`/admin/inventory/${it.id}/adjust`, { delta: Number(b.dataset.adj) }); load(); } catch (x) { toastError(x); } };
  }
  function edit(i) {
    const m = formDialog({ title: i ? `Edit ${i.name}` : 'Add ingredient', submit: 'Save', extraFooter: i ? '<button class="btn btn-danger-ghost" type="button" data-delete>Remove</button>' : '',
      fields: `<div class="grid-2"><label class="field"><span>Ingredient</span><input class="input" name="name" required maxlength="60" value="${esc(i?.name || '')}" placeholder="e.g. Paneer"></label>
        <label class="field"><span>Unit</span><input class="input" name="unit" required maxlength="15" value="${esc(i?.unit || 'kg')}" list="units"><datalist id="units"><option>kg</option><option>g</option><option>litre</option><option>pcs</option><option>dozen</option><option>packet</option></datalist></label>
        <label class="field"><span>Current quantity</span><input class="input" name="quantity" type="number" min="0" step="any" required value="${i?.quantity ?? ''}"></label>
        <label class="field"><span>Warn me below</span><input class="input" name="min_quantity" type="number" min="0" step="any" required value="${i?.min_quantity ?? ''}"></label>
        <label class="field"><span>Supplier</span><input class="input" name="supplier" maxlength="80" value="${esc(i?.supplier || '')}"></label>
        <label class="field"><span>Cost per unit (₹)</span><input class="input" name="cost" type="number" min="0" step="any" value="${i?.cost ?? ''}"></label></div>
        <label class="field"><span>Notes</span><input class="input" name="notes" maxlength="300" value="${esc(i?.notes || '')}"></label>`,
      onSubmit: async v => { const b = { ...v, quantity: Number(v.quantity), min_quantity: Number(v.min_quantity), cost: Number(v.cost || 0) };
        if (i) await patch(`/admin/inventory/${i.id}`, b); else await post('/admin/inventory', b); toast('Saved'); load(); } });
    $('[data-delete]', m.el)?.addEventListener('click', async () => { if (!(await confirmDialog({ title: `Remove ${i.name}?`, confirm: 'Remove', danger: true }))) return;
      try { await del(`/admin/inventory/${i.id}`); m.close(); load(); } catch (x) { toastError(x); } });
  }
  $('#add', view).onclick = () => edit(null);
  await load();
}
