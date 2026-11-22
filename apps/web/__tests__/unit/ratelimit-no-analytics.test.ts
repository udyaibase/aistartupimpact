import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

/**
 * @upstash/ratelimit's analytics writes an hourly "<prefix>:events:<bucket>" key per limiter that never expires.
 * With it on, Redis filled with ~1,600 stray keys. Every limiter must keep it off.
 */
describe('rate limiters keep Upstash analytics off', () => {
  for (const file of ['lib/rate-limit.ts', 'lib/event-rate-limit.ts']) {
    it(file, () => {
      const src = readFileSync(file, 'utf8');
      const limiters = (src.match(/new Ratelimit\(/g) || []).length;
      expect(limiters).toBeGreaterThan(0);
      expect(src).not.toMatch(/analytics:\s*true/);
      expect((src.match(/analytics:\s*false/g) || []).length).toBe(limiters);
    });
  }
});
