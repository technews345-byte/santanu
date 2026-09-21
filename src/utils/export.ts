import * as XLSX from 'xlsx';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import { format, parseISO } from 'date-fns';
import { Account, Category, Transaction } from '../types';
import { formatCurrency, summarize } from './finance';
import { REPORT_LOGO } from './reportLogo';

interface ExportContext {
  transactions: Transaction[];
  categories: Category[];
  accounts: Account[];
  rangeLabel: string;
  /** Whoever the report belongs to, when someone is signed in. */
  user?: { displayName: string | null; email: string | null } | null;
}

function toRows({ transactions, categories, accounts }: ExportContext) {
  return transactions.map((t) => {
    const cat = categories.find((c) => c.id === t.categoryId);
    const account = accounts.find((a) => a.id === t.accountId);
    const toAccount = accounts.find((a) => a.id === t.toAccountId);
    return {
      Date: format(parseISO(t.date), 'yyyy-MM-dd HH:mm'),
      Type: t.type,
      Category: cat?.name ?? (t.type === 'transfer' ? 'Transfer' : 'Uncategorized'),
      Account: account?.name ?? '',
      'To Account': toAccount?.name ?? '',
      Amount: t.amount,
      Currency: t.currency,
      Note: t.note,
    };
  });
}

export async function exportToXlsx(ctx: ExportContext): Promise<void> {
  const rows = toRows(ctx);
  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet['!cols'] = [{ wch: 16 }, { wch: 10 }, { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 8 }, { wch: 30 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Transactions');

  const buffer: ArrayBuffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
  const file = new File(Paths.cache, `transactions_${Date.now()}.xlsx`);
  file.create({ overwrite: true });
  file.write(new Uint8Array(buffer));

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      dialogTitle: 'Export Transactions',
    });
  }
}

/* Green is spoken for by income and violet by transfers, so neither appears
   among the category colours and a swatch never means two things. */
const CATEGORY_INK = [
  '#1877F2', '#00B3A4', '#F5A524', '#E5484D', '#EC4899',
  '#0EA5E9', '#F97316', '#A16207', '#0891B2', '#64748B',
];

const INCOME_INK = '#0F9D58';
const TRANSFER_INK = '#7C5CFC';

/** A colour at reduced strength, for a bar's track or a pill's ground. */
function wash(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/** Everything bound for HTML goes through here. A note is free text. */
function esc(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string
  );
}

/** The report is addressed to a person; a guest export is still theirs. */
function addressee(user: ExportContext['user']) {
  const email = user?.email?.trim() ?? '';
  let name = user?.displayName?.trim() ?? '';
  if (!name && email) {
    name = email
      .split('@')[0]
      .replace(/[._-]+/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
  if (!name) name = 'Spendly User';
  const initials = name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  return { name, email, initials };
}

export async function exportToPdf(ctx: ExportContext): Promise<void> {
  const { transactions, categories, accounts, rangeLabel } = ctx;
  const who = addressee(ctx.user);
  const { income, expense, net } = summarize(transactions);

  const rows = [...transactions].sort((a, b) => b.date.localeCompare(a.date));
  const counted = (type: Transaction['type']) => rows.filter((t) => t.type === type).length;
  const nIn = counted('income');
  const nOut = counted('expense');
  const moved = rows.filter((t) => t.type === 'transfer' || t.type === 'investment');
  const movedTotal = moved.reduce((sum, t) => sum + t.amount, 0);

  const dates = rows.map((t) => parseISO(t.date)).sort((a, b) => a.getTime() - b.getTime());
  const span = dates.length
    ? `${format(dates[0], 'd MMM yyyy')} – ${format(dates[dates.length - 1], 'd MMM yyyy')}`
    : '—';
  const days = dates.length
    ? Math.max(1, Math.round((dates[dates.length - 1].getTime() - dates[0].getTime()) / 86400000) + 1)
    : 1;

  const spentByCategory = new Map<string, number>();
  for (const t of rows) {
    if (t.type !== 'expense' || !t.categoryId) continue;
    spentByCategory.set(t.categoryId, (spentByCategory.get(t.categoryId) ?? 0) + t.amount);
  }
  const ranked = Array.from(spentByCategory.entries()).sort((a, b) => b[1] - a[1]);
  const biggest = ranked[0];

  // Colour is assigned by rank, so the largest category is the same colour in
  // the bar, the key and the table.
  const inkFor = new Map<string, string>();
  ranked.forEach(([id], i) => inkFor.set(id, CATEGORY_INK[i % CATEGORY_INK.length]));
  const nameOf = (id: string | null) =>
    categories.find((c) => c.id === id)?.name ?? 'Uncategorised';

  const share = ranked
    .map(([id, amount]) => {
      const pct = expense > 0 ? (amount / expense) * 100 : 0;
      return `<i style="width:${pct.toFixed(2)}%;background:${inkFor.get(id)}"></i>`;
    })
    .join('');

  const key = ranked
    .map(([id, amount]) => {
      const pct = expense > 0 ? (amount / expense) * 100 : 0;
      return `<span class="k"><i style="background:${inkFor.get(id)}"></i>${esc(nameOf(id))} <b>${pct.toFixed(1)}%</b></span>`;
    })
    .join('');

  const categoryRows = ranked
    .map(([id, amount], i) => {
      const ink = inkFor.get(id) as string;
      const pct = expense > 0 ? (amount / expense) * 100 : 0;
      const relative = biggest && biggest[1] > 0 ? (amount / biggest[1]) * 100 : 0;
      return `<tr>
        <td class="rank">${i + 1}</td>
        <td class="cat"><span class="dot" style="background:${ink}"></span>${esc(nameOf(id))}</td>
        <td class="barcell"><span class="bar" style="background:${wash(ink, 0.14)}"><i style="width:${relative.toFixed(1)}%;background:${ink}"></i></span></td>
        <td class="pct">${pct.toFixed(1)}%</td>
        <td class="amt" style="color:${ink}">${formatCurrency(amount)}</td>
      </tr>`;
    })
    .join('');

  const txnRows = rows
    .slice(0, 500)
    .map((t) => {
      const account = accounts.find((a) => a.id === t.accountId);
      const toAccount = accounts.find((a) => a.id === t.toAccountId);
      const ink =
        t.type === 'income'
          ? INCOME_INK
          : t.type === 'transfer' || t.type === 'investment'
            ? TRANSFER_INK
            : inkFor.get(t.categoryId ?? '') ?? '#64748B';
      const sign = t.type === 'income' ? '+' : t.type === 'expense' ? '−' : '';
      const cls = t.type === 'income' ? 'in' : t.type === 'expense' ? 'out' : 'mid';
      const label =
        t.categoryId
          ? nameOf(t.categoryId)
          : t.type === 'transfer'
            ? 'Transfer'
            : 'Uncategorised';
      const where = toAccount
        ? `${account?.name ?? '—'} → ${toAccount.name}`
        : account?.name ?? '—';
      return `<tr>
        <td class="nowrap"><span class="tick" style="background:${ink}"></span>${format(parseISO(t.date), 'd MMM yyyy')}</td>
        <td><span class="pill" style="background:${wash(ink, 0.13)};color:${ink}">${esc(label)}</span></td>
        <td class="muted">${esc(where)}</td>
        <td>${esc(t.note) || '<span class="muted">—</span>'}</td>
        <td class="amt ${cls}">${sign}${formatCurrency(t.amount)}</td>
      </tr>`;
    })
    .join('');

  const truncated =
    rows.length > 500
      ? `<p class="note">Showing the 500 most recent of ${rows.length} entries. Export to Excel for the complete set.</p>`
      : '';

  const movedNote = moved.length
    ? `<p class="note"><b>On transfers and investments.</b> ${moved.length} ${moved.length === 1 ? 'entry' : 'entries'}
       totalling ${formatCurrency(movedTotal)} appear in the table but stay out of the income and expense
       totals: money moved between your own accounts is neither earned nor spent.</p>`
    : '';

  const html = `<!doctype html>
<html lang="en-IN"><head><meta charset="utf-8" />
<title>Spendly Report — ${esc(who.name)}</title>
<style>
  @page { size: A4; margin: 12mm 12mm 13mm; }
  :root {
    --navy:#12224A; --ink:#1F2937; --muted:#6B7280; --line:#E5E9F0;
    --blue:#1877F2; --cyan:#2FC1FF; --green:#0F9D58; --red:#DC2626;
    --violet:#7C5CFC; --soft:#F6F8FC;
  }
  * { box-sizing:border-box; }
  body {
    margin:0; font-family:-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
    color:var(--ink); font-size:9.6pt; line-height:1.45;
    -webkit-print-color-adjust:exact; print-color-adjust:exact;
  }
  .masthead {
    background:linear-gradient(115deg,#0B1A3A 0%,#12224A 28%,#1656C9 72%,#2FC1FF 130%);
    color:#fff; padding:17px 20px 16px; border-radius:14px; display:flex;
    align-items:center; justify-content:space-between; gap:18px;
    position:relative; overflow:hidden;
  }
  .masthead::after {
    content:""; position:absolute; right:-30px; top:-66px; width:230px; height:230px;
    border-radius:50%; background:rgba(255,255,255,.07);
  }
  .brand { display:flex; align-items:center; gap:11px; position:relative; z-index:1; }
  /* The lockup carries the wordmark itself, so it needs width rather than a
     square badge; the plate is white because that is what it was drawn on. */
  .brand { flex-direction:column; align-items:flex-start; gap:7px; }
  .plate {
    background:#fff; border-radius:13px; padding:9px 16px; display:block;
    box-shadow:0 3px 10px rgba(0,0,0,.22);
  }
  .plate img { height:66px; width:auto; display:block; }
  .tagline { font-size:7.2pt; letter-spacing:.17em; text-transform:uppercase;
             color:rgba(255,255,255,.78); font-weight:600; }
  .title { text-align:right; position:relative; z-index:1; }
  .eyebrow { display:inline-block; font-size:7pt; letter-spacing:.17em; text-transform:uppercase;
             font-weight:700; background:rgba(255,255,255,.18); padding:2.5px 9px; border-radius:20px; }
  .title h1 { margin:5px 0 0; font-size:18pt; font-weight:800; letter-spacing:-.015em; }
  .title .sub { font-size:8.4pt; color:rgba(255,255,255,.78); margin-top:2px; }

  .holder { display:flex; align-items:center; gap:11px; background:var(--soft);
            border:1px solid var(--line); border-radius:11px; padding:9px 13px; margin-top:12px; }
  .avatar { width:36px; height:36px; border-radius:50%; flex:0 0 36px;
            background:linear-gradient(135deg,var(--blue),var(--cyan)); color:#fff;
            font-weight:800; font-size:12pt; display:flex; align-items:center; justify-content:center; }
  .who .label { font-size:6.8pt; letter-spacing:.15em; text-transform:uppercase;
                color:var(--blue); font-weight:700; }
  .who .name { font-size:12pt; font-weight:750; color:var(--navy); line-height:1.2; }
  .who .mail { font-size:8.2pt; color:var(--muted); }
  .meta { margin-left:auto; display:flex; gap:20px; text-align:right; }
  .meta span { display:block; font-size:6.8pt; letter-spacing:.13em; text-transform:uppercase;
               color:var(--muted); font-weight:700; }
  .meta b { font-size:8.8pt; font-weight:650; color:var(--navy); white-space:nowrap; }

  .cards { display:flex; gap:10px; margin-top:11px; }
  .card { flex:1; border-radius:12px; padding:12px 14px 13px; color:#fff;
          position:relative; overflow:hidden; }
  .card.inc { background:linear-gradient(135deg,#0F9D58,#39C77F); }
  .card.exp { background:linear-gradient(135deg,#C81E1E,#F2554F); }
  .card.net { background:linear-gradient(135deg,#12224A,#1877F2); }
  .card::after { content:""; position:absolute; right:-26px; bottom:-40px; width:110px;
                 height:110px; border-radius:50%; background:rgba(255,255,255,.10); }
  .card .k { font-size:7pt; letter-spacing:.15em; text-transform:uppercase;
             color:rgba(255,255,255,.85); font-weight:700; }
  .card .v { font-size:17pt; font-weight:800; letter-spacing:-.025em; margin-top:2px;
             line-height:1.15; position:relative; z-index:1; }
  .card .s { font-size:7.6pt; color:rgba(255,255,255,.82); margin-top:2px;
             position:relative; z-index:1; }

  .facts { display:flex; gap:10px; margin-top:10px; }
  .fact { flex:1; border:1px solid var(--line); border-left:3px solid var(--blue);
          border-radius:9px; padding:7px 11px; }
  .fact.b { border-left-color:#F5A524; }
  .fact.c { border-left-color:var(--violet); }
  .fact span { display:block; font-size:6.8pt; letter-spacing:.13em; text-transform:uppercase;
               color:var(--muted); font-weight:700; }
  .fact b { font-size:10pt; font-weight:750; color:var(--navy); }

  .split { display:flex; height:11px; border-radius:6px; overflow:hidden; margin-top:12px; }
  .split i { display:block; height:100%; }
  .keys { margin-top:7px; font-size:7.8pt; color:var(--muted); }
  .k { display:inline-block; margin:0 13px 3px 0; white-space:nowrap; }
  .k i { display:inline-block; width:8px; height:8px; border-radius:2.5px; margin-right:4px; }
  .k b { color:var(--navy); font-weight:700; margin-left:2px; }

  h2 { font-size:11pt; font-weight:800; color:var(--navy); margin:19px 0 8px;
       padding:0 0 6px 11px; border-bottom:2px solid var(--line); position:relative; }
  h2::before { content:""; position:absolute; left:0; top:1px; bottom:8px; width:4px;
               border-radius:3px; background:linear-gradient(180deg,var(--blue),var(--cyan)); }
  h2 small { float:right; font-size:8pt; font-weight:600; color:var(--muted); }

  table { width:100%; border-collapse:collapse; }
  thead { display:table-header-group; }
  th { font-size:7pt; letter-spacing:.14em; text-transform:uppercase; color:var(--navy);
       font-weight:700; text-align:left; padding:6px 8px; background:#EAF1FC;
       border-bottom:1.5px solid #D6E3F7; }
  td { padding:6px 8px; border-bottom:1px solid #F0F2F7; vertical-align:middle; }
  tr { break-inside:avoid; page-break-inside:avoid; }
  tbody tr:nth-child(even) { background:#FAFBFD; }
  .amt { text-align:right; font-variant-numeric:tabular-nums; font-weight:700; white-space:nowrap; }
  th.amt, .pct { text-align:right; }
  .pct { font-size:8.4pt; color:var(--muted); font-variant-numeric:tabular-nums; }
  .muted { color:var(--muted); }
  .nowrap { white-space:nowrap; font-variant-numeric:tabular-nums; }
  .rank { width:18px; color:var(--muted); font-size:8pt; font-weight:700; text-align:center; }
  .cat { font-weight:600; white-space:nowrap; }
  .dot { display:inline-block; width:9px; height:9px; border-radius:3px; margin-right:7px; }
  .tick { display:inline-block; width:3px; height:12px; border-radius:2px; margin-right:8px;
          vertical-align:-2px; }
  .barcell { width:40%; }
  .bar { display:block; height:8px; border-radius:5px; overflow:hidden; }
  .bar i { display:block; height:100%; border-radius:5px; }
  .amt.in { color:var(--green); }
  .amt.out { color:var(--red); }
  .amt.mid { color:var(--violet); }
  .pill { display:inline-block; padding:1.5px 9px; border-radius:20px; font-size:8pt;
          font-weight:650; white-space:nowrap; }
  tfoot td { background:var(--navy); color:#fff; font-weight:800; font-size:10pt;
             padding:8px; border:none; }
  .note { font-size:8.2pt; color:#4A5568; background:#F4F7FD; border:1px solid #DCE6F6;
          border-left:3px solid var(--violet); border-radius:8px; padding:9px 12px; margin:11px 0 0; }
  .note b { color:var(--navy); }
  .footer { margin-top:16px; padding-top:7px; break-inside:avoid; display:flex;
            align-items:center; justify-content:space-between; gap:12px;
            border-top:2px solid var(--blue); font-size:7.4pt; color:var(--muted); }
  .footer b { color:var(--navy); font-weight:700; }
  .stripe { display:flex; height:5px; margin-top:9px; border-radius:3px; overflow:hidden; }
  .stripe i { flex:1; }
</style></head>
<body>
  <div class="masthead">
    <div class="brand">
      <span class="plate"><img src="${REPORT_LOGO}" alt="Spendly" /></span>
      <span class="tagline">Your Money, Simplified</span>
    </div>
    <div class="title">
      <div class="eyebrow">Expense Report</div>
      <h1>${esc(rangeLabel)}</h1>
      <div class="sub">${esc(span)}</div>
    </div>
  </div>

  <div class="holder">
    <div class="avatar">${esc(who.initials)}</div>
    <div class="who">
      <div class="label">Account holder</div>
      <div class="name">${esc(who.name)}</div>
      ${who.email ? `<div class="mail">${esc(who.email)}</div>` : ''}
    </div>
    <div class="meta">
      <div><span>Entries</span><b>${rows.length}</b></div>
      <div><span>Period</span><b>${esc(span)}</b></div>
      <div><span>Generated</span><b>${esc(format(new Date(), 'd MMM yyyy, h:mm a'))}</b></div>
    </div>
  </div>

  <div class="cards">
    <div class="card inc">
      <div class="k">Total income</div>
      <div class="v">${formatCurrency(income)}</div>
      <div class="s">${nIn} credit ${nIn === 1 ? 'entry' : 'entries'}</div>
    </div>
    <div class="card exp">
      <div class="k">Total expenses</div>
      <div class="v">${formatCurrency(expense)}</div>
      <div class="s">${nOut} debit ${nOut === 1 ? 'entry' : 'entries'} · ${ranked.length} ${ranked.length === 1 ? 'category' : 'categories'}</div>
    </div>
    <div class="card net">
      <div class="k">Net balance</div>
      <div class="v">${net < 0 ? '−' : ''}${formatCurrency(Math.abs(net))}</div>
      <div class="s">Income − expenses${income > 0 ? ` · ${((net / income) * 100).toFixed(1)}% of income kept` : ''}</div>
    </div>
  </div>

  <div class="facts">
    <div class="fact"><span>Average spend / day</span><b>${formatCurrency(expense / days)}</b></div>
    <div class="fact b"><span>Largest category</span><b>${biggest ? `${esc(nameOf(biggest[0]))} · ${formatCurrency(biggest[1])}` : '—'}</b></div>
    <div class="fact c"><span>Transfers &amp; investments</span><b>${formatCurrency(movedTotal)}</b></div>
  </div>

  ${ranked.length ? `<div class="split">${share}</div><div class="keys">${key}</div>` : ''}

  <h2>Spending by category <small>${ranked.length} ${ranked.length === 1 ? 'category' : 'categories'} · share of total expenses</small></h2>
  <table>
    <thead><tr><th class="rank">#</th><th>Category</th><th>Share</th><th class="pct">%</th><th class="amt">Amount</th></tr></thead>
    <tbody>${categoryRows || '<tr><td colspan="5" class="muted">No expenses in this period.</td></tr>'}</tbody>
    <tfoot><tr><td colspan="4">Total expenses</td><td class="amt">${formatCurrency(expense)}</td></tr></tfoot>
  </table>

  <h2>Transactions <small>${rows.length} ${rows.length === 1 ? 'entry' : 'entries'} · newest first</small></h2>
  <table>
    <thead><tr><th>Date</th><th>Category</th><th>Account</th><th>Note</th><th class="amt">Amount</th></tr></thead>
    <tbody>${txnRows || '<tr><td colspan="5" class="muted">No transactions in this period.</td></tr>'}</tbody>
  </table>

  ${truncated}
  ${movedNote}

  <div class="footer">
    <div>Generated by <b>Spendly</b> · Personal expense report</div>
    <div>${esc(who.name)}${who.email ? ` · ${esc(who.email)}` : ''}</div>
    <div>Private &amp; confidential</div>
  </div>
  <div class="stripe">
    <i style="background:#12224A"></i><i style="background:#1877F2"></i>
    <i style="background:#2FC1FF"></i><i style="background:#00B3A4"></i>
    <i style="background:#F5A524"></i><i style="background:#E5484D"></i>
  </div>
</body></html>`;

  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Export PDF Report' });
  }
}
