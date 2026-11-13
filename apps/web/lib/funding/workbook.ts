import ExcelJS from 'exceljs';
import { datasetUsdInrToday, stageLabel, type DataRound, type SelectedStartup } from '@/lib/funding/dataset';
import { PACKS, PERIOD_LABELS, periodRange, type FundingFilters, type PackKey } from '@/lib/funding/packs';

/**
 * The paid Excel file. Amounts are real numbers (sortable, summable) with currency formats; every table has a
 * styled header, filters and a frozen top row. Full Dataset adds contact and source columns. The buyer's email
 * and order id are in the file properties and every page footer (licensed copy).
 */

const BRAND = 'FFA50F15';
// Indian digit grouping (1,23,45,678) for rupees; plain thousands for dollars.
const INR_FMT = '[>=10000000]"₹"##\\,##\\,##\\,##0;[>=100000]"₹"##\\,##\\,##0;"₹"#,##0';
const USD_FMT = '"$"#,##0';

interface Col { header: string; width: number; fmt?: 'money' | 'date' | 'int'; link?: boolean }

function table(ws: ExcelJS.Worksheet, cols: Col[], rows: (string | number | Date | null)[][], currency: 'INR' | 'USD', footer: string) {
  ws.columns = cols.map((c) => ({ header: c.header, width: c.width }));
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
  head.alignment = { vertical: 'middle', wrapText: true };
  head.height = 22;
  for (const r of rows) {
    const row = ws.addRow(r);
    cols.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      if (c.fmt === 'money') cell.numFmt = currency === 'INR' ? INR_FMT : USD_FMT;
      else if (c.fmt === 'date') cell.numFmt = 'dd mmm yyyy';
      else if (c.fmt === 'int') cell.numFmt = '#,##0';
      if (c.link && typeof cell.value === 'string' && /^https?:\/\//.test(cell.value)) {
        cell.value = { text: cell.value, hyperlink: cell.value };
        cell.font = { color: { argb: 'FF1D4ED8' }, underline: true };
      }
    });
  }
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  if (rows.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
  ws.headerFooter.oddFooter = `&L${footer.replace(/&/g, '&&')}&RPage &P of &N`;
}

function group(startups: SelectedStartup[], key: (s: SelectedStartup) => string | null, money: (r: DataRound) => number) {
  const m = new Map<string, { rounds: number; startups: Set<string>; amount: number }>();
  for (const s of startups) {
    const k = key(s) ?? 'Not specified';
    const g = m.get(k) ?? { rounds: 0, startups: new Set<string>(), amount: 0 };
    g.startups.add(s.id);
    for (const r of s.periodRounds) { g.rounds++; g.amount += money(r); }
    m.set(k, g);
  }
  return [...m.entries()].sort((a, b) => b[1].amount - a[1].amount || b[1].startups.size - a[1].startups.size);
}

export async function buildFundingWorkbook(opts: {
  startups: SelectedStartup[]; matched: number; filters: FundingFilters; pack: PackKey; email: string; orderId: string; now?: Date;
}): Promise<Buffer> {
  const { startups, filters: f, pack } = opts;
  const full = pack === 'FULL';
  const now = opts.now ?? new Date();
  const cur = f.currency;
  const money = (r: DataRound) => (cur === 'INR' ? r.inr : r.usd);
  const amount = (r: DataRound) => (r.disclosed ? money(r) : null);
  const curLabel = cur === 'INR' ? '(₹)' : '($)';
  const stamp = now.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
  const footer = `Udyaibase funding data · licensed to ${opts.email} · order ${opts.orderId} · ${stamp}`;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Udyaibase';
  wb.company = 'Udyaibase';
  wb.title = 'AI Startups Funding Data';
  wb.subject = `Licensed to ${opts.email}`;
  wb.keywords = `order:${opts.orderId}`;
  wb.description = footer;
  wb.created = now;

  // Startups
  const sCols: Col[] = [
    { header: '#', width: 5, fmt: 'int' }, { header: 'Startup', width: 28 }, { header: 'Sector', width: 22 }, { header: 'City', width: 16 },
    { header: 'Stage', width: 14 }, { header: 'Founded', width: 9 }, { header: `Raised ${curLabel}`, width: 16, fmt: 'money' },
    { header: 'Rounds', width: 8, fmt: 'int' }, { header: 'Last round', width: 13, fmt: 'date' }, { header: 'Last round type', width: 16 },
    { header: `Last round amount ${curLabel}`, width: 18, fmt: 'money' }, { header: 'Latest lead investors', width: 34 },
    { header: 'Udyaibase profile', width: 40, link: true },
    ...(full ? [{ header: 'Website', width: 32, link: true }, { header: 'LinkedIn', width: 40, link: true }, { header: 'Founders', width: 34 }, { header: 'Employees', width: 11, fmt: 'int' as const }, { header: 'All investors', width: 50 }] : []),
  ];
  table(wb.addWorksheet('Startups'), sCols, startups.map((s, i) => {
    const last = s.periodRounds[0];
    return [
      i + 1, s.name, s.sector, s.city, stageLabel(s.stage), s.foundedYear, (cur === 'INR' ? s.raisedInr : s.raisedUsd) || null,
      s.periodRounds.length, last?.announcedAt ?? null, last?.roundType ?? null, last ? amount(last) : null, last?.leadInvestors.join(', ') || null,
      s.profileUrl,
      ...(full ? [s.websiteUrl, s.linkedinUrl, s.founders.join(', ') || null, s.employeeCount, [...new Set(s.periodRounds.flatMap((r) => r.allInvestors))].join(', ') || null] : []),
    ];
  }), cur, footer);

  // Funding rounds
  const rounds = startups.flatMap((s) => s.periodRounds.map((r) => ({ s, r }))).sort((a, b) => b.r.announcedAt.getTime() - a.r.announcedAt.getTime());
  table(wb.addWorksheet('Funding Rounds'), [
    { header: 'Date', width: 13, fmt: 'date' }, { header: 'Startup', width: 28 }, { header: 'Round', width: 16 }, { header: `Amount ${curLabel}`, width: 16, fmt: 'money' },
    { header: 'Lead investors', width: 40 }, { header: 'Sector', width: 22 }, { header: 'City', width: 16 },
    ...(full ? [{ header: 'All investors', width: 50 }, { header: `Valuation ${curLabel}`, width: 16, fmt: 'money' as const }, { header: 'Source', width: 40, link: true }] : []),
  ], rounds.map(({ s, r }) => [
    r.announcedAt, s.name, r.roundType, amount(r), r.leadInvestors.join(', ') || null, s.sector, s.city,
    ...(full ? [r.allInvestors.join(', ') || null, r.valuationInr ? (cur === 'INR' ? r.valuationInr : Math.round(r.valuationInr / r.usdInr)) : null, r.sourceUrl] : []),
  ]), cur, footer);

  const sheets = new Set(full ? ['summary', 'sector', 'stage', 'city', 'investors', 'quarterly'] : f.sheets);
  const disclosed = rounds.filter(({ r }) => r.disclosed).map(({ r }) => money(r)).sort((a, b) => a - b);
  const total = disclosed.reduce((n, x) => n + x, 0);

  if (sheets.has('summary')) {
    const ws = wb.addWorksheet('Summary');
    ws.columns = [{ width: 34 }, { width: 22 }];
    const kv: [string, string | number | null, boolean?][] = [
      ['Startups in this file', startups.length],
      ['Startups matching your filters', opts.matched],
      ['Funding rounds', rounds.length],
      ['Rounds with a disclosed amount', disclosed.length],
      [`Total raised ${curLabel}`, total, true],
      [`Median round ${curLabel}`, disclosed.length ? disclosed[Math.floor(disclosed.length / 2)] : null, true],
      [`Largest round ${curLabel}`, disclosed.length ? disclosed[disclosed.length - 1] : null, true],
    ];
    ws.addRow(['AI Startups Funding Data', '']).font = { bold: true, size: 14, color: { argb: BRAND } };
    ws.addRow([`Generated ${stamp} · ${PACKS[pack].name}`, '']).font = { color: { argb: 'FF6B7280' } };
    ws.addRow([]);
    for (const [k, v, isMoney] of kv) {
      const row = ws.addRow([k, v]);
      row.getCell(1).font = { color: { argb: 'FF6B7280' } };
      row.getCell(2).font = { bold: true };
      if (isMoney) row.getCell(2).numFmt = cur === 'INR' ? INR_FMT : USD_FMT;
      else row.getCell(2).numFmt = '#,##0';
    }
    ws.headerFooter.oddFooter = `&L${footer.replace(/&/g, '&&')}`;
  }

  const groupSheet = (name: string, label: string, key: (s: SelectedStartup) => string | null) => {
    table(wb.addWorksheet(name), [
      { header: label, width: 28 }, { header: 'Startups', width: 10, fmt: 'int' }, { header: 'Rounds', width: 10, fmt: 'int' }, { header: `Raised ${curLabel}`, width: 18, fmt: 'money' },
    ], group(startups, key, (r) => (r.disclosed ? money(r) : 0)).map(([k, g]) => [k, g.startups.size, g.rounds, g.amount || null]), cur, footer);
  };
  if (sheets.has('sector')) groupSheet('By Sector', 'Sector', (s) => s.sector);
  if (sheets.has('stage')) groupSheet('By Stage', 'Stage', (s) => stageLabel(s.stage));
  if (sheets.has('city')) groupSheet('By City', 'City', (s) => s.city);

  if (sheets.has('investors')) {
    const inv = new Map<string, { deals: number; lead: number; amount: number; startups: Set<string> }>();
    for (const { s, r } of rounds) {
      for (const name of r.allInvestors) {
        const g = inv.get(name) ?? { deals: 0, lead: 0, amount: 0, startups: new Set<string>() };
        g.deals++; g.startups.add(s.name);
        if (r.leadInvestors.includes(name)) g.lead++;
        if (r.disclosed) g.amount += money(r);
        inv.set(name, g);
      }
    }
    table(wb.addWorksheet('Investors'), [
      { header: 'Investor', width: 34 }, { header: 'Deals', width: 8, fmt: 'int' }, { header: 'As lead', width: 9, fmt: 'int' },
      { header: `Total of rounds joined ${curLabel}`, width: 22, fmt: 'money' }, { header: 'Portfolio in this file', width: 60 },
    ], [...inv.entries()].sort((a, b) => b[1].deals - a[1].deals || b[1].amount - a[1].amount)
      .map(([name, g]) => [name, g.deals, g.lead, g.amount || null, [...g.startups].slice(0, 15).join(', ')]), cur, footer);
  }

  if (sheets.has('quarterly')) {
    const q = new Map<string, { rounds: number; amount: number }>();
    for (const { r } of rounds) {
      const d = r.announcedAt;
      const k = `${d.getUTCFullYear()} Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
      const g = q.get(k) ?? { rounds: 0, amount: 0 };
      g.rounds++; if (r.disclosed) g.amount += money(r);
      q.set(k, g);
    }
    table(wb.addWorksheet('Quarterly Trend'), [
      { header: 'Quarter', width: 12 }, { header: 'Rounds', width: 10, fmt: 'int' }, { header: `Raised ${curLabel}`, width: 18, fmt: 'money' },
    ], [...q.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([k, g]) => [k, g.rounds, g.amount || null]), cur, footer);
  }

  // About this data
  const about = wb.addWorksheet('About');
  about.columns = [{ width: 110 }];
  const { start, end } = periodRange(f, now);
  const scope = full ? 'Every approved startup in the Udyaibase directory, all time.' : [
    `Period: ${f.period === 'custom' ? `${f.from ?? 'start'} to ${f.to ?? 'today'}` : PERIOD_LABELS[f.period]}${start || end ? ' (startups that raised in this period)' : ''}`,
    f.sectors.length ? `Sectors: ${f.sectors.join(', ')}` : 'Sectors: all',
    f.stages.length ? `Stages: ${f.stages.map(stageLabel).join(', ')}` : 'Stages: all',
    f.cities.length ? `Cities: ${f.cities.join(', ')}` : 'Cities: all',
    f.fundedOnly ? 'Only startups with recorded funding' : 'Includes startups without recorded rounds (raised = directory total)',
  ].join('\n');
  for (const line of [
    'AI Startups Funding Data · Udyaibase',
    `Generated ${stamp}. ${PACKS[pack].name}: ${startups.length} of ${opts.matched} matching startups, ranked by most recent funding, then amount raised.`,
    '',
    scope,
    '',
    'Sources: public announcements, press coverage and founder submissions on Udyaibase. Undisclosed amounts are left blank.',
    `Currency: ${cur === 'INR' ? 'Indian rupees' : 'US dollars'}. A round reported in one currency is converted at the exchange rate on its announcement date (European Central Bank reference rates)${datasetUsdInrToday() ? `; startup totals without dated rounds at today's rate, ₹${datasetUsdInrToday()!.toFixed(2)} per US$1` : ''}.`,
    '',
    `Licence: for the use of ${opts.email} and their organisation. Sharing, reselling or publishing the dataset (in full or in substantial part) is not permitted. Quoting figures with credit to Udyaibase is welcome.`,
    `Order ${opts.orderId}. Questions or corrections: support@udyaibase.com`,
  ]) {
    const row = about.addRow([line]);
    row.alignment = { wrapText: true, vertical: 'top' };
  }
  about.getRow(1).font = { bold: true, size: 14, color: { argb: BRAND } };

  return Buffer.from(await wb.xlsx.writeBuffer());
}
