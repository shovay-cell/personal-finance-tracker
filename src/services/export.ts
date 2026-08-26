'use client';

import {
  BudgetProgress,
  CategoryBreakdownRow,
  CurrencyCode,
  FinanceAccount,
  FinanceCategory,
  ObligationWithBalance,
  ProfileMember,
  Transaction,
} from '@/types';
import { formatMoney, DateRange } from './analytics';
import { payeeKindLabel } from '@/constants/categories';

function downloadBlob(content: BlobPart, fileName: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvCell(value: unknown): string {
  const str = value === undefined || value === null ? '' : String(value);
  return `"${str.replace(/"/g, '""')}"`;
}

/** Excel on Windows only detects UTF-8 in a CSV when it starts with a BOM. */
function toCsv(rows: (string | number | undefined)[][]): string {
  return '﻿' + rows.map((row) => row.map(csvCell).join(';')).join('\r\n');
}

export function exportTransactionsCsv(
  transactions: Transaction[],
  categories: FinanceCategory[],
  accounts: FinanceAccount[],
  members: ProfileMember[],
  range: DateRange
): void {
  const categoryName = (id?: string) => categories.find((c) => c.id === id)?.name || '';
  const accountName = (id: string) => accounts.find((a) => a.id === id)?.name || '';
  const memberName = (id: string) => members.find((m) => m.id === id)?.displayName || '';

  const rows: (string | number | undefined)[][] = [
    [
      'Дата',
      'Тип',
      'Сумма',
      'Валюта',
      'Сумма в базовой валюте',
      'Курс',
      'Категория',
      'Подкатегория',
      'Счёт',
      'Продавец',
      'Заметка',
      'Автор',
      'Источник',
    ],
    ...transactions
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((t) => [
        t.date,
        t.kind === 'EXPENSE' ? 'Расход' : 'Доход',
        t.amount,
        t.currency,
        t.baseAmount,
        t.exchangeRate,
        categoryName(t.categoryId),
        categoryName(t.subcategoryId),
        accountName(t.accountId),
        t.merchant || '',
        t.note || '',
        memberName(t.authorId),
        t.source,
      ]),
  ];

  downloadBlob(
    toCsv(rows),
    `FinTrack_operations_${range.from}_${range.to}.csv`,
    'text/csv;charset=utf-8;'
  );
}

export function exportObligationsCsv(rows: ObligationWithBalance[]): void {
  const csvRows: (string | number | undefined)[][] = [
    [
      'Дата выдачи',
      'Плановая дата закрытия',
      'Кому/на что выписано',
      'Уточнение',
      'Сумма',
      'Валюта',
      'Погашено',
      'Остаток',
      'Статус',
    ],
    ...rows.map((r) => [
      r.obligation.issueDate,
      r.obligation.dueDate || '',
      payeeKindLabel(r.obligation.payeeKind),
      r.obligation.payeeLabel,
      r.obligation.amount,
      r.obligation.currency,
      r.settledAmount,
      r.outstandingAmount,
      OBLIGATION_STATUS_LABELS[r.status],
    ]),
  ];

  downloadBlob(
    toCsv(csvRows),
    `FinTrack_obligations_${new Date().toISOString().slice(0, 10)}.csv`,
    'text/csv;charset=utf-8;'
  );
}

export const OBLIGATION_STATUS_LABELS: Record<string, string> = {
  ISSUED: 'Выдан',
  PARTIALLY_SETTLED: 'Частично закрыт',
  SETTLED: 'Закрыт',
  OVERDUE: 'Просрочен',
};

interface PdfReportInput {
  title: string;
  period: string;
  baseCurrency: CurrencyCode;
  totalExpense: number;
  totalIncome: number;
  expenseBreakdown: CategoryBreakdownRow[];
  incomeBreakdown: CategoryBreakdownRow[];
  budgets: BudgetProgress[];
  obligations: ObligationWithBalance[];
}

/**
 * PDF export goes through the browser's own print-to-PDF dialog: it keeps the
 * bundle free of a PDF library and renders Cyrillic/Hebrew with the system fonts
 * that already handle them correctly.
 */
export function exportReportPdf(input: PdfReportInput): void {
  const {
    title,
    period,
    baseCurrency,
    totalExpense,
    totalIncome,
    expenseBreakdown,
    incomeBreakdown,
    budgets,
    obligations,
  } = input;

  const money = (v: number) => formatMoney(v, baseCurrency);

  const breakdownTable = (rows: CategoryBreakdownRow[]) =>
    rows.length === 0
      ? '<p class="muted">Нет операций за период</p>'
      : `<table>
          <thead><tr><th>Категория</th><th>Операций</th><th>Доля</th><th class="num">Сумма</th></tr></thead>
          <tbody>
            ${rows
              .map(
                (r) => `<tr>
                  <td><span class="dot" style="background:${r.colorHex}"></span>${escapeHtml(r.categoryName)}</td>
                  <td>${r.transactionCount}</td>
                  <td>${(r.share * 100).toFixed(1)}%</td>
                  <td class="num">${money(r.total)}</td>
                </tr>`
              )
              .join('')}
          </tbody>
        </table>`;

  const budgetTable =
    budgets.length === 0
      ? '<p class="muted">Лимиты не заданы</p>'
      : `<table>
          <thead><tr><th>Бюджет</th><th class="num">План</th><th class="num">Факт</th><th class="num">Остаток</th><th>Исполнение</th></tr></thead>
          <tbody>
            ${budgets
              .map(
                (b) => `<tr>
                  <td>${escapeHtml(b.categoryName)}</td>
                  <td class="num">${money(b.effectiveLimit)}</td>
                  <td class="num">${money(b.spent)}</td>
                  <td class="num">${money(b.remaining)}</td>
                  <td>${b.percent.toFixed(0)}%</td>
                </tr>`
              )
              .join('')}
          </tbody>
        </table>`;

  const obligationsTable =
    obligations.length === 0
      ? '<p class="muted">Открытых обязательств нет</p>'
      : `<table>
          <thead><tr><th>Выдан</th><th>Кому/на что</th><th class="num">Сумма</th><th class="num">Погашено</th><th class="num">Остаток</th><th>Статус</th></tr></thead>
          <tbody>
            ${obligations
              .map(
                (o) => `<tr>
                  <td>${o.obligation.issueDate}</td>
                  <td>${escapeHtml(payeeKindLabel(o.obligation.payeeKind))}${
                    o.obligation.payeeLabel ? ` — ${escapeHtml(o.obligation.payeeLabel)}` : ''
                  }</td>
                  <td class="num">${formatMoney(o.obligation.amount, o.obligation.currency)}</td>
                  <td class="num">${formatMoney(o.settledAmount, o.obligation.currency)}</td>
                  <td class="num">${formatMoney(o.outstandingAmount, o.obligation.currency)}</td>
                  <td>${OBLIGATION_STATUS_LABELS[o.status]}</td>
                </tr>`
              )
              .join('')}
          </tbody>
        </table>`;

  const html = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; color:#0F172A; margin:32px; }
  h1 { font-size:22px; margin:0 0 4px; }
  h2 { font-size:15px; margin:28px 0 8px; border-bottom:2px solid #0EA5E9; padding-bottom:4px; }
  .period { color:#64748B; font-size:12px; margin-bottom:20px; }
  .cards { display:flex; gap:12px; margin-bottom:8px; }
  .card { flex:1; border:1px solid #E2E8F0; border-radius:12px; padding:12px 14px; }
  .card .label { font-size:11px; color:#64748B; text-transform:uppercase; letter-spacing:.04em; }
  .card .value { font-size:20px; font-weight:700; margin-top:4px; }
  .expense { color:#E11D48; } .income { color:#059669; }
  table { width:100%; border-collapse:collapse; font-size:12px; }
  th, td { text-align:left; padding:7px 8px; border-bottom:1px solid #E2E8F0; }
  th { background:#F8FAFC; font-size:11px; text-transform:uppercase; letter-spacing:.03em; color:#475569; }
  td.num, th.num { text-align:right; font-variant-numeric: tabular-nums; }
  .dot { display:inline-block; width:9px; height:9px; border-radius:50%; margin-right:7px; }
  .muted { color:#94A3B8; font-size:12px; }
  footer { margin-top:32px; font-size:10px; color:#94A3B8; }
  @media print { body { margin:12mm; } h2 { break-after: avoid; } table { break-inside: auto; } tr { break-inside: avoid; } }
</style></head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <div class="period">Период: ${escapeHtml(period)} · Базовая валюта: ${baseCurrency}</div>

  <div class="cards">
    <div class="card"><div class="label">Расходы</div><div class="value expense">${money(totalExpense)}</div></div>
    <div class="card"><div class="label">Доходы</div><div class="value income">${money(totalIncome)}</div></div>
    <div class="card"><div class="label">Баланс периода</div><div class="value">${money(totalIncome - totalExpense)}</div></div>
  </div>

  <h2>Расходы по категориям</h2>
  ${breakdownTable(expenseBreakdown)}

  <h2>Доходы по категориям</h2>
  ${breakdownTable(incomeBreakdown)}

  <h2>План / факт по бюджетам</h2>
  ${budgetTable}

  <h2>Открытые обязательства (чеки на предъявителя)</h2>
  ${obligationsTable}

  <footer>Сформировано FinTrack · ${new Date().toLocaleString('ru-RU')}</footer>
  <script>window.onload = function () { window.print(); };</script>
</body></html>`;

  const printWindow = window.open('', '_blank', 'width=900,height=1000');
  if (!printWindow) {
    // Pop-up blocked — fall back to an .html download the user can print manually.
    downloadBlob(html, `FinTrack_report_${new Date().toISOString().slice(0, 10)}.html`, 'text/html');
    return;
  }
  printWindow.document.write(html);
  printWindow.document.close();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function downloadFinanceBackupFile(json: string): void {
  downloadBlob(
    json,
    `FinTrack_Backup_${new Date().toISOString().replace(/[:.]/g, '-')}.fintrack`,
    'application/json'
  );
}
