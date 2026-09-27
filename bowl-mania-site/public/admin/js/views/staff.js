import { get, post, patch, put, del } from '../api.js';
import { $, $$, esc, icon, badge, ago, initials, toast, toastError, confirmDialog, formDialog, emptyState, errorState } from '../ui.js';
import { state } from '../app.js';

export async function render(view, ctx) {
  let data, roles;
  view.innerHTML = `<div class="page-head"><div><h1>Staff & roles</h1><p>Give each person their own login. Roles decide which pages and actions they can use.</p></div>
    <div class="actions"><button class="btn btn-primary btn-sm" id="add">${icon('plus')} Add staff</button></div></div>
    <div class="toolbar row" style="margin-bottom:12px"><input class="input" id="q" type="search" placeholder="Search name, email or phone" aria-label="Search staff" style="max-width:320px">
      <select class="select" id="roleFilter" aria-label="Filter by role" style="max-width:220px"><option value="">All roles</option></select></div>
    <div class="card" id="list"></div><h2 style="margin:26px 0 12px">Roles & permissions</h2><div id="roles" class="stack"></div>`;
  async function load() {
    try { [data, roles] = await Promise.all([get('/admin/staff'), get('/admin/roles')]); } catch (e) { $('#list', view).innerHTML = errorState(e); $('[data-retry]', view).onclick = load; return; }
    const rf = $('#roleFilter', view);
    if (rf.options.length === 1) rf.insertAdjacentHTML('beforeend', data.roles.map(r => `<option value="${r.id}">${esc(r.name)}</option>`).join(''));
    renderList();
    const groups = [...new Set(roles.permissions.map(p => p.grp))];
    renderRoles(groups);
  }
  function renderList() {
    const q = $('#q', view).value.trim().toLowerCase(), role = $('#roleFilter', view).value;
    const rows = data.rows.filter(s => (!role || s.role_id === Number(role)) && (!q || [s.name, s.email, s.phone].some(x => String(x || '').toLowerCase().includes(q))));
    $('#list', view).innerHTML = !data.rows.length ? emptyState('users', 'No staff yet') : !rows.length ? emptyState('search', 'No staff match your search') : `<div class="table-wrap"><table class="table cards"><thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Role</th><th>Status</th><th>Last sign-in</th><th></th></tr></thead><tbody>
      ${rows.map(s => `<tr data-id="${s.id}"><td class="primary"><div class="row" style="gap:10px;flex-wrap:nowrap">${s.photo_url ? `<img class="avatar avatar-img" src="${esc(s.photo_url)}" alt="">` : `<span class="avatar">${esc(initials(s.name))}</span>`}<b>${esc(s.name)}</b>${s.id === state.admin.id ? badge('plain', 'You', 'plain') : ''}${riderRole(s.role_id) && !s.photo_url ? badge('pending', 'Photo missing') : ''}</div></td>
        <td data-label="Email">${esc(s.email)}</td><td data-label="Phone">${esc(s.phone || '—')}</td><td data-label="Role">${esc(s.role_name)}</td><td data-label="Status">${badge(s.status === 'active' ? 'ok' : 'disabled', s.status === 'active' ? 'Active' : 'Disabled')}</td>
        <td data-label="Last sign-in">${s.last_login_at ? ago(s.last_login_at) : 'Never'}</td><td class="r"><div class="row" style="gap:6px;justify-content:flex-end;flex-wrap:nowrap"><button class="btn btn-soft btn-xs" data-edit aria-label="Edit ${esc(s.name)}">Edit</button>${s.id !== state.admin.id ? `<button class="btn btn-danger-ghost btn-xs" data-delete aria-label="Delete ${esc(s.name)}">Delete</button>` : ''}</div></td></tr>`).join('')}</tbody></table></div>`;
  }
  function renderRoles(groups) {
    $('#roles', view).innerHTML = roles.roles.map(r => `<details class="card"><summary class="card-head" style="cursor:pointer;list-style:none"><div><h2>${esc(r.name)}</h2><p class="small muted">${esc(r.description)} · ${r.staff_count} staff · ${r.permissions.length} permissions</p></div>${icon('arrow')}</summary>
      <form class="card-body perm-grid" data-role="${r.id}">${groups.map(g => `<fieldset><legend>${esc(g)}</legend><div class="opts">${roles.permissions.filter(p => p.grp === g).map(p => `<label class="check small"><input type="checkbox" name="p" value="${p.key}" ${r.permissions.includes(p.key) ? 'checked' : ''} ${!roles.can_edit || r.key === 'super_admin' ? 'disabled' : ''}> ${esc(p.description)}</label>`).join('')}</div></fieldset>`).join('')}
        ${roles.can_edit && r.key !== 'super_admin' ? '<div class="row"><button class="btn btn-primary btn-sm" type="submit">Save permissions</button><span class="small muted">Staff with this role get the change on their next page load.</span></div>' : `<p class="small muted">${r.key === 'super_admin' ? 'Super Admin always has every permission.' : 'Only a Super Admin can change permissions.'}</p>`}</form></details>`).join('');
    $$('form[data-role]', view).forEach(f => f.onsubmit = async e => { e.preventDefault();
      try { await put(`/admin/roles/${f.dataset.role}/permissions`, { permissions: [...new FormData(f).getAll('p')] }); toast('Permissions saved'); load(); } catch (x) { toastError(x); } });
  }
  const riderRole = id => !!data?.roles.find(r => r.id === Number(id))?.is_rider;
  async function remove(s, dialog) {
    if (!(await confirmDialog({ title: `Delete ${s.name}?`, message: 'They will be signed out and can no longer sign in. Delivery staff who have made deliveries are disabled instead, so their delivery history is kept.', confirm: 'Delete', danger: true }))) return;
    try { const r = await del(`/admin/staff/${s.id}`); dialog?.close(); toast(r.disabled ? `${s.name} disabled (kept for delivery history)` : `${s.name} deleted`); load(); } catch (x) { toastError(x); }
  }
  function edit(s, presetRole) {
    const m = formDialog({ title: s ? `Edit ${s.name}` : 'Add staff member', submit: s ? 'Save' : 'Create account', extraFooter: s && s.id !== state.admin.id ? '<button class="btn btn-danger-ghost" type="button" data-delete>Delete</button>' : '',
      fields: `<div class="grid-2"><label class="field"><span>Name</span><input class="input" name="name" required maxlength="80" value="${esc(s?.name || '')}"></label>
        <label class="field"><span>Phone</span><input class="input" name="phone" inputmode="tel" value="${esc(s?.phone || '')}"></label></div>
        <label class="field"><span>Email (used to sign in)</span><input class="input" name="email" type="email" required value="${esc(s?.email || '')}"></label>
        <div class="grid-2"><label class="field"><span>Role</span><select class="select" name="role_id" data-type="number">${data.roles.filter(r => r.key !== 'super_admin' || state.admin.role === 'super_admin').map(r => `<option value="${r.id}" ${r.id === s?.role_id || (!s && r.key === presetRole) ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select></label>
          <label class="field"><span>Status</span><select class="select" name="status"><option value="active" ${s?.status !== 'disabled' ? 'selected' : ''}>Active</option><option value="disabled" ${s?.status === 'disabled' ? 'selected' : ''}>Disabled — can't sign in</option></select></label></div>
        <div class="field photo-field" data-photo><span>Profile photo <b class="req" data-req>(required for delivery staff)</b></span>
          <div class="row" style="gap:14px;flex-wrap:nowrap">
            <img class="photo-preview" data-preview alt="" ${s?.photo_url ? `src="${esc(s.photo_url)}"` : 'hidden'}><span class="photo-empty" data-empty ${s?.photo_url ? 'hidden' : ''}>${icon('image')}</span>
            <div class="stack" style="gap:6px"><input class="input" name="photo_file" type="file" accept="image/jpeg,image/png,image/webp" capture="user">
              <small>A clear, front-facing photo of their face. It is shown in the rider app and on the live map.</small></div></div></div>
        <label class="field"><span>${s ? 'New password (leave empty to keep)' : 'Password'}</span><input class="input" name="password" type="password" autocomplete="new-password" ${s ? '' : 'required'}><small>At least 10 characters with letters and numbers. Changing it signs them out everywhere.</small></label>`,
      onMount: form => {
        const role = form.elements.role_id, file = form.elements.photo_file;
        const sync = () => { $('[data-req]', form).hidden = !riderRole(role.value); };
        role.addEventListener('change', sync); sync();
        file.addEventListener('change', () => {
          const f = file.files[0], img = $('[data-preview]', form);
          if (!f) return;
          if (img.src.startsWith('blob:')) URL.revokeObjectURL(img.src);
          img.src = URL.createObjectURL(f); img.hidden = false; $('[data-empty]', form).hidden = true;
        });
      },
      onSubmit: async (v, form) => {
        const f = form.elements.photo_file.files[0];
        delete v.photo_file;
        if (riderRole(v.role_id) && !f && !s?.photo_url) throw new Error('Add a profile photo. It is required for delivery staff.');
        if (f && f.size > 8 * 1024 * 1024) throw new Error('That photo is too large (max 8 MB).');
        let body = v;
        if (f) { body = new FormData(); Object.entries(v).forEach(([k, x]) => body.append(k, x ?? '')); body.append('photo', f); }
        if (s) await patch(`/admin/staff/${s.id}`, body); else await post('/admin/staff', body);
        toast(s ? 'Staff member updated' : `${v.name} can now sign in`); load();
      } });
    $('[data-delete]', m.el)?.addEventListener('click', () => remove(s, m));
  }
  $('#add', view).onclick = () => edit(null);
  $('#list', view).onclick = e => {
    const tr = e.target.closest('tr[data-id]'); if (!tr) return;
    const s = data.rows.find(x => x.id == tr.dataset.id);
    if (e.target.closest('[data-edit]')) edit(s); else if (e.target.closest('[data-delete]')) remove(s);
  };
  $('#q', view).oninput = renderList; $('#roleFilter', view).onchange = renderList;
  await load();
  if (ctx.query.new) edit(null, ctx.query.role);
  else if (ctx.query.edit) { const s = data?.rows.find(x => x.id === Number(ctx.query.edit)); if (s) edit(s); }
}
