import { Router } from 'express';
import ExcelJS from 'exceljs';
import { db } from '../../db/index.js';
import { ah, badRequest } from '../../lib/errors.js';
import { parse, z } from '../../lib/validate.js';
import { audit } from '../../lib/audit.js';
import { requirePerm } from '../../middleware/auth.js';
import { addDays, localParts, localToDate, sqlNow } from '../../lib/time.js';
import { range, tzOffsetMinutes } from './helpers.js';
import { orderFilters } from './orders.js';
import { paymentFilters } from './payments.js';
import { STATUS_LABEL } from '../../services/orders.js';

const r = Router();
const PLACED = 'o.placed_at IS NOT NULL';
const SOLD = `${PLACED} AND o.status NOT IN ('cancelled','refunded')`;

function metrics(start, end) {
  const k = db.prepare(`SELECT
      COUNT(*) FILTER (WHERE ${SOLD}) AS orders,
      COALESCE(SUM(o.total) FILTER (WHERE ${SOLD}),0) AS revenue,
      COALESCE(SUM(o.total) FILTER (WHERE ${SOLD} AND o.payment_method='online'),0) AS online_revenue,
      COALESCE(SUM(o.total) FILTER (WHERE ${SOLD} AND o.payment_method='cod'),0) AS cod_revenue,
      COALESCE(SUM(o.delivery_fee) FILTER (WHERE ${SOLD}),0) AS delivery_revenue,
      COALESCE(SUM(o.discount) FILTER (WHERE ${SOLD}),0) AS discounts,
      COALESCE(SUM(o.tax) FILTER (WHERE ${SOLD}),0) AS tax,
      COUNT(*) FILTER (WHERE ${PLACED} AND o.status='cancelled') AS cancelled,
      COUNT(*) FILTER (WHERE ${PLACED}) AS placed
    FROM orders o WHERE o.created_at>=? AND o.created_at<?`).get(start, end);
  k.aov = k.orders ? Math.round(k.revenue / k.orders) : 0;
  k.cancellation_rate = k.placed ? +(k.cancelled / k.placed * 100).toFixed(1) : 0;
  k.new_customers = db.prepare(`SELECT COUNT(*) n FROM (SELECT customer_id, MIN(created_at) first FROM orders o WHERE ${PLACED} GROUP BY customer_id) WHERE first>=? AND first<?`).get(start, end).n;
  const cust = db.prepare(`SELECT COUNT(DISTINCT o.customer_id) n FROM orders o WHERE ${SOLD} AND o.created_at>=? AND o.created_at<?`).get(start, end).n;
  k.customers = cust; k.returning_customers = Math.max(0, cust - k.new_customers);
  k.bowls = db.prepare(`SELECT COALESCE(SUM(oi.quantity),0) n FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE ${SOLD} AND o.created_at>=? AND o.created_at<?`).get(start, end).n;
  return k;
}
function series(rg, grain) {
  const off = tzOffsetMinutes();
  const fmt = { hour: '%H', day: '%Y-%m-%d', week: '%Y-%W', month: '%Y-%m' }[grain];
  const rows = db.prepare(`SELECT strftime('${fmt}', o.created_at, '${off >= 0 ? '+' : ''}${off} minutes') AS k,
      COUNT(*) AS orders, SUM(o.total) AS revenue FROM orders o WHERE ${SOLD} AND o.created_at>=? AND o.created_at<? GROUP BY k`).all(rg.start, rg.end);
  const map = Object.fromEntries(rows.map(x => [x.k, x]));
  const out = [];
  if (grain === 'hour') for (let h = 0; h < 24; h++) { const k = String(h).padStart(2, '0'); out.push({ key: k, label: `${h % 12 || 12}${h < 12 ? 'a' : 'p'}`, orders: map[k]?.orders || 0, revenue: map[k]?.revenue || 0 }); }
  else if (grain === 'day') for (let d = rg.from; d <= rg.to; d = addDays(d, 1)) out.push({ key: d, label: d.slice(8) + ' ' + new Date(d + 'T12:00:00Z').toLocaleDateString('en-IN', { month: 'short', timeZone: 'UTC' }), orders: map[d]?.orders || 0, revenue: map[d]?.revenue || 0 });
  else if (grain === 'month') { let d = rg.from.slice(0, 7); const end = rg.to.slice(0, 7); while (d <= end) { out.push({ key: d, label: new Date(d + '-15T12:00:00Z').toLocaleDateString('en-IN', { month: 'short', year: '2-digit', timeZone: 'UTC' }), orders: map[d]?.orders || 0, revenue: map[d]?.revenue || 0 }); const [y, m] = d.split('-').map(Number); d = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`; } }
  else for (const x of rows) out.push({ key: x.k, label: 'Wk ' + x.k.slice(5), orders: x.orders, revenue: x.revenue });
  return out;
}
const autoGrain = rg => rg.days <= 1 ? 'hour' : rg.days <= 62 ? 'day' : 'month';
const breakdowns = (start, end) => ({
  top_items: db.prepare(`SELECT oi.menu_item_id AS id, oi.name, SUM(oi.quantity) qty, SUM(oi.line_total) revenue FROM order_items oi JOIN orders o ON o.id=oi.order_id
    WHERE ${SOLD} AND o.created_at>=? AND o.created_at<? GROUP BY oi.name ORDER BY qty DESC, revenue DESC`).all(start, end),
  by_payment: db.prepare(`SELECT o.payment_method AS key, COUNT(*) orders, SUM(o.total) revenue FROM orders o WHERE ${SOLD} AND o.created_at>=? AND o.created_at<? GROUP BY o.payment_method`).all(start, end),
  by_area: db.prepare(`SELECT COALESCE(a.name,'—') AS key, o.fulfilment, COUNT(*) orders, SUM(o.total) revenue FROM orders o LEFT JOIN delivery_areas a ON a.id=o.area_id
    WHERE ${SOLD} AND o.created_at>=? AND o.created_at<? GROUP BY a.name, o.fulfilment ORDER BY revenue DESC`).all(start, end),
  by_category: db.prepare(`SELECT COALESCE(c.name,'Uncategorised') AS key, SUM(oi.quantity) qty, SUM(oi.line_total) revenue FROM order_items oi JOIN orders o ON o.id=oi.order_id
    LEFT JOIN categories c ON c.id=oi.category_id WHERE ${SOLD} AND o.created_at>=? AND o.created_at<? GROUP BY c.name ORDER BY revenue DESC`).all(start, end)
});
const previous = rg => { const len = rg.days; const to = addDays(rg.from, -1), from = addDays(to, -(len - 1));
  return { start: sqlNow(localToDate(from, '00:00')), end: rg.start, from, to }; };

r.get('/dashboard', requirePerm('dashboard.view'), ah(async (req, res) => {
  const rg = range({ preset: 'today', ...req.query });
  const prev = previous(rg);
  const today = localParts().date, weekStart = addDays(today, -6), monthStart = today.slice(0, 8) + '01';
  const live = Object.fromEntries(db.prepare(`SELECT status, COUNT(*) n FROM orders o WHERE ${PLACED} AND o.status NOT IN ('completed','cancelled','refunded','delivered') GROUP BY status`).all().map(x => [x.status, x.n]));
  const statusCounts = Object.fromEntries(db.prepare(`SELECT status, COUNT(*) n FROM orders o WHERE ${PLACED} AND o.created_at>=? AND o.created_at<? GROUP BY status`).all(rg.start, rg.end).map(x => [x.status, x.n]));
  res.json({
    range: rg, kpis: metrics(rg.start, rg.end), previous: metrics(prev.start, prev.end), status_counts: statusCounts, live,
    active_deliveries: live.out_for_delivery || 0, pending: live.new || 0,
    series: { range: series(rg, autoGrain(rg)), today: series(range({ preset: 'today' }), 'hour'),
      week: series(range({ preset: 'custom', from: weekStart, to: today }), 'day'), month: series(range({ preset: 'custom', from: monthStart, to: today }), 'day') },
    ...breakdowns(rg.start, rg.end),
    recent: db.prepare(`SELECT o.id, o.order_number, o.customer_name, o.total, o.status, o.payment_method, o.payment_status, o.fulfilment, o.created_at,
      (SELECT GROUP_CONCAT(quantity || '× ' || name, ', ') FROM order_items WHERE order_id=o.id) AS items_text FROM orders o WHERE ${PLACED} ORDER BY o.id DESC LIMIT 8`).all()
  });
}));

r.get('/analytics', requirePerm('analytics.view'), ah(async (req, res) => {
  const rg = range(req.query);
  const { grain } = parse(z.object({ grain: z.enum(['auto', 'hour', 'day', 'week', 'month']).optional().default('auto') }), req.query);
  const g = grain === 'auto' ? autoGrain(rg) : grain;
  if (g === 'hour' && rg.days > 1) throw badRequest('Hourly view works for a single day.');
  const b = breakdowns(rg.start, rg.end);
  const off = tzOffsetMinutes();
  const growth = db.prepare(`SELECT strftime('${g === 'month' ? '%Y-%m' : '%Y-%m-%d'}', first, '${off >= 0 ? '+' : ''}${off} minutes') k, COUNT(*) n
    FROM (SELECT MIN(created_at) first FROM orders o WHERE ${PLACED} GROUP BY customer_id) WHERE first>=? AND first<? GROUP BY k ORDER BY k`).all(rg.start, rg.end);
  const repeat = db.prepare(`SELECT COUNT(*) FILTER (WHERE n>=2) repeaters, COUNT(*) total FROM (SELECT customer_id, COUNT(*) n FROM orders o WHERE ${SOLD} AND o.created_at>=? AND o.created_at<? GROUP BY customer_id)`).get(rg.start, rg.end);
  const prev = previous(rg);
  res.json({
    range: rg, grain: g, kpis: metrics(rg.start, rg.end), previous: metrics(prev.start, prev.end), series: series(rg, g),
    top_items: b.top_items.slice(0, 10), worst_items: db.prepare(`SELECT m.name, COALESCE(x.qty,0) qty, COALESCE(x.revenue,0) revenue FROM menu_items m LEFT JOIN
      (SELECT oi.menu_item_id id, SUM(oi.quantity) qty, SUM(oi.line_total) revenue FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE ${SOLD} AND o.created_at>=? AND o.created_at<? GROUP BY oi.menu_item_id) x ON x.id=m.id
      WHERE m.active=1 ORDER BY qty ASC, revenue ASC LIMIT 5`).all(rg.start, rg.end),
    by_payment: b.by_payment, by_area: b.by_area, by_category: b.by_category, customer_growth: growth,
    repeat: { ...repeat, rate: repeat.total ? +(repeat.repeaters / repeat.total * 100).toFixed(1) : 0 }
  });
}));

// ---------- Reports (CSV / Excel), filters applied before export ----------
const money = { numFmt: '"₹"#,##0' };
const REPORTS = {
  orders: { title: 'Orders', perm: 'reports.export', build(q) {
    const { where, params, sort } = orderFilters(q);
    const rows = db.prepare(`SELECT o.*, a.name AS area_name, (SELECT GROUP_CONCAT(quantity || ' x ' || name || ' (' || size_label || ')', '; ') FROM order_items WHERE order_id=o.id) AS items_text,
      (SELECT SUM(quantity) FROM order_items WHERE order_id=o.id) AS qty, (SELECT ad.name FROM delivery_assignments d JOIN admins ad ON ad.id=d.staff_id WHERE d.order_id=o.id) AS rider
      FROM orders o LEFT JOIN delivery_areas a ON a.id=o.area_id WHERE ${where} ORDER BY ${sort} LIMIT 50000`).all(...params);
    return { columns: [['Order ID', 'order_number', 16], ['Date/time', 'created_local', 18], ['Customer', 'customer_name', 20], ['Phone', 'customer_phone', 13], ['Items', 'items_text', 50], ['Qty', 'qty', 6],
      ['Subtotal', 'subtotal', 10, money], ['Discount', 'discount', 10, money], ['Coupon', 'coupon_code', 10], ['Delivery fee', 'delivery_fee', 11, money], ['Tax', 'tax', 8, money], ['Total', 'total', 10, money],
      ['Payment method', 'payment_method', 14], ['Payment status', 'payment_status', 14], ['Fulfilment', 'fulfilment', 10], ['Area', 'area_name', 10], ['Distance km', 'distance_km', 10], ['Status', 'status_label', 16], ['Delivery person', 'rider', 16], ['Address', 'address', 40], ['Notes', 'notes', 30]],
      rows: rows.map(o => ({ ...o, status_label: STATUS_LABEL[o.status] })) };
  } },
  revenue: { title: 'Revenue', perm: 'reports.export', build(q) {
    const rg = range(q);
    const rows = series(rg, rg.days > 62 ? 'month' : 'day').map(s => {
      const [a, b] = rg.days > 62 ? [s.key + '-01', addDays((s.key.slice(5) === '12' ? `${+s.key.slice(0, 4) + 1}-01` : `${s.key.slice(0, 5)}${String(+s.key.slice(5) + 1).padStart(2, '0')}`) + '-01', -1)] : [s.key, s.key];
      const from = a < rg.from ? rg.from : a, to = b > rg.to ? rg.to : b;
      const m = metrics(sqlNow(localToDate(from, '00:00')), sqlNow(localToDate(addDays(to, 1), '00:00')));
      return { period: s.key, ...m };
    });
    return { columns: [['Period', 'period', 12], ['Orders', 'orders', 8], ['Revenue', 'revenue', 12, money], ['Online', 'online_revenue', 12, money], ['Cash', 'cod_revenue', 12, money],
      ['Delivery fees', 'delivery_revenue', 12, money], ['Discounts', 'discounts', 12, money], ['Tax', 'tax', 10, money], ['Avg order', 'aov', 10, money], ['Bowls', 'bowls', 8], ['Cancelled', 'cancelled', 10], ['New customers', 'new_customers', 12]], rows };
  } },
  payments: { title: 'Payments', perm: 'payments.view', build(q) {
    const { where, params } = paymentFilters(q);
    const rows = db.prepare(`SELECT p.*, o.order_number, o.customer_name, o.customer_phone FROM payments p JOIN orders o ON o.id=p.order_id WHERE ${where} ORDER BY p.id DESC LIMIT 50000`).all(...params);
    return { columns: [['Payment #', 'id', 10], ['Date/time', 'created_local', 18], ['Order ID', 'order_number', 16], ['Customer', 'customer_name', 20], ['Phone', 'customer_phone', 13], ['Provider', 'provider', 10], ['Method', 'method', 10],
      ['Razorpay order', 'razorpay_order_id', 22], ['Razorpay payment', 'razorpay_payment_id', 22], ['Amount', 'amount', 10, money], ['Refunded', 'refunded_amount', 10, money], ['Status', 'status', 12], ['Paid at', 'paid_local', 18]],
      rows: rows.map(p => ({ ...p, paid_local: p.paid_at ? toLocal(p.paid_at) : '' })) };
  } },
  customers: { title: 'Customers', perm: 'customers.view', build() {
    const rows = db.prepare(`SELECT c.*, COUNT(o.id) FILTER (WHERE ${SOLD}) orders_count, COALESCE(SUM(o.total) FILTER (WHERE ${SOLD}),0) spent,
      MIN(o.created_at) FILTER (WHERE ${PLACED}) first_at, MAX(o.created_at) FILTER (WHERE ${PLACED}) last_at FROM customers c LEFT JOIN orders o ON o.customer_id=c.id GROUP BY c.id ORDER BY spent DESC`).all();
    return { columns: [['Name', 'name', 22], ['Phone', 'phone', 13], ['Email', 'email', 24], ['Orders', 'orders_count', 8], ['Total spent', 'spent', 12, money], ['First order', 'first_local', 18], ['Last order', 'last_local', 18], ['Status', 'status', 10]],
      rows: rows.map(c => ({ ...c, first_local: c.first_at ? toLocal(c.first_at) : '', last_local: c.last_at ? toLocal(c.last_at) : '' })) };
  } },
  'menu-sales': { title: 'Menu sales', perm: 'reports.export', build(q) {
    const rg = range(q);
    const rows = db.prepare(`SELECT oi.name, oi.size_label, COALESCE(c.name,'') category, SUM(oi.quantity) qty, SUM(oi.line_total) revenue, COUNT(DISTINCT o.id) orders FROM order_items oi JOIN orders o ON o.id=oi.order_id
      LEFT JOIN categories c ON c.id=oi.category_id WHERE ${SOLD} AND o.created_at>=? AND o.created_at<? GROUP BY oi.name, oi.size_label ORDER BY revenue DESC`).all(rg.start, rg.end);
    return { columns: [['Item', 'name', 26], ['Size', 'size_label', 10], ['Category', 'category', 18], ['Quantity', 'qty', 10], ['Orders', 'orders', 8], ['Revenue', 'revenue', 12, money]], rows };
  } },
  delivery: { title: 'Deliveries', perm: 'reports.export', build(q) {
    const rg = range(q);
    const rows = db.prepare(`SELECT o.order_number, o.created_at, o.customer_name, o.address, a.name area_name, o.distance_km, o.delivery_fee, o.total, o.status, s.name rider, d.status delivery_status, d.assigned_at, d.picked_up_at, d.delivered_at
      FROM orders o LEFT JOIN delivery_areas a ON a.id=o.area_id LEFT JOIN delivery_assignments d ON d.order_id=o.id LEFT JOIN admins s ON s.id=d.staff_id
      WHERE o.fulfilment='delivery' AND ${PLACED} AND o.created_at>=? AND o.created_at<? ORDER BY o.id DESC`).all(rg.start, rg.end);
    return { columns: [['Order ID', 'order_number', 16], ['Date/time', 'created_local', 18], ['Customer', 'customer_name', 20], ['Address', 'address', 36], ['Area', 'area_name', 10], ['Distance km', 'distance_km', 10],
      ['Delivery fee', 'delivery_fee', 11, money], ['Order total', 'total', 11, money], ['Order status', 'status', 14], ['Delivery person', 'rider', 16], ['Delivery status', 'delivery_status', 14], ['Delivered at', 'delivered_local', 18]],
      rows: rows.map(o => ({ ...o, delivered_local: o.delivered_at ? toLocal(o.delivered_at) : '' })) };
  } }
};
const toLocal = utc => { const d = new Date(utc.replace(' ', 'T') + 'Z'); const p = localParts(d); return `${p.date} ${p.time}`; };
const csvCell = v => { const s = v == null ? '' : String(v); return /[",\n\r]/.test(s) || /^[=+\-@]/.test(s) ? `"${(/^[=+\-@]/.test(s) ? "'" : '') + s.replace(/"/g, '""')}"` : s; };

r.get('/reports/:type', ah(async (req, res, next) => {
  const def = REPORTS[req.params.type]; if (!def) throw badRequest('Unknown report.');
  requirePerm(def.perm, 'reports.export')(req, res, async err => {
    if (err) return next(err);
    try {
      const { format } = parse(z.object({ format: z.enum(['csv', 'xlsx']).default('xlsx') }), req.query);
      const { columns, rows } = def.build(req.query);
      rows.forEach(x => { if (x.created_at && !x.created_local) x.created_local = toLocal(x.created_at); });
      const name = `bowl-mania-${req.params.type}-${localParts().date}.${format}`;
      audit(req, 'export', 'report', req.params.type, `Downloaded ${def.title} report (${rows.length} rows, ${format.toUpperCase()})`);
      res.set('Content-Disposition', `attachment; filename="${name}"`);
      if (format === 'csv') {
        res.type('text/csv; charset=utf-8');
        return res.send('﻿' + [columns.map(c => csvCell(c[0])).join(','), ...rows.map(row => columns.map(c => csvCell(row[c[1]])).join(','))].join('\r\n'));
      }
      const wb = new ExcelJS.Workbook(); wb.creator = 'Bowl Mania';
      const ws = wb.addWorksheet(def.title, { views: [{ state: 'frozen', ySplit: 1 }] });
      ws.columns = columns.map(([header, key, width, style]) => ({ header, key, width, style }));
      ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B5D3B' } };
      rows.forEach(row => ws.addRow(Object.fromEntries(columns.map(c => [c[1], row[c[1]] ?? '']))));
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
      res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      await wb.xlsx.write(res); res.end();
    } catch (e) { next(e); }
  });
}));
export default r;
