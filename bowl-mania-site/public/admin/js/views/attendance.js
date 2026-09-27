// Rider attendance (with check-in selfies), shift scheduling and leave requests.
import { get, post, patch, del } from '../api.js';
import { $, $$, esc, icon, badge, fmtDate, fmtDateTime, toast, toastError, formDialog, confirmDialog, emptyState, errorState, todayYMD } from '../ui.js';
import { can, bus } from '../app.js';

const STATE = { working: ['ok', 'Working'], on_break: ['pending', 'On break'], checked_out: ['off', 'Checked out'], absent: ['cancelled', 'Absent'], no_shift: ['off', 'No shift'], on_leave: ['in_progress', 'On leave'] };
const time = s => (s ? fmtDateTime(s).split(', ').pop() : '—');
const ts = s => Date.parse(s.replace(' ', 'T') + 'Z');
const mins = (a, b) => Math.max(0, Math.round(((b ? ts(b) : Date.now()) - ts(a)) / 60000));

export async function render(view, ctx) {
  const tabs = [['today', 'Attendance'], can('riders.manage', 'attendance.view') && ['shifts', 'Shifts'], ['leave', 'Leave']].filter(Boolean);
  let tab = tabs.some(t => t[0] === ctx.query.tab) ? ctx.query.tab : 'today';
  view.innerHTML = `<div class="page-head"><div><h1>Attendance</h1><p>Rider check-ins with selfie and location, shifts and leave.</p></div></div>
    <div class="tabs-line" role="tablist">${tabs.map(([k, l]) => `<button role="tab" data-tab="${k}" aria-selected="${tab === k}">${l}</button>`).join('')}</div><div id="body" style="margin-top:16px"></div>`;
  $$('[data-tab]', view).forEach(b => b.onclick = () => { tab = b.dataset.tab; $$('[data-tab]', view).forEach(x => x.setAttribute('aria-selected', x === b)); show(); });
  const body = () => $('#body', view);
  let date = todayYMD();
  async function show() { if (tab === 'today') return today(); if (tab === 'shifts') return shifts(); return leave(); }

  async function today() {
    body().innerHTML = `<div class="toolbar"><label class="field inline"><span>Date</span><input class="input" type="date" id="date" value="${date}"></label></div><div id="att"><span class="skel" style="height:200px"></span></div>`;
    $('#date', view).onchange = e => { date = e.target.value; today(); };
    let r; try { r = await get('/admin/attendance', { date }); } catch (e) { $('#att', view).innerHTML = errorState(e); $('[data-retry]', view).onclick = today; return; }
    const counts = r.rows.reduce((m, x) => ({ ...m, [x.state]: (m[x.state] || 0) + 1 }), {});
    $('#att', view).innerHTML = r.rows.length ? `<div class="chips" style="margin-bottom:12px">${Object.entries(STATE).filter(([k]) => counts[k]).map(([k, [, l]]) => `<span class="chip">${l} <em>${counts[k]}</em></span>`).join('')}</div>
      <div class="card"><div class="table-wrap"><table class="table cards"><thead><tr><th>Rider</th><th>Shift</th><th>Check-in</th><th>Check-out</th><th>Breaks</th><th>Status</th></tr></thead><tbody>
      ${r.rows.map(x => { const a = x.attendance; const [bk, bl] = STATE[x.state];
        return `<tr><td class="primary"><div class="row" style="flex-wrap:nowrap">${a?.check_in_selfie ? `<a href="${esc(a.check_in_selfie)}" target="_blank" rel="noopener"><img class="selfie" src="${esc(a.check_in_selfie)}" alt="Check-in selfie of ${esc(x.rider.name)}" loading="lazy"></a>` : ''}
            <a href="#/riders/${x.rider.id}"><b>${esc(x.rider.name)}</b></a>${x.rider.employee_id ? `<span class="sub">${esc(x.rider.employee_id)}</span>` : ''}</div></td>
          <td data-label="Shift">${x.shift ? `${esc(x.shift.start_time)}–${esc(x.shift.end_time)}` : '<span class="muted">—</span>'}</td>
          <td data-label="Check-in">${a ? `${time(a.check_in_at)} ${a.status === 'late' ? badge('pending', 'Late') : ''}${a.check_in_lat != null ? ` <a class="tiny" href="https://www.google.com/maps?q=${a.check_in_lat},${a.check_in_lng}" target="_blank" rel="noopener">map</a>` : ''}` : '—'}</td>
          <td data-label="Check-out">${a?.check_out_at ? `${time(a.check_out_at)}${a.check_out_selfie ? ` <a class="tiny" href="${esc(a.check_out_selfie)}" target="_blank" rel="noopener">selfie</a>` : ''}` : '—'}</td>
          <td data-label="Breaks">${x.breaks.length ? `${x.breaks.length} · ${x.breaks.reduce((s, b) => s + mins(b.started_at, b.ended_at), 0)} min` : '—'}</td>
          <td data-label="Status">${badge(bk, bl)}${x.leave ? `<span class="sub">${esc(x.leave.reason)}</span>` : ''}</td></tr>`; }).join('')}</tbody></table></div></div>
      <p class="small muted" style="margin-top:10px">Selfies are kept for 90 days, then deleted automatically.</p>`
      : emptyState('users', 'No riders yet', 'Riders are staff with the Delivery Staff role.');
  }

  async function shifts() {
    body().innerHTML = '<span class="skel" style="height:200px"></span>';
    let r; try { r = await get('/admin/shifts'); } catch (e) { body().innerHTML = errorState(e); $('[data-retry]', view).onclick = shifts; return; }
    const byDate = r.rows.reduce((m, s) => ((m[s.date] ||= []).push(s), m), {});
    body().innerHTML = `<div class="toolbar"><span class="muted small">Next 14 days</span><span class="spacer"></span>${can('riders.manage') ? `<button class="btn btn-primary btn-sm" id="addShift">${icon('plus')} Schedule shifts</button>` : ''}</div>
      ${r.rows.length ? `<div class="card"><div class="card-body">${Object.entries(byDate).map(([d, list]) => `<div class="shift-day"><b>${fmtDate(d)}</b><div class="row">${list.map(s => `<span class="chip">${esc(s.rider_name)} · ${esc(s.start_time)}–${esc(s.end_time)}${can('riders.manage') ? ` <button class="icon-btn xs" data-del="${s.id}" aria-label="Remove shift of ${esc(s.rider_name)} on ${esc(d)}">${icon('close')}</button>` : ''}</span>`).join('')}</div></div>`).join('')}</div></div>`
        : emptyState('clock', 'No shifts scheduled', 'Schedule shifts so riders see them in the app and late check-ins are flagged. Check-in works without a shift too, unless you require one in Settings.')}`;
    $$('[data-del]', view).forEach(b => b.onclick = async () => { if (!(await confirmDialog({ title: 'Remove this shift?', message: 'The rider is notified in the app.', confirm: 'Remove', danger: true }))) return;
      try { await del(`/admin/shifts/${b.dataset.del}`); toast('Shift removed'); shifts(); } catch (x) { toastError(x); } });
    $('#addShift', view)?.addEventListener('click', () => {
      if (!r.riders.length) return toast('Add delivery staff first', 'err');
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      formDialog({ title: 'Schedule shifts', submit: 'Save shifts',
        fields: `<fieldset class="field"><legend>Riders</legend><div class="check-grid">${r.riders.map(x => `<label class="check"><input type="checkbox" name="rider_ids" value="${x.id}" checked> ${esc(x.name)}</label>`).join('')}</div></fieldset>
          <div class="grid-2"><label class="field"><span>From</span><input class="input" type="date" name="from" value="${todayYMD()}" required></label><label class="field"><span>To</span><input class="input" type="date" name="to" value="${todayYMD()}" required></label>
          <label class="field"><span>Starts</span><input class="input" type="time" name="start_time" value="10:00" required></label><label class="field"><span>Ends</span><input class="input" type="time" name="end_time" value="20:00" required></label></div>
          <fieldset class="field"><legend>On these days</legend><div class="row">${days.map((d, i) => `<label class="check"><input type="checkbox" name="days" value="${i}" checked> ${d}</label>`).join('')}</div></fieldset>
          <label class="field"><span>Note <em>(optional)</em></span><input class="input" name="note" maxlength="120" placeholder="e.g. Sonari kitchen"></label>
          <p class="small muted">An existing shift for the same rider and day is replaced.</p>`,
        onSubmit: async (v, form) => {
          const ids = [...form.querySelectorAll('[name=rider_ids]:checked')].map(i => Number(i.value)), ds = [...form.querySelectorAll('[name=days]:checked')].map(i => Number(i.value));
          if (!ids.length) throw new Error('Choose at least one rider.');
          const res = await post('/admin/shifts', { rider_ids: ids, from: v.from, to: v.to, start_time: v.start_time, end_time: v.end_time, days: ds, note: v.note });
          toast(`${res.created} shift${res.created === 1 ? '' : 's'} saved`); shifts(); }
      });
    });
  }

  async function leave() {
    body().innerHTML = '<span class="skel" style="height:200px"></span>';
    let rows; try { rows = await get('/admin/leave'); } catch (e) { body().innerHTML = errorState(e); $('[data-retry]', view).onclick = leave; return; }
    body().innerHTML = rows.length ? `<div class="card"><div class="table-wrap"><table class="table cards"><thead><tr><th>Rider</th><th>Dates</th><th>Reason</th><th>Status</th><th></th></tr></thead><tbody>
      ${rows.map(l => `<tr><td class="primary"><b>${esc(l.rider_name)}</b><span class="sub">requested ${fmtDate(l.created_at)}</span></td><td data-label="Dates">${fmtDate(l.from_date)}${l.to_date !== l.from_date ? ' – ' + fmtDate(l.to_date) : ''}</td>
        <td data-label="Reason">${esc(l.reason)}</td><td data-label="Status">${badge(l.status === 'pending' ? 'pending' : l.status === 'approved' ? 'approved' : 'cancelled', l.status[0].toUpperCase() + l.status.slice(1))}${l.decided_by_name ? `<span class="sub">by ${esc(l.decided_by_name)}</span>` : ''}</td>
        <td class="r">${l.status === 'pending' && can('riders.manage') ? `<button class="btn btn-primary btn-xs" data-dec="approved" data-id="${l.id}">Approve</button> <button class="btn btn-ghost btn-xs" data-dec="rejected" data-id="${l.id}">Reject</button>` : ''}</td></tr>`).join('')}</tbody></table></div></div>`
      : emptyState('clock', 'No leave requests', 'Riders request leave from the Attendance tab in the app.');
    $$('[data-dec]', view).forEach(b => b.onclick = async () => { try { await patch(`/admin/leave/${b.dataset.id}`, { status: b.dataset.dec }); toast(`Leave ${b.dataset.dec}`); leave(); } catch (x) { toastError(x); } });
  }

  await show();
  const on = e => { if (e.detail?.type === 'attendance' && tab === 'today') today(); };
  bus.addEventListener('rider', on);
  return () => bus.removeEventListener('rider', on);
}
