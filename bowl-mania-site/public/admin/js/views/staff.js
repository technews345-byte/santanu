import { get, post, patch, put, del } from '../api.js';
import { $, $$, esc, icon, badge, ago, initials, toast, toastError, confirmDialog, formDialog, emptyState, errorState } from '../ui.js';
import { state } from '../app.js';

export async function render(view, ctx) {
  let data, roles;
  view.innerHTML = `<div class="page-head"><div><h1>Staff & roles</h1><p>Give each person their own login. Roles decide which pages and actions they can use.</p></div>
    <div class="actions"><button class="btn btn-primary btn-sm" id="add">${icon('plus')} Add staff</button></div></div>
    <div class="card" id="list"></div><h2 style="margin:26px 0 12px">Roles & permissions</h2><div id="roles" class="stack"></div>`;
  async function load() {
    try { [data, roles] = await Promise.all([get('/admin/staff'), get('/admin/roles')]); } catch (e) { $('#list', view).innerHTML = errorState(e); $('[data-retry]', view).onclick = load; return; }
    $('#list', view).innerHTML = data.rows.length ? `<div class="table-wrap"><table class="table cards"><thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Role</th><th>Status</th><th>Last sign-in</th><th></th></tr></thead><tbody>
      ${data.rows.map(s => `<tr data-id="${s.id}"><td class="primary"><div class="row" style="gap:10px;flex-wrap:nowrap"><span class="avatar">${esc(initials(s.name))}</span><b>${esc(s.name)}</b>${s.id === state.admin.id ? badge('plain', 'You', 'plain') : ''}</div></td>
        <td data-label="Email">${esc(s.email)}</td><td data-label="Phone">${esc(s.phone || '—')}</td><td data-label="Role">${esc(s.role_name)}</td><td data-label="Status">${badge(s.status === 'active' ? 'ok' : 'disabled', s.status === 'active' ? 'Active' : 'Disabled')}</td>
        <td data-label="Last sign-in">${s.last_login_at ? ago(s.last_login_at) : 'Never'}</td><td class="r"><button class="btn btn-ghost btn-xs" data-edit>Edit</button></td></tr>`).join('')}</tbody></table></div>` : emptyState('users', 'No staff yet');
    $('#list', view).onclick = e => { const tr = e.target.closest('tr[data-id]'); if (tr && e.target.closest('[data-edit]')) edit(data.rows.find(s => s.id == tr.dataset.id)); };
    const groups = [...new Set(roles.permissions.map(p => p.grp))];
    $('#roles', view).innerHTML = roles.roles.map(r => `<details class="card"><summary class="card-head" style="cursor:pointer;list-style:none"><div><h2>${esc(r.name)}</h2><p class="small muted">${esc(r.description)} · ${r.staff_count} staff · ${r.permissions.length} permissions</p></div>${icon('arrow')}</summary>
      <form class="card-body perm-grid" data-role="${r.id}">${groups.map(g => `<fieldset><legend>${esc(g)}</legend><div class="opts">${roles.permissions.filter(p => p.grp === g).map(p => `<label class="check small"><input type="checkbox" name="p" value="${p.key}" ${r.permissions.includes(p.key) ? 'checked' : ''} ${!roles.can_edit || r.key === 'super_admin' ? 'disabled' : ''}> ${esc(p.description)}</label>`).join('')}</div></fieldset>`).join('')}
        ${roles.can_edit && r.key !== 'super_admin' ? '<div class="row"><button class="btn btn-primary btn-sm" type="submit">Save permissions</button><span class="small muted">Staff with this role get the change on their next page load.</span></div>' : `<p class="small muted">${r.key === 'super_admin' ? 'Super Admin always has every permission.' : 'Only a Super Admin can change permissions.'}</p>`}</form></details>`).join('');
    $$('form[data-role]', view).forEach(f => f.onsubmit = async e => { e.preventDefault();
      try { await put(`/admin/roles/${f.dataset.role}/permissions`, { permissions: [...new FormData(f).getAll('p')] }); toast('Permissions saved'); load(); } catch (x) { toastError(x); } });
  }
  function edit(s) {
    const m = formDialog({ title: s ? `Edit ${s.name}` : 'Add staff member', submit: s ? 'Save' : 'Create account', extraFooter: s && s.id !== state.admin.id ? '<button class="btn btn-danger-ghost" type="button" data-delete>Remove</button>' : '',
      fields: `<div class="grid-2"><label class="field"><span>Name</span><input class="input" name="name" required maxlength="80" value="${esc(s?.name || '')}"></label>
        <label class="field"><span>Phone</span><input class="input" name="phone" inputmode="tel" value="${esc(s?.phone || '')}"></label></div>
        <label class="field"><span>Email (used to sign in)</span><input class="input" name="email" type="email" required value="${esc(s?.email || '')}"></label>
        <div class="grid-2"><label class="field"><span>Role</span><select class="select" name="role_id" data-type="number">${data.roles.filter(r => r.key !== 'super_admin' || state.admin.role === 'super_admin').map(r => `<option value="${r.id}" ${r.id === s?.role_id ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select></label>
          <label class="field"><span>Status</span><select class="select" name="status"><option value="active" ${s?.status !== 'disabled' ? 'selected' : ''}>Active</option><option value="disabled" ${s?.status === 'disabled' ? 'selected' : ''}>Disabled — can't sign in</option></select></label></div>
        <label class="field"><span>${s ? 'New password (leave empty to keep)' : 'Password'}</span><input class="input" name="password" type="password" autocomplete="new-password" ${s ? '' : 'required'}><small>At least 10 characters with letters and numbers. Changing it signs them out everywhere.</small></label>`,
      onSubmit: async v => { if (s) await patch(`/admin/staff/${s.id}`, v); else await post('/admin/staff', v); toast(s ? 'Staff member updated' : `${v.name} can now sign in`); load(); } });
    $('[data-delete]', m.el)?.addEventListener('click', async () => {
      if (!(await confirmDialog({ title: `Remove ${s.name}?`, message: 'They will be signed out and lose access. Delivery staff with history are disabled instead of deleted.', confirm: 'Remove', danger: true }))) return;
      try { const r = await del(`/admin/staff/${s.id}`); m.close(); toast(r.disabled ? 'Account disabled (kept for delivery history)' : 'Removed'); load(); } catch (x) { toastError(x); } });
  }
  $('#add', view).onclick = () => edit(null);
  await load();
  if (ctx.query.new) edit(null);
}
