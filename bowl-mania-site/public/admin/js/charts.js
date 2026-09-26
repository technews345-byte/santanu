// Single-series column chart and horizontal bar lists. One hue, rounded data ends, hover tooltips, table fallback.
import { esc, rupee, num } from './ui.js';

let tip;
function tooltip() { if (!tip) { tip = document.createElement('div'); tip.className = 'chart-tip'; tip.hidden = true; document.body.append(tip); } return tip; }
const niceMax = v => { if (v <= 0) return 100; const p = 10 ** Math.floor(Math.log10(v)); return [1, 2, 2.5, 5, 10].find(m => m * p >= v) * p; };

/** series: [{label, value, orders?, long?}] */
export function columnChart(el, series, { valueFmt = rupee, height = 240, label = 'Sales' } = {}) {
  const draw = () => {
    const W = el.clientWidth || 600, H = height;
    const pad = { l: 58, r: 8, t: 14, b: 26 }, iw = Math.max(50, W - pad.l - pad.r), ih = H - pad.t - pad.b;
    const max = niceMax(Math.max(0, ...series.map(s => s.value)));
    const band = iw / Math.max(1, series.length), bw = Math.max(3, Math.min(26, band - 3));
    const y = v => pad.t + ih - (v / max) * ih, base = pad.t + ih;
    const every = Math.ceil(series.length / Math.max(3, Math.floor(iw / 46)));
    const path = (x, v) => { const top = y(v), h = base - top; if (h <= 0.5) return ''; const r = Math.min(4, h, bw / 2);
      return `M${x},${base}V${top + r}Q${x},${top} ${x + r},${top}H${x + bw - r}Q${x + bw},${top} ${x + bw},${top + r}V${base}Z`; };
    const peak = series.reduce((m, s, i) => s.value > (series[m]?.value ?? -1) ? i : m, 0);
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)} chart">
      ${[0, .25, .5, .75, 1].map(f => `<line class="grid" x1="${pad.l}" x2="${W - pad.r}" y1="${y(max * f)}" y2="${y(max * f)}"/><text class="axis" x="${pad.l - 8}" y="${y(max * f) + 4}" text-anchor="end">${esc(valueFmt(max * f))}</text>`).join('')}
      ${series.map((s, i) => { const x = pad.l + i * band + (band - bw) / 2; return `<rect class="hit" data-i="${i}" x="${pad.l + i * band}" y="${pad.t}" width="${band}" height="${ih}"/><path class="bar" d="${path(x, s.value)}"/>${i % every === 0 ? `<text class="axis" x="${x + bw / 2}" y="${H - 6}" text-anchor="middle">${esc(s.label)}</text>` : ''}${i === peak && s.value > 0 ? `<text class="val" x="${x + bw / 2}" y="${y(s.value) - 6}" text-anchor="middle">${esc(valueFmt(s.value))}</text>` : ''}`; }).join('')}
    </svg>`;
    const t = tooltip();
    el.querySelectorAll('.hit').forEach(h => {
      h.addEventListener('mousemove', e => { const s = series[h.dataset.i]; t.innerHTML = `<b>${esc(s.long || s.label)}</b>${esc(valueFmt(s.value))}${s.orders != null ? ` · ${num(s.orders)} order${s.orders === 1 ? '' : 's'}` : ''}`; t.hidden = false;
        t.style.left = Math.min(e.clientX + 14, innerWidth - t.offsetWidth - 8) + 'px'; t.style.top = Math.max(8, e.clientY - t.offsetHeight - 12) + 'px'; });
      h.addEventListener('mouseleave', () => { t.hidden = true; });
    });
  };
  draw();
  const ro = new ResizeObserver(() => draw()); ro.observe(el);
  return () => ro.disconnect();
}
export const chartTable = (series, head = 'Period', valueFmt = rupee) => `<details class="table-toggle"><summary>Show as table</summary><div class="table-wrap"><table class="table"><thead><tr><th>${esc(head)}</th><th class="r">Orders</th><th class="r">Amount</th></tr></thead><tbody>
  ${series.map(s => `<tr><td>${esc(s.long || s.label)}</td><td class="r">${num(s.orders ?? 0)}</td><td class="r">${esc(valueFmt(s.value))}</td></tr>`).join('')}</tbody></table></div></details>`;
/** rows: [{name, value, sub?}] */
export const hbars = (rows, valueFmt = rupee) => {
  if (!rows.length) return '<p class="muted small">No data for this period.</p>';
  const max = Math.max(...rows.map(r => r.value), 1);
  return `<div class="hbars">${rows.map(r => `<div class="hbar"><span class="name" title="${esc(r.name)}">${esc(r.name)}</span><span class="track"><span class="fill" style="width:${Math.max(2, r.value / max * 100)}%"></span></span><b>${esc(valueFmt(r.value))}${r.sub ? ` <span class="muted small">${esc(r.sub)}</span>` : ''}</b></div>`).join('')}</div>`;
};
/** Two-part split bar with legend (e.g. online vs cash). parts: [{name, value, color}] */
export const splitBar = parts => {
  const total = parts.reduce((s, p) => s + p.value, 0);
  if (!total) return '<p class="muted small">No data for this period.</p>';
  return `<div class="split">${parts.filter(p => p.value).map(p => `<i style="width:${p.value / total * 100}%;background:${p.color}" title="${esc(p.name)}"></i>`).join('')}</div>
    <div class="legend">${parts.map(p => `<span style="--c:${p.color}">${esc(p.name)} <b class="num">${rupee(p.value)}</b> <span class="muted">(${Math.round(p.value / total * 100)}%)</span></span>`).join('')}</div>`;
};
