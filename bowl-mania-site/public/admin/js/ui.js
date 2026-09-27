// Small UI toolkit shared by every admin screen.
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const icon = (name, cls = '') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
export const rupee = n => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');
export const num = n => (Number(n) || 0).toLocaleString('en-IN');
export const debounce = (fn, ms = 300) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
export const initials = name => String(name || '?').split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
export let TZ = 'Asia/Kolkata';
export const setTZ = tz => { TZ = tz || TZ; };
/** Server timestamps are UTC ("YYYY-MM-DD HH:MM:SS" or ISO). */
export const toDate = s => s ? new Date(/T/.test(s) ? s : s.replace(' ', 'T') + 'Z') : null;
export const fmtDateTime = s => { const d = toDate(s); return d && !isNaN(d) ? d.toLocaleString('en-IN', { timeZone: TZ, day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : ''; };
export const fmtDate = s => { const d = toDate(s); return d && !isNaN(d) ? d.toLocaleDateString('en-IN', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric' }) : ''; };
export const fmtTime = s => { const d = toDate(s); return d && !isNaN(d) ? d.toLocaleTimeString('en-IN', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }) : ''; };
export function ago(s) {
  const d = toDate(s); if (!d) return '';
  const m = Math.round((Date.now() - d) / 60000);
  if (m < 1) return 'just now'; if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h} h ago`;
  return fmtDate(s);
}
/** Local date string YYYY-MM-DD in the restaurant timezone. */
export const todayYMD = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
/** UTC timestamp → value for <input type="datetime-local"> in restaurant time. */
export function toLocalInput(s) {
  const d = toDate(s); if (!d) return '';
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

export const STATUS = {
  new: 'New', confirmed: 'Confirmed', accepted: 'Accepted', preparing: 'Preparing', ready: 'Ready', out_for_delivery: 'Out for delivery',
  delivered: 'Delivered', completed: 'Completed', cancelled: 'Cancelled', refunded: 'Refunded'
};
export const STATUS_COLOR = { new: '#b7791f', confirmed: '#2b6cb0', accepted: '#2b6cb0', preparing: '#6b46c1', ready: '#0f7c7c', out_for_delivery: '#1f5f99', delivered: '#1f8a4c', completed: '#1f8a4c', cancelled: '#c0392b', refunded: '#6b6a63' };
export const PAY = { created: 'Awaiting payment', pending: 'Pending', paid: 'Paid', failed: 'Failed', refunded: 'Refunded', partially_refunded: 'Part refunded' };
export const badge = (key, label, extra = '') => `<span class="badge b-${esc(key)} ${extra}">${esc(label ?? key)}</span>`;
export const statusBadge = s => badge(s, STATUS[s] || s);
export const payBadge = (s, method) => badge(s, `${method === 'cod' ? 'Cash' : method === 'online' ? 'Online' : ''}${method ? ' · ' : ''}${PAY[s] || s}`);
export const dietMark = d => d === 'both' ? '<i class="diet veg" title="Veg option"></i><i class="diet nonveg" title="Non-veg option"></i>' : `<i class="diet ${d === 'nonveg' ? 'nonveg' : d === 'egg' ? 'egg' : 'veg'}" title="${esc({ veg: 'Vegetarian', egg: 'Contains egg', nonveg: 'Non-vegetarian' }[d] || '')}"></i>`;
export const stars = n => `<span class="stars" aria-label="${n} out of 5">${'★'.repeat(n)}${'☆'.repeat(5 - n)}</span>`;

// ---------- Toasts ----------
export function toast(message, type = 'ok', { action, onAction, timeout = 3200 } = {}) {
  const el = document.createElement('div');
  el.className = `toast ${type}`; el.setAttribute('role', type === 'err' ? 'alert' : 'status');
  el.innerHTML = `${icon(type === 'err' ? 'close' : type === 'order' ? 'bell' : 'check')}<span>${esc(message)}</span>${action ? `<button type="button">${esc(action)}</button>` : ''}`;
  if (action) el.querySelector('button').onclick = () => { onAction?.(); el.remove(); };
  $('#toasts').append(el);
  setTimeout(() => el.remove(), timeout);
}
export const toastError = e => toast(e?.message || String(e), 'err', { timeout: 5000 });

// ---------- Modals ----------
let openCount = 0;
/** Opens a dialog. `render(body, close)` fills it; returns { el, close }. Focus is trapped and restored. */
export function modal({ title, body = '', footer = '', size = '', onClose } = {}) {
  const last = document.activeElement;
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `<div class="modal ${size}" role="dialog" aria-modal="true" aria-labelledby="mt-${++openCount}">
    <div class="modal-head"><h2 id="mt-${openCount}">${esc(title)}</h2><button type="button" class="icon-btn" data-x aria-label="Close">${icon('close')}</button></div>
    <div class="modal-body">${body}</div>${footer ? `<div class="modal-foot">${footer}</div>` : ''}</div>`;
  const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); if (!document.querySelector('.modal-backdrop')) document.body.style.overflow = ''; last?.focus?.(); onClose?.(); };
  const onKey = e => {
    if (e.key === 'Escape') close();
    if (e.key === 'Tab') {
      const f = $$('a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select,textarea,[tabindex]:not([tabindex="-1"])', wrap).filter(x => x.offsetParent);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f.at(-1).focus(); }
      else if (!e.shiftKey && document.activeElement === f.at(-1)) { e.preventDefault(); f[0].focus(); }
    }
  };
  wrap.addEventListener('mousedown', e => { if (e.target === wrap) close(); });
  wrap.querySelector('[data-x]').onclick = close;
  document.addEventListener('keydown', onKey);
  $('#overlay-root').append(wrap); document.body.style.overflow = 'hidden';
  setTimeout(() => ($('input:not([type=hidden]):not([type=checkbox]):not([type=radio]),select,textarea', wrap.querySelector('.modal-body')) || wrap.querySelector('[data-x]')).focus(), 30);
  return { el: wrap, close };
}
/** Confirmation dialog for destructive or important actions. Resolves true/false. */
export function confirmDialog({ title = 'Are you sure?', message = '', confirm = 'Confirm', danger = false, input = null } = {}) {
  return new Promise(resolve => {
    let done = false;
    const m = modal({ title, size: 'narrow',
      body: `<p>${message}</p>${input ? `<label class="field"><span>${esc(input.label)}</span><input class="input" id="confirmInput" placeholder="${esc(input.placeholder || '')}" value="${esc(input.value || '')}"></label>` : ''}`,
      footer: `<span class="spacer"></span><button class="btn btn-ghost" data-no>Cancel</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-yes>${esc(confirm)}</button>`,
      onClose: () => { if (!done) resolve(false); } });
    m.el.querySelector('[data-no]').onclick = () => m.close();
    m.el.querySelector('[data-yes]').onclick = () => { done = true; const v = input ? m.el.querySelector('#confirmInput').value : true; m.close(); resolve(v); };
  });
}
/**
 * Form dialog. `fields` html; `onSubmit(values, form)` may throw ApiError to show inline.
 * Values: inputs by name; data-type="number|bool|json" coerce.
 */
export function formDialog({ title, fields, submit = 'Save', size = '', onSubmit, extraFooter = '', onMount }) {
  const m = modal({ title, size, body: `<form class="stack" id="dlgForm" novalidate>${fields}<div class="form-error" hidden></div><button type="submit" hidden></button></form>`,
    footer: `${extraFooter}<span class="spacer"></span><button class="btn btn-ghost" type="button" data-cancel>Cancel</button><button class="btn btn-primary" type="button" data-submit>${esc(submit)}</button>` });
  const form = m.el.querySelector('#dlgForm'), err = form.querySelector('.form-error'), btn = m.el.querySelector('[data-submit]');
  m.el.querySelector('[data-cancel]').onclick = m.close;
  const run = async e => {
    e?.preventDefault(); err.hidden = true;
    btn.classList.add('is-loading');
    try { const r = await onSubmit(readForm(form), form, m); if (r !== false) m.close(); }
    catch (x) { err.textContent = x.message; err.hidden = false; err.scrollIntoView({ block: 'nearest' }); }
    finally { btn.classList.remove('is-loading'); }
  };
  btn.onclick = run; form.onsubmit = run;
  onMount?.(form, m);
  return m;
}
export function readForm(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name || el.disabled) continue;
    const t = el.dataset.type;
    if (el.type === 'checkbox') { if (t === 'list') { out[el.name] ||= []; if (el.checked) out[el.name].push(el.value); } else out[el.name] = el.checked; continue; }
    if (el.type === 'radio') { if (el.checked) out[el.name] = el.value; continue; }
    if (el.tagName === 'SELECT' && el.multiple) { out[el.name] = [...el.selectedOptions].map(o => t === 'number' ? Number(o.value) : o.value); continue; }
    let v = el.value;
    if (t === 'number') v = v === '' ? null : Number(v);
    out[el.name] = v;
  }
  return out;
}

// ---------- Common blocks ----------
export const emptyState = (ic, title, text = '', action = '') => `<div class="empty"><div class="art">${icon(ic)}</div><h3>${esc(title)}</h3>${text ? `<p>${text}</p>` : ''}${action}</div>`;
export const skeleton = (rows = 5, h = 18) => `<div class="card card-pad stack-sm">${Array.from({ length: rows }, (_, i) => `<span class="skel" style="height:${h}px;width:${90 - (i % 3) * 15}%"></span>`).join('')}</div>`;
export const errorState = (e, retry = true) => `<div class="error-state"><span>${esc(e.message || e)}</span>${retry ? '<button class="btn btn-ghost btn-sm" data-retry>Try again</button>' : ''}</div>`;
export function pager({ total, page, limit }, onPage) {
  const pages = Math.max(1, Math.ceil(total / limit));
  const el = document.createElement('div'); el.className = 'pager';
  el.innerHTML = `<span>${total ? `${num((page - 1) * limit + 1)}–${num(Math.min(total, page * limit))} of ${num(total)}` : 'No results'}</span>
    <div class="row"><button class="btn btn-ghost btn-xs" ${page <= 1 ? 'disabled' : ''} data-p="${page - 1}">Previous</button><span class="small">Page ${page} of ${pages}</span><button class="btn btn-ghost btn-xs" ${page >= pages ? 'disabled' : ''} data-p="${page + 1}">Next</button></div>`;
  el.onclick = e => { const b = e.target.closest('[data-p]'); if (b) onPage(Number(b.dataset.p)); };
  return el;
}
export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('Copied'); }
  catch { const i = document.createElement('input'); i.value = text; document.body.append(i); i.select(); document.execCommand?.('copy'); i.remove(); toast('Copied'); }
}
export const waLink = (phone, text = '') => `https://wa.me/91${String(phone).replace(/\D/g, '').slice(-10)}${text ? '?text=' + encodeURIComponent(text) : ''}`;
/** Downloads a file from a GET URL using the cookie session. */
export function download(url) { const a = document.createElement('a'); a.href = url; a.rel = 'noopener'; document.body.append(a); a.click(); a.remove(); }
