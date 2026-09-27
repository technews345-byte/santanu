import { get } from '../api.js';
import { $, $$, esc, icon, rupee, num, badge, fmtDateTime, emptyState, errorState, pager, debounce, download, PAY } from '../ui.js';
import { can, go } from '../app.js';

const f = { status: '', provider: '', q: '', from: '', to: '', page: 1 };
export async function render(view) {
  view.innerHTML = `<div class="page-head"><div><h1>Payments</h1><p>Every Razorpay and cash payment. Online payments are only marked paid after Razorpay's signature is verified on the server.</p></div>
    <div class="actions">${can('reports.export', 'payments.view') ? `<button class="btn btn-ghost btn-sm" data-exp="csv">${icon('download')} CSV</button><button class="btn btn-ghost btn-sm" data-exp="xlsx">${icon('download')} Excel</button>` : ''}</div></div>
    <div class="kpis" id="sums" style="margin-bottom:16px"></div>
    <div class="toolbar"><input class="input search" id="q" type="search" placeholder="Order ID, customer or Razorpay ID" aria-label="Search payments">
      <select class="select" id="status" aria-label="Status"><option value="">Any status</option>${Object.entries(PAY).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
      <select class="select" id="provider" aria-label="Method"><option value="">Online & cash</option><option value="razorpay">Razorpay</option><option value="cod">Cash</option></select>
      <input class="input" type="date" id="from" aria-label="From"><input class="input" type="date" id="to" aria-label="To"></div><div class="card" id="list"></div>`;
  for (const k of ['status', 'provider', 'from', 'to']) { $('#' + k, view).value = f[k]; $('#' + k, view).onchange = e => { f[k] = e.target.value; f.page = 1; load(); }; }
  $('#q', view).oninput = debounce(e => { f.q = e.target.value.trim(); f.page = 1; load(); }, 300);
  $$('[data-exp]', view).forEach(b => b.onclick = () => download('/api/admin/reports/payments?' + new URLSearchParams({ ...Object.fromEntries(Object.entries(f).filter(([k, v]) => v && k !== 'page')), format: b.dataset.exp })));
  async function load() {
    let r; try { r = await get('/admin/payments', f); } catch (e) { $('#list', view).innerHTML = errorState(e); $('[data-retry]', view).onclick = load; return; }
    const sum = (st, pr) => r.sums.filter(s => (!st || s.status === st) && (!pr || s.provider === pr)).reduce((a, s) => ({ n: a.n + s.n, amount: a.amount + s.amount, refunded: a.refunded + s.refunded }), { n: 0, amount: 0, refunded: 0 });
    const paidOnline = sum('paid', 'razorpay'), cash = sum('paid', 'cod'), failed = sum('failed'), refunded = r.sums.reduce((a, s) => a + s.refunded, 0);
    $('#sums', view).innerHTML = `<div class="kpi hero"><span>Paid online</span><b>${rupee(paidOnline.amount)}</b><small>${num(paidOnline.n)} payments</small></div>
      <div class="kpi"><span>Cash collected</span><b>${rupee(cash.amount)}</b><small>${num(cash.n)} orders</small></div><div class="kpi"><span>Refunded / failed</span><b>${rupee(refunded)}</b><small>${num(failed.n)} failed attempts</small></div>`;
    const el = $('#list', view);
    if (!r.rows.length) { el.innerHTML = emptyState('card', 'No payments match'); return; }
    el.innerHTML = `<div class="table-wrap"><table class="table cards"><thead><tr><th>Transaction</th><th>Order</th><th>Customer</th><th>Method</th><th>Razorpay order</th><th>Payment ID</th><th class="r">Amount</th><th>Status</th><th>Date</th></tr></thead><tbody>
      ${r.rows.map(p => `<tr class="clickable" data-o="${p.order_id}"><td class="primary"><b>#${p.id}</b><span class="sub">${p.provider === 'cod' ? 'Cash' : 'Razorpay'}</span></td><td data-label="Order">${esc(p.order_number)}</td><td data-label="Customer">${esc(p.customer_name)}</td>
        <td data-label="Method">${esc(p.provider === 'cod' ? 'Cash' : (p.method || '—').toUpperCase())}</td><td data-label="RZP order"><span class="code">${esc(p.razorpay_order_id || '—')}</span></td><td data-label="Payment ID"><span class="code">${esc(p.razorpay_payment_id || '—')}</span></td>
        <td class="r strong" data-label="Amount">${rupee(p.amount)}${p.refunded_amount ? `<span class="sub">−${rupee(p.refunded_amount)} refunded</span>` : ''}</td><td data-label="Status">${badge(p.status, PAY[p.status])}${p.error ? `<span class="sub" style="color:var(--err)">${esc(p.error)}</span>` : ''}</td><td data-label="Date">${fmtDateTime(p.paid_at || p.created_at)}</td></tr>`).join('')}</tbody></table></div>`;
    el.append(pager(r, p => { f.page = p; load(); }));
    $$('tr[data-o]', el).forEach(tr => tr.onclick = () => go(`orders/${tr.dataset.o}`));
  }
  await load();
}
