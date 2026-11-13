import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const db = vi.hoisted(() => ({
  exchangeRate: { findFirst: vi.fn(), createMany: vi.fn(async ({ data }: { data: unknown[] }) => ({ count: data.length })) },
  $executeRaw: vi.fn(async () => 3),
}));
vi.mock('@udyaibase/database', () => ({ prisma: db }));
// No Redis in tests: run the loader directly.
vi.mock('@/lib/cache', () => ({ cached: async (_k: string, _o: unknown, fn: () => Promise<unknown>) => fn() }));

import { FALLBACK_USD_INR, latestUsdInr, refreshExchangeRates } from '@/lib/fx';

const fetchMock = vi.fn();
const sqlText = (call: unknown[]) => (call[0] as TemplateStringsArray).join('?');

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const ok = (rates: Record<string, number>) => ({ ok: true, json: async () => ({ rates: Object.fromEntries(Object.entries(rates).map(([d, v]) => [d, { INR: v }])) }) });

describe('refreshExchangeRates', () => {
  it('first run: loads the history from 2000 and converts rounds saved with a fixed rate', async () => {
    db.exchangeRate.findFirst.mockResolvedValue(null);
    fetchMock.mockResolvedValue(ok({ '2000-01-13': 43.6, '2026-02-16': 90.7, bad: 1, '2026-02-17': 9999 }));
    const r = await refreshExchangeRates();
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/2000-01-01\.\.\d{4}-\d{2}-\d{2}\?base=USD&symbols=INR$/);
    // Junk rows (bad date, absurd rate) are dropped.
    expect(db.exchangeRate.createMany.mock.calls[0][0].data).toHaveLength(2);
    expect(r.ratesAdded).toBe(2);
    expect(db.$executeRaw).toHaveBeenCalledTimes(2);
    expect(sqlText(db.$executeRaw.mock.calls[0])).toContain('95.4'); // the fixed-rate pass
    expect(sqlText(db.$executeRaw.mock.calls[1])).toContain('usd_inr_on'); // recalculation
  });

  it('later runs: only the new days, and no fixed-rate pass', async () => {
    db.exchangeRate.findFirst.mockResolvedValue({ day: new Date('2026-11-10T00:00:00Z') });
    fetchMock.mockResolvedValue(ok({ '2026-11-11': 94.1, '2026-11-12': 94.04 }));
    await refreshExchangeRates();
    expect(fetchMock.mock.calls[0][0]).toContain('/2026-11-11..');
    expect(db.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('throws on an API error (the daily job logs it and carries on)', async () => {
    db.exchangeRate.findFirst.mockResolvedValue({ day: new Date('2026-11-10T00:00:00Z') });
    fetchMock.mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });
    await expect(refreshExchangeRates()).rejects.toThrow('HTTP 503');
  });
});

describe('latestUsdInr', () => {
  it('uses the newest stored rate', async () => {
    db.exchangeRate.findFirst.mockResolvedValue({ usdInr: 94.04 });
    expect(await latestUsdInr()).toBe(94.04);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('fetches when nothing is stored yet, and never throws', async () => {
    db.exchangeRate.findFirst.mockResolvedValue(null);
    fetchMock.mockResolvedValue(ok({ '2026-11-11': 94.1, '2026-11-12': 94.04 }));
    expect(await latestUsdInr()).toBe(94.04);
    fetchMock.mockRejectedValue(new Error('offline'));
    expect(await latestUsdInr()).toBe(FALLBACK_USD_INR);
  });
});
