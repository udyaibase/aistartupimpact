import { describe, it, expect } from 'vitest';
import {
  byCity, byInvestor, fundingFaq, inrPaiseOf, inScope, monthSlugOf, monthsWithRounds, parseMonthSlug, roundsInCity,
  roundsWithInvestor, slugify, summarize, summaryText, usdCentsOf, type FundingRoundRow,
} from '@/lib/funding/insights';

const round = (over: Partial<FundingRoundRow>): FundingRoundRow => ({
  id: Math.random().toString(36).slice(2), slug: null, roundType: 'SEED', amountInr: null, amountUsd: null,
  announcedAt: '2026-03-10T00:00:00Z', leadInvestors: [], allInvestors: [], startupName: 'Acme', startupSlug: 'acme',
  headquartersCity: 'Bengaluru', startupCategory: 'SaaS', startupLogoUrl: null, inIndia: true, city: 'Bengaluru', ...over,
});

describe('units', () => {
  it('uses rupees when recorded, else converts dollars (cents × 84 = paise)', () => {
    expect(inrPaiseOf({ amountInr: '5000000000', amountUsd: '6000000' })).toBe(5_000_000_000);
    expect(inrPaiseOf({ amountInr: null, amountUsd: 100_000_000 })).toBe(8_400_000_000); // $1M → ₹8.4 Cr
    expect(usdCentsOf({ amountInr: 8_400_000_000, amountUsd: null })).toBe(100_000_000);
  });
});

describe('dates and slugs', () => {
  it('assigns months in India time', () => {
    expect(monthSlugOf('2026-10-31T20:00:00Z')).toBe('november-2026'); // 1:30 am IST on 1 Nov
    expect(monthSlugOf('2026-11-15T10:00:00Z')).toBe('november-2026');
  });
  it('parses month slugs and rejects anything else', () => {
    expect(parseMonthSlug('november-2026')).toEqual({ year: 2026, month: 10 });
    expect(parseMonthSlug('bengaluru')).toBeNull();
    expect(parseMonthSlug('smarch-2026')).toBeNull();
  });
  it('slugs investor and city names', () => {
    expect(slugify('Peak XV Partners')).toBe('peak-xv-partners');
    expect(slugify('Accel & Partners')).toBe('accel-and-partners');
  });
});

describe('aggregates', () => {
  const rounds = [
    round({ amountInr: 1_000_000_000, leadInvestors: ['Peak XV'], allInvestors: ['Peak XV', 'Accel'], announcedAt: '2026-03-01T00:00:00Z' }),
    round({ amountInr: 3_000_000_000, leadInvestors: ['Accel'], city: 'Mumbai', headquartersCity: 'Mumbai', announcedAt: '2025-02-01T00:00:00Z' }),
    round({ amountInr: 2_000_000_000, inIndia: false, city: 'San Francisco', headquartersCity: 'San Francisco', announcedAt: '2026-01-01T00:00:00Z' }),
  ];

  it('scopes to India', () => {
    expect(inScope(rounds, 'india')).toHaveLength(2);
    expect(inScope(rounds, 'global')).toHaveLength(3);
  });

  it('counts an investor once per round even when listed as lead and participant', () => {
    const peak = byInvestor(rounds).find((g) => g.slug === 'peak-xv')!;
    expect(peak.deals).toBe(1);
    expect(byInvestor(rounds).find((g) => g.slug === 'accel')!.deals).toBe(3 - 1); // rounds 1 and 2
  });

  it('groups by city and finds hub rounds', () => {
    // Equal deal counts rank by amount: Mumbai ₹30 Cr ahead of Bengaluru ₹10 Cr.
    expect(byCity(rounds).map((c) => c.name)).toEqual(['Mumbai', 'San Francisco', 'Bengaluru']);
    expect(roundsInCity(rounds, 'mumbai')).toHaveLength(1);
    expect(roundsWithInvestor(rounds, 'accel')).toHaveLength(2);
    expect(monthsWithRounds(rounds).map((m) => m.slug)).toEqual(['march-2026', 'january-2026', 'february-2025']);
  });

  it('compares year-to-date with the same period last year', () => {
    const s = summarize(inScope(rounds, 'india'), new Date('2026-03-15T00:00:00Z'));
    expect(s.ytd).toEqual({ deals: 1, paise: 1_000_000_000 });
    expect(s.lastYearSamePeriod).toEqual({ deals: 1, paise: 3_000_000_000 }); // Feb 2025 is before 15 Mar
    expect(s.largest?.amountInr).toBe(3_000_000_000);
    expect(summaryText(s, 'india')).toContain('down 67%');
  });

  it('writes FAQ answers from the same numbers', () => {
    const s = summarize(inScope(rounds, 'india'), new Date('2026-03-15T00:00:00Z'));
    const faq = fundingFaq(s, 'india', '15 Mar 2026');
    expect(faq[0].q).toBe('How much funding have AI startups raised in India in 2026?');
    expect(faq[0].a).toContain('across 1 funding round in 2026');
    expect(faq.at(-1)!.a).toContain('15 Mar 2026');
  });
});
