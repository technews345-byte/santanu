import { get } from '../api.js';
import { $, esc, fmtDateTime, emptyState, errorState, pager, debounce } from '../ui.js';

export async function render(view) {
  const f = { entity: '', q: '', page: 1 };
  view.innerHTML = `<div class="page-head"><div><h1>Audit log</h1><p>Who changed what, and when. Kept for accountability; it cannot be edited.</p></div></div>
    <div class="toolbar"><input class="input search" id="q" type="search" placeholder="Search changes (e.g. price, order number)" aria-label="Search audit log"><select class="select" id="entity" aria-label="Type"><option value="">Everything</option></select></div><div class="card" id="list"></div>`;
  $('#q', view).oninput = debounce(e => { f.q = e.target.value.trim(); f.page = 1; load(); }, 300);
  $('#entity', view).onchange = e => { f.entity = e.target.value; f.page = 1; load(); };
  let first = true;
  async function load() {
    let r; try { r = await get('/admin/audit', f); } catch (e) { $('#list', view).innerHTML = errorState(e); return; }
    if (first) { $('#entity', view).innerHTML += r.entities.map(x => `<option value="${esc(x)}">${esc(x.replace(/_/g, ' '))}</option>`).join(''); first = false; }
    const el = $('#list', view);
    if (!r.rows.length) { el.innerHTML = emptyState('list', 'No changes recorded'); return; }
    el.innerHTML = `<div class="table-wrap"><table class="table cards"><thead><tr><th>When</th><th>Who</th><th>What changed</th><th>Type</th><th>IP</th></tr></thead><tbody>${r.rows.map(a => `<tr><td data-label="When" class="nowrap">${fmtDateTime(a.created_at)}</td><td data-label="Who"><b>${esc(a.admin_name)}</b></td>
      <td class="primary">${esc(a.summary)}${a.old_value || a.new_value ? `<details class="tiny"><summary class="muted" style="cursor:pointer">Details</summary><pre class="code" style="white-space:pre-wrap;margin:6px 0 0">${esc(a.old_value ? 'Before: ' + a.old_value + '\n' : '')}${esc(a.new_value ? 'After: ' + a.new_value : '')}</pre></details>` : ''}</td>
      <td data-label="Type">${esc(a.entity.replace(/_/g, ' '))}</td><td data-label="IP" class="small muted">${esc(a.ip || '')}</td></tr>`).join('')}</tbody></table></div>`;
    el.append(pager(r, p => { f.page = p; load(); }));
  }
  await load();
}
