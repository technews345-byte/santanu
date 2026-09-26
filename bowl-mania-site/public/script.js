const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rupee = n => `₹${Number(n).toLocaleString('en-IN')}`;

const WHATSAPP = { sonari: '918099026415', nazira: '918720915865', pickup: '918099026415' };
const BASE_DELIVERY = 10;

// Used when the site is opened without the API (e.g. static hosting).
const FALLBACK_MENU = [
  { id: 1, name: 'Morning Glow Bowl', description: 'Oats · Fresh Fruits · Nuts & Seeds', image: 'assets/bowls/morning-glow.jpg', diet: 'veg', prices: [{ size: '250 ml', price: 99 }, { size: '500 ml', price: 149 }] },
  { id: 2, name: 'Bean Vitality Bowl', description: 'Steamed Beans · Paneer · Fresh Veggies · Herbs & Dressing', image: 'assets/bowls/bean-vitality.jpg', diet: 'veg', prices: [{ size: '250 ml', price: 99 }, { size: '500 ml', price: 149 }] },
  { id: 3, name: 'Grill Power Bowl', description: 'Grilled Chicken or Paneer · Fresh Veggies · Signature Dressing', image: 'assets/bowls/grill-power.jpg', diet: 'both', prices: [{ size: '250 ml', price: 99 }, { size: '500 ml', price: 149 }] },
  { id: 4, name: 'Chicken Crunch Bowl', description: 'Grilled Chicken · Crunchy Fresh Veggies · Sweet Corn · Sesame · Signature Dressing', image: 'assets/bowls/chicken-crunch.jpg', diet: 'nonveg', prices: [{ size: '250 ml', price: 99 }, { size: '500 ml', price: 149 }] },
  { id: 5, name: 'Sprout Bowl (Indic Touch)', description: 'Sprouts · Dates · Pomegranate · Nuts · Coriander · Indian Masala & Chutney', image: 'assets/bowls/sprout.jpg', diet: 'veg', prices: [{ size: '250 ml', price: 99 }, { size: '500 ml', price: 149 }] },
  { id: 6, name: 'Super Protein Bowl', description: 'Chicken + Paneer + Egg + Nuts & Seeds + Fresh Veggies + Dressing', image: 'assets/bowls/super-protein.jpg', diet: 'nonveg', prices: [{ size: '500 ml', price: 199 }, { size: '750 ml', price: 249 }] }
];
const TAGS = { 'Morning Glow Bowl': ['Breakfast pick'], 'Super Protein Bowl': ['High protein', 'sun'], 'Grill Power Bowl': ['Chicken or paneer'] };

let menu = FALLBACK_MENU;
let apiAvailable = false;

/* ---------- Header & navigation ---------- */
const header = $('.header');
const nav = $('#site-nav');
const toggle = $('.menu-toggle');
const setNav = open => { nav.classList.toggle('is-open', open); toggle.setAttribute('aria-expanded', open); toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu'); };
toggle.addEventListener('click', () => setNav(!nav.classList.contains('is-open')));
$$('a', nav).forEach(a => a.addEventListener('click', () => setNav(false)));
addEventListener('scroll', () => header.classList.toggle('is-scrolled', scrollY > 10), { passive: true });

const sections = $$('main section[id]');
const navLinks = $$('a', nav);
const navObserver = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (!e.isIntersecting) return;
    navLinks.forEach(a => a.classList.toggle('is-current', a.getAttribute('href') === `#${e.target.id}`));
  });
}, { rootMargin: '-45% 0px -50% 0px' });
sections.forEach(s => navObserver.observe(s));

/* ---------- Reveal + video autoplay ---------- */
const reveal = new IntersectionObserver(entries => entries.forEach(e => {
  if (e.isIntersecting) { e.target.classList.add('in'); reveal.unobserve(e.target); }
}), { threshold: .12 });
function observeReveal(els) { els.forEach(el => { el.classList.add('reveal'); reveal.observe(el); }); }
observeReveal($$('.section-head, .steps li, .story-media, .story-copy, .branch, .video-grid video, .promise-grid > div'));

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const videoObserver = new IntersectionObserver(entries => entries.forEach(e => {
  const v = e.target;
  if (e.isIntersecting && !reduceMotion) { v.preload = 'auto'; v.play().catch(() => {}); } else v.pause();
}), { threshold: .25 });
$$('video[data-autoplay]').forEach(v => videoObserver.observe(v));
if (reduceMotion) $$('.hero-frame video').forEach(v => { v.removeAttribute('autoplay'); v.pause(); });

/* ---------- Menu ---------- */
const grid = $('[data-menu-grid]');
const splitName = name => { const m = name.match(/^(.*?)\s*\((.+)\)$/); return m ? [m[1], m[2]] : [name, '']; };
const dietMarks = diet => diet === 'both'
  ? '<i class="diet veg" title="Vegetarian option"></i><i class="diet nonveg" title="Non-veg option"></i>'
  : `<i class="diet ${diet === 'nonveg' ? 'nonveg' : 'veg'}" title="${diet === 'nonveg' ? 'Non-vegetarian' : 'Vegetarian'}"></i>`;

function renderMenu() {
  grid.innerHTML = menu.map(item => {
    const [title, sub] = splitName(item.name);
    const tag = TAGS[item.name];
    return `<article class="dish" data-id="${item.id}" data-diet="${esc(item.diet || 'veg')}">
      <div class="dish-media">
        <img src="${esc(item.image)}" alt="${esc(item.name)}" loading="lazy" width="720" height="576">
        ${tag ? `<span class="dish-tag ${tag[1] || ''}">${esc(tag[0])}</span>` : ''}
      </div>
      <div class="dish-body">
        <div class="dish-title">${dietMarks(item.diet)}<h3>${esc(title)}${sub ? `<small>${esc(sub)}</small>` : ''}</h3></div>
        <p>${esc(item.description)}</p>
        <div class="dish-foot">
          <div class="sizes" role="group" aria-label="Size">
            ${item.prices.map((p, i) => `<button type="button" data-size="${esc(p.size)}" aria-pressed="${i === 0}">${esc(p.size)}</button>`).join('')}
          </div>
          <span class="price" data-price>${rupee(item.prices[0].price)}</span>
          <button class="add-btn" type="button" data-add aria-label="Add ${esc(item.name)} to order">+</button>
        </div>
      </div>
    </article>`;
  }).join('');
  observeReveal($$('.dish', grid));
  applyFilter(currentFilter);
}

grid.addEventListener('click', e => {
  const card = e.target.closest('.dish'); if (!card) return;
  const item = menu.find(m => m.id === Number(card.dataset.id)); if (!item) return;
  const sizeBtn = e.target.closest('[data-size]');
  if (sizeBtn) {
    $$('[data-size]', card).forEach(b => b.setAttribute('aria-pressed', b === sizeBtn));
    $('[data-price]', card).textContent = rupee(item.prices.find(p => p.size === sizeBtn.dataset.size).price);
  }
  if (e.target.closest('[data-add]')) {
    const size = $('[data-size][aria-pressed="true"]', card).dataset.size;
    cart.add(item, size);
    toast(`Added ${splitName(item.name)[0]} · ${size}`);
  }
});

let currentFilter = 'all';
function applyFilter(f) {
  currentFilter = f;
  $$('.dish', grid).forEach(card => {
    const d = card.dataset.diet;
    const show = f === 'all' || d === 'both' || d === f;
    card.classList.toggle('is-hidden', !show);
  });
}
$$('[data-filter]').forEach(chip => chip.addEventListener('click', () => {
  $$('[data-filter]').forEach(c => { c.classList.toggle('is-active', c === chip); c.setAttribute('aria-pressed', c === chip); });
  applyFilter(chip.dataset.filter);
}));

async function loadMenu() {
  try {
    const r = await fetch('/api/menu', { headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error();
    const data = await r.json();
    if (Array.isArray(data) && data.length) { menu = data; apiAvailable = true; }
  } catch { /* static hosting — use the built-in menu */ }
  renderMenu();
  cart.render();
}

/* ---------- Cart ---------- */
const drawer = $('#cart');
const backdrop = $('[data-cart-backdrop]');
const form = $('[data-checkout]');
const msg = $('[data-form-msg]');
let lastFocus = null;

const cart = {
  lines: (() => { try { return JSON.parse(localStorage.getItem('bm-cart')) || []; } catch { return []; } })(),
  save() { try { localStorage.setItem('bm-cart', JSON.stringify(this.lines)); } catch {} },
  find(id, size) { return this.lines.find(l => l.id === id && l.size === size); },
  add(item, size) {
    const line = this.find(item.id, size);
    if (line) line.qty = Math.min(20, line.qty + 1); else this.lines.push({ id: item.id, size, qty: 1 });
    this.save(); this.render(true);
  },
  set(id, size, qty) {
    if (qty <= 0) this.lines = this.lines.filter(l => !(l.id === id && l.size === size));
    else this.find(id, size).qty = Math.min(20, qty);
    this.save(); this.render();
  },
  detailed() {
    return this.lines.map(l => {
      const item = menu.find(m => m.id === l.id);
      const price = item?.prices.find(p => p.size === l.size);
      return item && price ? { ...l, item, price: price.price } : null;
    }).filter(Boolean);
  },
  area() { return new FormData(form).get('area') || 'sonari'; },
  totals() {
    const subtotal = this.detailed().reduce((s, l) => s + l.price * l.qty, 0);
    const delivery = this.area() === 'pickup' ? 0 : BASE_DELIVERY;
    return { subtotal, delivery, total: subtotal + delivery };
  },
  render(bump) {
    const lines = this.detailed();
    const count = lines.reduce((s, l) => s + l.qty, 0);
    const badge = $('[data-cart-count]');
    badge.hidden = !count; badge.textContent = count;
    if (bump) { badge.classList.remove('bump'); void badge.offsetWidth; badge.classList.add('bump'); }
    $('[data-cart-empty]').hidden = !!count;
    form.hidden = !count; $('[data-cart-foot]').hidden = !count;
    $('[data-cart-items]').innerHTML = lines.map(l => `<li class="cart-item" data-id="${l.id}" data-size="${esc(l.size)}">
      <img src="${esc(l.item.image)}" alt="">
      <div><b>${esc(l.item.name)}</b><small>${esc(l.size)} · ${rupee(l.price)}</small><br>
        <span class="qty"><button type="button" data-q="-1" aria-label="Decrease">−</button><span>${l.qty}</span><button type="button" data-q="1" aria-label="Increase">+</button></span></div>
      <span class="cart-item-price">${rupee(l.price * l.qty)}</span></li>`).join('');
    const t = this.totals();
    $('[data-subtotal]').textContent = rupee(t.subtotal);
    $('[data-delivery]').textContent = t.delivery ? rupee(t.delivery) : 'Free';
    $('[data-total]').textContent = rupee(t.total);
    $('[data-address-field]').hidden = this.area() === 'pickup';
  }
};

$('[data-cart-items]').addEventListener('click', e => {
  const b = e.target.closest('[data-q]'); if (!b) return;
  const li = b.closest('.cart-item');
  const line = cart.find(Number(li.dataset.id), li.dataset.size);
  cart.set(line.id, line.size, line.qty + Number(b.dataset.q));
});
form.addEventListener('change', e => { if (e.target.name === 'area') cart.render(); });

function openCart() {
  lastFocus = document.activeElement;
  $('[data-toast]').classList.remove('show');
  backdrop.hidden = false; drawer.classList.add('is-open'); drawer.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  setTimeout(() => drawer.focus(), 50);
}
function closeCart() {
  backdrop.hidden = true; drawer.classList.remove('is-open'); drawer.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  lastFocus?.focus?.();
}
$$('[data-open-cart]').forEach(b => b.addEventListener('click', openCart));
$$('[data-close-cart]').forEach(b => b.addEventListener('click', () => { closeCart(); if (b.closest('.cart-empty')) location.hash = '#menu'; }));
backdrop.addEventListener('click', closeCart);
addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (drawer.classList.contains('is-open')) closeCart(); else setNav(false);
});

/* ---------- Checkout ---------- */
function validate() {
  let ok = true;
  const pickup = cart.area() === 'pickup';
  $$('.field', form).forEach(f => {
    const input = $('input, textarea', f);
    const skip = pickup && f.hasAttribute('data-address-field');
    const bad = !skip && !input.checkValidity();
    f.classList.toggle('invalid', bad);
    if (bad && ok) { input.focus(); ok = false; }
  });
  return ok;
}
function orderText(fd) {
  const lines = cart.detailed().map(l => `• ${l.qty} × ${l.item.name} (${l.size}) — ${rupee(l.price * l.qty)}`);
  const t = cart.totals(); const area = fd.get('area');
  return [`Hi Bowl Mania! I'd like to order:`, ...lines, '',
    `Subtotal: ${rupee(t.subtotal)}`, area === 'pickup' ? 'Self pickup' : `Delivery (${area}): from ${rupee(t.delivery)}`, '',
    `Name: ${fd.get('customerName') || ''}`, `Phone: ${fd.get('phone') || ''}`,
    area === 'pickup' ? '' : `Address: ${fd.get('address') || ''}`, fd.get('notes') ? `Notes: ${fd.get('notes')}` : ''
  ].filter((x, i, a) => x !== '' || a[i - 1] !== '').join('\n');
}
function sendWhatsApp() {
  const fd = new FormData(form);
  window.open(`https://wa.me/${WHATSAPP[fd.get('area')] || WHATSAPP.sonari}?text=${encodeURIComponent(orderText(fd))}`, '_blank', 'noopener');
}
$('[data-wa-order]').addEventListener('click', () => { if (validate()) sendWhatsApp(); });

$('[data-place-order]').addEventListener('click', async e => {
  if (!validate()) return;
  if (!apiAvailable) { sendWhatsApp(); return; }
  const btn = e.currentTarget; btn.disabled = true; btn.textContent = 'Placing order…';
  msg.className = 'form-msg'; msg.textContent = '';
  const fd = new FormData(form);
  const body = {
    customerName: fd.get('customerName'), phone: fd.get('phone'), area: fd.get('area'),
    address: fd.get('area') === 'pickup' ? 'Self pickup' : fd.get('address'), notes: fd.get('notes'),
    items: cart.lines.map(l => ({ menuItemId: l.id, size: l.size, quantity: l.qty }))
  };
  try {
    const r = await fetch('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
    cart.lines = []; cart.save(); cart.render(); form.reset();
    $('[data-cart-empty]').hidden = true; form.hidden = false;
    $$('.field', form).forEach(f => f.hidden = true); $('.seg', form).hidden = true; $('h3', form).hidden = true;
    msg.className = 'form-msg ok';
    msg.innerHTML = `<b>Thank you! Order #${esc(data.orderId)} is confirmed.</b><br>Total ${rupee(data.total)}. We'll call you shortly to confirm delivery.`;
    setTimeout(() => { $$('.field', form).forEach(f => f.hidden = false); $('.seg', form).hidden = false; $('h3', form).hidden = false; msg.className = 'form-msg'; msg.textContent = ''; cart.render(); }, 8000);
  } catch (err) {
    msg.className = 'form-msg err'; msg.textContent = err.message;
  } finally {
    btn.disabled = false; btn.textContent = 'Place order';
  }
});

/* ---------- Toast ---------- */
let toastTimer;
function toast(text) {
  const t = $('[data-toast]');
  t.innerHTML = `${esc(text)} · <u style="cursor:pointer">View order</u>`;
  t.style.pointerEvents = 'auto'; t.onclick = openCart;
  t.classList.add('show'); clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.classList.remove('show'); t.style.pointerEvents = 'none'; }, 2600);
}

$$('[data-year]').forEach(el => el.textContent = new Date().getFullYear());
loadMenu();
