const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rupee = n => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;
const token = location.pathname.split('/').filter(Boolean).pop();
const isNew = new URLSearchParams(location.search).has('new');
const main = document.getElementById('track');
const TZ = 'Asia/Kolkata';
const toDate = s => s ? new Date(/T/.test(s) ? s : s.replace(' ', 'T') + 'Z') : null;
const time = s => { const d = toDate(s); return d ? d.toLocaleTimeString('en-IN', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }) : ''; };
const dayTime = s => { const d = toDate(s); return d ? d.toLocaleString('en-IN', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : ''; };
const fmt12 = hhmm => { const [h, m] = String(hhmm).split(':').map(Number); return `${h % 12 || 12}${m ? ':' + String(m).padStart(2, '0') : ''} ${h < 12 ? 'AM' : 'PM'}`; };
const PAY = { created: ['Awaiting payment', 'warn'], pending: ['Pay on delivery', 'warn'], paid: ['Paid', ''], failed: ['Payment failed', 'err'], refunded: ['Refunded', ''], partially_refunded: ['Partly refunded', ''] };
const HEADLINE = { new: 'We have your order', confirmed: 'Order confirmed', accepted: 'Order accepted', preparing: 'Your bowl is being prepared', ready: 'Your order is ready', out_for_delivery: 'On the way to you', delivered: 'Delivered — enjoy!', completed: 'Enjoy your bowl!', cancelled: 'Order cancelled', refunded: 'Order refunded' };
let timer, reviewOpen = false;

async function load() {
  let o;
  try {
    const r = await fetch(`/api/track/${encodeURIComponent(token)}`, { headers: { Accept: 'application/json' } });
    o = await r.json(); if (!r.ok) throw new Error(o.error || 'Could not load this order.');
  } catch (e) { main.innerHTML = `<div class="t-card"><h1 style="font-size:1.6rem">We couldn't find that order</h1><p>${esc(e.message)}</p><a class="btn btn-primary" href="/#track" style="width:max-content">Look up by order number</a></div>`; return; }
  document.title = `${o.order_number} · ${HEADLINE[o.status]} · Bowl Mania`;
  if (!reviewOpen) render(o);
  clearTimeout(timer);
  if (!['delivered', 'completed', 'cancelled', 'refunded'].includes(o.status)) timer = setTimeout(load, 20000);
}

function render(o) {
  const pickup = o.fulfilment === 'pickup';
  const seen = {}; o.history.forEach(h => { seen[h.status] ||= h.at; });
  seen.new ||= o.placed_at || o.created_at;
  const steps = [['new', 'Order placed'], ['confirmed', 'Confirmed'], ['preparing', 'Preparing'], ['ready', pickup ? 'Ready for pickup' : 'Ready'], ...(pickup ? [['completed', 'Picked up']] : [['out_for_delivery', 'Out for delivery'], ['delivered', 'Delivered']])];
  const order = ['new', 'confirmed', 'accepted', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'completed'];
  const at = order.indexOf(o.status === 'accepted' ? 'confirmed' : o.status);
  const cancelled = ['cancelled', 'refunded'].includes(o.status);
  const [payLabel, payCls] = PAY[o.payment_status] || [o.payment_status, ''];
  const waiting = o.payment_method === 'online' && ['created', 'failed'].includes(o.payment_status) && !cancelled;
  main.innerHTML = `
    ${isNew && !cancelled && !waiting ? `<div class="t-banner">Thank you! Your order is placed. Save this page to follow it — we'll also update you on WhatsApp.</div>` : ''}
    ${waiting ? `<div class="t-banner ${o.payment_status === 'failed' ? 'err' : 'warn'}">${o.payment_status === 'failed' ? 'Your payment did not go through, so this order is not confirmed.' : 'We are waiting for your online payment to confirm this order.'} If money was deducted, it will be confirmed automatically or refunded. Need help? <a href="tel:+91${esc(o.contact.phone)}">Call ${esc(o.contact.phone)}</a></div>` : ''}
    <section class="t-card t-hero"><p class="eyebrow">${esc(o.restaurant)} · Order ${esc(o.order_number)}</p><h1>${esc(HEADLINE[o.status] || o.status_label)}</h1>
      ${!cancelled && o.estimated_at && !['delivered', 'completed'].includes(o.status) ? `<span class="eta">⏱ ${pickup ? 'Ready by' : 'Arriving by'} about ${time(o.estimated_at)}${o.slot ? ` · ${esc(o.slot.label)} ${fmt12(o.slot.start)}–${fmt12(o.slot.end)}` : ''}</span>` : ''}
      ${o.rider && o.status === 'out_for_delivery' ? `<p><b>${esc(o.rider.first_name)}</b> is bringing your order.</p>` : ''}
      <p>${rupee(o.total)} · <span class="pill ${payCls}">${esc(payLabel)}</span></p></section>
    <section class="t-card"><ol class="timeline">${steps.map(([k, l], i) => { const idx = order.indexOf(k); const done = !cancelled && (seen[k] || idx <= at); const cur = !cancelled && idx === at;
        return `<li class="${done ? 'done' : ''} ${cur ? 'current' : ''}"><span class="dot">${done ? '✓' : ''}</span><div><b>${l}</b></div><time>${seen[k] ? time(seen[k]) : ''}</time></li>`; }).join('')}
      ${cancelled ? `<li class="done"><span class="dot" style="background:#b3261e;border-color:#b3261e">✕</span><div><b>${esc(o.status_label)}</b></div><time>${time(seen[o.status])}</time></li>` : ''}</ol></section>
    <div class="t-grid">
      <section class="t-card"><h2>${pickup ? 'Pickup' : 'Delivery'}</h2><dl class="kv">
        <dt>${pickup ? 'From' : 'Kitchen'}</dt><dd>${esc(o.area || '')}</dd>
        ${o.slot ? `<dt>When</dt><dd>${esc(o.slot.label)}, ${new Date(o.slot.date + 'T12:00:00Z').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })} · ${fmt12(o.slot.start)}–${fmt12(o.slot.end)}</dd>` : ''}
        ${!pickup ? `<dt>Distance</dt><dd>${o.distance_km ?? '—'} km</dd><dt>Delivery charge</dt><dd>${o.delivery_fee ? rupee(o.delivery_fee) : 'Free'}</dd>` : ''}
        <dt>Payment</dt><dd>${o.payment_method === 'online' ? `Online · ${esc(payLabel)}` : (pickup ? 'Pay at pickup' : 'Cash on delivery') + (o.payment_status === 'paid' ? ' · Paid' : '')}</dd><dt>Placed</dt><dd>${dayTime(o.placed_at || o.created_at)}</dd></dl>
        <a class="btn btn-outline btn-sm" href="tel:+91${esc(o.contact.phone)}" style="width:max-content">Call Bowl Mania</a></section>
      <section class="t-card"><h2>Your order</h2><div class="t-lines">${o.items.map(i => `<div><span>${i.quantity} × ${esc(i.name)} <span class="lbl">(${esc(i.size)})</span></span><span>${rupee(i.line_total)}</span></div>`).join('')}
        <div><span class="lbl">Subtotal</span><span>${rupee(o.subtotal)}</span></div>${o.discount ? `<div class="disc"><span>Discount</span><span>−${rupee(o.discount)}</span></div>` : ''}
        ${!pickup ? `<div><span class="lbl">Delivery</span><span>${rupee(o.delivery_fee)}</span></div>` : ''}${o.tax ? `<div><span class="lbl">Tax</span><span>${rupee(o.tax)}</span></div>` : ''}
        <div class="total"><span>Total</span><span>${rupee(o.total)}</span></div></div></section>
    </div>
    ${o.can_review ? `<form class="t-card" id="review"><h2>How was your bowl?</h2><div class="stars-input" role="radiogroup" aria-label="Rating">${[5, 4, 3, 2, 1].map(n => `<input type="radio" name="rating" id="r${n}" value="${n}"><label for="r${n}" title="${n} star${n > 1 ? 's' : ''}">★</label>`).join('')}</div>
      <label class="field"><span>Tell us more <em>(optional)</em></span><textarea name="comment" rows="3" maxlength="1000"></textarea></label><button class="btn btn-primary" type="submit" style="width:max-content">Send review</button><p class="form-msg" id="reviewMsg"></p></form>` : ''}`;
  const form = document.getElementById('review');
  if (form) {
    form.addEventListener('focusin', () => { reviewOpen = true; });
    form.addEventListener('submit', async e => {
      e.preventDefault(); const f = new FormData(form), m = document.getElementById('reviewMsg');
      if (!f.get('rating')) { m.className = 'form-msg err'; m.textContent = 'Tap a star to rate your order.'; return; }
      try {
        const r = await fetch(`/api/track/${encodeURIComponent(token)}/review`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rating: Number(f.get('rating')), comment: f.get('comment') }) });
        const d = await r.json(); if (!r.ok) throw new Error(d.error);
        form.innerHTML = '<h2>Thank you! 💚</h2><p>Your review helps other guests choose their bowl.</p>'; reviewOpen = false;
      } catch (x) { m.className = 'form-msg err'; m.textContent = x.message || 'Could not send your review.'; }
    });
  }
}
load();
document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
