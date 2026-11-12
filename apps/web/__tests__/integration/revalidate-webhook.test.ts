import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const revalidatePath = vi.fn();
vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));
// Never reach the real Redis from tests; record which cache keys the webhook clears.
const invalidateCache = vi.fn(async (..._keys: string[]) => {});
vi.mock('@/lib/cache', () => ({ invalidateCache: (...k: string[]) => invalidateCache(...k), cached: (_k: string, _o: unknown, f: () => unknown) => f() }));

const call = async (body: unknown, auth?: string) => {
  const { POST } = await import('@/app/api/webhooks/revalidate/route');
  return POST(new Request('http://x/api/webhooks/revalidate', { method: 'POST', headers: { 'content-type': 'application/json', ...(auth ? { authorization: auth } : {}) }, body: JSON.stringify(body) }) as any);
};

describe('POST /api/webhooks/revalidate (admin → web page refresh)', () => {
  beforeEach(() => { revalidatePath.mockClear(); invalidateCache.mockClear(); vi.stubEnv('INTERNAL_API_SECRET', 'test-secret-1234567890'); });
  afterEach(() => vi.unstubAllEnvs());

  it('fails closed: no secret configured, missing or wrong token', async () => {
    expect((await call({ sections: ['news'] })).status).toBe(401);
    expect((await call({ sections: ['news'] }, 'Bearer wrong')).status).toBe(401);
    vi.stubEnv('INTERNAL_API_SECRET', '');
    expect((await call({ sections: ['news'] }, 'Bearer ')).status).toBe(401);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('refreshes known sections (including the (public) route group) and the homepage', async () => {
    const res = await call({ sections: ['news', 'home', 'not-a-section'] }, 'Bearer test-secret-1234567890');
    expect(res.status).toBe(200);
    expect(revalidatePath).toHaveBeenCalledWith('/news', 'layout');
    expect(revalidatePath).toHaveBeenCalledWith('/(public)/news', 'layout');
    expect(revalidatePath).toHaveBeenCalledWith('/');
    expect(revalidatePath.mock.calls.some((c) => String(c[0]).includes('not-a-section'))).toBe(false);
  });

  it('"all" refreshes everything; paths must be plain site paths', async () => {
    await call({ sections: ['all'], paths: ['/jobs/abc', 'https://evil.com', '/x?y=<script>'] }, 'Bearer test-secret-1234567890');
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout');
    expect(revalidatePath).toHaveBeenCalledWith('/jobs/abc');
    expect(revalidatePath).not.toHaveBeenCalledWith('https://evil.com');
    expect(revalidatePath.mock.calls.some((c) => String(c[0]).includes('script'))).toBe(false);
  });

  it('rejects an empty request', async () => {
    expect((await call({}, 'Bearer test-secret-1234567890')).status).toBe(400);
  });

  it('clears the cached funding round list when funding or startups change, and only then', async () => {
    await call({ sections: ['news'] }, 'Bearer test-secret-1234567890');
    expect(invalidateCache).not.toHaveBeenCalled();
    await call({ sections: ['funding'] }, 'Bearer test-secret-1234567890');
    expect(invalidateCache).toHaveBeenCalledWith('funding:rounds:v1');
    invalidateCache.mockClear();
    await call({ sections: ['startups'] }, 'Bearer test-secret-1234567890');
    expect(invalidateCache).toHaveBeenCalledWith('funding:rounds:v1');
  });
});
