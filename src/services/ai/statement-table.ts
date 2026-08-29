'use client';

/**
 * Turns a spreadsheet or CSV bank export into the plain-text table the
 * text-completion route expects. `xlsx` is loaded lazily — most sessions never
 * touch this path, so it should not sit in the main bundle.
 */

const EXCEL_EXTENSIONS = /\.(xlsx|xls|xlsm)$/i;
const EXCEL_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/vnd.ms-excel.sheet.macroEnabled.12',
]);

export function isSpreadsheetFile(file: File): boolean {
  return EXCEL_EXTENSIONS.test(file.name) || EXCEL_MIME_TYPES.has(file.type);
}

export function isCsvFile(file: File): boolean {
  return /\.csv$/i.test(file.name) || file.type === 'text/csv';
}

/** Reads every non-empty sheet into a `;`-separated table, capped so a huge
 *  workbook does not blow past what is worth sending to the model in one go. */
export async function readSpreadsheetAsTable(file: File): Promise<string> {
  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });

  const lines: string[] = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false });
    if (rows.length === 0) continue;

    if (workbook.SheetNames.length > 1) lines.push(`# ${sheetName}`);
    for (const row of rows) {
      lines.push(row.map((cell) => (cell === undefined || cell === null ? '' : String(cell))).join(';'));
      if (lines.length > 4000) break;
    }
    if (lines.length > 4000) break;
  }

  return lines.join('\n');
}

export async function readCsvAsTable(file: File): Promise<string> {
  const text = await file.text();
  return text.split(/\r?\n/).slice(0, 4000).join('\n');
}
