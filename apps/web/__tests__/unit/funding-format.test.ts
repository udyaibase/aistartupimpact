import { describe, it, expect } from 'vitest';
import { inrLabel, roundAmount, roundHeadline, roundLabel, usdLabel } from '@/lib/funding/format';

describe('funding round formatting', () => {
  it('turns stored round types into readable names', () => {
    expect(roundLabel('SERIES_D')).toBe('Series D');
    expect(roundLabel('PRE_SEED')).toBe('Pre-Seed');
    expect(roundLabel('PRE_SERIES_A')).toBe('Pre-Series A');
    expect(roundLabel('SEED')).toBe('Seed');
    expect(roundLabel('IPO')).toBe('IPO');
    expect(roundLabel(null)).toBe('Funding');
  });

  it('reads amountUsd as cents (not dollars)', () => {
    expect(usdLabel(6_500_000_000)).toBe('$65M'); // $65,000,000.00
    expect(usdLabel(120_000_000_000)).toBe('$1.2B');
    expect(usdLabel(50_000_000)).toBe('$500K');
    expect(usdLabel(null)).toBeNull();
    expect(usdLabel(0)).toBeNull();
  });

  it('reads amountInr as paise (not rupees)', () => {
    expect(inrLabel(540_00_00_000_00)).toBe('₹540 Cr'); // ₹540 crore
    expect(inrLabel(25e9)).toBe('₹25 Cr'); // ₹25 crore = 25e9 paise;
    expect(inrLabel(75_00_000_00)).toBe('₹75 L');
    expect(inrLabel(null)).toBeNull();
  });

  it('prefers dollars, falls back to rupees, and writes a headline', () => {
    expect(roundAmount({ amountUsd: 6_500_000_000, amountInr: 540_00_00_000_00 })).toBe('$65M');
    expect(roundAmount({ amountUsd: null, amountInr: 25e9 })).toBe('₹25 Cr');
    expect(roundHeadline({ startupName: 'Qure.ai ', roundType: 'SERIES_D', amountUsd: 6_500_000_000 })).toBe('Qure.ai raises $65M Series D');
    expect(roundHeadline({ startupName: 'Acme', roundType: 'SEED' })).toBe('Acme raises Seed funding');
  });
});
