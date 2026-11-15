import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('@udyaibase/database', () => ({ prisma: {} }));
vi.mock('@/lib/founder-auth', () => ({ getFounderSession: vi.fn(async () => ({ userId: 'f1', email: 'f@x.co', name: 'F', onboardingCompleted: true })) }));
vi.mock('@/lib/db', () => ({ sql: vi.fn(async () => []) }));

const post = (body: unknown) => new Request('https://udyaibase.com/x', { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }) as never;

describe('self-serve advertising purchases', () => {
  afterEach(() => { delete process.env.ADVERTISE_SELF_SERVE; });

  it.each([
    ['package purchase', '@/app/api/founder/advertise/route', { tier: 'STARTER' }],
    ['package upgrade', '@/app/api/founder/advertise/upgrade/route', { toTier: 'PREMIUM' }],
    ['zone extension', '@/app/api/founder/advertise/zones/extend/route', { activationId: 'a', extraDays: 5 }],
    ['zone activation', '@/app/api/founder/advertise/zones/activate/route', { zone: 'HOMEPAGE_HERO' }],
    ['social post', '@/app/api/founder/advertise/social-posts/route', { postType: 'LINKEDIN' }],
  ])('%s is refused while the flow is switched off', async (_name, path, body) => {
    const { POST } = await import(path);
    const res = await POST(post(body));
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe('ADS_UNAVAILABLE');
  });
});
