import { describe, it, expect } from 'vitest';
import { INDIA_CITY_KEYS } from '@/lib/india-hq';

describe('INDIA_CITY_KEYS (headquartered in India)', () => {
  const keys = new Set(INDIA_CITY_KEYS);

  it('includes Indian cities and their common spellings, lower-cased', () => {
    for (const c of ['bengaluru', 'bangalore', 'mumbai', 'chennai', 'hyderabad', 'gurugram', 'visakhapatnam', 'vizag']) {
      expect(keys.has(c)).toBe(true);
    }
  });

  it('excludes cities abroad', () => {
    for (const c of ['san francisco', 'sunnyvale', 'austin', 'new york', 'london', 'singapore', 'dhaka']) {
      expect(keys.has(c)).toBe(false);
    }
  });
});
