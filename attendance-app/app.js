// Punch Attendance — location-based manual punch in / punch out.
// All data is kept in localStorage on the device.

(function () {
  'use strict';

  const KEY_SETTINGS = 'attendance.settings';
  const KEY_RECORDS = 'attendance.records';

  const $ = (id) => document.getElementById(id);
  // Present only inside the Android app (see /attendance-android).
  const native = window.AndroidDevice || null;

  // ---------- storage ----------
  function load(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
    catch (e) { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage blocked */ }
  }

  let settings = load(KEY_SETTINGS, {
    empName: '', siteName: 'Office', lat: null, lng: null, radius: 100, maxAcc: 50, remind: false, webhook: '', webhookToken: ''
  });
  // records: [{ type: 'IN'|'OUT', time: ISO, lat, lng, accuracy, distance, site }]
  let records = load(KEY_RECORDS, []);

  let lastPos = null;      // latest GeolocationPosition
  let lastInside = null;   // last known inside/outside state for reminders

  // ---------- geo ----------
  function distanceMeters(lat1, lng1, lat2, lng2) {
    const R = 6371000, toRad = (d) => d * Math.PI / 180;
    const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  function hasSite() {
    return Number.isFinite(settings.lat) && Number.isFinite(settings.lng);
  }

  function evaluate(pos) {
    if (!pos || !hasSite()) return null;
    const { latitude, longitude, accuracy } = pos.coords;
    const dist = distanceMeters(latitude, longitude, settings.lat, settings.lng);
    return {
      dist, accuracy,
      inside: dist <= settings.radius,
      accurate: accuracy <= settings.maxAcc,
      lat: latitude, lng: longitude
    };
  }

  function getFreshPosition() {
    return new Promise((resolve, reject) => {
      if (!('geolocation' in navigator)) return reject(new Error('Location is not supported on this device.'));
      navigator.geolocation.getCurrentPosition(resolve, reject,
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
    });
  }

  // ---------- state ----------
  function lastRecord() { return records.length ? records[records.length - 1] : null; }
  function isPunchedIn() { const r = lastRecord(); return !!r && r.type === 'IN'; }

  // Pair IN/OUT records into shifts.
  function shifts() {
    const out = [];
    let open = null;
    for (const r of records) {
      if (r.type === 'IN') { if (open) out.push({ in: open, out: null }); open = r; }
      else if (r.type === 'OUT' && open) { out.push({ in: open, out: r }); open = null; }
    }
    if (open) out.push({ in: open, out: null });
    return out;
  }

  function shiftMs(s) {
    const end = s.out ? new Date(s.out.time) : new Date();
    return Math.max(0, end - new Date(s.in.time));
  }

  function fmtDur(ms) {
    const m = Math.floor(ms / 60000);
    return Math.floor(m / 60) + 'h ' + String(m % 60).padStart(2, '0') + 'm';
  }
  const fmtTime = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const fmtDate = (iso) => new Date(iso).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' });
  const dayKey = (d) => new Date(d).toDateString();

  // ---------- UI ----------
  function setMsg(text, cls) {
    const el = $('msg'); el.textContent = text; el.className = 'msg ' + (cls || '');
  }

  function renderStatus() {
    const pill = $('statusPill'), dt = $('distanceText'), btn = $('punchBtn');
    const punchedIn = isPunchedIn();

    btn.textContent = punchedIn ? 'Punch Out' : 'Punch In';
    btn.className = 'big ' + (punchedIn ? 'punch-out' : 'punch-in');
    $('stateText').textContent = punchedIn
      ? 'Punched in at ' + fmtTime(lastRecord().time) : 'Not punched in';

    if (!hasSite()) {
      pill.textContent = 'Set work location'; pill.className = 'pill wait';
      dt.textContent = 'Open Settings and tap "Use my current location" while at work.';
      btn.disabled = true; return;
    }
    const ev = evaluate(lastPos);
    if (!ev) {
      pill.textContent = 'Checking location…'; pill.className = 'pill wait';
      btn.disabled = true; return;
    }
    const site = settings.siteName || 'work location';
    dt.textContent = Math.round(ev.dist) + ' m from ' + site +
      ' (allowed ' + settings.radius + ' m) · GPS ±' + Math.round(ev.accuracy) + ' m';
    if (ev.inside && ev.accurate) {
      pill.textContent = 'At ' + site; pill.className = 'pill ok';
    } else if (!ev.accurate) {
      pill.textContent = 'Weak GPS'; pill.className = 'pill wait';
    } else {
      pill.textContent = 'Outside ' + site; pill.className = 'pill bad';
    }
    // Button stays enabled when inside; final check happens with a fresh fix on tap.
    btn.disabled = !ev.inside;
  }

  function renderHistory() {
    const tbody = $('history');
    tbody.innerHTML = '';
    const list = shifts().slice().reverse().slice(0, 60);
    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="muted">No punches yet.</td></tr>';
    }
    for (const s of list) {
      const tr = document.createElement('tr');
      [fmtDate(s.in.time), fmtTime(s.in.time), s.out ? fmtTime(s.out.time) : '—',
        fmtDur(shiftMs(s)) + (s.out ? '' : ' …')].forEach((t) => {
        const td = document.createElement('td'); td.textContent = t; tr.appendChild(td);
      });
      tbody.appendChild(tr);
    }
    const today = dayKey(Date.now());
    const total = shifts().filter((s) => dayKey(s.in.time) === today)
      .reduce((a, s) => a + shiftMs(s), 0);
    $('todayHours').textContent = fmtDur(total);
  }

  function renderAll() { renderStatus(); renderHistory(); }

  function tick() {
    const now = new Date();
    $('clock').textContent = now.toLocaleTimeString();
    $('today').textContent = now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
  }

  // ---------- punch ----------
  async function punch() {
    const btn = $('punchBtn');
    btn.disabled = true;
    setMsg('Getting exact location…', 'wait');
    try {
      const pos = await getFreshPosition();
      lastPos = pos;
      const ev = evaluate(pos);
      if (native && native.isMockLocation()) {
        setMsg('Fake GPS (mock location) detected. Turn off the fake-location app to punch.', 'bad');
        return;
      }
      if (!ev.accurate) {
        setMsg('GPS is not accurate enough (±' + Math.round(ev.accuracy) +
          ' m). Move to an open area and try again.', 'bad');
        return;
      }
      if (!ev.inside) {
        setMsg('You are ' + Math.round(ev.dist) + ' m away. You must be within ' +
          settings.radius + ' m of ' + (settings.siteName || 'work') + ' to punch.', 'bad');
        return;
      }
      const type = isPunchedIn() ? 'OUT' : 'IN';
      records.push({
        type, time: new Date().toISOString(),
        lat: +ev.lat.toFixed(6), lng: +ev.lng.toFixed(6),
        accuracy: Math.round(ev.accuracy), distance: Math.round(ev.dist),
        site: settings.siteName || '', employee: settings.empName || '',
        battery: battery ? Math.round(battery.level * 100) : null
      });
      save(KEY_RECORDS, records);
      setMsg((type === 'IN' ? 'Punched in' : 'Punched out') + ' at ' +
        fmtTime(lastRecord().time) + ' ✓', 'ok');
      sendToOtherApp(lastRecord());
      if (navigator.vibrate) navigator.vibrate(80);
    } catch (e) {
      setMsg(geoErrorText(e), 'bad');
    } finally {
      renderAll();
    }
  }

  function geoErrorText(e) {
    if (e && e.code === 1) return 'Location permission denied. Allow location for this site in browser settings.';
    if (e && e.code === 2) return 'Location unavailable. Turn on GPS / Location services.';
    if (e && e.code === 3) return 'Location timed out. Try again.';
    return (e && e.message) || 'Could not get location.';
  }

  // ---------- sync to another app (official API / webhook) ----------
  // Sends the real punch (time + verified GPS) to the other attendance system.
  async function sendToOtherApp(rec) {
    if (!settings.webhook) return;
    const headers = { 'Content-Type': 'application/json' };
    if (settings.webhookToken) headers.Authorization = 'Bearer ' + settings.webhookToken;
    try {
      const res = await fetch(settings.webhook, {
        method: 'POST', headers,
        body: JSON.stringify({
          event: rec.type === 'IN' ? 'clock_in' : 'clock_out',
          employee: rec.employee, site: rec.site, time: rec.time,
          latitude: rec.lat, longitude: rec.lng, accuracy_m: rec.accuracy, distance_m: rec.distance
        })
      });
      rec.synced = res.ok;
      setMsg(document.getElementById('msg').textContent +
        (res.ok ? ' · sent to other app' : ' · other app replied ' + res.status), res.ok ? 'ok' : 'bad');
    } catch (e) {
      rec.synced = false;
      setMsg(document.getElementById('msg').textContent + ' · could not reach other app', 'bad');
    }
    save(KEY_RECORDS, records);
  }

  // ---------- reminders (never punch automatically; just notify) ----------
  function maybeRemind(ev) {
    if (!ev || !ev.accurate) return;
    if (lastInside !== null && settings.remind && ev.inside !== lastInside) {
      const text = ev.inside && !isPunchedIn() ? 'You have arrived. Tap to Punch In.'
        : !ev.inside && isPunchedIn() ? 'You left work. Remember to Punch Out.' : null;
      if (text) notify(text);
    }
    lastInside = ev.inside;
  }

  function notify(text) {
    if (navigator.vibrate) navigator.vibrate([100, 60, 100]);
    if (native) native.notify(text);
    else if ('Notification' in window && Notification.permission === 'granted') {
      try { new Notification('Punch Attendance', { body: text, icon: 'icon.svg' }); } catch (e) { /* ignore */ }
    }
    setMsg(text, 'wait');
  }

  // ---------- export ----------
  function download(name, content, type) {
    if (native) { native.saveFile(name, content, type); return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type }));
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function exportCsv() {
    const esc = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const rows = [['Employee', 'Site', 'Date', 'Punch In', 'Punch Out', 'Hours',
      'In Lat', 'In Lng', 'In Distance m', 'Out Lat', 'Out Lng', 'Out Distance m', 'In Battery %', 'Out Battery %']];
    for (const s of shifts()) {
      rows.push([
        s.in.employee, s.in.site, fmtDate(s.in.time),
        new Date(s.in.time).toLocaleString(), s.out ? new Date(s.out.time).toLocaleString() : '',
        (shiftMs(s) / 3600000).toFixed(2),
        s.in.lat, s.in.lng, s.in.distance,
        s.out ? s.out.lat : '', s.out ? s.out.lng : '', s.out ? s.out.distance : '',
        s.in.battery ?? '', s.out ? (s.out.battery ?? '') : ''
      ]);
    }
    download('attendance-' + new Date().toISOString().slice(0, 10) + '.csv',
      rows.map((r) => r.map(esc).join(',')).join('\r\n'), 'text/csv');
  }

  function exportJson() {
    download('attendance-' + new Date().toISOString().slice(0, 10) + '.json',
      JSON.stringify({ settings, records }, null, 2), 'application/json');
  }

  // ---------- settings ----------
  function fillSettings() {
    $('empName').value = settings.empName || '';
    $('siteName').value = settings.siteName || '';
    $('lat').value = hasSite() ? settings.lat : '';
    $('lng').value = hasSite() ? settings.lng : '';
    $('radius').value = settings.radius;
    $('maxAcc').value = settings.maxAcc;
    $('remind').checked = !!settings.remind;
    $('webhook').value = settings.webhook || '';
    $('webhookToken').value = settings.webhookToken || '';
  }

  function saveSettings() {
    const lat = parseFloat($('lat').value), lng = parseFloat($('lng').value);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      setMsg('Enter a valid latitude and longitude, or tap "Use my current location".', 'bad');
      return;
    }
    settings = {
      empName: $('empName').value.trim(),
      siteName: $('siteName').value.trim() || 'Office',
      lat, lng,
      radius: Math.max(20, parseInt($('radius').value, 10) || 100),
      maxAcc: Math.max(10, parseInt($('maxAcc').value, 10) || 50),
      remind: $('remind').checked,
      webhook: $('webhook').value.trim(),
      webhookToken: $('webhookToken').value.trim()
    };
    save(KEY_SETTINGS, settings);
    if (!native && settings.remind && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
    fillSettings();
    setMsg('Settings saved.', 'ok');
    renderAll();
  }

  async function useHere() {
    setMsg('Getting current location…', 'wait');
    try {
      const pos = await getFreshPosition();
      $('lat').value = pos.coords.latitude.toFixed(6);
      $('lng').value = pos.coords.longitude.toFixed(6);
      setMsg('Location filled (±' + Math.round(pos.coords.accuracy) + ' m). Tap Save settings.', 'ok');
    } catch (e) { setMsg(geoErrorText(e), 'bad'); }
  }

  // ---------- battery & device details (this phone only) ----------
  let battery = null;

  function fmtSecs(sec) {
    if (!Number.isFinite(sec) || sec <= 0) return '—';
    const m = Math.round(sec / 60);
    return Math.floor(m / 60) + 'h ' + String(m % 60).padStart(2, '0') + 'm';
  }

  let nativeInfo = null;
  function readNative() {
    try { nativeInfo = JSON.parse(native.info()); } catch (e) { nativeInfo = null; return; }
    battery = nativeInfo.battery == null ? null : {
      level: nativeInfo.battery / 100, charging: nativeInfo.charging,
      chargingTime: nativeInfo.chargeTimeSec == null ? Infinity : nativeInfo.chargeTimeSec,
      dischargingTime: Infinity
    };
  }

  function renderDevice() {
    if (native) readNative();
    const lvl = $('battLevel'), st = $('battState'), bar = $('battBar');
    if (battery) {
      const pct = Math.round(battery.level * 100);
      lvl.textContent = pct + '%';
      bar.style.width = pct + '%';
      bar.style.background = pct <= 15 ? 'var(--out)' : pct <= 30 ? 'var(--warn)' : 'var(--in)';
      st.textContent = battery.charging ? 'Charging' : pct <= 15 ? 'Low battery' : 'On battery';
      st.className = 'pill ' + (battery.charging ? 'ok' : pct <= 15 ? 'bad' : 'wait');
    } else {
      lvl.textContent = 'N/A';
      st.textContent = 'Not supported in this browser'; st.className = 'pill wait';
    }
    const c = navigator.connection || {};
    const ua = navigator.userAgent;
    const os = /Android ([\d.]+)/.exec(ua) ? 'Android ' + /Android ([\d.]+)/.exec(ua)[1]
      : /iPhone OS ([\d_]+)/.exec(ua) ? 'iOS ' + /iPhone OS ([\d_]+)/.exec(ua)[1].replace(/_/g, '.')
      : (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '—';
    const model = /Android [\d.]+; ([^;)]+)/.exec(ua);
    const n = nativeInfo;
    const rows = n ? [
      ['Battery', battery ? Math.round(battery.level * 100) + '%' : 'Not available'],
      ['Status', n.full ? 'Full' : n.charging ? 'Charging' : 'Discharging'],
      ['Power source', n.plugged],
      ['Time to full', n.charging && !n.full ? fmtSecs(n.chargeTimeSec) : '—'],
      ['Battery health', n.health],
      ['Battery temperature', n.temperatureC == null ? '—' : n.temperatureC + ' °C'],
      ['Battery voltage', n.voltage == null ? '—' : n.voltage.toFixed(2) + ' V'],
      ['Battery type', n.technology || '—'],
      ['Phone', (n.manufacturer + ' ' + n.model).trim()],
      ['Android', n.android + ' (API ' + n.sdk + ')'],
      ['Network', n.network],
      ['Screen', screen.width + ' × ' + screen.height + ' @' + (window.devicePixelRatio || 1) + 'x'],
      ['CPU cores', navigator.hardwareConcurrency || '—'],
      ['Time zone', Intl.DateTimeFormat().resolvedOptions().timeZone || '—'],
      ['GPS accuracy', lastPos ? '±' + Math.round(lastPos.coords.accuracy) + ' m' : '—'],
      ['App version', n.appVersion || '—']
    ] : [
      ['Battery', battery ? Math.round(battery.level * 100) + '%' : 'Not available'],
      ['Charging', battery ? (battery.charging ? 'Yes' : 'No') : '—'],
      ['Time to full', battery && battery.charging ? fmtSecs(battery.chargingTime) : '—'],
      ['Time left', battery && !battery.charging ? fmtSecs(battery.dischargingTime) : '—'],
      ['Operating system', os],
      ['Device model', model ? model[1].trim() : '—'],
      ['Screen', screen.width + ' × ' + screen.height + ' @' + (window.devicePixelRatio || 1) + 'x'],
      ['CPU cores', navigator.hardwareConcurrency || '—'],
      ['Memory (approx.)', navigator.deviceMemory ? navigator.deviceMemory + ' GB' : '—'],
      ['Network', navigator.onLine ? 'Online' + (c.effectiveType ? ' (' + c.effectiveType.toUpperCase() + ')' : '') : 'Offline'],
      ['Data saver', c.saveData ? 'On' : c.saveData === false ? 'Off' : '—'],
      ['Language', navigator.language || '—'],
      ['Time zone', Intl.DateTimeFormat().resolvedOptions().timeZone || '—'],
      ['GPS accuracy', lastPos ? '±' + Math.round(lastPos.coords.accuracy) + ' m' : '—']
    ];
    const tbody = $('deviceInfo');
    tbody.innerHTML = '';
    for (const [k, v] of rows) {
      const tr = document.createElement('tr');
      const th = document.createElement('td'); th.className = 'muted'; th.textContent = k;
      const td = document.createElement('td'); td.textContent = v;
      tr.append(th, td); tbody.appendChild(tr);
    }
  }

  function initDevice() {
    if (native) {
      setInterval(renderDevice, 5000);
    } else if (navigator.getBattery) {
      navigator.getBattery().then((b) => {
        battery = b;
        ['levelchange', 'chargingchange', 'chargingtimechange', 'dischargingtimechange']
          .forEach((ev) => b.addEventListener(ev, renderDevice));
        renderDevice();
      }).catch(renderDevice);
    }
    window.addEventListener('online', renderDevice);
    window.addEventListener('offline', renderDevice);
    if (navigator.connection) navigator.connection.addEventListener('change', renderDevice);
    setInterval(renderDevice, 15000);
    renderDevice();
  }

  // ---------- init ----------
  function init() {
    fillSettings();
    if (!hasSite()) $('settingsBox').open = true;
    tick(); setInterval(tick, 1000);
    setInterval(renderHistory, 30000);

    $('punchBtn').addEventListener('click', punch);
    $('saveBtn').addEventListener('click', saveSettings);
    $('useHereBtn').addEventListener('click', useHere);
    $('exportBtn').addEventListener('click', exportCsv);
    $('exportJsonBtn').addEventListener('click', exportJson);
    $('clearBtn').addEventListener('click', () => {
      if (confirm('Delete ALL attendance records on this device?')) {
        records = []; save(KEY_RECORDS, records); renderAll(); setMsg('Records deleted.', 'ok');
      }
    });

    if ('geolocation' in navigator) {
      navigator.geolocation.watchPosition((pos) => {
        lastPos = pos;
        maybeRemind(evaluate(pos));
        renderStatus();
      }, (e) => {
        $('statusPill').textContent = 'No location'; $('statusPill').className = 'pill bad';
        $('distanceText').textContent = geoErrorText(e);
      }, { enableHighAccuracy: true, maximumAge: 10000, timeout: 30000 });
    } else {
      $('distanceText').textContent = 'This browser does not support location.';
    }

    if (!native && 'serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
    initDevice();
    renderAll();
  }

  init();
})();
