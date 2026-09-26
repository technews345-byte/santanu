import { get, post } from '../api.js';
import { $, esc, icon, ago, fmtDateTime, emptyState, errorState, toast } from '../ui.js';
import { bus, state } from '../app.js';

const ICON = { new_order: 'orders', payment_received: 'card', payment_failed: 'card', order_cancelled: 'orders', low_stock: 'box', inquiry: 'chat', new_review: 'star' };
export async function render(view) {
  view.innerHTML = `<div class="page-head"><div><h1>Notifications</h1><p>New orders, payments, cancellations, low stock, messages and reviews.</p></div>
    <div class="actions"><label class="switch"><input type="checkbox" id="sound" ${state.soundOff ? '' : 'checked'}><i></i>Sound for new orders</label>
      <button class="btn btn-ghost btn-sm" id="perm">${icon('bell')} Browser alerts</button><button class="btn btn-soft btn-sm" id="readAll">Mark all read</button></div></div><div class="card" id="list"></div>`;
  $('#sound', view).onchange = e => { state.soundOff = !e.target.checked; try { localStorage.setItem('bm-sound', state.soundOff ? 'off' : 'on'); } catch {} toast(state.soundOff ? 'Sound off' : 'Sound on'); };
  $('#perm', view).onclick = async () => { if (!('Notification' in window)) return toast("This browser doesn't support notifications", 'err'); const p = await Notification.requestPermission(); toast(p === 'granted' ? 'Browser alerts are on' : 'Browser alerts are blocked — allow them in your browser settings', p === 'granted' ? 'ok' : 'err'); };
  $('#readAll', view).onclick = async () => { await post('/admin/notifications/read', {}); state.unread = 0; load(); };
  async function load() {
    let r; try { r = await get('/admin/notifications', { limit: 100 }); } catch (e) { $('#list', view).innerHTML = errorState(e); return; }
    $('#list', view).innerHTML = r.rows.length ? `<div class="stack-sm" style="padding:8px">${r.rows.map(n => `<a class="notif ${n.read_at ? '' : 'unread'}" href="${esc(n.link || '#/notifications')}" data-id="${n.id}"><span class="ic">${icon(ICON[n.type] || 'bell')}</span><span><b>${esc(n.title)}</b><p>${esc(n.body)}</p><time title="${fmtDateTime(n.created_at)}">${ago(n.created_at)}</time></span></a>`).join('')}</div>`
      : emptyState('bell', 'No notifications yet', 'New orders and messages will show up here.');
  }
  await load();
  const on = () => load(); bus.addEventListener('notification', on);
  return () => bus.removeEventListener('notification', on);
}
