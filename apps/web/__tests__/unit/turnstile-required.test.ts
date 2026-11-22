import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Public forms that email someone or create records must pass the Turnstile bot check. A missing token fails:
 * several routes used to check only when a token was sent, so a bot could just leave it out.
 */
describe('humanCheckFailed', () => {
  const realFetch = global.fetch;
  beforeEach(() => { vi.resetModules(); process.env.TURNSTILE_SECRET_KEY = 'test-secret'; });
  afterEach(() => { global.fetch = realFetch; delete process.env.TURNSTILE_SECRET_KEY; });

  it('refuses a request with no token, without asking Cloudflare', async () => {
    global.fetch = vi.fn() as any;
    const { humanCheckFailed } = await import('@/lib/turnstile');
    for (const t of [undefined, null, '', 42]) {
      const res = await humanCheckFailed(t);
      expect(res?.status).toBe(400);
      expect((await res!.json()).code).toBe('captcha');
    }
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('refuses a token Cloudflare rejects, and lets a passed one through', async () => {
    global.fetch = vi.fn(async (_u: any, init: any) => {
      const token = new URLSearchParams(init.body).get('response');
      return { json: async () => ({ success: token === 'good' }) } as any;
    }) as any;
    const { humanCheckFailed } = await import('@/lib/turnstile');
    expect((await humanCheckFailed('bad'))?.status).toBe(400);
    expect(await humanCheckFailed('good')).toBeNull();
  });

  it('local setups without keys are not blocked', async () => {
    delete process.env.TURNSTILE_SECRET_KEY;
    const { humanCheckFailed } = await import('@/lib/turnstile');
    expect(await humanCheckFailed(undefined)).toBeNull();
  });
});
