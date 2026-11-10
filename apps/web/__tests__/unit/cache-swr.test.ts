import { describe, it, expect, vi, beforeEach } from 'vitest';

// In-memory stand-in for the parts of Upstash Redis that lib/cache.ts uses.
const store = new Map<string, any>();
vi.mock('@upstash/redis', () => ({
  Redis: class {
    async get(key: string) { return store.has(key) ? structuredClone(store.get(key)) : null; }
    async set(key: string, value: any, opts?: { nx?: boolean }) {
      if (opts?.nx && store.has(key)) return null;
      store.set(key, structuredClone(value));
      return 'OK';
    }
    async del(...keys: string[]) { keys.forEach((k) => store.delete(k)); return keys.length; }
    async hincrby() { return 1; }
  },
}));

const afterMock = vi.fn();
vi.mock('next/server', () => ({ after: (cb: () => unknown) => afterMock(cb) }));

const KEY = 'test:entry';
const FULL_KEY = `c1-local:${KEY}`; // VERCEL_ENV is unset in tests

async function loadCache() {
  vi.resetModules();
  return import('../../lib/cache');
}

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  store.clear();
  afterMock.mockReset();
  process.env.UPSTASH_REDIS_REST_URL = 'https://redis.test';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
  delete process.env.VERCEL_ENV;
});

describe('cached() stale-while-revalidate', () => {
  it('returns the stale value immediately and rebuilds after the response', async () => {
    const { cached } = await loadCache();
    store.set(FULL_KEY, { d: JSON.stringify('old'), t: Date.now() - 20_000, c: false });
    const fetcher = vi.fn(async () => 'new');

    const result = await cached(KEY, { ttl: 10, staleTtl: 100 }, fetcher);

    expect(result).toBe('old');
    expect(fetcher).not.toHaveBeenCalled();
    expect(afterMock).toHaveBeenCalledTimes(1);

    await afterMock.mock.calls[0][0]();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.parse(store.get(FULL_KEY).d)).toBe('new');
    expect(store.has(`lk:${FULL_KEY}`)).toBe(false);
  });

  it('skips the rebuild when another process holds the lock', async () => {
    const { cached } = await loadCache();
    store.set(FULL_KEY, { d: JSON.stringify('old'), t: Date.now() - 20_000, c: false });
    store.set(`lk:${FULL_KEY}`, '1');
    const fetcher = vi.fn(async () => 'new');

    expect(await cached(KEY, { ttl: 10, staleTtl: 100 }, fetcher)).toBe('old');
    await afterMock.mock.calls[0][0]();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('falls back to a background rebuild when after() is unavailable', async () => {
    afterMock.mockImplementation(() => { throw new Error('outside request scope'); });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { cached } = await loadCache();
    store.set(FULL_KEY, { d: JSON.stringify('old'), t: Date.now() - 20_000, c: false });
    const fetcher = vi.fn(async () => 'new');

    expect(await cached(KEY, { ttl: 10, staleTtl: 100 }, fetcher)).toBe('old');
    await flush(); await flush();

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.parse(store.get(FULL_KEY).d)).toBe('new');
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('logs a failed background rebuild and keeps the stale value', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { cached } = await loadCache();
    store.set(FULL_KEY, { d: JSON.stringify('old'), t: Date.now() - 20_000, c: false });

    expect(await cached(KEY, { ttl: 10, staleTtl: 100 }, async () => { throw new Error('db down'); })).toBe('old');
    await afterMock.mock.calls[0][0]();

    expect(error).toHaveBeenCalled();
    expect(JSON.parse(store.get(FULL_KEY).d)).toBe('old');
    error.mockRestore();
  });
});

describe('cached() compression', () => {
  it('gzips large entries and reads them back', async () => {
    const { cached } = await loadCache();
    const big = Array.from({ length: 3000 }, (_, i) => ({ id: i, name: `tool-${i}`, description: 'x'.repeat(30) }));

    expect(await cached(KEY, { ttl: 60 }, async () => big)).toEqual(big);
    const entry = store.get(FULL_KEY);
    expect(entry.c).toBe(true);
    expect(entry.d.length).toBeLessThan(JSON.stringify(big).length / 3);

    const fetcher = vi.fn(async () => []);
    expect(await cached(KEY, { ttl: 60 }, fetcher)).toEqual(big);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('stores small entries as plain JSON and still reads entries written before compression', async () => {
    const { cached } = await loadCache();
    expect(await cached(KEY, { ttl: 60 }, async () => ({ a: 1 }))).toEqual({ a: 1 });
    expect(store.get(FULL_KEY).c).toBe(false);

    store.set(FULL_KEY, { d: JSON.stringify({ legacy: true }), t: Date.now() });
    expect(await cached(KEY, { ttl: 60 }, async () => ({ legacy: false }))).toEqual({ legacy: true });
  });
});
