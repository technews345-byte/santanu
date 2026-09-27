import { post } from '../api.js';
import { $, esc, initials, toast, formDialog } from '../ui.js';
import { state } from '../app.js';

export async function render(view) {
  const a = state.admin;
  view.innerHTML = `<div class="page-head"><div><h1>Your account</h1></div></div>
    <div class="card card-pad stack" style="max-width:560px"><div class="row"><span class="avatar lg">${esc(initials(a.name))}</span><div><h2>${esc(a.name)}</h2><p class="muted small">${esc(a.email)} · ${esc(a.role_name)}</p></div></div>
      <p class="small muted">Your role can: ${a.permissions.map(p => `<span class="code">${esc(p)}</span>`).join(' ')}</p>
      <div class="row"><button class="btn btn-primary btn-sm" id="pw">Change password</button></div></div>`;
  $('#pw', view).onclick = () => formDialog({ title: 'Change password', size: 'narrow', submit: 'Change password',
    fields: `<label class="field"><span>Current password</span><input class="input" type="password" name="current" autocomplete="current-password" required></label>
      <label class="field"><span>New password</span><input class="input" type="password" name="password" autocomplete="new-password" required><small>At least 10 characters with letters and numbers. Other devices will be signed out.</small></label>`,
    onSubmit: async v => { await post('/auth/password', v); toast('Password changed'); } });
}
