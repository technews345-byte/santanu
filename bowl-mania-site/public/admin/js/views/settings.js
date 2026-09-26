import { get, patch } from '../api.js';
import { $, $$, esc, icon, badge, toast, toastError, copyText, errorState } from '../ui.js';
import { photoField, mountPhotoField } from './_photo.js';
import { state } from '../app.js';

const EVENT_LABEL = { order_received: 'Order received', payment_success: 'Payment successful', order_confirmed: 'Order confirmed', preparing: 'Preparing', ready: 'Ready', out_for_delivery: 'Out for delivery', delivered: 'Delivered', cancelled: 'Cancelled', refund_processed: 'Refund processed' };
export async function render(view) {
  let s;
  try { s = await get('/admin/settings'); } catch (e) { view.innerHTML = errorState(e, false); return; }
  const r = s.restaurant, b = s.business, n = s.notifications, i = s.integrations;
  const saveBtn = '<div class="row"><button class="btn btn-primary btn-sm" type="submit">Save</button></div>';
  view.innerHTML = `<div class="page-head"><div><h1>Settings</h1><p>Restaurant details, business rules, payments and notifications. Secret keys stay in the server's .env file and are never shown here.</p></div></div>
    <div class="cols-2"><div class="stack">
      <form class="card card-pad stack" data-group="restaurant"><h2>Restaurant</h2>
        <div class="grid-2"><label class="field"><span>Name</span><input class="input" name="name" required value="${esc(r.name)}"></label><label class="field"><span>Tagline</span><input class="input" name="tagline" value="${esc(r.tagline)}"></label>
          <label class="field"><span>Phone</span><input class="input" name="phone" value="${esc(r.phone)}"></label><label class="field"><span>WhatsApp (with country code)</span><input class="input" name="whatsapp" value="${esc(r.whatsapp)}" placeholder="918099026415"></label>
          <label class="field"><span>Email</span><input class="input" type="email" name="email" value="${esc(r.email)}"></label><label class="field"><span>Address</span><input class="input" name="address" value="${esc(r.address)}"></label>
          <label class="field"><span>Instagram</span><input class="input" name="instagram" value="${esc(r.instagram)}"></label><label class="field"><span>Facebook</span><input class="input" name="facebook" value="${esc(r.facebook)}"></label>
          <label class="field"><span>YouTube</span><input class="input" name="youtube" value="${esc(r.youtube)}"></label></div>${photoField('logo', r.logo, 'Logo')}${saveBtn}</form>
      <form class="card card-pad stack" data-group="business"><h2>Business rules</h2>
        <div class="grid-2"><label class="field"><span>Restaurant status</span><select class="select" name="status_mode"><option value="auto" ${b.status_mode === 'auto' ? 'selected' : ''}>Automatic (follow delivery slots)</option><option value="open" ${b.status_mode === 'open' ? 'selected' : ''}>Always open</option><option value="closed" ${b.status_mode === 'closed' ? 'selected' : ''}>Closed</option></select></label>
          <label class="field"><span>Message when closed</span><input class="input" name="closed_message" value="${esc(b.closed_message)}"></label>
          <label class="field"><span>Minimum order (₹)</span><input class="input" type="number" min="0" name="min_order" data-type="number" value="${b.min_order}"></label><label class="field"><span>Tax (%)</span><input class="input" type="number" min="0" max="28" step="0.01" name="tax_percent" data-type="number" value="${b.tax_percent}"><small>Added on the food total after discounts. 0 = prices include tax.</small></label>
          <label class="field"><span>Preparation time (min)</span><input class="input" type="number" min="0" name="prep_minutes" data-type="number" value="${b.prep_minutes}"></label><label class="field"><span>Delivery travel time (min)</span><input class="input" type="number" min="0" name="delivery_minutes" data-type="number" value="${b.delivery_minutes}"></label>
          <label class="field"><span>Stop taking orders before slot ends (min)</span><input class="input" type="number" min="0" name="order_cutoff_minutes" data-type="number" value="${b.order_cutoff_minutes}"></label>
          <label class="field"><span>Timezone</span><input class="input" name="timezone" value="${esc(b.timezone)}"></label></div>
        <input type="hidden" name="currency" value="INR"><label class="check"><input type="checkbox" name="accept_preorders" ${b.accept_preorders ? 'checked' : ''}> Accept pre-orders for the next slot when closed</label>
        <p class="small muted">Opening hours, delivery slots, holidays, radius and charges are set per location in <a href="#/delivery-areas">Delivery areas</a>.</p>${saveBtn}</form>
      <form class="card card-pad stack" data-group="notifications"><h2>WhatsApp messages</h2>
        <label class="check"><input type="checkbox" name="whatsapp_enabled" ${n.whatsapp_enabled ? 'checked' : ''}> Send WhatsApp updates to customers</label>
        <label class="check"><input type="checkbox" name="browser_sound" ${n.browser_sound ? 'checked' : ''}> Play a sound in the admin for new orders</label>
        <p class="small muted">Placeholders: <span class="code">{{customer_name}}</span> <span class="code">{{order_id}}</span> <span class="code">{{amount}}</span> <span class="code">{{tracking_url}}</span> <span class="code">{{rider_name}}</span> <span class="code">{{rider_phone}}</span> <span class="code">{{refund_amount}}</span>.
          To message customers who haven't written to you in 24 hours, WhatsApp requires an approved template: enter its name and its variables will be filled in the same order as the placeholders.</p>
        ${s.events.map(e => { const t = n.templates[e]; return `<fieldset class="card card-pad stack-sm" data-tpl="${e}" style="padding:14px"><div class="row"><b>${EVENT_LABEL[e]}</b><span class="spacer"></span><label class="switch"><input type="checkbox" data-k="enabled" ${t.enabled ? 'checked' : ''}><i></i>On</label></div>
          <textarea class="textarea" data-k="body" rows="3" aria-label="${EVENT_LABEL[e]} message">${esc(t.body)}</textarea>
          <div class="grid-2"><label class="field"><span>Approved template name <small>(optional)</small></span><input class="input" data-k="template_name" value="${esc(t.template_name)}" placeholder="order_confirmed_v1"></label><label class="field"><span>Language code</span><input class="input" data-k="language" value="${esc(t.language)}"></label></div></fieldset>`; }).join('')}
        ${saveBtn}</form>
    </div><div class="stack">
      <form class="card card-pad stack" data-group="payments"><h2>Payment methods</h2>
        <label class="check"><input type="checkbox" name="online_enabled" ${s.payments.online_enabled ? 'checked' : ''}> Online payment (Razorpay)</label>
        <label class="check"><input type="checkbox" name="cod_enabled" ${s.payments.cod_enabled ? 'checked' : ''}> Cash on delivery / pay at pickup</label>${saveBtn}</form>
      <div class="card card-pad stack"><h2>Connections</h2>
        <div class="integration"><span class="ic">${icon('card')}</span><div class="stack-sm"><div class="row"><b>Razorpay</b>${i.razorpay.configured ? badge('ok', i.razorpay.mode === 'live' ? 'Live keys' : 'Test keys') : badge('off', 'Not connected')}</div>
          <p class="small muted">${i.razorpay.configured ? `Key ${esc(i.razorpay.key_id)}. ` : 'Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to .env. '}Webhook ${i.razorpay.webhook_configured ? 'secret set' : '<b>secret missing</b> (RAZORPAY_WEBHOOK_SECRET)'}.</p>
          <div class="copy-field"><input class="input" readonly value="${esc(i.razorpay.webhook_url)}" aria-label="Razorpay webhook URL"><button type="button" class="icon-btn" data-copy="${esc(i.razorpay.webhook_url)}">${icon('copy')}</button></div><p class="tiny muted">Events: payment.captured, payment.failed, order.paid, refund.processed, refund.failed</p></div></div>
        <div class="integration"><span class="ic">${icon('wa')}</span><div class="stack-sm"><div class="row"><b>WhatsApp Cloud API</b>${i.whatsapp.configured ? badge('ok', 'Connected') : badge('off', 'Not connected')}</div>
          <p class="small muted">${i.whatsapp.configured ? '' : 'Add WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID to .env. '}Delivery receipts ${i.whatsapp.webhook_configured ? 'enabled' : 'need WHATSAPP_VERIFY_TOKEN and WHATSAPP_APP_SECRET'}.</p>
          <div class="copy-field"><input class="input" readonly value="${esc(i.whatsapp.webhook_url)}" aria-label="WhatsApp webhook URL"><button type="button" class="icon-btn" data-copy="${esc(i.whatsapp.webhook_url)}">${icon('copy')}</button></div><a class="small" href="#/settings" id="logsLink">View message log</a></div></div>
        <div class="integration"><span class="ic">${icon('chat')}</span><div><div class="row"><b>Email (password resets)</b>${i.email.configured ? badge('ok', 'Connected') : badge('off', 'Not connected')}</div><p class="small muted">Set SMTP_HOST and SMTP_FROM in .env to email reset links.</p></div></div>
      </div>
      <div class="card" id="logs" hidden></div>
    </div></div>`;
  mountPhotoField(view, 'logo', 'menu');
  $$('[data-copy]', view).forEach(b => b.onclick = () => copyText(b.dataset.copy));
  $$('form[data-group]', view).forEach(f => f.onsubmit = async e => {
    e.preventDefault(); const g = f.dataset.group; const btn = $('button[type=submit]', f); btn.classList.add('is-loading');
    const v = {}; for (const el of f.elements) { if (!el.name) continue; v[el.name] = el.type === 'checkbox' ? el.checked : el.dataset.type === 'number' ? Number(el.value) : el.value; }
    if (g === 'notifications') v.templates = Object.fromEntries($$('[data-tpl]', f).map(fs => [fs.dataset.tpl, { enabled: $('[data-k=enabled]', fs).checked, body: $('[data-k=body]', fs).value, template_name: $('[data-k=template_name]', fs).value.trim(), language: $('[data-k=language]', fs).value.trim() || 'en' }]));
    try { await patch(`/admin/settings/${g}`, v); toast('Settings saved'); if (g === 'restaurant' || g === 'business') state.config = await get('/public/config'); }
    catch (x) { toastError(x); } finally { btn.classList.remove('is-loading'); }
  });
  $('#logsLink', view).onclick = async e => { e.preventDefault(); const box = $('#logs', view); box.hidden = false;
    const r = await get('/admin/notification-logs', { limit: 30 }).catch(x => ({ rows: [], error: x }));
    box.innerHTML = `<div class="card-head"><h2>Recent WhatsApp messages</h2></div>${r.rows.length ? `<div class="table-wrap"><table class="table cards"><tbody>${r.rows.map(l => `<tr><td class="primary"><b>${esc(EVENT_LABEL[l.event] || l.event)}</b><span class="sub">${esc(l.order_number || '')} · ${esc(l.recipient)}</span></td><td data-label="Status">${badge(l.status)}${l.error ? `<span class="sub">${esc(l.error)}</span>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<p class="card-body muted small">No messages yet.</p>'}`; };
}
