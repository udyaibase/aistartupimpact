import { describe, it, expect } from 'vitest';
import { roundDate } from '@/lib/funding/format';
import { taglineClause } from '@/lib/seo-text';

describe('roundDate', () => {
  it('reads the database formats', () => {
    expect(roundDate('2026-08-06 00:00:00')?.getFullYear()).toBe(2026);
    expect(roundDate('2026-08-06 00:00:00+00')?.toISOString()).toBe('2026-08-06T00:00:00.000Z');
    expect(roundDate('2026-08-06')?.getFullYear()).toBe(2026);
  });
  it('rejects unreadable and impossibly old dates instead of throwing', () => {
    expect(roundDate('0022-02-15 00:00:00')).toBeNull(); // the ReadyAssist typo that broke the sitemap
    expect(roundDate('1899-01-01')).toBeNull();
    expect(roundDate('not a date')).toBeNull();
    expect(roundDate('')).toBeNull();
    expect(roundDate(null)).toBeNull();
  });
});

describe('taglineClause', () => {
  it('lowercases an ordinary first word', () => {
    expect(taglineClause('Building agents for insurance.')).toBe('building agents for insurance');
    expect(taglineClause('The marketplace for AI tools')).toBe('the marketplace for AI tools');
  });
  it('keeps acronyms and brand-style words as written', () => {
    expect(taglineClause('AI-powered fraud detection')).toBe('AI-powered fraud detection');
    expect(taglineClause('B2B payments for India')).toBe('B2B payments for India');
    expect(taglineClause('GenAI for lawyers')).toBe('GenAI for lawyers');
    expect(taglineClause('iOS-first health coach')).toBe('iOS-first health coach');
    expect(taglineClause('AI')).toBe('AI');
  });
});

import { roundMoneyLabel } from '@/lib/funding/insights';

describe('roundMoneyLabel', () => {
  it('shows the dollar amount recorded on the round, not one converted back from rupees', () => {
    // Neysa Series B: $600M recorded, rupees entered at ~95.4/$ — must not read "$681.4M".
    expect(roundMoneyLabel({ amountUsd: 600_000_000_00, amountInr: 5_724_00_00_000_00 })).toBe('₹5,724 Cr ($600M)');
  });
  it('converts only the missing side', () => {
    expect(roundMoneyLabel({ amountUsd: 2_300_000_00, amountInr: null })).toMatch(/^₹\S+ Cr \(\$2\.3M\)$/);
    expect(roundMoneyLabel({ amountUsd: null, amountInr: 0 })).toBe('undisclosed');
  });
});
