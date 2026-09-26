import { get } from '../api.js';
import { $, $$, esc, icon, rupee, num, statusBadge, payBadge, ago, errorState, STATUS, STATUS_COLOR, todayYMD, TZ } from '../ui.js';
import { columnChart, chartTable, hbars, splitBar } from '../charts.js';
import { state, can, go, bus } from '../app.js';

const PRESETS = [['today', 'Today'], ['yesterday', 'Yesterday'], ['last7', 'Last 7 days'], ['last30', 'Last 30 days'], ['this_month', 'This month'], ['custom', 'Custom']];
let preset = 'today', custom = { from: '', to: '' }, chartTab = 'range';

function greeting() {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}
const delta = (cur, prev) => {
  if (!prev) return cur ? '<span class="muted">nothing in the previous period</span>' : '';
  const p = Math.round((cur - prev) / prev * 100);
  return `<span class="delta ${p >= 0 ? 'up' : 'down'}">${p >= 0 ? '▲' : '▼'} ${Math.abs(p)}%</span>`;
};

export async function render(view) {
  const offs = [];
  const quick = [
    can('menu.manage') && ['menu?new=1', 'bowl', 'Add menu item'], can('promotions.manage') && ['coupons?new=1', 'ticket', 'Create coupon'],
    can('promotions.manage') && ['offers?new=1', 'gift', 'Create offer'], can('delivery.manage') && ['delivery-areas?new=1', 'pin', 'Add delivery area'],
    can('orders.create') && ['orders/new', 'orders', 'New manual order'], can('staff.manage') && ['staff?new=1', 'users', 'Add staff']
  ].filter(Boolean);

  async function load() {
    const q = preset === 'custom' ? { preset, from: custom.from || todayYMD(), to: custom.to || todayYMD() } : { preset };
    view.querySelector('#dashBody').style.opacity = .55;
    let d;
    try { d = await get('/admin/dashboard', q); } catch (e) { view.querySelector('#dashBody').innerHTML = errorState(e); view.querySelector('[data-retry]').onclick = load; return; }
    const k = d.kpis, p = d.previous, label = PRESETS.find(x => x[0] === preset)[1].toLowerCase();
    const live = d.live || {};
    view.querySelector('#liveStrip').innerHTML = [['new', 'waiting'], ['preparing', 'preparing'], ['ready', 'ready'], ['out_for_delivery', 'out for delivery']]
      .map(([s, t]) => `<span><i style="background:${STATUS_COLOR[s]}"></i>${num(live[s] || 0)} ${t}</span>`).join('');
    const sc = d.status_counts || {};
    view.querySelector('#dashBody').style.opacity = 1;
    view.querySelector('#dashBody').innerHTML = `
      <div class="kpis">
        <div class="kpi hero"><span>${icon('card')}Sales · ${esc(label)}</span><b>${rupee(k.revenue)}</b><small>${p.revenue ? delta(k.revenue, p.revenue) + ' vs previous period' : 'Nothing in the previous period'}</small></div>
        <div class="kpi"><span>${icon('orders')}Orders</span><b>${num(k.orders)}</b><small>${p.orders ? delta(k.orders, p.orders) + ' · ' : ''}${num(k.bowls)} bowl${k.bowls === 1 ? '' : 's'}</small></div>
        <div class="kpi"><span>${icon('chart')}Average order value</span><b>${rupee(k.aov)}</b><small>${p.aov ? `${delta(k.aov, p.aov)} vs ${rupee(p.aov)}` : 'Per order, after discounts'}</small></div>
        <div class="kpi ${d.pending ? 'alert' : ''}"><span>${icon('clock')}Pending orders</span><b>${num(d.pending)}</b><small>${d.pending ? 'Waiting for confirmation' : 'Nothing waiting'}</small></div>
        <div class="kpi"><span>${icon('scooter')}Active deliveries</span><b>${num(d.active_deliveries)}</b><small>Out for delivery now</small></div>
        <div class="kpi"><span>${icon('users')}New customers</span><b>${num(k.new_customers)}</b><small>${num(k.returning_customers)} returning</small></div>
      </div>
      <div class="card card-pad" style="margin-top:16px"><div class="row" style="margin-bottom:10px"><h2>Orders by status</h2><span class="muted small">${esc(label)}</span><span class="spacer"></span><span class="small muted">Online ${rupee(k.online_revenue)} · Cash ${rupee(k.cod_revenue)}</span></div>
        <div class="status-row">${Object.entries(STATUS).filter(([s]) => s !== 'accepted' || sc.accepted).map(([s, t]) => `<a class="status-tile" href="#/orders?status=${s}" style="--c:${STATUS_COLOR[s]}"><b>${num(sc[s] || 0)}</b><span>${t}</span></a>`).join('')}</div></div>
      <div class="dash-grid">
        <div class="stack">
          <div class="card"><div class="tabs-line" role="tablist">${[['range', `Sales · ${label}`], ['today', 'Today'], ['week', 'This week'], ['month', 'This month'], ['orders', 'Orders by day']].map(([t, l]) => `<button role="tab" aria-selected="${t === chartTab}" data-tab="${t}">${esc(l)}</button>`).join('')}</div>
            <div class="card-body"><div class="chart" id="salesChart"></div><div id="salesTable"></div></div></div>
          <div class="cols-2-even">
            <div class="card card-pad"><h2 style="margin-bottom:12px">Most popular bowls</h2>${hbars(d.top_items.slice(0, 6).map(i => ({ name: i.name, value: i.qty, sub: rupee(i.revenue) })), v => num(v) + ' sold')}</div>
            <div class="card card-pad stack"><div><h2 style="margin-bottom:12px">Revenue by payment</h2>${splitBar([{ name: 'Online', value: k.online_revenue, color: '#147A43' }, { name: 'Cash', value: k.cod_revenue, color: '#c99400' }])}</div>
              <div><h2 style="margin-bottom:12px">New vs returning</h2>${splitBar([{ name: 'New', value: k.new_customers, color: '#147A43' }, { name: 'Returning', value: k.returning_customers, color: '#c99400' }]).replace(/₹/g, '')}</div></div>
          </div>
          <div class="card card-pad"><h2 style="margin-bottom:12px">Revenue by location</h2>${hbars(d.by_area.map(a => ({ name: `${a.key} · ${a.fulfilment === 'pickup' ? 'pickup' : 'delivery'}`, value: a.revenue, sub: `${a.orders} orders` })))}</div>
        </div>
        <div class="stack">
          ${quick.length ? `<div class="card card-pad leaf-accent"><h2 style="margin-bottom:12px">Quick actions</h2><div class="quick">${quick.map(([h, i, t]) => `<button type="button" data-go="${h}">${icon(i)}${esc(t)}</button>`).join('')}</div></div>` : ''}
          <div class="card"><div class="card-head"><h2>Latest orders</h2><a href="#/orders" class="small">All orders</a></div>
            ${d.recent.length ? `<div class="table-wrap"><table class="table cards"><tbody>${d.recent.map(o => `<tr class="clickable" data-open="${o.id}">
              <td class="primary"><b>${esc(o.order_number)}</b><span class="sub">${esc(o.customer_name)} · ${ago(o.created_at)}</span></td>
              <td data-label="Status">${statusBadge(o.status)}</td><td class="r" data-label="Total"><b>${rupee(o.total)}</b><span class="sub">${o.payment_method === 'cod' ? 'Cash' : 'Online'}</span></td></tr>`).join('')}</tbody></table></div>`
              : '<div class="empty"><div class="art">' + icon('bowl') + '</div><h3>No orders yet</h3><p>New orders from the website appear here instantly.</p></div>'}
          </div>
        </div>
      </div>`;
    const drawChart = () => {
      const money = list => list.map(x => ({ ...x, value: x.revenue }));
      const s = chartTab === 'today' ? money(d.series.today) : chartTab === 'week' ? money(d.series.week) : chartTab === 'month' ? money(d.series.month) : chartTab === 'orders' ? d.series.range.map(x => ({ ...x, value: x.orders })) : money(d.series.range);
      const fmt = chartTab === 'orders' ? v => num(Math.round(v)) : rupee;
      offs.push(columnChart(view.querySelector('#salesChart'), s, { valueFmt: fmt, label: chartTab === 'orders' ? 'Orders' : 'Sales' }));
      view.querySelector('#salesTable').innerHTML = chartTable(s, chartTab === 'today' || (chartTab === 'range' && d.range.days <= 1) ? 'Hour' : 'Day');
    };
    drawChart();
    $$('[data-tab]', view).forEach(b => b.onclick = () => { chartTab = b.dataset.tab; $$('[data-tab]', view).forEach(x => x.setAttribute('aria-selected', x === b)); drawChart(); });
    $$('[data-open]', view).forEach(r => r.onclick = () => go(`orders/${r.dataset.open}`));
    $$('[data-go]', view).forEach(b => b.onclick = () => { location.hash = '#/' + b.dataset.go; });
  }

  view.innerHTML = `<div class="hello"><div><h1>${greeting()}, ${esc(state.admin.name.split(' ')[0])} 👋</h1><p>Here's what's happening at Bowl Mania ${preset === 'today' ? 'today' : 'in this period'}.</p><div class="live-strip" id="liveStrip"></div></div>
    <div class="stack-sm" style="justify-items:end"><div class="chips" id="presets">${PRESETS.map(([k, l]) => `<button class="chip" type="button" data-p="${k}" aria-pressed="${k === preset}">${l}</button>`).join('')}</div>
      <div class="row" id="customRange" ${preset === 'custom' ? '' : 'hidden'}><input class="input" type="date" id="from" value="${custom.from}" aria-label="From date" style="width:auto"><span class="muted">to</span><input class="input" type="date" id="to" value="${custom.to}" aria-label="To date" style="width:auto"></div></div></div>
    <div id="dashBody">${'<div class="kpis">' + '<span class="skel" style="height:112px"></span>'.repeat(6) + '</div>'}</div>`;
  view.querySelector('#presets').onclick = e => { const b = e.target.closest('[data-p]'); if (!b) return; preset = b.dataset.p;
    $$('[data-p]', view).forEach(x => x.setAttribute('aria-pressed', x === b)); view.querySelector('#customRange').hidden = preset !== 'custom';
    if (preset === 'custom' && !custom.from) { custom = { from: todayYMD(), to: todayYMD() }; view.querySelector('#from').value = view.querySelector('#to').value = custom.from; }
    view.querySelector('.hello p').textContent = `Here's what's happening at Bowl Mania ${preset === 'today' ? 'today' : 'in this period'}.`; load(); };
  ['from', 'to'].forEach(k => view.querySelector('#' + k).onchange = e => { custom[k] = e.target.value; load(); });
  await load();
  const onOrder = () => load();
  bus.addEventListener('order', onOrder);
  const timer = setInterval(load, 120_000);
  return () => { bus.removeEventListener('order', onOrder); clearInterval(timer); offs.forEach(f => f?.()); };
}
