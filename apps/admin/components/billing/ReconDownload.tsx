'use client';

import { Download } from 'lucide-react';

/** A text cell that starts with =, +, - or @ would run as a formula in a spreadsheet; numbers are written as numbers. */
function cell(v: string | number): string {
  if (typeof v === 'number') return v.toFixed(2);
  const safe = /^[=+\-@]/.test(v) ? `'${v}` : v;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Downloads rows as a CSV file. `small` is the compact button used inside table rows. */
export default function ReconDownload({ fileName, head, lines, label = 'Download CSV', small, describe }: {
  fileName: string; head: readonly string[]; lines: (string | number)[][]; label?: string; small?: boolean;
  /** Full name for screen readers when the visible label is short, e.g. "Download May 2026 transactions". */
  describe?: string;
}) {
  const download = () => {
    const url = URL.createObjectURL(new Blob([[[...head], ...lines].map((l) => l.map(cell).join(',')).join('\n')], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileName}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <button type="button" onClick={download} disabled={lines.length === 0} aria-label={describe} title={lines.length === 0 ? 'Nothing to download' : describe}
      className={`inline-flex items-center gap-1.5 rounded-lg font-medium bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed ${small ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm'}`}>
      <Download className={small ? 'w-3.5 h-3.5' : 'w-4 h-4'} aria-hidden /> {label}
    </button>
  );
}
