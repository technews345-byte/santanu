import { get } from '../api.js';
import { $, $$, esc, icon, rupee, num, errorState, todayYMD, download } from '../ui.js';
import { columnChart, chartTable, hbars, splitBar } from '../charts.js';
import { can } from '../app.js';

const PRESETS = [['last7', 'Last 7 days'], ['last30', 'Last 30 days'], ['this_month', 'This month'], ['last_month', 'Last month'], ['this_year', 'This year'], ['custom', 'Custom']];
let q = { preset: 'last30', from: '', to: '', grain: 'auto' };
const delta = (c, p) => !p ? '' : `<span class="delta ${c >= p ? 'up' : 'down'}">${c >= p ? '▲' : '▼'} ${Math.abs(Math.round((c - p) / p * 100))}%</span>`;

export async function render(view) {
  const offs = [];
  view.innerHTML = `<div class="page-head"><div><h1>Analytics</h1><p>Sales, customers and menu performance for any period.</p></div>
    <div class="actions">${can('reports.export') ? `<button class="btn btn-ghost btn-sm" id="exp">${icon('download')} Revenue report</button>` : ''}</div></div>
    <div class="toolbar"><div class="chips">${PRESETS.map(([k, l]) => `<button class="chip" data-p="${k}" aria-pressed="${q.preset === k}">${l}</button>`).join('')}</div>
      <span id="custom" ${q.preset === 'custom' ? '' : 'hidden'} class="row"><input class="input" type="date" id="from" aria-label="From"><input class="input" type="date" id="to" aria-label="To"></span>
      <div class="seg" role="group" aria-label="Group by">${[['auto', 'Auto'], ['day', 'Daily'], ['week', 'Weekly'], ['month', 'Monthly']].map(([k, l]) => `<button type="button" data-g="${k}" aria-pressed="${q.grain === k}">${l}</button>`).join('')}</div></div>
    <div id="body"></div>`;
  $$('[data-p]', view).forEach(b => b.onclick = () => { q.preset = b.dataset.p; $$('[data-p]', view).forEach(x => x.setAttribute('aria-pressed', x === b)); $('#custom', view).hidden = q.preset !== 'custom';
    if (q.preset === 'custom' && !q.from) { q.from = q.to = todayYMD(); $('#from', view).value = $('#to', view).value = q.from; } load(); });
  $$('[data-g]', view).forEach(b => b.onclick = () => { q.grain = b.dataset.g; $$('[data-g]', view).forEach(x => x.setAttribute('aria-pressed', x === b)); load(); });
  ['from', 'to'].forEach(k => { $('#' + k, view).value = q[k]; $('#' + k, view).onchange = e => { q[k] = e.target.value; load(); }; });
  $('#exp', view)?.addEventListener('click', () => download('/api/admin/reports/revenue?' + new URLSearchParams({ ...q, format: 'xlsx' })));
  async function load() {
    const body = $('#body', view); body.style.opacity = .55;
    let a; try { a = await get('/admin/analytics', q.preset === 'custom' ? q : { preset: q.preset, grain: q.grain }); } catch (e) { body.innerHTML = errorState(e); body.style.opacity = 1; $('[data-retry]', body).onclick = load; return; }
    body.style.opacity = 1; offs.splice(0).forEach(f => f());
    const k = a.kpis, p = a.previous;
    a.series = a.series.map(x => ({ ...x, value: x.revenue }));
    body.innerHTML = `<p class="small muted" style="margin-bottom:12px">${esc(a.range.from)} to ${esc(a.range.to)} · compared with the previous ${a.range.days} days</p>
      <div class="kpis" style="grid-template-columns:repeat(4,1fr)">
        <div class="kpi hero"><span>Revenue</span><b>${rupee(k.revenue)}</b><small>${delta(k.revenue, p.revenue)} vs ${rupee(p.revenue)}</small></div>
        <div class="kpi"><span>Orders</span><b>${num(k.orders)}</b><small>${delta(k.orders, p.orders)} · ${num(k.bowls)} bowls</small></div>
        <div class="kpi"><span>Average order</span><b>${rupee(k.aov)}</b><small>${delta(k.aov, p.aov)}</small></div>
        <div class="kpi"><span>Cancellation rate</span><b>${k.cancellation_rate}%</b><small>${num(k.cancelled)} of ${num(k.placed)} orders</small></div>
        <div class="kpi"><span>Delivery revenue</span><b>${rupee(k.delivery_revenue)}</b><small>Delivery fees collected</small></div>
        <div class="kpi"><span>Discounts given</span><b>${rupee(k.discounts)}</b><small>Offers and coupons</small></div>
        <div class="kpi"><span>New customers</span><b>${num(k.new_customers)}</b><small>${delta(k.new_customers, p.new_customers)}</small></div>
        <div class="kpi"><span>Repeat customers</span><b>${a.repeat.rate}%</b><small>${num(a.repeat.repeaters)} ordered 2+ times</small></div></div>
      <div class="card" style="margin-top:18px"><div class="card-head"><h2>${{ hour: 'Hourly', day: 'Daily', week: 'Weekly', month: 'Monthly' }[a.grain]} sales</h2></div><div class="card-body"><div class="chart" id="salesChart"></div>${chartTable(a.series, { hour: 'Hour', day: 'Day', week: 'Week', month: 'Month' }[a.grain])}</div></div>
      <div class="cols-2-even" style="margin-top:18px">
        <div class="card card-pad"><h2 style="margin-bottom:12px">Top-selling bowls</h2>${hbars(a.top_items.map(i => ({ name: i.name, value: i.revenue, sub: `${num(i.qty)} sold` })))}</div>
        <div class="card card-pad"><h2 style="margin-bottom:12px">Slowest sellers</h2>${hbars(a.worst_items.map(i => ({ name: i.name, value: i.qty, sub: rupee(i.revenue) })), v => `${num(v)} sold`)}<p class="tiny muted" style="margin-top:8px">Items on the menu with the fewest sales in this period.</p></div>
        <div class="card card-pad"><h2 style="margin-bottom:12px">Category sales</h2>${hbars(a.by_category.map(c => ({ name: c.key, value: c.revenue, sub: `${num(c.qty)} bowls` })))}</div>
        <div class="card card-pad"><h2 style="margin-bottom:12px">Locations</h2>${hbars(a.by_area.map(x => ({ name: `${x.key} · ${x.fulfilment}`, value: x.revenue, sub: `${num(x.orders)} orders` })))}</div>
        <div class="card card-pad"><h2 style="margin-bottom:12px">Payment methods</h2>${splitBar(['online', 'cod'].map(m => ({ name: m === 'online' ? 'Online' : 'Cash', value: a.by_payment.find(x => x.key === m)?.revenue || 0, color: m === 'online' ? '#147A43' : '#c99400' })))}</div>
        <div class="card card-pad"><h2 style="margin-bottom:12px">Customer growth</h2><div class="chart" id="growthChart" style="height:180px"></div></div>
      </div>`;
    offs.push(columnChart($('#salesChart', body), a.series, { label: 'Sales' }));
    offs.push(columnChart($('#growthChart', body), a.customer_growth.map(g => ({ label: g.k.slice(5), long: g.k, value: g.n })), { height: 180, valueFmt: v => num(Math.round(v)), label: 'New customers' }));
  }
  await load();
  return () => offs.forEach(f => f());
}
