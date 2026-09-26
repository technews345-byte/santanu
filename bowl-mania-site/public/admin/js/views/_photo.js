// Photo field: pick from bundled bowl photos or the media library, or upload a new one.
import { get, api } from '../api.js';
import { $, esc, icon, toastError } from '../ui.js';

const BUNDLED = ['morning-glow', 'bean-vitality', 'grill-power', 'chicken-crunch', 'sprout', 'super-protein', 'hero-bowl'].map(n => `assets/bowls/${n}.jpg`);
export function photoField(name, value = '', label = 'Photo') {
  return `<fieldset class="field" data-photo="${name}"><legend>${esc(label)}</legend>
    <input type="hidden" name="${name}" value="${esc(value)}">
    <div class="photo-picker" data-grid><span class="skel" style="height:76px"></span></div>
    <label class="upload-drop" data-drop>${icon('upload')}<span><b>Upload a photo</b> · JPG, PNG or WebP up to 8 MB</span><input type="file" accept="image/jpeg,image/png,image/webp" hidden></label></fieldset>`;
}
export async function mountPhotoField(root, name, category = 'food') {
  const fs = root.querySelector(`[data-photo="${name}"]`), input = fs.querySelector(`input[name="${name}"]`), grid = fs.querySelector('[data-grid]');
  const lib = await get('/admin/media', { kind: 'image' }).then(r => r.rows.filter(m => m.active)).catch(() => []);
  const urls = [...new Set([...(input.value ? [input.value] : []), ...lib.map(m => m.url), ...BUNDLED])];
  const draw = () => { grid.innerHTML = urls.map((u, i) => `<label><input type="radio" name="__${name}" value="${esc(u)}" ${u === input.value ? 'checked' : ''} aria-label="Photo ${i + 1}"><img src="${esc(u.startsWith('/') || u.startsWith('http') ? u : '/' + u)}" alt="" loading="lazy"></label>`).join(''); };
  draw();
  grid.addEventListener('change', e => { input.value = e.target.value; });
  const file = fs.querySelector('input[type=file]'), drop = fs.querySelector('[data-drop]');
  const upload = async f => {
    if (!f) return; drop.classList.add('drag'); drop.querySelector('span').textContent = 'Uploading…';
    try { const fd = new FormData(); fd.append('file', f); fd.append('category', category); fd.append('title', f.name.replace(/\.[^.]+$/, ''));
      const m = await api('/admin/media', { method: 'POST', body: fd }); urls.unshift(m.url); input.value = m.url; draw(); }
    catch (x) { toastError(x); } finally { drop.classList.remove('drag'); drop.querySelector('span').innerHTML = '<b>Upload a photo</b> · JPG, PNG or WebP up to 8 MB'; }
  };
  file.onchange = () => upload(file.files[0]);
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('drag'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
  drop.addEventListener('drop', e => { e.preventDefault(); upload(e.dataTransfer.files[0]); });
}
export const imgSrc = u => !u ? '/assets/logo.jpg' : u.startsWith('/') || u.startsWith('http') ? u : '/' + u;
