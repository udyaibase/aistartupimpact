import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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

describe('the limit counted across servers', () => {
  const env = { ...process.env };
  afterEach(() => { process.env = { ...env }; vi.unstubAllGlobals(); vi.resetModules(); });

  async function load(withStore: boolean) {
    vi.resetModules();
    if (withStore) { process.env.UPSTASH_REDIS_REST_URL = 'https://store.example'; process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token'; }
    else { delete process.env.UPSTASH_REDIS_REST_URL; delete process.env.UPSTASH_REDIS_REST_TOKEN; }
    return import('@/lib/rate-limit');
  }

  it('asks the shared store and blocks once the count passes the limit', async () => {
    let count = 0;
    const fetchMock = vi.fn(async (_url: string, init: { body: string }) => {
      count++;
      const commands = JSON.parse(init.body);
      expect(commands[0][0]).toBe('INCR');
      expect(commands[1]).toEqual(['EXPIRE', commands[0][1], expect.any(Number), 'NX']); // the counter cleans itself up
      return { ok: true, json: async () => [{ result: count }, { result: 1 }] };
    });
    vi.stubGlobal('fetch', fetchMock);
    const { tooManyShared, LIMITS: L } = await load(true);
    for (let i = 0; i < L.bulkEmail.max; i++) expect(await tooManyShared('u1', 'bulkEmail')).toBeNull();
    expect(await tooManyShared('u1', 'bulkEmail')).toMatch(/paused for/);
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://store.example/pipeline');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)[0][1]).toMatch(/^admin:limit:bulkEmail:u1:\d+$/);
  });

  it('still limits on this server when the store fails or is not set up, and never throws', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));
    const down = await load(true);
    for (let i = 0; i < down.LIMITS.bulkEmail.max; i++) expect(await down.tooManyShared('u1', 'bulkEmail')).toBeNull();
    expect(await down.tooManyShared('u1', 'bulkEmail')).toMatch(/paused for/);

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const none = await load(false);
    expect(await none.tooManyShared('u2', 'refund')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
