import { describe, it, expect, vi } from 'vitest';
vi.mock('@upstash/redis', () => ({ Redis: class {} }));
import { rateLimitMessage, retryAfterHeaders } from '@/lib/rate-limit';

const now = 1_800_000_000_000;
describe('rate limit message', () => {
  it('says exactly when to try again', () => {
    expect(rateLimitMessage(now + 30_000, now)).toBe('Too many attempts. Please try again in a minute.');
    expect(rateLimitMessage(now + 12 * 60_000, now)).toBe('Too many attempts. Please try again in 12 minutes.');
    expect(rateLimitMessage(now + 59 * 60_000 + 1, now)).toBe('Too many attempts. Please try again in about an hour.');
    expect(rateLimitMessage(now + 3 * 3_600_000, now)).toBe('Too many attempts. Please try again in about 3 hours.');
    expect(rateLimitMessage(now + 30 * 3_600_000, now)).toBe('Too many attempts. Please try again tomorrow.');
  });
  it('falls back when the time is unknown', () => {
    expect(rateLimitMessage(0, now)).toMatch(/wait a little/);
    expect(rateLimitMessage(now - 1000, now)).toMatch(/wait a little/);
  });
  it('sets Retry-After in seconds', () => {
    expect(retryAfterHeaders(now + 90_500, now)).toEqual({ 'Retry-After': '91' });
    expect(retryAfterHeaders(0, now)).toEqual({});
  });
});
