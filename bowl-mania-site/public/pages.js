// Shared behaviour for the information pages (features, about, support, contact, legal).
const $ = (s, el = document) => el.querySelector(s), $$ = (s, el = document) => [...el.querySelectorAll(s)];
const WA_DEFAULT = '918099026415';

const header = $('.header'), nav = $('#site-nav'), toggle = $('.menu-toggle');
if (toggle && nav) {
  const setNav = open => { nav.classList.toggle('is-open', open); toggle.setAttribute('aria-expanded', open); toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu'); };
  toggle.addEventListener('click', () => setNav(!nav.classList.contains('is-open')));
  $$('a', nav).forEach(a => a.addEventListener('click', () => setNav(false)));
}
addEventListener('scroll', () => header?.classList.toggle('is-scrolled', scrollY > 10), { passive: true });
$$('[data-year]').forEach(el => { el.textContent = new Date().getFullYear(); });

// Open the FAQ answer a link points to (support.html#faq-payment-failed).
function openHashTarget() {
  const t = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1)));
  if (t && t.tagName === 'DETAILS') { t.open = true; t.scrollIntoView({ block: 'start' }); }
}
addEventListener('hashchange', openHashTarget); openHashTarget();

/** Posts to the Bowl Mania server. Resolves null when the site is running without it (static hosting). */
async function api(path, body) {
  let r;
  try { r = await fetch('/api' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
  catch { return null; }
  const data = (r.headers.get('content-type') || '').includes('application/json') ? await r.json().catch(() => ({})) : null;
  if (!data) return null;
  if (!r.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data;
}
const waUrl = (text, number = WA_DEFAULT) => `https://wa.me/${number}?text=${encodeURIComponent(text)}`;

function wireForm(form, { path, build, success, fallbackText }) {
  const out = $('[data-form-msg]', form), btn = $('button[type=submit]', form);
  form.addEventListener('submit', async e => {
    e.preventDefault();
    out.className = 'form-msg'; out.textContent = '';
    $$('.field', form).forEach(f => f.classList.remove('invalid'));
    const bad = $$('[required]', form).filter(i => i.type === 'checkbox' ? !i.checked : !i.value.trim());
    if (bad.length) {
      bad.forEach(i => i.closest('.field')?.classList.add('invalid'));
      out.className = 'form-msg err';
      out.textContent = bad.every(i => i.type === 'checkbox') ? 'Please tick the box to confirm.' : 'Please fill in the highlighted fields.';
      bad[0].focus(); return;
    }
    const values = Object.fromEntries(new FormData(form));
    btn.disabled = true;
    try {
      const res = await api(path, build(values));
      if (res) { form.reset(); out.className = 'form-msg ok'; out.textContent = success; }
      else {
        // No server behind this copy of the site: hand the message to WhatsApp instead.
        window.open(waUrl(fallbackText(values)), '_blank', 'noopener');
        out.className = 'form-msg ok'; out.textContent = 'WhatsApp has opened with your message ready. Press send there to reach us.';
      }
    } catch (err) { out.className = 'form-msg err'; out.textContent = err.message; }
    finally { btn.disabled = false; }
  });
}

const contactForm = $('[data-page-contact]');
if (contactForm) wireForm(contactForm, {
  path: '/contact',
  build: v => ({ name: v.name, phone: v.phone, email: v.email, message: v.topic ? `[${v.topic}] ${v.message}` : v.message, website: v.website }),
  success: "Thank you! We've received your message and will reply soon — usually the same day.",
  fallbackText: v => `Hi Bowl Mania, this is ${v.name}.${v.topic ? ` (${v.topic})` : ''}\n\n${v.message}`
});

const deleteForm = $('[data-delete-request]');
if (deleteForm) wireForm(deleteForm, {
  path: '/privacy/delete-request',
  build: v => ({ name: v.name, phone: v.phone, email: v.email, details: v.details, website: v.website }),
  success: "Request received. We'll contact you on the mobile number you gave to confirm it's you, then erase your data within 30 days.",
  fallbackText: v => `Hi Bowl Mania, please delete my account and personal data.\n\nName: ${v.name}\nMobile used for orders: ${v.phone}${v.email ? `\nEmail: ${v.email}` : ''}${v.details ? `\n\n${v.details}` : ''}`
});
