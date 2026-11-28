/**
 * One CSV cell, safe to open in Excel or Sheets. Client-safe.
 *
 * Names, companies and other text typed by the public end up in exports. A value starting with =, +, - or @ (or a tab
 * or carriage return) would run as a formula when an admin opens the file, so it is prefixed with an apostrophe,
 * which spreadsheets show as plain text. Quotes are doubled and the cell is always quoted.
 */
export function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** A whole CSV from a header row and data rows. */
export function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers.map(csvCell).join(','), ...rows.map((r) => r.map(csvCell).join(','))].join('\n');
}
