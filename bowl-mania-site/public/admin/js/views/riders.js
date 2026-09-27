// Riders: live operations map (Leaflet + OpenStreetMap) and rider profiles with operational performance.
// No rider earnings are shown or stored anywhere in this screen.
import { get, patch, post, api } from '../api.js';
import { $, $$, esc, icon, badge, ago, fmtDate, fmtDateTime, toast, toastError, formDialog, emptyState, errorState, initials, num } from '../ui.js';
import { can, go, bus } from '../app.js';
import { DSTEP } from './_delivery.js';

let leaflet;
function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  leaflet ||= new Promise((resolve, reject) => {
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = '/admin/vendor/leaflet/leaflet.css'; document.head.append(css);
    const s = document.createElement('script'); s.src = '/admin/vendor/leaflet/leaflet.js'; s.onload = () => resolve(window.L); s.onerror = () => reject(new Error('The map could not be loaded.'));
    document.head.append(s);
  });
  return leaflet;
}
const tiles = L => L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, referrerPolicy: 'strict-origin-when-cross-origin', attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' });
const riderIcon = (L, r) => L.divIcon({ className: '', iconSize: [38, 38], iconAnchor: [19, 19],
  html: `<span class="rider-pin ${r.online ? (r.location?.stale ? 'stale' : r.current ? 'busy' : 'on') : 'off'}">${esc(initials(r.name))}</span>` });
const kitchenIcon = L => L.divIcon({ className: '', iconSize: [30, 30], iconAnchor: [15, 15], html: '<span class="kitchen-pin">🍲</span>' });
const age = s => (s == null ? 'never' : s < 60 ? `${s} seconds ago` : ago(new Date(Date.now() - s * 1000).toISOString()));
const stateBadge = r => !r.online ? badge('off', 'Offline') : r.current ? badge('out_for_delivery', 'On delivery') : badge('ok', 'Online');

export async function render(view, ctx) {
  if (ctx.params[0]) return profile(view, Number(ctx.params[0]));
  view.innerHTML = `<div class="page-head"><div><h1>Riders</h1><p>Live positions, current orders and availability. Updates arrive as riders move.</p></div>
    <div class="actions"><div class="seg" role="group" aria-label="Show"><button type="button" data-f="all" aria-pressed="true">All</button><button type="button" data-f="online" aria-pressed="false">Online</button><button type="button" data-f="busy" aria-pressed="false">On delivery</button></div></div></div>
    <div class="live-grid"><div class="card map-card"><div id="map" role="application" aria-label="Live rider map"></div></div><div class="card rider-list" id="list"><span class="skel" style="height:240px"></span></div></div>`;
  let data, L, map, markers = new Map(), trail = null, selected = null, filter = 'all';
  try { L = await loadLeaflet(); } catch (e) { $('#map', view).innerHTML = `<p class="muted card-pad">${esc(e.message)}</p>`; }
  async function load() {
    try { data = await get('/admin/riders'); } catch (e) { $('#list', view).innerHTML = errorState(e); $('[data-retry]', view).onclick = load; return; }
    draw();
  }
  function visible() { return data.rows.filter(r => r.status === 'active' && (filter === 'all' || (filter === 'online' ? r.online : !!r.current))); }
  function draw() {
    const rows = visible();
    $('#list', view).innerHTML = rows.length ? rows.map(r => `<button class="rider-row ${selected === r.id ? 'sel' : ''}" data-id="${r.id}">
        <span class="avatar">${esc(initials(r.name))}</span><span class="grow"><b>${esc(r.name)}</b>
          <span class="small muted">${r.current ? `${esc(r.current.order_number)} · ${esc(r.current.status_label)}` : r.online ? 'Waiting for an order' : 'Offline'}</span>
          <span class="tiny ${r.location?.stale && r.online ? 'warn-text' : 'muted'}">${r.location ? `GPS ${age(r.location.age_seconds)}${r.location.stale && r.online ? ' · stale' : ''}` : 'No GPS yet'}</span></span>
        ${stateBadge(r)}</button>`).join('')
      : emptyState('scooter', data.rows.length ? 'No riders match' : 'No riders yet', data.rows.length ? 'Try another filter.' : 'Create staff with the Delivery Staff role, then they sign in to the Bowl Mania Rider app.');
    $$('.rider-row', view).forEach(b => b.onclick = () => select(Number(b.dataset.id)));
    if (!L) return;
    if (!map) {
      map = L.map($('#map', view), { zoomControl: true }); tiles(L).addTo(map);
      const k = data.kitchens.filter(x => x.lat != null);
      k.forEach(x => L.marker([x.lat, x.lng], { icon: kitchenIcon(L), title: x.name }).addTo(map).bindTooltip(`Bowl Mania ${esc(x.name)}`));
      map.setView(k.length ? [k[0].lat, k[0].lng] : [27.03, 95.0], 13);
    }
    const seen = new Set();
    for (const r of rows) {
      if (!r.location) continue;
      seen.add(r.id);
      const html = `<b>${esc(r.name)}</b> ${r.online ? '● Online' : '○ Offline'}<br>${r.current ? `Order ${esc(r.current.order_number)}<br>${esc(r.current.status_label)}<br>` : ''}Updated ${age(r.location.age_seconds)}${r.location.stale ? '<br><b style="color:#b7791f">Location may be out of date</b>' : ''}`;
      let m = markers.get(r.id);
      if (!m) { m = L.marker([r.location.lat, r.location.lng], { icon: riderIcon(L, r), title: r.name }).addTo(map).on('click', () => select(r.id)); markers.set(r.id, m); }
      m.setLatLng([r.location.lat, r.location.lng]).setIcon(riderIcon(L, r)).bindPopup(html);
    }
    for (const [id, m] of markers) if (!seen.has(id)) { m.remove(); markers.delete(id); }
  }
  async function select(id) {
    selected = id; draw();
    const r = data.rows.find(x => x.id === id);
    if (r?.location && map) map.setView([r.location.lat, r.location.lng], Math.max(map.getZoom(), 15));
    markers.get(id)?.openPopup();
    if (!L || !map) return;
    trail?.remove(); trail = null;
    const pts = await get(`/admin/riders/${id}/track`).catch(() => []);
    if (pts.length > 1) trail = L.polyline(pts.map(p => [p.lat, p.lng]), { color: '#147A43', weight: 4, opacity: .7 }).addTo(map);
    const panel = document.createElement('div');
    panel.className = 'rider-detail';
    panel.innerHTML = `<div class="row"><b>${esc(r.name)}</b>${stateBadge(r)}<span class="spacer"></span><a class="btn btn-ghost btn-xs" href="#/riders/${r.id}">Profile</a>
      ${r.online && can('delivery.assign') ? '<button class="btn btn-ghost btn-xs" data-off>Set offline</button>' : ''}</div>
      ${r.current ? `<p class="small">Order <a href="#/orders/${r.current.id}">${esc(r.current.order_number)}</a> · ${esc(r.current.status_label)}<br><span class="muted">${esc(r.current.address || '')}</span></p>` : '<p class="small muted">No active order.</p>'}
      <p class="tiny muted">${r.location ? `Last GPS ${fmtDateTime(r.location.at)} · accuracy ${r.location.accuracy != null ? Math.round(r.location.accuracy) + ' m' : '—'}${r.location.speed != null ? ` · ${Math.round(r.location.speed * 3.6)} km/h` : ''}` : 'No location received yet.'}
      ${r.phone ? ` · <a href="tel:+91${esc(r.phone)}">Call</a>` : ''}</p>`;
    $('.rider-detail', view)?.remove();
    $('#list', view).prepend(panel);
    $('[data-off]', panel)?.addEventListener('click', async () => { try { await post(`/admin/riders/${r.id}/offline`); toast(`${r.name} is offline`); load(); } catch (x) { toastError(x); } });
  }
  $$('[data-f]', view).forEach(b => b.onclick = () => { filter = b.dataset.f; $$('[data-f]', view).forEach(x => x.setAttribute('aria-pressed', x === b)); draw(); });
  await load();
  // Live updates: positions move without reloading; everything else refreshes the list.
  const onRider = e => {
    const d = e.detail;
    if (d.type === 'rider_location' && data) {
      const r = data.rows.find(x => x.id === d.data.admin_id);
      if (r) { r.location = { ...(r.location || {}), lat: d.data.lat, lng: d.data.lng, accuracy: d.data.accuracy, at: d.data.at, age_seconds: 0, stale: false }; draw(); }
    } else load();
  };
  bus.addEventListener('rider', onRider);
  const t = setInterval(() => { data?.rows.forEach(r => { if (r.location) { r.location.age_seconds += 15; r.location.stale = r.location.age_seconds > data.stale_minutes * 60; } }); draw(); }, 15_000);
  const t2 = setInterval(load, 60_000);
  return () => { bus.removeEventListener('rider', onRider); clearInterval(t); clearInterval(t2); map?.remove(); };
}

async function profile(view, id) {
  const back = `<a class="back" href="#/riders">${icon('back')} Riders</a>`;
  let r, range = { from: '', to: '' };
  async function load() {
    try { r = await get(`/admin/riders/${id}`, range); } catch (e) { view.innerHTML = back + errorState(e, false); return; }
    const p = r.performance;
    view.innerHTML = `${back}
      <div class="card card-pad order-hero"><div class="row" style="gap:14px">${r.photo_url ? `<img class="avatar lg photo" src="${esc(r.photo_url)}" alt="">` : `<span class="avatar lg">${esc(initials(r.name))}</span>`}
        <div><h1>${esc(r.name)}</h1><p class="muted">${r.employee_id ? `Employee ${esc(r.employee_id)} · ` : ''}${esc(r.vehicle_type || 'Vehicle not set')}${r.vehicle_number ? ' · ' + esc(r.vehicle_number) : ''}${r.joining_date ? ` · joined ${fmtDate(r.joining_date)}` : ''}</p></div></div>
        <div class="row">${stateBadge(r)}${r.phone ? `<a class="btn btn-ghost btn-sm" href="tel:+91${esc(r.phone)}">${icon('phone')} Call</a>` : ''}${can('riders.manage') ? '<button class="btn btn-soft btn-sm" id="edit">Edit details</button><button class="btn btn-ghost btn-sm" id="photo">Photo</button>' : ''}</div></div>
      <h2 style="margin:20px 0 10px">Today</h2>
      <div class="kpis"><div class="kpi"><span>Deliveries</span><b>${num(r.today.deliveries)}</b></div><div class="kpi"><span>Completed</span><b>${num(r.today.completed)}</b></div>
        <div class="kpi"><span>Pending</span><b>${num(r.today.pending)}</b></div><div class="kpi"><span>Distance</span><b>${r.today.distance_km} km</b></div></div>
      <div class="row" style="margin:24px 0 10px"><h2 style="margin:0">Performance</h2><span class="spacer"></span>
        <label class="field inline"><span>From</span><input class="input" type="date" id="from" value="${esc(p.from)}"></label><label class="field inline"><span>To</span><input class="input" type="date" id="to" value="${esc(p.to)}"></label></div>
      <div class="kpis"><div class="kpi"><span>Assigned</span><b>${num(p.total_deliveries)}</b></div><div class="kpi"><span>Completed</span><b>${num(p.completed)}</b></div>
        <div class="kpi"><span>Cancelled</span><b>${num(p.cancelled)}</b></div><div class="kpi"><span>Rejected</span><b>${num(p.rejected)}</b></div>
        <div class="kpi"><span>On time</span><b>${p.on_time_rate == null ? '—' : p.on_time_rate + '%'}</b><small>${num(p.on_time)} of ${num(p.completed)}</small></div>
        <div class="kpi"><span>Avg. delivery time</span><b>${p.avg_delivery_minutes == null ? '—' : p.avg_delivery_minutes + ' min'}</b></div>
        <div class="kpi"><span>Distance</span><b>${p.distance_km} km</b></div><div class="kpi"><span>Customer rating</span><b>${p.rating == null ? '—' : p.rating + ' ★'}</b><small>${num(p.ratings_count)} review${p.ratings_count === 1 ? '' : 's'}</small></div></div>
      <div class="cols-2" style="margin-top:18px"><div class="card"><div class="card-head"><h2>Delivery history</h2></div>${r.history.length ? `<div class="table-wrap"><table class="table cards"><thead><tr><th>Order</th><th>Status</th><th>When</th><th class="r">Distance</th></tr></thead><tbody>
          ${r.history.map(h => `<tr class="clickable" data-o="${h.order_id}"><td class="primary"><b>${esc(h.order_number)}</b><span class="sub">${esc(h.address || '')}</span></td><td data-label="Status">${badge(h.status === 'delivered' ? 'delivered' : 'cancelled', DSTEP[h.status] || h.status)}</td><td data-label="When">${fmtDateTime(h.at)}</td><td class="r" data-label="Distance">${h.distance_km ?? '—'} km</td></tr>`).join('')}</tbody></table></div>` : emptyState('scooter', 'No deliveries in this period')}</div>
        <div class="stack"><div class="card"><div class="card-head"><h2>Attendance</h2><a class="small" href="#/attendance">All</a></div><div class="card-body">${r.attendance.length ? r.attendance.map(a => `<div class="row small att-row">${a.check_in_selfie ? `<a href="${esc(a.check_in_selfie)}" target="_blank" rel="noopener"><img class="selfie" src="${esc(a.check_in_selfie)}" alt="Check-in selfie ${esc(a.date)}" loading="lazy"></a>` : ''}
            <span><b>${fmtDate(a.date)}</b><br><span class="muted">${fmtDateTime(a.check_in_at).split(', ').pop()} – ${a.check_out_at ? fmtDateTime(a.check_out_at).split(', ').pop() : 'working'}</span></span><span class="spacer"></span>${badge(a.status === 'late' ? 'pending' : 'ok', a.status === 'late' ? 'Late' : 'Present')}</div>`).join('') : '<p class="muted small">No attendance yet.</p>'}</div></div>
          <div class="card"><div class="card-head"><h2>Upcoming shifts</h2><a class="small" href="#/attendance?tab=shifts">Manage</a></div><div class="card-body">${r.shifts.length ? r.shifts.map(s => `<div class="row small"><b>${fmtDate(s.date)}</b><span>${esc(s.start_time)}–${esc(s.end_time)}</span>${s.note ? `<span class="muted">${esc(s.note)}</span>` : ''}</div>`).join('') : '<p class="muted small">No shifts scheduled.</p>'}</div></div></div></div>`;
    $$('[data-o]', view).forEach(tr => tr.onclick = () => go(`orders/${tr.dataset.o}`));
    ['from', 'to'].forEach(k => $('#' + k, view).onchange = e => { range[k] = e.target.value; load(); });
    $('#edit', view)?.addEventListener('click', () => formDialog({ title: `Edit ${r.name}`, submit: 'Save',
      fields: `<div class="grid-2"><label class="field"><span>Employee ID</span><input class="input" name="employee_id" maxlength="40" value="${esc(r.employee_id)}"></label>
        <label class="field"><span>Joining date</span><input class="input" type="date" name="joining_date" value="${esc(r.joining_date || '')}"></label>
        <label class="field"><span>Vehicle</span><input class="input" name="vehicle_type" maxlength="40" placeholder="e.g. Scooter" value="${esc(r.vehicle_type)}"></label>
        <label class="field"><span>Vehicle number</span><input class="input" name="vehicle_number" maxlength="20" placeholder="e.g. AS06 AB 1234" value="${esc(r.vehicle_number)}"></label></div>
        <p class="small muted">Name, phone, email and password are changed in Staff & roles.</p>`,
      onSubmit: async v => { await patch(`/admin/riders/${id}`, v); toast('Rider updated'); load(); } }));
    $('#photo', view)?.addEventListener('click', () => {
      const inp = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/jpeg,image/png,image/webp' });
      inp.onchange = async () => { const fd = new FormData(); fd.append('photo', inp.files[0]);
        try { await api(`/admin/riders/${id}/photo`, { method: 'POST', body: fd }); toast('Photo updated'); load(); } catch (x) { toastError(x); } };
      inp.click();
    });
  }
  await load();
}
