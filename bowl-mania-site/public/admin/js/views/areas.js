import { get, post, patch, del } from '../api.js';
import { $, $$, esc, icon, rupee, badge, fmtDate, toast, toastError, confirmDialog, formDialog, emptyState, errorState, todayYMD } from '../ui.js';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export async function render(view, ctx) {
  let areas = [], cal = { holidays: [], special_hours: [] };
  view.innerHTML = `<div class="page-head"><div><h1>Delivery areas & hours</h1><p>Kitchen locations, delivery radius, charges and time slots. Changes apply to the website immediately.</p></div>
    <div class="actions"><button class="btn btn-primary btn-sm" id="add">${icon('plus')} Add delivery area</button></div></div><div id="areas" class="stack"></div>
    <div class="cols-2-even" style="margin-top:20px"><div class="card"><div class="card-head"><h2>Holidays & closures</h2><button class="btn btn-ghost btn-xs" id="addHoliday">Add closure</button></div><div class="card-body" id="holidays"></div></div>
      <div class="card"><div class="card-head"><h2>Special hours</h2><button class="btn btn-ghost btn-xs" id="addSpecial">Add special hours</button></div><div class="card-body" id="special"></div></div></div>`;
  async function load() {
    try { [areas, cal] = await Promise.all([get('/admin/delivery/areas'), get('/admin/delivery/calendar')]); } catch (e) { $('#areas', view).innerHTML = errorState(e); $('[data-retry]', view).onclick = load; return; }
    $('#areas', view).innerHTML = areas.length ? areas.map(a => `<div class="card"><div class="card-head"><div class="row">${icon('pin')}<h2>${esc(a.name)}</h2>${a.active ? '' : badge('off', 'Off')}${a.delivery_enabled ? badge('ok', 'Delivery') : ''}${a.pickup_enabled ? badge('ok', 'Pickup') : ''}</div><button class="btn btn-ghost btn-xs" data-edit="${a.id}">Edit</button></div>
      <div class="card-body grid-3"><div><span class="eyebrow">Delivery charge</span><p><b>${rupee(a.base_charge)}</b> for the first ${a.base_distance_km} km, then <b>${rupee(a.extra_charge)}</b> per ${a.extra_distance_km} km. Up to <b>${a.max_radius_km} km</b>.</p>
          <p class="tiny muted">${a.fee_examples.filter(x => x.fee != null).map(x => `${x.km} km → ${rupee(x.fee)}`).join(' · ')}</p></div>
        <div><span class="eyebrow">Time slots</span>${a.slots.map(s => `<p class="small">${s.active ? '' : '<s>'}<b>${esc(s.label)}</b> ${esc(s.start_time)}–${esc(s.end_time)} <span class="muted">${s.days.length === 7 ? 'daily' : s.days.split('').map(d => DAYS[d]).join(', ')}</span>${s.active ? '' : '</s>'}</p>`).join('') || '<p class="muted small">No slots — orders are not possible.</p>'}</div>
        <div><span class="eyebrow">Next slots</span>${a.upcoming.map(s => `<p class="small">${esc(s.display)}</p>`).join('') || '<p class="muted small">None in the next 2 days.</p>'}
          <p class="tiny muted">Kitchen at <a href="https://www.google.com/maps?q=${a.lat},${a.lng}" target="_blank" rel="noopener">${a.lat.toFixed(5)}, ${a.lng.toFixed(5)}</a>${a.phone ? ' · ' + esc(a.phone) : ''}</p></div></div></div>`).join('')
      : emptyState('pin', 'No delivery areas', 'Add your first kitchen location to start taking orders.');
    $$('[data-edit]', view).forEach(b => b.onclick = () => edit(areas.find(a => a.id == b.dataset.edit)));
    const nameOf = id => id ? areas.find(a => a.id === id)?.name : 'All locations';
    $('#holidays', view).innerHTML = cal.holidays.length ? cal.holidays.map(h => `<div class="row" style="justify-content:space-between;padding:6px 0;border-bottom:1px dashed var(--line)"><span><b>${fmtDate(h.date + 'T12:00:00Z')}</b> · ${esc(nameOf(h.area_id))}${h.note ? ` <span class="muted">— ${esc(h.note)}</span>` : ''}</span><button class="btn-link small" data-delh="${h.id}">Remove</button></div>`).join('') : '<p class="muted small">No upcoming closures.</p>';
    $('#special', view).innerHTML = cal.special_hours.length ? cal.special_hours.map(h => `<div class="row" style="justify-content:space-between;padding:6px 0;border-bottom:1px dashed var(--line)"><span><b>${fmtDate(h.date + 'T12:00:00Z')}</b> ${esc(h.start_time)}–${esc(h.end_time)} · ${esc(nameOf(h.area_id))}${h.note ? ` <span class="muted">— ${esc(h.note)}</span>` : ''}</span><button class="btn-link small" data-dels="${h.id}">Remove</button></div>`).join('') : '<p class="muted small">Special hours replace the normal slots on that date.</p>';
    $$('[data-delh]', view).forEach(b => b.onclick = async () => { await del(`/admin/delivery/holidays/${b.dataset.delh}`); toast('Closure removed'); load(); });
    $$('[data-dels]', view).forEach(b => b.onclick = async () => { await del(`/admin/delivery/special-hours/${b.dataset.dels}`); toast('Special hours removed'); load(); });
  }
  const slotRow = (s = { label: '', days: '0123456', start_time: '', end_time: '', active: true }) => `<div class="card card-pad stack-sm" data-slot="${s.id || ''}" style="padding:12px"><div class="grid-4">
    <label class="field"><span>Name</span><input class="input" data-k="label" value="${esc(s.label)}" placeholder="Morning"></label><label class="field"><span>Opens</span><input class="input" type="time" data-k="start_time" value="${esc(s.start_time)}"></label>
    <label class="field"><span>Closes</span><input class="input" type="time" data-k="end_time" value="${esc(s.end_time)}"></label><label class="switch" style="align-self:end"><input type="checkbox" data-k="active" ${s.active ? 'checked' : ''}><i></i>Active</label></div>
    <div class="row"><div class="chips">${DAYS.map((d, i) => `<label class="chip" style="height:30px"><input type="checkbox" data-day="${i}" ${s.days.includes(String(i)) ? 'checked' : ''} style="accent-color:var(--green)"> ${d}</label>`).join('')}</div><span class="spacer"></span><button type="button" class="btn-link small" data-rm style="color:var(--err)">Remove slot</button></div></div>`;
  function edit(a) {
    const m = formDialog({ title: a ? `Edit ${a.name}` : 'Add delivery area', size: 'wide', submit: 'Save', extraFooter: a ? '<button class="btn btn-danger-ghost" type="button" data-delete>Delete</button>' : '',
      fields: `<div class="grid-3"><label class="field"><span>Location name</span><input class="input" name="name" required maxlength="60" value="${esc(a?.name || '')}"></label>
        <label class="field"><span>Phone</span><input class="input" name="phone" maxlength="20" value="${esc(a?.phone || '')}"></label><label class="field"><span>WhatsApp (with 91)</span><input class="input" name="whatsapp" maxlength="20" value="${esc(a?.whatsapp || '')}"></label></div>
        <label class="field"><span>Kitchen address</span><input class="input" name="address" maxlength="300" value="${esc(a?.address || '')}"></label>
        <div class="grid-3"><label class="field"><span>Latitude</span><input class="input" name="lat" type="number" step="any" required value="${a?.lat ?? ''}"></label><label class="field"><span>Longitude</span><input class="input" name="lng" type="number" step="any" required value="${a?.lng ?? ''}"></label>
          <button class="btn btn-ghost btn-sm" type="button" id="here" style="align-self:end">${icon('pin')} Use my current location</button></div>
        <p class="tiny muted" style="margin-top:-8px">Tip: in Google Maps, long-press the kitchen and copy the coordinates. Distances are measured in a straight line from here.</p>
        <div class="grid-4"><label class="field"><span>Base distance (km)</span><input class="input" name="base_distance_km" type="number" step="0.1" min="0.1" required value="${a?.base_distance_km ?? 1.5}"></label>
          <label class="field"><span>Base charge (₹)</span><input class="input" name="base_charge" type="number" min="0" required value="${a?.base_charge ?? 10}"></label>
          <label class="field"><span>Each extra (km)</span><input class="input" name="extra_distance_km" type="number" step="0.1" min="0.1" required value="${a?.extra_distance_km ?? 1.5}"></label>
          <label class="field"><span>Extra charge (₹)</span><input class="input" name="extra_charge" type="number" min="0" required value="${a?.extra_charge ?? 10}"></label></div>
        <div class="grid-4"><label class="field"><span>Max radius (km)</span><input class="input" name="max_radius_km" type="number" step="0.1" min="0.5" required value="${a?.max_radius_km ?? 6}"></label>
          <label class="check" style="align-self:end"><input type="checkbox" name="delivery_enabled" ${a ? (a.delivery_enabled ? 'checked' : '') : 'checked'}> Delivery</label>
          <label class="check" style="align-self:end"><input type="checkbox" name="pickup_enabled" ${a ? (a.pickup_enabled ? 'checked' : '') : 'checked'}> Pickup</label>
          <label class="check" style="align-self:end"><input type="checkbox" name="active" ${a ? (a.active ? 'checked' : '') : 'checked'}> Active</label></div>
        <fieldset class="field"><legend>Delivery & pickup slots</legend><div class="stack-sm" id="slots">${(a?.slots?.length ? a.slots : [{ label: 'Morning', days: '0123456', start_time: '07:00', end_time: '09:00', active: true }, { label: 'Evening', days: '0123456', start_time: '16:00', end_time: '20:00', active: true }]).map(slotRow).join('')}</div>
          <button type="button" class="btn-link small" id="addSlot">+ Add slot</button></fieldset>`,
      onMount: f => {
        $('#addSlot', f).onclick = () => $('#slots', f).insertAdjacentHTML('beforeend', slotRow());
        $('#slots', f).onclick = e => { if (e.target.closest('[data-rm]')) e.target.closest('[data-slot]').remove(); };
        $('#here', f).onclick = () => navigator.geolocation?.getCurrentPosition(p => { f.lat.value = p.coords.latitude.toFixed(6); f.lng.value = p.coords.longitude.toFixed(6); }, () => toast('Location permission was denied', 'err'), { enableHighAccuracy: true });
      },
      onSubmit: async (v, f) => {
        const slots = $$('[data-slot]', f).map(r => ({ ...(r.dataset.slot ? { id: Number(r.dataset.slot) } : {}), label: $('[data-k=label]', r).value.trim(), start_time: $('[data-k=start_time]', r).value, end_time: $('[data-k=end_time]', r).value,
          active: $('[data-k=active]', r).checked, days: $$('[data-day]', r).filter(c => c.checked).map(c => c.dataset.day).join('') }));
        const body = { ...v, slots }; for (const k of ['lat', 'lng', 'base_distance_km', 'base_charge', 'extra_distance_km', 'extra_charge', 'max_radius_km']) body[k] = Number(v[k]);
        if (a) await patch(`/admin/delivery/areas/${a.id}`, body); else await post('/admin/delivery/areas', body); toast('Delivery area saved'); load();
      } });
    $('[data-delete]', m.el)?.addEventListener('click', async () => { if (!(await confirmDialog({ title: `Delete ${a.name}?`, message: 'Areas with past orders cannot be deleted; turn them off instead.', confirm: 'Delete', danger: true }))) return;
      try { await del(`/admin/delivery/areas/${a.id}`); m.close(); load(); } catch (x) { toastError(x); } });
  }
  const areaSel = () => `<label class="field"><span>Location</span><select class="select" name="area_id" data-type="number"><option value="">All locations</option>${areas.map(a => `<option value="${a.id}">${esc(a.name)}</option>`).join('')}</select></label>`;
  $('#add', view).onclick = () => edit(null);
  $('#addHoliday', view).onclick = () => formDialog({ title: 'Add closure', size: 'narrow', submit: 'Add', fields: `<label class="field"><span>Date</span><input class="input" type="date" name="date" required min="${todayYMD()}"></label>${areaSel()}<label class="field"><span>Note</span><input class="input" name="note" placeholder="e.g. Bihu holiday"></label>`,
    onSubmit: async v => { await post('/admin/delivery/holidays', v); toast('Closure added'); load(); } });
  $('#addSpecial', view).onclick = () => formDialog({ title: 'Add special hours', size: 'narrow', submit: 'Add', fields: `<label class="field"><span>Date</span><input class="input" type="date" name="date" required min="${todayYMD()}"></label>${areaSel()}
    <div class="grid-2"><label class="field"><span>Opens</span><input class="input" type="time" name="start_time" required></label><label class="field"><span>Closes</span><input class="input" type="time" name="end_time" required></label></div><label class="field"><span>Name</span><input class="input" name="note" placeholder="e.g. Festival hours"></label>`,
    onSubmit: async v => { await post('/admin/delivery/special-hours', v); toast('Special hours added'); load(); } });
  await load();
  if (ctx.query.new) edit(null);
}
