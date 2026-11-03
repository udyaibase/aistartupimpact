import { describe, it, expect, vi, beforeAll } from 'vitest';
vi.mock('@udyaibase/database', () => ({ prisma: {} }));
vi.mock('@/lib/db', () => ({ getAllFundingRoundsDirect: vi.fn(async () => []) }));
import ExcelJS from 'exceljs';
import { DEFAULT_FILTERS, PACKS, packOptions, parseFilters, splitInclusive, suggestedPack } from '@/lib/funding/packs';
import { selectStartups, type DataRound, type DataStartup } from '@/lib/funding/dataset';
import { buildFundingWorkbook } from '@/lib/funding/workbook';
import { snapshotRounds, SNAPSHOT_LAG_DAYS } from '@/lib/funding/report';
import { emailPass, purchaseToken, verifyEmailPass, verifyPurchaseToken } from '@/lib/funding/access';

const DAY = 864e5;
const ago = (days: number) => new Date(Date.now() - days * DAY);

function round(startupId: string, daysAgo: number, inr: number, extra: Partial<DataRound> = {}): DataRound {
  return {
    id: `${startupId}-${daysAgo}`, startupId, roundType: 'Seed', announcedAt: ago(daysAgo), inr, usd: Math.round(inr / 84), disclosed: inr > 0,
    leadInvestors: ['Peak XV'], allInvestors: ['Peak XV', 'Angel A'], valuationInr: null, sourceUrl: 'https://news.example/x', ...extra,
  };
}
function startup(id: string, o: Partial<DataStartup> = {}): DataStartup {
  return {
    id, name: id.toUpperCase(), slug: id, sector: 'Fintech', city: 'Bengaluru', stage: 'SEED', foundedYear: 2021,
    websiteUrl: `https://${id}.in`, linkedinUrl: null, founders: ['A Founder'], employeeCount: 12, profileUrl: `https://udyaibase.com/startups/${id}`,
    listedTotalInr: 0, rounds: [], ...o,
  };
}

const data: DataStartup[] = [
  startup('alpha', { rounds: [round('alpha', 10, 50_00_00_000)] }),               // newest round, ₹50 Cr
  startup('beta', { sector: 'Healthtech', city: 'Mumbai', rounds: [round('beta', 200, 10_00_00_000)] }),
  startup('gamma', { stage: 'SERIES_A', rounds: [round('gamma', 40, 5_00_00_000), round('gamma', 400, 1_00_00_000)] }),
  startup('delta', { listedTotalInr: 2_00_00_000 }),                                // no recorded rounds
];

describe('funding packs', () => {
  it('prices include 18% GST; the invoice splits it out exactly', () => {
    expect(splitInclusive(PACKS.STARTER.totalPaise)).toEqual({ amount: 16864, gst: 3036, total: 19900 });
    for (const p of Object.values(PACKS)) {
      const s = splitInclusive(p.totalPaise);
      expect(s.amount + s.gst).toBe(p.totalPaise);
      expect(Math.abs(s.gst - s.amount * 0.18)).toBeLessThan(1);
    }
    expect([PACKS.STARTER, PACKS.GROWTH, PACKS.PRO, PACKS.SCALE, PACKS.FULL].map((p) => [p.limit, p.totalPaise / 100])).toEqual([
      [50, 199], [250, 399], [500, 699], [1000, 1499], [null, 3999],
    ]);
  });

  it('only sells packs that make sense: smaller ones give the top N, the smallest that fits gives all, bigger ones are refused', () => {
    const o = packOptions(312, 746);
    const by = Object.fromEntries(o.map((x) => [x.key, x]));
    expect(by.STARTER).toMatchObject({ available: true, gets: 50 });
    expect(by.GROWTH).toMatchObject({ available: true, gets: 250 });
    expect(by.PRO).toMatchObject({ available: true, gets: 312 });
    expect(by.SCALE).toMatchObject({ available: false, note: 'Your selection fits in Pro' });
    expect(by.FULL).toMatchObject({ available: true, gets: 746 });
    expect(suggestedPack(o)).toBe('PRO');
    // Whole directory (746): Scale is the pack that holds them all.
    expect(packOptions(746, 746).find((x) => x.key === 'SCALE')).toMatchObject({ available: true, gets: 746 });
    expect(packOptions(0, 746).filter((x) => x.available).map((x) => x.key)).toEqual(['FULL']);
  });

  it('untrusted filters are cleaned: unknown values dropped, custom dates ordered, sheets limited to known ones', () => {
    const f = parseFilters({ period: 'custom', from: '2026-05-01', to: '2025-01-01', sectors: ['Fintech', 'Fintech', 7], currency: 'GBP', sheets: ['summary', 'evil'], fundedOnly: 'yes' });
    expect(f).toMatchObject({ period: 'custom', from: '2025-01-01', to: '2026-05-01', sectors: ['Fintech'], currency: 'INR', sheets: ['summary'], fundedOnly: false });
    expect(parseFilters({ period: 'forever' }).period).toBe('all');
    expect(parseFilters(null)).toEqual(DEFAULT_FILTERS);
  });
});

describe('selectStartups (same function for the live count and the file)', () => {
  it('ranks by most recent funding, then amount; startups without rounds come last', () => {
    const { matched, startups } = selectStartups(data, DEFAULT_FILTERS, null);
    expect(matched).toBe(4);
    expect(startups.map((s) => s.id)).toEqual(['alpha', 'gamma', 'beta', 'delta']);
    expect(startups[3].raisedInr).toBe(2_00_00_000); // directory total stands in when no rounds are recorded
  });

  it('a period keeps only startups that raised in it, and only those rounds', () => {
    const { startups } = selectStartups(data, { ...DEFAULT_FILTERS, period: '90d' }, null);
    expect(startups.map((s) => s.id)).toEqual(['alpha', 'gamma']);
    expect(startups[1].periodRounds).toHaveLength(1);
    expect(startups[1].raisedInr).toBe(5_00_00_000);
  });

  it('sector, stage, city and funded-only filters; the pack limit cuts the ranked list', () => {
    expect(selectStartups(data, { ...DEFAULT_FILTERS, sectors: ['healthtech'] }, null).startups.map((s) => s.id)).toEqual(['beta']);
    expect(selectStartups(data, { ...DEFAULT_FILTERS, stages: ['SERIES_A'] }, null).startups.map((s) => s.id)).toEqual(['gamma']);
    expect(selectStartups(data, { ...DEFAULT_FILTERS, cities: ['Mumbai'] }, null).matched).toBe(1);
    expect(selectStartups(data, { ...DEFAULT_FILTERS, fundedOnly: true }, null).matched).toBe(3);
    const top2 = selectStartups(data, DEFAULT_FILTERS, 2);
    expect([top2.matched, top2.startups.length]).toEqual([4, 2]);
  });

  it('Full Dataset ignores the filters', () => {
    expect(selectStartups(data, { ...DEFAULT_FILTERS, sectors: ['Healthtech'], period: '30d' }, null, { ignoreFilters: true }).matched).toBe(4);
  });
});

describe('free snapshot', () => {
  it(`leaves out rounds from the last ${SNAPSHOT_LAG_DAYS} days`, () => {
    const rounds = [{ announcedAt: ago(5).toISOString() }, { announcedAt: ago(89).toISOString() }, { announcedAt: ago(91).toISOString() }, { announcedAt: null }];
    const { rounds: kept } = snapshotRounds(rounds);
    expect(kept).toEqual([rounds[2]]);
  });
});

describe('access tokens', () => {
  beforeAll(() => { process.env.NEXTAUTH_SECRET ||= 'test-secret-for-funding-tokens'; });

  it('an email pass proves the email and cannot be forged or reused as a download link', () => {
    const pass = emailPass('Priya@Example.com');
    expect(verifyEmailPass(pass)).toBe('priya@example.com');
    const [body] = pass.split('.');
    expect(verifyEmailPass(`${body}.forged`)).toBeNull();
    expect(verifyPurchaseToken(pass)).toBeNull();
    expect(verifyPurchaseToken(purchaseToken('p1'))).toBe('p1');
    expect(verifyEmailPass(purchaseToken('p1'))).toBeNull();
  });

  it('an expired email pass is refused', () => {
    vi.useFakeTimers();
    const pass = emailPass('a@b.co');
    vi.advanceTimersByTime(31 * 60_000);
    expect(verifyEmailPass(pass)).toBeNull();
    vi.useRealTimers();
  });
});

describe('Excel workbook', () => {
  async function open(pack: 'GROWTH' | 'FULL', filters = DEFAULT_FILTERS) {
    const { matched, startups } = selectStartups(data, filters, null, { ignoreFilters: pack === 'FULL' });
    const buf = await buildFundingWorkbook({ startups, matched, filters, pack, email: 'buyer@example.com', orderId: 'ord_1' });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    return wb;
  }
  const headers = (ws: ExcelJS.Worksheet) => (ws.getRow(1).values as unknown[]).slice(1);

  it('has the chosen sheets, numeric amounts, filters, a frozen header and the licence footer', async () => {
    const wb = await open('GROWTH', { ...DEFAULT_FILTERS, sheets: ['summary', 'investors'] });
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Startups', 'Funding Rounds', 'Summary', 'Investors', 'About']);
    const s = wb.getWorksheet('Startups')!;
    expect(s.rowCount).toBe(1 + 4);
    expect(s.getRow(2).getCell(2).value).toBe('ALPHA');
    expect(typeof s.getRow(2).getCell(7).value).toBe('number'); // raised, summable
    expect(s.autoFilter).toBeTruthy();
    expect(s.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
    expect(s.headerFooter.oddFooter).toContain('buyer@example.com');
    expect(headers(s)).not.toContain('Founders');
    expect(wb.getWorksheet('Funding Rounds')!.rowCount).toBe(1 + 4);
    expect(wb.subject).toContain('buyer@example.com');
  });

  it('USD files use dollars; Full Dataset adds contact and source columns and every sheet', async () => {
    const usd = await open('GROWTH', { ...DEFAULT_FILTERS, currency: 'USD', sheets: [] });
    expect(usd.getWorksheet('Startups')!.getRow(2).getCell(7).value).toBe(Math.round(50_00_00_000 / 84));
    const full = await open('FULL', { ...DEFAULT_FILTERS, sheets: [] });
    expect(full.worksheets.map((w) => w.name)).toEqual(['Startups', 'Funding Rounds', 'Summary', 'By Sector', 'By Stage', 'By City', 'Investors', 'Quarterly Trend', 'About']);
    expect(headers(full.getWorksheet('Startups')!)).toEqual(expect.arrayContaining(['Website', 'LinkedIn', 'Founders', 'All investors']));
    expect(headers(full.getWorksheet('Funding Rounds')!)).toEqual(expect.arrayContaining(['Source']));
  });
});
