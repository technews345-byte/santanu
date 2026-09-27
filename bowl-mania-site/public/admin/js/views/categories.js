import { get, post, patch, put, del } from '../api.js';
import { $, $$, esc, icon, toast, toastError, confirmDialog, formDialog, emptyState, errorState } from '../ui.js';
import { photoField, mountPhotoField, imgSrc } from './_photo.js';

export async function render(view) {
  let cats = [];
  view.innerHTML = `<div class="page-head"><div><h1>Categories</h1><p>Group bowls on the website. Drag order with the arrows; turn a category off to hide all its items.</p></div>
    <div class="actions"><button class="btn btn-primary btn-sm" id="add">${icon('plus')} Add category</button></div></div><div class="card" id="list"></div>`;
  async function load() {
    try { cats = await get('/admin/categories'); } catch (e) { $('#list', view).innerHTML = errorState(e); $('[data-retry]', view).onclick = load; return; }
    const el = $('#list', view);
    if (!cats.length) { el.innerHTML = emptyState('list', 'No categories yet', 'Create categories like Morning Bowls or Protein Bowls.'); return; }
    el.innerHTML = cats.map((c, i) => `<div class="sortable-row" data-id="${c.id}"><div class="handle"><button type="button" data-up ${i ? '' : 'disabled'} aria-label="Move ${esc(c.name)} up">▲</button><button type="button" data-down ${i < cats.length - 1 ? '' : 'disabled'} aria-label="Move ${esc(c.name)} down">▼</button></div>
      <img class="thumb" src="${imgSrc(c.image)}" alt=""><div style="flex:1;min-width:0"><b>${esc(c.name)}</b><span class="muted small" style="display:block">${c.item_count} item${c.item_count === 1 ? '' : 's'}${c.description ? ' · ' + esc(c.description) : ''}</span></div>
      <label class="switch"><input type="checkbox" data-toggle ${c.active ? 'checked' : ''}><i></i><span class="hide-xs">${c.active ? 'Enabled' : 'Disabled'}</span></label>
      <button class="btn btn-ghost btn-xs" data-edit>Edit</button></div>`).join('');
    el.onclick = async e => { const row = e.target.closest('.sortable-row'); if (!row) return; const i = cats.findIndex(c => c.id == row.dataset.id);
      if (e.target.closest('[data-edit]')) return edit(cats[i]);
      const up = e.target.closest('[data-up]'), down = e.target.closest('[data-down]'); if (!up && !down) return;
      const j = up ? i - 1 : i + 1; [cats[i], cats[j]] = [cats[j], cats[i]];
      try { await put('/admin/categories/order', { ids: cats.map(c => c.id) }); load(); } catch (x) { toastError(x); } };
    $$('[data-toggle]', el).forEach(c => c.onchange = async () => { const cat = cats.find(x => x.id == c.closest('[data-id]').dataset.id);
      try { await patch(`/admin/categories/${cat.id}`, { ...cat, active: c.checked }); toast(`${cat.name} ${c.checked ? 'enabled' : 'disabled'}`); load(); } catch (x) { c.checked = !c.checked; toastError(x); } });
  }
  function edit(c) {
    const m = formDialog({ title: c ? `Edit ${c.name}` : 'Add category', submit: c ? 'Save' : 'Add category', extraFooter: c ? '<button class="btn btn-danger-ghost" type="button" data-delete>Delete</button>' : '',
      fields: `<label class="field"><span>Name</span><input class="input" name="name" required maxlength="60" value="${esc(c?.name || '')}"></label>
        <label class="field"><span>Description</span><input class="input" name="description" maxlength="300" value="${esc(c?.description || '')}"></label>
        ${photoField('image', c?.image || '', 'Category image')}
        <label class="check"><input type="checkbox" name="active" ${c ? (c.active ? 'checked' : '') : 'checked'}> Enabled</label>`,
      onMount: f => mountPhotoField(f, 'image', 'category'),
      onSubmit: async v => { if (c) await patch(`/admin/categories/${c.id}`, v); else await post('/admin/categories', v); toast('Category saved'); load(); } });
    $('[data-delete]', m.el)?.addEventListener('click', async () => {
      if (!(await confirmDialog({ title: `Delete ${c.name}?`, message: 'Only empty categories can be deleted.', confirm: 'Delete', danger: true }))) return;
      try { await del(`/admin/categories/${c.id}`); m.close(); toast('Category deleted'); load(); } catch (x) { toastError(x); } });
  }
  $('#add', view).onclick = () => edit(null);
  await load();
}
