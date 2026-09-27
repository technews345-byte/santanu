import { get, patch, post, put, del } from '../api.js';
import { $, $$, esc, icon, rupee, num, dietMark, toast, toastError, confirmDialog, formDialog, emptyState, errorState, debounce } from '../ui.js';
import { can, bus } from '../app.js';
import { photoField, mountPhotoField, imgSrc } from './_photo.js';

let items = [], cats = [], filter = { q: '', cat: '', state: '' }, reorder = false;
export async function render(view, ctx) {
  const manage = can('menu.manage');
  view.innerHTML = `<div class="page-head"><div><h1>Menu</h1><p>Prices, photos and availability here update the website immediately.</p></div>
    <div class="actions">${manage ? `<button class="btn btn-ghost btn-sm" id="reorderBtn">${icon('list')} Reorder</button><button class="btn btn-primary btn-sm" id="addItem">${icon('plus')} Add item</button>` : ''}</div></div>
    <div class="toolbar"><input class="input search" id="q" type="search" placeholder="Search bowls" aria-label="Search menu">
      <select class="select" id="cat" aria-label="Category"><option value="">All categories</option></select>
      <div class="seg" role="group" aria-label="Availability"><button type="button" data-st="" aria-pressed="true">All</button><button type="button" data-st="available" aria-pressed="false">Available</button><button type="button" data-st="soldout" aria-pressed="false">Sold out</button><button type="button" data-st="hidden" aria-pressed="false">Hidden</button></div></div>
    <div id="menuBody"></div>`;
  async function load() {
    try { const r = await get('/admin/menu'); items = r.items; cats = r.categories; } catch (e) { $('#menuBody', view).innerHTML = errorState(e); $('[data-retry]', view).onclick = load; return; }
    $('#cat', view).innerHTML = `<option value="">All categories</option>${cats.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}`; $('#cat', view).value = filter.cat;
    draw();
  }
  function draw() {
    const body = $('#menuBody', view);
    if (reorder) {
      body.innerHTML = `<div class="card"><div class="card-head"><h2>Display order</h2><span class="muted small">Use the arrows, then save. This is the order customers see.</span><button class="btn btn-primary btn-sm" id="saveOrder">Save order</button></div>
        <div>${items.map((i, n) => `<div class="sortable-row" data-id="${i.id}"><div class="handle"><button type="button" data-up ${n ? '' : 'disabled'} aria-label="Move up">▲</button><button type="button" data-down ${n < items.length - 1 ? '' : 'disabled'} aria-label="Move down">▼</button></div><img class="thumb" src="${imgSrc(i.image)}" alt=""><b>${esc(i.name)}</b><span class="muted small">${esc(i.category_name || '')}</span></div>`).join('')}</div></div>`;
      body.onclick = e => { const row = e.target.closest('.sortable-row'); if (!row) return; const i = items.findIndex(x => x.id == row.dataset.id);
        if (e.target.closest('[data-up]') && i > 0) [items[i - 1], items[i]] = [items[i], items[i - 1]];
        else if (e.target.closest('[data-down]') && i < items.length - 1) [items[i + 1], items[i]] = [items[i], items[i + 1]]; else return; draw(); };
      $('#saveOrder', view).onclick = async () => { try { await put('/admin/menu/order', { ids: items.map(i => i.id) }); toast('Menu order saved'); reorder = false; load(); } catch (x) { toastError(x); } };
      return;
    }
    body.onclick = null;
    const list = items.filter(i => (!filter.q || i.name.toLowerCase().includes(filter.q)) && (!filter.cat || String(i.category_id) === filter.cat)
      && (!filter.state || (filter.state === 'available' && i.available && i.active) || (filter.state === 'soldout' && !i.available) || (filter.state === 'hidden' && !i.active)));
    if (!list.length) { body.innerHTML = emptyState('bowl', items.length ? 'No items match' : 'Your menu is empty', items.length ? 'Try another filter.' : 'Add your first bowl to start taking orders.', manage && !items.length ? '<button class="btn btn-primary" data-add>Add item</button>' : ''); $('[data-add]', body)?.addEventListener('click', () => edit(null)); return; }
    body.innerHTML = `<div class="menu-grid">${list.map(i => `<article class="m-card ${i.active ? '' : 'off'}">
      <div class="img"><img src="${imgSrc(i.image)}" alt="${esc(i.name)}" loading="lazy"><div class="flags">${i.featured ? '<span>★ Featured</span>' : ''}${!i.available ? '<span class="so">Sold out</span>' : ''}${!i.active ? '<span>Hidden</span>' : ''}${i.tag ? `<span>${esc(i.tag)}</span>` : ''}</div></div>
      <div class="body"><h3>${dietMark(i.diet)}${esc(i.name)}${i.subtitle ? ` <span class="muted small">(${esc(i.subtitle)})</span>` : ''}</h3><p>${esc(i.description)}</p>
        <div class="price-chips">${i.sizes.map(s => `<span${s.active ? '' : ' style="opacity:.5;text-decoration:line-through"'}>${esc(s.label)} · ${rupee(s.price)}</span>`).join('')}</div>
        <p class="tiny">${esc(i.category_name || 'No category')} · ${num(i.sold_30d)} sold in 30 days${i.spicy ? ' · ' + '🌶'.repeat(i.spicy) : ''}</p></div>
      <div class="foot"><label class="switch"><input type="checkbox" data-avail="${i.id}" ${i.available ? 'checked' : ''}><i></i>${i.available ? 'Available' : 'Sold out'}</label>
        ${manage ? `<div class="row" style="gap:6px"><label class="switch" title="Show on website"><input type="checkbox" data-active="${i.id}" ${i.active ? 'checked' : ''}><i></i>Visible</label><button class="btn btn-ghost btn-xs" data-edit="${i.id}">Edit</button></div>` : ''}</div></article>`).join('')}</div>`;
    $$('[data-avail]', body).forEach(c => c.onchange = () => toggle(c, { available: c.checked }, c.checked ? 'is available again' : 'is marked sold out'));
    $$('[data-active]', body).forEach(c => c.onchange = () => toggle(c, { active: c.checked }, c.checked ? 'is visible on the website' : 'is hidden from the website'));
    $$('[data-edit]', body).forEach(b => b.onclick = () => edit(items.find(i => i.id == b.dataset.edit)));
  }
  async function toggle(c, body, text) {
    const id = Number(c.dataset.avail || c.dataset.active), it = items.find(i => i.id === id);
    try { await patch(`/admin/menu/${id}/availability`, body); Object.assign(it, body); toast(`${it.name} ${text}`); draw(); } catch (x) { c.checked = !c.checked; toastError(x); }
  }
  function sizeRow(s = { label: '', price: '', active: true }) {
    return `<div class="size-row" data-size-id="${s.id || ''}"><input class="input" data-k="label" value="${esc(s.label)}" placeholder="e.g. 500 ml" aria-label="Size"><span class="rupee-in"><input class="input" data-k="price" type="number" min="1" step="1" inputmode="numeric" value="${esc(s.price)}" aria-label="Price"></span>
      <label class="switch"><input type="checkbox" data-k="active" ${s.active ? 'checked' : ''}><i></i>On</label><button type="button" class="icon-btn" data-rm aria-label="Remove size">${icon('close')}</button></div>`;
  }
  function edit(it) {
    const n = it?.nutrition || {};
    const m = formDialog({ title: it ? `Edit ${it.name}` : 'Add menu item', size: 'wide', submit: it ? 'Save changes' : 'Add item',
      extraFooter: it ? '<button class="btn btn-danger-ghost" type="button" data-delete>Delete</button>' : '',
      fields: `<div class="grid-2"><label class="field"><span>Item name</span><input class="input" name="name" required maxlength="80" value="${esc(it?.name || '')}"></label>
          <label class="field"><span>Subtitle <small>(optional, e.g. Indic Touch)</small></span><input class="input" name="subtitle" maxlength="60" value="${esc(it?.subtitle || '')}"></label></div>
        <label class="field"><span>Short description</span><input class="input" name="description" maxlength="400" value="${esc(it?.description || '')}" placeholder="Oats · Fresh fruits · Nuts & seeds"></label>
        <label class="field"><span>Ingredients</span><textarea class="textarea" name="ingredients" maxlength="600" rows="2">${esc(it?.ingredients || '')}</textarea></label>
        <div class="grid-3"><label class="field"><span>Category</span><select class="select" name="category_id" data-type="number"><option value="">No category</option>${cats.map(c => `<option value="${c.id}" ${c.id === it?.category_id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
          <label class="field"><span>Type</span><select class="select" name="diet">${[['veg', 'Vegetarian'], ['egg', 'Contains egg'], ['nonveg', 'Non-vegetarian'], ['both', 'Veg or non-veg option']].map(([k, l]) => `<option value="${k}" ${k === (it?.diet || 'veg') ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <label class="field"><span>Spice level</span><select class="select" name="spicy" data-type="number">${['Not spicy', 'Mild 🌶', 'Medium 🌶🌶', 'Hot 🌶🌶🌶'].map((l, i) => `<option value="${i}" ${i === (it?.spicy || 0) ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
        <fieldset class="field"><legend>Sizes & prices</legend><div class="stack-sm" id="sizes">${(it?.sizes?.length ? it.sizes : [{ label: '250 ml', price: '', active: true }, { label: '500 ml', price: '', active: true }]).map(sizeRow).join('')}</div>
          <button type="button" class="btn-link small" id="addSize">+ Add size</button></fieldset>
        <fieldset class="field"><legend>Nutrition per bowl <small>(optional)</small></legend><div class="grid-4">
          ${[['calories', 'Calories (kcal)'], ['protein_g', 'Protein (g)'], ['carbs_g', 'Carbs (g)'], ['fat_g', 'Fat (g)']].map(([k, l]) => `<label class="field"><span>${l}</span><input class="input" type="number" min="0" step="any" name="n_${k}" value="${n[k] ?? ''}"></label>`).join('')}</div></fieldset>
        ${photoField('image', it?.image || '')}
        <div class="grid-3"><label class="field"><span>Badge <small>(optional)</small></span><input class="input" name="tag" maxlength="30" value="${esc(it?.tag || '')}" placeholder="e.g. High protein"></label>
          <label class="check" style="align-self:end"><input type="checkbox" name="featured" ${it?.featured ? 'checked' : ''}> Featured item</label>
          <label class="check" style="align-self:end"><input type="checkbox" name="available" ${it ? (it.available ? 'checked' : '') : 'checked'}> Available to order</label>
          <label class="check"><input type="checkbox" name="active" ${it ? (it.active ? 'checked' : '') : 'checked'}> Show on website</label></div>`,
      onMount: form => {
        mountPhotoField(form, 'image');
        $('#addSize', form).onclick = () => $('#sizes', form).insertAdjacentHTML('beforeend', sizeRow());
        $('#sizes', form).onclick = e => { if (e.target.closest('[data-rm]')) { if ($$('.size-row', form).length > 1) e.target.closest('.size-row').remove(); else toast('Keep at least one size', 'err'); } };
      },
      onSubmit: async (v, form) => {
        const sizes = $$('.size-row', form).map(r => ({ ...(r.dataset.sizeId ? { id: Number(r.dataset.sizeId) } : {}), label: $('[data-k=label]', r).value.trim(), price: Number($('[data-k=price]', r).value), active: $('[data-k=active]', r).checked }));
        if (sizes.some(s => !s.label || !(s.price > 0))) throw new Error('Every size needs a name and a price above ₹0.');
        const nutrition = {}; for (const k of ['calories', 'protein_g', 'carbs_g', 'fat_g']) if (v['n_' + k] !== '') nutrition[k] = Number(v['n_' + k]);
        const body = { name: v.name, subtitle: v.subtitle, description: v.description, ingredients: v.ingredients, category_id: v.category_id || null, diet: v.diet, spicy: v.spicy, featured: v.featured, available: v.available, active: v.active, image: v.image, tag: v.tag, nutrition, sizes };
        if (it) await patch(`/admin/menu/${it.id}`, body); else await post('/admin/menu', body);
        toast(it ? 'Changes saved — the website is updated' : `${v.name} added to the menu`); load();
      } });
    $('[data-delete]', m.el)?.addEventListener('click', async () => {
      if (!(await confirmDialog({ title: `Delete ${it.name}?`, message: 'It will disappear from the menu. Past orders keep their details. To hide it temporarily, turn off "Show on website" instead.', confirm: 'Delete item', danger: true }))) return;
      try { await del(`/admin/menu/${it.id}`); m.close(); toast(`${it.name} deleted`); load(); } catch (x) { toastError(x); }
    });
  }
  $('#q', view).oninput = debounce(e => { filter.q = e.target.value.toLowerCase().trim(); draw(); }, 150);
  $('#cat', view).onchange = e => { filter.cat = e.target.value; draw(); };
  $$('[data-st]', view).forEach(b => b.onclick = () => { filter.state = b.dataset.st; $$('[data-st]', view).forEach(x => x.setAttribute('aria-pressed', x === b)); draw(); });
  $('#addItem', view)?.addEventListener('click', () => edit(null));
  $('#reorderBtn', view)?.addEventListener('click', () => { reorder = !reorder; $('#reorderBtn', view).innerHTML = reorder ? 'Done' : `${icon('list')} Reorder`; draw(); });
  await load();
  if (ctx.query.new && manage) edit(null);
  const on = () => { if (!document.querySelector('.modal-backdrop') && !reorder) load(); };
  bus.addEventListener('menu', on);
  return () => bus.removeEventListener('menu', on);
}
