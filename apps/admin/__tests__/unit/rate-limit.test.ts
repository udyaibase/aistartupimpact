import { beforeEach, describe, expect, it } from 'vitest';
import { LIMITS, resetRateLimits, tooMany } from '@/lib/rate-limit';

describe('speed limit on sensitive admin actions', () => {
  beforeEach(resetRateLimits);

  it('allows up to the limit, then pauses with a plain message', () => {
    const t = 1_000_000;
    for (let i = 0; i < LIMITS.refund.max; i++) expect(tooMany('u1', 'refund', t + i)).toBeNull();
    expect(tooMany('u1', 'refund', t + 50)).toMatch(/paused for \d+ minutes/);
  });

  it('counts each person and each action separately', () => {
    const t = 1_000_000;
    for (let i = 0; i < LIMITS.bulkEmail.max; i++) tooMany('u1', 'bulkEmail', t);
    expect(tooMany('u1', 'bulkEmail', t)).not.toBeNull();
    expect(tooMany('u2', 'bulkEmail', t)).toBeNull();
    expect(tooMany('u1', 'refund', t)).toBeNull();
  });

  it('lets the action through again once the window has passed', () => {
    const t = 1_000_000;
    for (let i = 0; i < LIMITS.refund.max; i++) tooMany('u1', 'refund', t);
    expect(tooMany('u1', 'refund', t + 1)).not.toBeNull();
    expect(tooMany('u1', 'refund', t + LIMITS.refund.windowMs + 1)).toBeNull();
  });

  it('a refused attempt does not extend the pause', () => {
    const t = 1_000_000;
    for (let i = 0; i < LIMITS.refund.max; i++) tooMany('u1', 'refund', t);
    for (let i = 0; i < 50; i++) tooMany('u1', 'refund', t + LIMITS.refund.windowMs - 10);
    expect(tooMany('u1', 'refund', t + LIMITS.refund.windowMs + 1)).toBeNull();
  });
});
