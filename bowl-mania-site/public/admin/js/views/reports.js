import { $, $$, esc, icon, todayYMD, download } from '../ui.js';
import { can, state } from '../app.js';

const REPORTS = [
  { key: 'orders', title: 'Orders', text: 'Every order with items, amounts, payment, delivery person and address.', perm: ['reports.export'], filters: ['range', 'status', 'payment_method', 'area_id'] },
  { key: 'revenue', title: 'Revenue', text: 'Daily (or monthly) revenue, online vs cash, delivery fees, discounts and tax.', perm: ['reports.export'], filters: ['range'] },
  { key: 'payments', title: 'Payments', text: 'Razorpay and cash transactions with IDs, refunds and status.', perm: ['payments.view'], filters: ['range', 'pstatus', 'provider'] },
  { key: 'customers', title: 'Customers', text: 'All customers with order count, total spend and first/last order.', perm: ['customers.view'], filters: [] },
  { key: 'menu-sales', title: 'Menu sales', text: 'Quantity and revenue for each bowl and size.', perm: ['reports.export'], filters: ['range'] },
  { key: 'delivery', title: 'Deliveries', text: 'Delivery orders with distance, fee, delivery person and timings.', perm: ['reports.export'], filters: ['range'] }
];
export async function render(view) {
  const list = REPORTS.filter(r => can(...r.perm));
  const today = todayYMD(), first = today.slice(0, 8) + '01';
  view.innerHTML = `<div class="page-head"><div><h1>Reports</h1><p>Choose filters, then download as Excel or CSV. Filters are applied before export.</p></div></div>
    <div class="menu-grid" style="grid-template-columns:repeat(auto-fill,minmax(340px,1fr))">${list.map(r => `<form class="card card-pad stack" data-key="${r.key}">
      <div><h2>${esc(r.title)}</h2><p class="small muted">${esc(r.text)}</p></div>
      ${r.filters.includes('range') ? `<div class="grid-2"><label class="field"><span>From</span><input class="input" type="date" name="from" value="${first}"></label><label class="field"><span>To</span><input class="input" type="date" name="to" value="${today}"></label></div>` : ''}
      ${r.filters.includes('status') ? `<label class="field"><span>Order status</span><select class="select" name="status"><option value="">All</option><option value="open">Open</option><option value="completed,delivered">Delivered / completed</option><option value="cancelled">Cancelled</option></select></label>` : ''}
      ${r.filters.includes('payment_method') ? `<label class="field"><span>Payment</span><select class="select" name="payment_method"><option value="">All</option><option value="online">Online</option><option value="cod">Cash</option></select></label>` : ''}
      ${r.filters.includes('area_id') ? `<label class="field"><span>Location</span><select class="select" name="area_id"><option value="">All</option>${(state.config?.areas || []).map(a => `<option value="${a.id}">${esc(a.name)}</option>`).join('')}</select></label>` : ''}
      ${r.filters.includes('pstatus') ? `<label class="field"><span>Payment status</span><select class="select" name="status"><option value="">All</option><option value="paid">Paid</option><option value="failed">Failed</option><option value="refunded">Refunded</option><option value="pending">Pending</option></select></label>` : ''}
      ${r.filters.includes('provider') ? `<label class="field"><span>Method</span><select class="select" name="provider"><option value="">All</option><option value="razorpay">Razorpay</option><option value="cod">Cash</option></select></label>` : ''}
      <div class="row" style="margin-top:auto"><button class="btn btn-primary btn-sm" type="button" data-fmt="xlsx">${icon('download')} Excel</button><button class="btn btn-ghost btn-sm" type="button" data-fmt="csv">${icon('download')} CSV</button></div></form>`).join('')}</div>`;
  $$('form[data-key]', view).forEach(f => $$('[data-fmt]', f).forEach(b => b.onclick = () => {
    const p = Object.fromEntries([...new FormData(f)].filter(([, v]) => v));
    if (p.from || p.to) p.preset = 'custom';
    download(`/api/admin/reports/${f.dataset.key}?` + new URLSearchParams({ ...p, format: b.dataset.fmt }));
  }));
}
