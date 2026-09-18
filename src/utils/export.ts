import * as XLSX from 'xlsx';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import { format, parseISO } from 'date-fns';
import { Account, Category, Transaction } from '../types';
import { formatCurrency, summarize } from './finance';

interface ExportContext {
  transactions: Transaction[];
  categories: Category[];
  accounts: Account[];
  rangeLabel: string;
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

export async function exportToPdf(ctx: ExportContext): Promise<void> {
  const { transactions, categories, accounts, rangeLabel } = ctx;
  const { income, expense, net } = summarize(transactions);

  const categoryTotals = new Map<string, number>();
  for (const t of transactions) {
    if (t.type !== 'expense' || !t.categoryId) continue;
    categoryTotals.set(t.categoryId, (categoryTotals.get(t.categoryId) ?? 0) + t.amount);
  }
  const categoryRows = Array.from(categoryTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([id, amount]) => {
      const cat = categories.find((c) => c.id === id);
      return `<tr><td>${cat?.name ?? 'Uncategorized'}</td><td style="text-align:right">${formatCurrency(amount)}</td></tr>`;
    })
    .join('');

  const txnRows = transactions
    .slice(0, 500)
    .map((t) => {
      const cat = categories.find((c) => c.id === t.categoryId);
      const account = accounts.find((a) => a.id === t.accountId);
      const color = t.type === 'income' ? '#10B981' : t.type === 'expense' ? '#F43F5E' : '#6366F1';
      const sign = t.type === 'income' ? '+' : t.type === 'expense' ? '-' : '';
      return `<tr>
        <td>${format(parseISO(t.date), 'MMM d, yyyy')}</td>
        <td>${cat?.name ?? (t.type === 'transfer' ? 'Transfer' : '')}</td>
        <td>${account?.name ?? ''}</td>
        <td>${(t.note || '').replace(/</g, '&lt;')}</td>
        <td style="text-align:right; color:${color}; font-weight:600">${sign}${formatCurrency(t.amount)}</td>
      </tr>`;
    })
    .join('');

  const html = `
  <html>
  <head>
    <meta charset="utf-8" />
    <style>
      body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #0F172A; padding: 24px; }
      h1 { font-size: 22px; margin-bottom: 4px; }
      .subtitle { color: #64748B; font-size: 12px; margin-bottom: 20px; }
      .summary { display: flex; gap: 16px; margin-bottom: 24px; }
      .chip { flex: 1; background: #F1F5F9; border-radius: 12px; padding: 12px; }
      .chip .label { font-size: 11px; color: #64748B; font-weight: 600; text-transform: uppercase; }
      .chip .value { font-size: 18px; font-weight: 800; margin-top: 4px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
      th { text-align: left; font-size: 11px; text-transform: uppercase; color: #64748B; border-bottom: 1px solid #E2E8F0; padding: 6px 4px; }
      td { font-size: 12px; padding: 6px 4px; border-bottom: 1px solid #F1F5F9; }
      h2 { font-size: 15px; margin-top: 8px; }
    </style>
  </head>
  <body>
    <h1>Expense Report</h1>
    <div class="subtitle">${rangeLabel} · Generated ${format(new Date(), 'MMM d, yyyy')}</div>
    <div class="summary">
      <div class="chip"><div class="label">Income</div><div class="value" style="color:#10B981">${formatCurrency(income)}</div></div>
      <div class="chip"><div class="label">Expenses</div><div class="value" style="color:#F43F5E">${formatCurrency(expense)}</div></div>
      <div class="chip"><div class="label">Net</div><div class="value">${formatCurrency(net)}</div></div>
    </div>
    <h2>Spending by Category</h2>
    <table>
      <tr><th>Category</th><th style="text-align:right">Amount</th></tr>
      ${categoryRows || '<tr><td colspan="2">No expense data</td></tr>'}
    </table>
    <h2>Transactions</h2>
    <table>
      <tr><th>Date</th><th>Category</th><th>Account</th><th>Note</th><th style="text-align:right">Amount</th></tr>
      ${txnRows || '<tr><td colspan="5">No transactions</td></tr>'}
    </table>
  </body>
  </html>`;

  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Export PDF Report' });
  }
}
