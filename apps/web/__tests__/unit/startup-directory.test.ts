import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ sql: vi.fn() }));

import { parseDirectoryQuery, MAX_PAGE_SIZE } from '@/lib/startups/directory';

const parse = (qs: string) => {
  const p = new URLSearchParams(qs);
  return parseDirectoryQuery((k) => p.get(k));
};

describe('parseDirectoryQuery', () => {
  it('reads the funding toggle', () => {
    expect(parse('funding=funded').funding).toBe('funded');
    expect(parse('funding=unfunded').funding).toBe('unfunded');
    expect(parse('').funding).toBeUndefined();
  });

  it('drops values that are not on the allowed lists', () => {
    const q = parse('funding=yes&stage=NOPE&status=x&employeeRange=9&country=Mars&sort=drop');
    expect(q).toMatchObject({ funding: undefined, stage: undefined, status: undefined, employeeRange: undefined, country: undefined, sort: undefined });
  });

  it('keeps valid filters', () => {
    expect(parse('stage=SEED&status=ACTIVE&country=India&employeeRange=11-50&sort=funded&city=Pune')).toMatchObject({
      stage: 'SEED', status: 'ACTIVE', country: 'India', employeeRange: '11-50', sort: 'funded', city: 'Pune',
    });
  });

  it('bounds paging', () => {
    expect(parse('page=-3&limit=10000')).toMatchObject({ page: 1, limit: MAX_PAGE_SIZE });
    expect(parse('page=abc&limit=0')).toMatchObject({ page: 1, limit: 1 });
    expect(parse('')).toMatchObject({ page: 1, limit: 30 });
  });

  it('trims and caps the search text', () => {
    expect(parse('q=%20%20%20').q).toBeUndefined();
    expect(parse(`q=${'a'.repeat(300)}`).q).toHaveLength(100);
  });
});
