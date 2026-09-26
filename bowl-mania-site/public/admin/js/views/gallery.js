import { get, api, patch, del } from '../api.js';
import { $, $$, esc, icon, badge, toast, toastError, confirmDialog, formDialog, emptyState, errorState } from '../ui.js';

const CATS = { food: 'Food', restaurant: 'Restaurant', video: 'Video', banner: 'Promotional banner', menu: 'Menu graphic', category: 'Category image' };
export async function render(view) {
  let rows = [], show = '';
  view.innerHTML = `<div class="page-head"><div><h1>Gallery & videos</h1><p>Photos are resized and converted to WebP automatically. Active items appear in the website gallery.</p></div>
    <div class="actions"><label class="btn btn-primary btn-sm" style="cursor:pointer">${icon('upload')} Upload<input type="file" id="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" multiple hidden></label></div></div>
    <div class="chips" id="chips" style="margin-bottom:14px"></div><div id="grid"></div>`;
  async function load() {
    try { rows = (await get('/admin/media')).rows; } catch (e) { $('#grid', view).innerHTML = errorState(e); $('[data-retry]', view).onclick = load; return; }
    $('#chips', view).innerHTML = [['', 'All', rows.length], ...Object.entries(CATS).map(([k, l]) => [k, l, rows.filter(r => r.category === k).length]).filter(x => x[2])].map(([k, l, n]) => `<button class="chip" data-c="${k}" aria-pressed="${show === k}">${l} <em>${n}</em></button>`).join('');
    $$('[data-c]', view).forEach(b => b.onclick = () => { show = b.dataset.c; load(); });
    const list = rows.filter(r => !show || r.category === show);
    const g = $('#grid', view);
    if (!list.length) { g.innerHTML = `<label class="upload-drop" style="padding:48px">${icon('image')}<b>Upload your first photo or video</b><span>Food shots, the kitchen, promotional banners. JPG, PNG, WebP up to 8 MB; MP4/WebM up to 60 MB.</span><input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" multiple hidden data-f></label>`; $('[data-f]', g).onchange = e => upload([...e.target.files]); return; }
    g.innerHTML = `<div class="gallery-grid">${list.map(m => `<article class="g-card" data-id="${m.id}"><div class="media">${m.kind === 'video' ? `<video src="${esc(m.url)}" muted playsinline preload="metadata"></video>` : `<img src="${esc(m.thumb_url || m.url)}" alt="${esc(m.title)}" loading="lazy">`}${m.active ? '' : badge('off', 'Hidden')}</div>
      <div class="meta"><b title="${esc(m.title)}">${esc(m.title || 'Untitled')}</b><span class="tiny muted">${esc(CATS[m.category] || m.category)} · ${(m.size_bytes / 1024 / 1024).toFixed(1)} MB${m.width ? ` · ${m.width}×${m.height}` : ''}</span>
        <div class="row" style="gap:6px"><button class="btn btn-ghost btn-xs" data-edit>Edit</button><button class="btn btn-danger-ghost btn-xs" data-del>Delete</button></div></div></article>`).join('')}</div>`;
    g.onclick = async e => { const card = e.target.closest('[data-id]'); if (!card) return; const m = rows.find(r => r.id == card.dataset.id);
      if (e.target.closest('[data-edit]')) edit(m);
      if (e.target.closest('[data-del]')) { if (!(await confirmDialog({ title: 'Delete this file?', message: 'It will be removed from the website and the server.', confirm: 'Delete', danger: true }))) return;
        try { await del(`/admin/media/${m.id}`); toast('Deleted'); load(); } catch (x) { toastError(x); } } };
  }
  async function upload(files) {
    for (const f of files) {
      toast(`Uploading ${f.name}…`);
      const fd = new FormData(); fd.append('file', f); fd.append('title', f.name.replace(/\.[^.]+$/, '')); fd.append('category', f.type.startsWith('video') ? 'video' : show && show !== 'video' ? show : 'food');
      try { await api('/admin/media', { method: 'POST', body: fd }); } catch (x) { toastError(x); }
    }
    toast('Upload finished'); load();
  }
  function edit(m) {
    formDialog({ title: 'Edit media', submit: 'Save', fields: `<label class="field"><span>Title</span><input class="input" name="title" maxlength="120" value="${esc(m.title)}"></label>
      <label class="field"><span>Description</span><textarea class="textarea" name="description" maxlength="500">${esc(m.description)}</textarea></label>
      <div class="grid-2"><label class="field"><span>Category</span><select class="select" name="category">${Object.entries(CATS).map(([k, l]) => `<option value="${k}" ${k === m.category ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="field"><span>Display order</span><input class="input" type="number" min="0" name="display_order" data-type="number" value="${m.display_order}"></label></div>
      <label class="check"><input type="checkbox" name="active" ${m.active ? 'checked' : ''}> Show on website</label><p class="tiny muted">File: <span class="code">${esc(m.url)}</span></p>`,
      onSubmit: async v => { await patch(`/admin/media/${m.id}`, v); toast('Saved'); load(); } });
  }
  $('#file', view).onchange = e => upload([...e.target.files]);
  await load();
}
