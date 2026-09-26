// Bowl Mania website. Menu, prices, hours, delivery charges and totals all come from the server;
// the browser only keeps the cart (item + size + quantity) and shows what the server calculates.
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rupee = n => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;
const debounce = (fn, ms = 300) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const img = u => !u ? 'assets/logo.jpg' : u;
const fmt12 = hhmm => { const [h, m] = hhmm.split(':').map(Number); return `${h % 12 || 12}${m ? ':' + String(m).padStart(2, '0') : ''} ${h < 12 ? 'AM' : 'PM'}`; };
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

async function api(path, body) {
  const r = await fetch('/api' + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { headers: { Accept: 'application/json' } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(d.error || 'Something went wrong. Please try again.'), { status: r.status });
  return d;
}

// Used only when the page is opened without the server (static preview): ordering then goes to WhatsApp.
const FALLBACK = { categories: [], items: [
  ['Morning Glow Bowl', 'Oats · Fresh Fruits · Nuts & Seeds', 'morning-glow', 'veg', [['250 ml', 99], ['500 ml', 149]], 'Breakfast pick'],
  ['Bean Vitality Bowl', 'Steamed Beans · Paneer · Fresh Veggies · Herbs & Dressing', 'bean-vitality', 'veg', [['250 ml', 99], ['500 ml', 149]]],
  ['Grill Power Bowl', 'Grilled Chicken or Paneer · Fresh Veggies · Signature Dressing', 'grill-power', 'both', [['250 ml', 99], ['500 ml', 149]], 'Chicken or paneer'],
  ['Chicken Crunch Bowl', 'Grilled Chicken · Crunchy Fresh Veggies · Sweet Corn · Sesame · Signature Dressing', 'chicken-crunch', 'nonveg', [['250 ml', 99], ['500 ml', 149]]],
  ['Sprout Bowl', 'Sprouts · Dates · Pomegranate · Nuts · Coriander · Indian Masala & Chutney', 'sprout', 'veg', [['250 ml', 99], ['500 ml', 149]], '', 'Indic Touch'],
  ['Super Protein Bowl', 'Chicken + Paneer + Egg + Nuts & Seeds + Fresh Veggies + Dressing', 'super-protein', 'nonveg', [['500 ml', 199], ['750 ml', 249]], 'High protein']
].map(([name, description, slug, diet, sizes, tag = '', subtitle = ''], i) => ({ id: i + 1, name, subtitle, description, diet, tag, image: `assets/bowls/${slug}.jpg`, available: true, featured: false, spicy: 0,
  sizes: sizes.map(([label, price], j) => ({ id: (i + 1) * 10 + j, label, price })) })) };

let MENU = FALLBACK, CONFIG = null, LIVE = false;

/* ---------- Header, navigation, reveal, videos ---------- */
const header = $('.header'), nav = $('#site-nav'), toggle = $('.menu-toggle');
const setNav = open => { nav.classList.toggle('is-open', open); toggle.setAttribute('aria-expanded', open); toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu'); };
toggle.addEventListener('click', () => setNav(!nav.classList.contains('is-open')));
$$('a', nav).forEach(a => a.addEventListener('click', () => setNav(false)));
addEventListener('scroll', () => header.classList.toggle('is-scrolled', scrollY > 10), { passive: true });
const navObserver = new IntersectionObserver(entries => entries.forEach(e => { if (e.isIntersecting) $$('a', nav).forEach(a => a.classList.toggle('is-current', a.getAttribute('href') === `#${e.target.id}`)); }), { rootMargin: '-45% 0px -50% 0px' });
$$('main section[id]').forEach(s => navObserver.observe(s));
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const videoObserver = new IntersectionObserver(entries => entries.forEach(e => { const v = e.target; if (e.isIntersecting && !reduceMotion) { v.preload = 'auto'; v.play().catch(() => {}); } else v.pause(); }), { threshold: .25 });
$$('video[data-autoplay]').forEach(v => videoObserver.observe(v));
if (reduceMotion) $$('.hero-frame video').forEach(v => { v.removeAttribute('autoplay'); v.pause(); });

let toastTimer;
function toast(text, action) {
  const t = $('[data-toast]');
  t.innerHTML = esc(text) + (action ? ` · <u style="cursor:pointer">${esc(action)}</u>` : '');
  t.style.pointerEvents = action ? 'auto' : 'none'; t.onclick = action ? openCart : null;
  t.classList.add('show'); clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.classList.remove('show'); t.style.pointerEvents = 'none'; }, 2800);
}

/* ---------- Site configuration (hours, areas, contacts) ---------- */
function renderConfig() {
  if (!CONFIG) return;
  const { status, areas, restaurant } = CONFIG;
  const pill = $('[data-status-pill]');
  const next = status.areas.map(a => a.next).filter(Boolean).sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0];
  const current = status.areas.find(a => a.current)?.current;
  pill.classList.toggle('open', status.open); pill.classList.toggle('closed', !status.open);
  pill.querySelector('span').innerHTML = status.mode === 'closed' ? esc(status.message)
    : status.open ? `<b>Open now</b>${current ? ` · delivering until ${fmt12(current.end_time)}` : ''}`
    : `<b>Closed now</b>${next ? ` · pre-order for ${esc(next.display.split(' · ')[0].toLowerCase())} ${fmt12(next.start_time)}` : ''}`;

  const slotText = s => `${esc(s.label)}`;
  const daysText = d => d.length === 7 ? '' : ` <span class="fine">${d.split('').map(x => DAYS[x]).join(', ')}</span>`;
  const branches = $('[data-branches]');
  const rule = areas[0]?.fee_rule;
  const sameRule = areas.every(a => JSON.stringify(a.fee_rule) === JSON.stringify(rule));
  branches.innerHTML = areas.map(a => `<article class="branch"><header><svg class="ic"><use href="#i-pin"/></svg><h3>${esc(a.name)}</h3></header>
      <ul class="slots">${a.slots.map(s => `<li><svg class="ic"><use href="#i-clock"/></svg><span>${slotText(s)}${daysText(s.days)}</span><b>${fmt12(s.start_time)} – ${fmt12(s.end_time)}</b></li>`).join('')}</ul>
      ${sameRule ? '' : `<p class="fine">${rupee(a.fee_rule.base_charge)} up to ${a.fee_rule.base_distance_km} km, then +${rupee(a.fee_rule.extra_charge)} per ${a.fee_rule.extra_distance_km} km · up to ${a.max_radius_km} km</p>`}
      <div class="branch-actions">${a.whatsapp ? `<a class="btn btn-primary btn-sm" href="https://wa.me/${esc(a.whatsapp)}" target="_blank" rel="noopener"><svg class="ic"><use href="#i-wa"/></svg> WhatsApp</a>` : ''}${a.phone ? `<a class="btn btn-outline btn-sm" href="tel:+91${esc(a.phone)}"><svg class="ic"><use href="#i-phone"/></svg> ${esc(a.phone)}</a>` : ''}</div></article>`).join('')
    + (sameRule && rule ? `<article class="branch branch-fees"><header><svg class="ic"><use href="#i-scooter"/></svg><h3>Delivery charge</h3></header>
      <table class="fees"><tbody>${rule.examples.slice(0, 3).map((x, i, arr) => `<tr><td>${i ? arr[i - 1].upto_km : 0} – ${x.upto_km} km</td><td>${rupee(x.fee)}</td></tr>`).join('')}</tbody></table>
      <p class="fine">+${rupee(rule.extra_charge)} for every additional ${rule.extra_distance_km} km · we deliver up to ${Math.max(...areas.map(a => a.max_radius_km))} km. Pickup is free.</p></article>` : '');
  $('[data-delivery-intro]').textContent = `${areas.length === 1 ? 'One location' : `${areas.length} locations`}, fresh delivery windows every day. Self pickup is always free.`;
  areas.slice(0, 2).forEach((a, i) => { const col = $(`[data-footer-area="${i}"]`); if (col) col.innerHTML = `<h4>${esc(a.name)}</h4><p>${a.phone ? `<a href="tel:+91${esc(a.phone)}">+91 ${esc(a.phone)}</a><br>` : ''}${a.slots.map(s => `${fmt12(s.start_time)}–${fmt12(s.end_time)}`).join(' · ')}</p>`; });
  $('[data-contact-links]').innerHTML = areas.map(a => a.whatsapp ? `<a href="https://wa.me/${esc(a.whatsapp)}" target="_blank" rel="noopener"><svg class="ic"><use href="#i-wa"/></svg> WhatsApp ${esc(a.name)} · ${esc(a.phone)}</a>` : '').join('')
    + (restaurant.instagram ? `<a href="${esc(restaurant.instagram)}" target="_blank" rel="noopener"><svg class="ic"><use href="#i-ig"/></svg> Follow us on Instagram</a>` : '');
  $('[data-pickup-areas]').innerHTML = areas.filter(a => a.pickup_enabled).map(a => `<option value="${a.id}">${esc(a.name)}${a.address ? ' · ' + esc(a.address) : ''}</option>`).join('');
}

/* ---------- Menu ---------- */
const grid = $('[data-menu-grid]');
const dietMarks = d => d === 'both' ? '<i class="diet veg" title="Vegetarian option"></i><i class="diet nonveg" title="Non-veg option"></i>'
  : `<i class="diet ${d === 'nonveg' || d === 'egg' ? 'nonveg' : 'veg'}" title="${d === 'nonveg' ? 'Non-vegetarian' : d === 'egg' ? 'Contains egg' : 'Vegetarian'}"></i>`;
let filterDiet = 'all', filterCat = '';
function renderMenu() {
  const items = MENU.items.filter(i => (filterDiet === 'all' || i.diet === 'both' || (filterDiet === 'veg' ? i.diet === 'veg' : i.diet !== 'veg')) && (!filterCat || String(i.category_id) === filterCat));
  grid.innerHTML = items.map(item => {
    const sold = !item.available;
    return `<article class="dish ${sold ? 'soldout' : ''}" data-id="${item.id}">
      <div class="dish-media"><img src="${esc(img(item.image))}" alt="${esc(item.name)}" loading="lazy" width="1000" height="800">
        ${item.tag ? `<span class="dish-tag ${item.featured ? 'sun' : ''}">${esc(item.tag)}</span>` : item.featured ? '<span class="dish-tag sun">Chef\'s pick</span>' : ''}${sold ? '<span class="soldout-tag">Sold out</span>' : ''}</div>
      <div class="dish-body">
        <div class="dish-title">${dietMarks(item.diet)}<h3>${esc(item.name)}${item.subtitle ? `<small>${esc(item.subtitle)}</small>` : ''}</h3></div>
        <p>${esc(item.description)}${item.spicy ? ` <span class="spicy" title="Spice level">${'🌶'.repeat(item.spicy)}</span>` : ''}</p>
        <div class="dish-foot">
          <div class="sizes" role="group" aria-label="Size">${item.sizes.map((s, i) => `<button type="button" data-size="${s.id}" aria-pressed="${i === 0}">${esc(s.label)}</button>`).join('')}</div>
          <span class="price" data-price>${rupee(item.sizes[0].price)}</span>
          <button class="add-btn" type="button" data-add aria-label="Add ${esc(item.name)} to order" ${sold ? 'disabled' : ''}>+</button>
        </div>
      </div></article>`;
  }).join('') || '<p class="menu-note">No bowls match this filter.</p>';
  const prices = MENU.items.flatMap(i => i.sizes.map(s => s.price));
  if (prices.length) { $('[data-stat-price]').textContent = rupee(Math.min(...prices)); $('[data-stat-count]').textContent = MENU.items.length; }
}
grid.addEventListener('click', e => {
  const card = e.target.closest('.dish'); if (!card) return;
  const item = MENU.items.find(m => m.id === Number(card.dataset.id)); if (!item) return;
  const sizeBtn = e.target.closest('[data-size]');
  if (sizeBtn) {
    $$('[data-size]', card).forEach(b => b.setAttribute('aria-pressed', b === sizeBtn));
    $('[data-price]', card).textContent = rupee(item.sizes.find(s => s.id === Number(sizeBtn.dataset.size)).price);
  }
  if (e.target.closest('[data-add]') && item.available) {
    const sizeId = Number($('[data-size][aria-pressed="true"]', card).dataset.size);
    cart.add(item.id, sizeId);
    toast(`Added ${item.name} · ${item.sizes.find(s => s.id === sizeId).label}`, 'View order');
  }
});
function renderFilters() {
  const chips = $('.filters');
  const cats = MENU.categories || [];
  chips.innerHTML = `<button class="chip ${filterDiet === 'all' && !filterCat ? 'is-active' : ''}" type="button" data-filter="all" aria-pressed="${filterDiet === 'all' && !filterCat}">All bowls</button>
    <button class="chip ${filterDiet === 'veg' ? 'is-active' : ''}" type="button" data-filter="veg" aria-pressed="${filterDiet === 'veg'}"><i class="diet veg"></i>Vegetarian</button>
    <button class="chip ${filterDiet === 'nonveg' ? 'is-active' : ''}" type="button" data-filter="nonveg" aria-pressed="${filterDiet === 'nonveg'}"><i class="diet nonveg"></i>Non-veg</button>
    ${cats.length > 1 ? cats.map(c => `<button class="chip ${filterCat === String(c.id) ? 'is-active' : ''}" type="button" data-cat="${c.id}" aria-pressed="${filterCat === String(c.id)}">${esc(c.name)}</button>`).join('') : ''}`;
}
$('.filters').addEventListener('click', e => {
  const d = e.target.closest('[data-filter]'), c = e.target.closest('[data-cat]');
  if (d) { filterDiet = d.dataset.filter; if (filterDiet === 'all') filterCat = ''; }
  else if (c) { filterCat = filterCat === c.dataset.cat ? '' : c.dataset.cat; }
  else return;
  renderFilters(); renderMenu();
});

/* ---------- Cart ---------- */
const drawer = $('#cart'), backdrop = $('[data-cart-backdrop]'), form = $('[data-checkout]'), msg = $('[data-form-msg]');
let lastFocus = null, quote = null, location_ = null;
const find = (itemId, sizeId) => { const item = MENU.items.find(i => i.id === itemId); const size = item?.sizes.find(s => s.id === sizeId); return item && size ? { item, size } : null; };
const cart = {
  lines: (() => { try { return JSON.parse(localStorage.getItem('bm-cart-v2')) || []; } catch { return []; } })(),
  save() { try { localStorage.setItem('bm-cart-v2', JSON.stringify(this.lines)); } catch { /* private mode */ } },
  add(itemId, sizeId) { const l = this.lines.find(x => x.item_id === itemId && x.size_id === sizeId); if (l) l.quantity = Math.min(20, l.quantity + 1); else this.lines.push({ item_id: itemId, size_id: sizeId, quantity: 1 }); this.save(); this.render(true); },
  set(itemId, sizeId, q) { this.lines = this.lines.map(l => l.item_id === itemId && l.size_id === sizeId ? { ...l, quantity: Math.min(20, q) } : l).filter(l => l.quantity > 0); this.save(); this.render(); },
  clear() { this.lines = []; this.save(); this.render(); },
  valid() { return this.lines.filter(l => { const f = find(l.item_id, l.size_id); return f && f.item.available; }); },
  render(bump) {
    // Drop lines whose item or size no longer exists on the menu.
    this.lines = this.lines.filter(l => find(l.item_id, l.size_id)); this.save();
    const count = this.lines.reduce((s, l) => s + l.quantity, 0);
    const badge = $('[data-cart-count]'); badge.hidden = !count; badge.textContent = count;
    if (bump) { badge.classList.remove('bump'); void badge.offsetWidth; badge.classList.add('bump'); }
    $('[data-cart-empty]').hidden = !!count; form.hidden = !count; $('[data-cart-foot]').hidden = !count;
    $('[data-cart-items]').innerHTML = this.lines.map(l => { const { item, size } = find(l.item_id, l.size_id);
      return `<li class="cart-item" data-item="${item.id}" data-size="${size.id}"><img src="${esc(img(item.image))}" alt="">
        <div><b>${esc(item.name)}</b><small>${esc(size.label)} · ${rupee(size.price)}${item.available ? '' : ' · <span style="color:#b3261e">sold out — remove to continue</span>'}</small><br>
        <span class="qty"><button type="button" data-q="-1" aria-label="Remove one">−</button><span>${l.quantity}</span><button type="button" data-q="1" aria-label="Add one">+</button></span></div>
        <span class="cart-item-price">${rupee(size.price * l.quantity)}</span></li>`; }).join('');
    requote();
  }
};
$('[data-cart-items]').addEventListener('click', e => {
  const b = e.target.closest('[data-q]'); if (!b) return;
  const li = b.closest('.cart-item'); const l = cart.lines.find(x => x.item_id === Number(li.dataset.item) && x.size_id === Number(li.dataset.size));
  cart.set(l.item_id, l.size_id, l.quantity + Number(b.dataset.q));
});
function openCart() {
  lastFocus = document.activeElement; backdrop.hidden = false; drawer.classList.add('is-open'); drawer.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden'; $('[data-toast]').classList.remove('show'); setTimeout(() => drawer.focus(), 50); requote();
}
function closeCart() { backdrop.hidden = true; drawer.classList.remove('is-open'); drawer.setAttribute('aria-hidden', 'true'); document.body.style.overflow = ''; lastFocus?.focus?.(); }
$$('[data-open-cart]').forEach(b => b.addEventListener('click', openCart));
$$('[data-close-cart]').forEach(b => b.addEventListener('click', () => { closeCart(); if (b.closest('.cart-empty')) location.hash = '#menu'; }));
backdrop.addEventListener('click', closeCart);
addEventListener('keydown', e => { if (e.key !== 'Escape') return; if (drawer.classList.contains('is-open')) closeCart(); else setNav(false); });

/* ---------- Checkout: location, quote, slots, payment ---------- */
const fulfilment = () => new FormData(form).get('fulfilment') || 'delivery';
const locStatus = (text, cls = '') => { const el = $('[data-loc-status]'); el.textContent = text; el.className = 'loc-status ' + cls; };
function parseLocation(v) {
  const s = String(v);
  const m = s.match(/@(-?\d+\.\d+),\s*(-?\d+\.\d+)/) || s.match(/[?&](?:q|query|ll|destination)=(-?\d+\.\d+)(?:,|%2C)\s*(-?\d+\.\d+)/i) || s.match(/(-?\d{1,2}\.\d{3,})\s*,\s*(-?\d{1,3}\.\d{3,})/);
  return m ? { lat: Number(m[1]), lng: Number(m[2]) } : null;
}
$('[data-locate]').addEventListener('click', () => {
  if (!navigator.geolocation) return locStatus("Your browser can't share location. Paste a Google Maps location instead.", 'err');
  locStatus('Finding your location…');
  navigator.geolocation.getCurrentPosition(p => { location_ = { lat: p.coords.latitude, lng: p.coords.longitude }; form.maplink.value = `${location_.lat.toFixed(5)}, ${location_.lng.toFixed(5)}`; requote(); },
    err => locStatus(err.code === 1 ? 'Location permission was denied. Paste a Google Maps location, or choose Pickup.' : "We couldn't get your location. Paste a Google Maps location instead.", 'err'),
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
});
form.maplink.addEventListener('input', debounce(() => { const p = parseLocation(form.maplink.value); if (p) { location_ = p; requote(); } else if (form.maplink.value.trim()) locStatus('Paste coordinates like "27.0333, 95.0167", or a Google Maps link that contains them.', 'err'); }, 500));
form.addEventListener('change', e => {
  if (e.target.name === 'fulfilment') { const p = fulfilment() === 'pickup'; $('[data-delivery-block]').hidden = p; $('[data-pickup-block]').hidden = !p; requote(); }
  if (e.target.name === 'area_id') requote();
});
$('[data-apply-coupon]').addEventListener('click', () => requote(true));

let quoteSeq = 0;
const requote = debounce(async (couponClicked) => {
  if (!LIVE || !cart.lines.length) return renderTotals();
  const body = { items: cart.valid().map(({ item_id, size_id, quantity }) => ({ item_id, size_id, quantity })), fulfilment: fulfilment(), coupon_code: form.coupon_code.value.trim(),
    phone: (d => d.length === 10 ? d : '')(form.phone.value.replace(/\D/g, '').slice(-10)) };
  if (!body.items.length) { quote = null; return renderTotals(); }
  if (body.fulfilment === 'pickup') body.area_id = Number(form.area_id.value) || CONFIG?.areas.find(a => a.pickup_enabled)?.id;
  else if (location_) Object.assign(body, location_);
  const seq = ++quoteSeq;
  try {
    const q = await api('/checkout/quote', body);
    if (seq !== quoteSeq) return;
    quote = q;
    if (body.fulfilment === 'delivery') {
      if (!location_) locStatus('Share your location to see the delivery charge.');
      else if (q.delivery?.eligible) locStatus(`Delivering from ${q.area.name} · ${q.delivery.distance_km} km · ${rupee(q.delivery_fee)} delivery`, 'ok');
      else locStatus(q.delivery?.message || 'We could not check this location.', 'err');
    }
    const cm = $('[data-coupon-msg]');
    cm.textContent = q.coupon ? q.coupon.message : couponClicked && !body.coupon_code ? 'Enter a coupon code.' : '';
    cm.className = 'coupon-msg ' + (q.coupon ? (q.coupon.valid ? 'ok' : 'err') : '');
    renderSlots(q.slots); renderPayments(q.payments); renderTotals();
  } catch (e) { if (seq === quoteSeq) { quote = null; renderTotals(e.message); } }
}, 250);

function renderSlots(slots) {
  const sel = $('[data-slots]'), prev = sel.value;
  sel.innerHTML = slots.length ? slots.map(s => `<option value="${esc(s.key)}">${esc(s.display)}</option>`).join('') : '<option value="">No delivery times available in the next few days</option>';
  if (slots.some(s => s.key === prev)) sel.value = prev;
}
function renderPayments(p) {
  const box = $('[data-pay-methods]'), prev = new FormData(form).get('payment_method');
  const opts = [p.online && ['online', 'Pay online', 'UPI, cards, net banking · secured by Razorpay'], p.cod && ['cod', fulfilment() === 'pickup' ? 'Pay at pickup' : 'Cash on delivery', 'Pay when your bowls arrive']].filter(Boolean);
  box.innerHTML = '<legend>Payment</legend>' + (opts.length ? opts.map(([k, t, d], i) => `<label class="pay-opt"><input type="radio" name="payment_method" value="${k}" ${(prev ? prev === k : i === 0) ? 'checked' : ''}><span><b>${t}</b><small>${d}</small></span></label>`).join('') : '<p class="fine">Ordering is paused right now.</p>');
  if (!$('input[name=payment_method]:checked', box) && opts.length) $('input[name=payment_method]', box).checked = true;
  updateButton();
}
function updateButton() {
  const pm = new FormData(form).get('payment_method');
  $('[data-place-order]').textContent = quote ? (pm === 'online' ? `Pay ${rupee(quote.total)}` : `Place order · ${rupee(quote.total)}`) : 'Place order';
}
form.addEventListener('change', e => { if (e.target.name === 'payment_method') updateButton(); });
function renderTotals(error) {
  const t = $('[data-totals]');
  if (!LIVE) {
    const sub = cart.lines.reduce((s, l) => { const f = find(l.item_id, l.size_id); return s + (f ? f.size.price * l.quantity : 0); }, 0);
    t.innerHTML = `<div><dt>Subtotal</dt><dd>${rupee(sub)}</dd></div><div><dt>Delivery</dt><dd>from ₹10</dd></div><div class="total"><dt>Estimated total</dt><dd>${rupee(sub + 10)}</dd></div>`;
    return;
  }
  if (error) { t.innerHTML = `<div><dt class="warn">${esc(error)}</dt></div>`; return; }
  if (!quote) { t.innerHTML = ''; return; }
  t.innerHTML = `<div><dt>Subtotal</dt><dd>${rupee(quote.subtotal)}</dd></div>
    ${quote.offer ? `<div class="disc"><dt>${esc(quote.offer.title)}</dt><dd>−${rupee(quote.offer.discount)}</dd></div>` : ''}
    ${quote.coupon?.valid ? `<div class="disc"><dt>Coupon ${esc(quote.coupon.code)}</dt><dd>−${rupee(quote.coupon.discount)}</dd></div>` : ''}
    ${quote.delivery ? `<div><dt>Delivery${quote.delivery.eligible ? ` <small>(${quote.delivery.distance_km} km)</small>` : ''}</dt><dd>${quote.delivery.eligible ? (quote.delivery_fee ? rupee(quote.delivery_fee) : 'Free') : '—'}</dd></div>` : '<div><dt>Pickup</dt><dd>Free</dd></div>'}
    ${quote.tax ? `<div><dt>Tax (${quote.tax_percent}%)</dt><dd>${rupee(quote.tax)}</dd></div>` : ''}
    <div class="total"><dt>Total</dt><dd>${rupee(quote.total)}</dd></div>
    ${quote.warnings.filter(w => !/location/i.test(w)).map(w => `<div><dt class="warn">${esc(w)}</dt></div>`).join('')}`;
  updateButton();
}

function fail(text, field) {
  msg.className = 'form-msg err'; msg.textContent = text;
  if (field) { form[field]?.focus(); form[field]?.closest('.field')?.classList.add('invalid'); }
  msg.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  return false;
}
function validate() {
  $$('.field.invalid', form).forEach(f => f.classList.remove('invalid'));
  msg.className = 'form-msg'; msg.textContent = '';
  if (!cart.valid().length) return fail('Your order has no available bowls.');
  if (cart.valid().length !== cart.lines.length) return fail('Remove the sold-out bowls to continue.');
  if (fulfilment() === 'delivery') {
    if (!location_) return fail('Share your location so we can calculate the delivery charge.', 'maplink');
    if (!quote?.delivery?.eligible) return fail(quote?.delivery?.message || 'We do not deliver to this location yet. Choose Pickup instead.');
    if (!form.address.value.trim()) return fail('Enter your house number and street.', 'address');
  }
  if (!form.slot_key.value) return fail('Choose a delivery time.', 'slot_key');
  if (!form.customer_name.value.trim()) return fail('Enter your name.', 'customer_name');
  if (!/^[6-9]\d{9}$/.test(form.phone.value.replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, ''))) return fail('Enter a valid 10-digit mobile number.', 'phone');
  if (!new FormData(form).get('payment_method')) return fail('Choose how you want to pay.');
  return true;
}

let pendingPayment = null;
$('[data-place-order]').addEventListener('click', async e => {
  if (!LIVE) return;
  if (pendingPayment) return openRazorpay(pendingPayment);
  if (!validate()) return;
  const btn = e.currentTarget, f = new FormData(form);
  btn.disabled = true; const label = btn.textContent; btn.textContent = 'Placing your order…';
  const body = {
    customer_name: f.get('customer_name'), phone: f.get('phone'), email: f.get('email'), fulfilment: fulfilment(),
    ...(fulfilment() === 'pickup' ? { area_id: Number(f.get('area_id')) } : { ...location_, address: f.get('address'), landmark: f.get('landmark') }),
    slot_key: f.get('slot_key'), items: cart.valid().map(({ item_id, size_id, quantity }) => ({ item_id, size_id, quantity })),
    coupon_code: f.get('coupon_code'), payment_method: f.get('payment_method'), notes: f.get('notes')
  };
  try {
    const r = await api('/orders', body);
    try { localStorage.setItem('bm-last-order', JSON.stringify({ order: r.order_number, token: r.tracking_token })); } catch { /* ignore */ }
    if (r.payment) { pendingPayment = r; cart.clear(); form.hidden = false; $('[data-cart-foot]').hidden = false; $('[data-cart-empty]').hidden = true; return openRazorpay(r); }
    cart.clear(); location.href = `/track/${r.tracking_token}?new=1`;
  } catch (x) { fail(x.message); requote(); }
  finally { btn.disabled = false; if (!pendingPayment) btn.textContent = label; }
});

function loadRazorpay() {
  return window.Razorpay ? Promise.resolve() : new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://checkout.razorpay.com/v1/checkout.js'; s.onload = res; s.onerror = () => rej(new Error('Could not load the payment window. Check your connection and try again.')); document.head.append(s); });
}
async function openRazorpay(r) {
  const btn = $('[data-place-order]');
  btn.textContent = `Pay ${rupee(r.total)}`;
  msg.className = 'form-msg'; msg.innerHTML = `Order <b>${esc(r.order_number)}</b> is reserved. Complete the payment to confirm it.`;
  try { await loadRazorpay(); } catch (e) { return fail(e.message); }
  const p = r.payment;
  const rzp = new window.Razorpay({
    key: p.key_id, amount: p.amount, currency: p.currency, order_id: p.razorpay_order_id, name: p.name, description: p.description,
    image: location.origin + '/assets/logo.jpg', prefill: p.prefill, theme: { color: '#147A43' },
    handler: async resp => {
      msg.className = 'form-msg'; msg.textContent = 'Confirming your payment…';
      try { const v = await api('/payments/verify', resp); pendingPayment = null; location.href = `/track/${v.tracking_token}?new=1`; }
      catch (x) { msg.className = 'form-msg err'; msg.innerHTML = `${esc(x.message)} <a href="/track/${esc(r.tracking_token)}">Check your order status</a>`; }
    },
    modal: { ondismiss: () => { msg.className = 'form-msg err'; msg.innerHTML = `Payment not completed. Tap <b>Pay ${rupee(r.total)}</b> to try again, or <a href="/track/${esc(r.tracking_token)}">view your order</a>.`; } }
  });
  rzp.on('payment.failed', resp => { api('/payments/failed', { razorpay_order_id: p.razorpay_order_id, reason: resp.error?.description || 'Payment failed' }).catch(() => {}); });
  rzp.open();
}

/* ---------- WhatsApp fallback (static preview only) ---------- */
function orderText() {
  const f = new FormData(form);
  const lines = cart.lines.map(l => { const { item, size } = find(l.item_id, l.size_id); return `• ${l.quantity} × ${item.name} (${size.label}) — ${rupee(size.price * l.quantity)}`; });
  return [`Hi Bowl Mania! I'd like to order:`, ...lines, '', `Name: ${f.get('customer_name') || ''}`, `Phone: ${f.get('phone') || ''}`,
    fulfilment() === 'pickup' ? 'Self pickup' : `Address: ${f.get('address') || ''}${f.get('landmark') ? ' (' + f.get('landmark') + ')' : ''}`, f.get('notes') ? `Notes: ${f.get('notes')}` : ''].filter(Boolean).join('\n');
}
$('[data-wa-order]').addEventListener('click', e => { e.currentTarget.href = `https://wa.me/918099026415?text=${encodeURIComponent(orderText())}`; });

/* ---------- Tracking lookup, reviews, offers, contact, gallery ---------- */
$('[data-track-form]').addEventListener('submit', async e => {
  e.preventDefault(); const f = new FormData(e.target), out = $('[data-track-msg]');
  out.className = 'form-msg'; out.textContent = 'Looking up your order…';
  try { const r = await api('/track/lookup', { order_number: String(f.get('order')).trim(), phone: f.get('phone') }); location.href = `/track/${r.tracking_token}`; }
  catch (x) { out.className = 'form-msg err'; out.textContent = x.status === 404 || x.status === 400 ? x.message : "Tracking isn't available right now. Please WhatsApp us."; }
});
try { const last = JSON.parse(localStorage.getItem('bm-last-order')); if (last?.order) $('#track-order').value = last.order; } catch { /* ignore */ }

async function loadExtras() {
  const [reviews, offers, gallery] = await Promise.all([api('/reviews').catch(() => []), api('/offers').catch(() => []), api('/gallery').catch(() => [])]);
  if (reviews.length) {
    $('[data-reviews]').hidden = false;
    const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
    $('[data-review-summary]').textContent = `${avg.toFixed(1)} ★ average from our latest reviews`;
    $('[data-review-list]').innerHTML = reviews.slice(0, 6).map(r => `<figure class="review"><span class="stars" aria-label="${r.rating} out of 5">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</span><p>${esc(r.comment || 'Loved it!')}</p><b>— ${esc(r.customer_name)}</b></figure>`).join('');
  }
  if (offers.length) {
    $('[data-offers]').hidden = false;
    const tag = o => o.type === 'percent' ? `${o.value}%` : o.type === 'flat' ? `₹${o.value}` : o.type === 'free_delivery' ? 'FREE' : o.type === 'bogo' ? '1+1' : 'COMBO';
    $('[data-offers-list]').innerHTML = offers.map(o => `<div class="offer-chip"><span class="tag">${tag(o)}</span><span><b>${esc(o.title)}</b>${o.min_order ? ` <span class="fine">on orders over ${rupee(o.min_order)}</span>` : ''}</span></div>`).join('');
  }
  const media = gallery.filter(m => m.category !== 'banner' && m.category !== 'menu').slice(0, 8);
  if (media.length >= 2) {
    $('.video-grid').innerHTML = media.map(m => m.kind === 'video' ? `<video muted loop playsinline preload="none" data-autoplay src="${esc(m.url)}" aria-label="${esc(m.title)}"></video>` : `<img src="${esc(m.url)}" alt="${esc(m.title)}" loading="lazy" style="width:100%;aspect-ratio:9/14;object-fit:cover;border-radius:var(--r-lg)">`).join('');
    $$('.video-grid video[data-autoplay]').forEach(v => videoObserver.observe(v));
  }
}
$('[data-contact-form]').addEventListener('submit', async e => {
  e.preventDefault(); const f = e.target, out = $('[data-contact-msg]'), btn = $('button', f);
  if (!LIVE) { out.className = 'form-msg err'; out.textContent = 'Please WhatsApp us — the message form works on the live website.'; return; }
  btn.disabled = true; out.className = 'form-msg'; out.textContent = 'Sending…';
  try { await api('/contact', Object.fromEntries(new FormData(f))); f.reset(); out.className = 'form-msg ok'; out.textContent = "Thank you! We've received your message and will reply soon."; }
  catch (x) { out.className = 'form-msg err'; out.textContent = x.message; } finally { btn.disabled = false; }
});

/* ---------- Boot ---------- */
$$('[data-year]').forEach(el => { el.textContent = new Date().getFullYear(); });
(async () => {
  try {
    const [cfg, menu] = await Promise.all([api('/public/config'), api('/menu')]);
    CONFIG = cfg; MENU = menu; LIVE = true;
    renderConfig();
    if (!cfg.status.accepting_orders) $('[data-place-order]').disabled = true;
    loadExtras();
  } catch {
    LIVE = false; $('[data-wa-order]').hidden = false; $('[data-place-order]').hidden = true;
    $('[data-delivery-block] [data-locate]').hidden = true; $('.coupon-row').hidden = true; $('[data-coupon-msg]').hidden = true;
    $('[data-slots]').closest('.field').hidden = true; $('[data-pay-methods]').hidden = true;
    form.maplink.closest('.field').hidden = true; locStatus('');
  }
  renderFilters(); renderMenu(); cart.render();
})();
