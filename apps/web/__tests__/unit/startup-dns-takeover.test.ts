import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { queryRaw, executeRaw, verifyDNS, markStartupVerified, recordTakeover } = vi.hoisted(() => ({
  queryRaw: vi.fn(), executeRaw: vi.fn(), verifyDNS: vi.fn(), markStartupVerified: vi.fn(async () => {}), recordTakeover: vi.fn(async () => {}),
}));
vi.mock('@udyaibase/database', () => ({ prisma: { $queryRaw: queryRaw, $executeRaw: executeRaw } }));
vi.mock('@/lib/founder-auth', () => ({ getFounderSession: async () => ({ userId: 'new', name: 'New' }) }));
// The route limits DNS checks per founder; the limiter itself is not under test (and must not reach a real store).
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: async () => ({ success: true, reset: 0 }), rateLimitMessage: () => '', retryAfterHeaders: () => ({}), dnsCheckRateLimit: null }));
vi.mock('@udyaibase/utils/src/verification/dns', () => ({ verifyDNS }));
vi.mock('@/lib/startups/claim', () => ({ claimToken: (_s: unknown, who: string) => `tok-${who}` }));
vi.mock('@/lib/founder/limits', () => ({ founderAtStartupLimit: async () => false, STARTUP_LIMIT_MESSAGE: 'limit' }));
vi.mock('@/lib/founder/activity', () => ({ logFounderActivity: vi.fn(async () => {}) }));
vi.mock('@/lib/startups/ownership', () => ({ markStartupVerified }));
vi.mock('@/lib/founder/refresh-listing', () => ({ refreshPublicListing: vi.fn(async () => {}) }));
vi.mock('@/lib/startups/verification-lifecycle', () => ({ recordTakeover }));
vi.mock('@/lib/client-ip', () => ({ clientIp: () => '1.2.3.4' }));

import { GET } from '@/app/api/founder/startups/[id]/verify/route';

const call = () => GET(new NextRequest('http://x/api/founder/startups/s1/verify'), { params: Promise.resolve({ id: 's1' }) });
const row = (over: Record<string, unknown>) => ({
  id: 's1', name: 'Acme', websiteUrl: 'https://acme.ai', isVerified: true, ownerId: 'old', verificationToken: 'tok-old', verifiedDomain: 'acme.ai', ...over,
});

beforeEach(() => {
  queryRaw.mockReset(); executeRaw.mockReset(); verifyDNS.mockReset(); markStartupVerified.mockClear(); recordTakeover.mockClear();
  executeRaw.mockResolvedValue(1);
});

describe('DNS verification and takeovers', () => {
  it('DNS takes over a startup verified only by a work email, and the previous owner is told', async () => {
    queryRaw.mockResolvedValue([row({ verificationMethod: 'EMAIL' })]);
    verifyDNS.mockResolvedValue({ verified: true });
    const res = await call();
    expect((await res.json()).verified).toBe(true);
    expect(markStartupVerified).toHaveBeenCalledWith(expect.anything(), 's1', 'acme.ai', 'new', expect.objectContaining({ method: 'DNS', token: 'tok-new' }));
    expect(recordTakeover).toHaveBeenCalledWith(expect.objectContaining({ previousOwnerId: 'old', newOwnerId: 'new', previousMethod: 'EMAIL' }));
  });

  it('DNS against DNS is refused while the current owner’s record is still on the domain', async () => {
    queryRaw.mockResolvedValue([row({ verificationMethod: 'DNS' })]);
    verifyDNS.mockImplementation(async (_d: string, token: string) => ({ verified: token === 'tok-old' || token === 'tok-new' }));
    const res = await call();
    expect(res.status).toBe(403);
    expect(markStartupVerified).not.toHaveBeenCalled();
  });

  it('DNS against DNS succeeds once the old record is gone (the domain changed hands)', async () => {
    queryRaw.mockResolvedValue([row({ verificationMethod: 'DNS' })]);
    verifyDNS.mockImplementation(async (_d: string, token: string) => ({ verified: token === 'tok-new' }));
    const res = await call();
    expect((await res.json()).verified).toBe(true);
    expect(recordTakeover).toHaveBeenCalledWith(expect.objectContaining({ previousMethod: 'DNS' }));
  });

  it('a resolver failure while checking the old record never hands the startup over', async () => {
    queryRaw.mockResolvedValue([row({ verificationMethod: 'DNS' })]);
    verifyDNS.mockResolvedValue({ verified: false, lookupFailed: true });
    const res = await call();
    expect(res.status).toBe(503);
    expect(markStartupVerified).not.toHaveBeenCalled();
  });

  it('the owner checking again renews (no takeover)', async () => {
    queryRaw.mockResolvedValue([row({ ownerId: 'new', verificationToken: 'tok-new', verificationMethod: 'DNS' })]);
    verifyDNS.mockResolvedValue({ verified: true });
    const res = await call();
    expect((await res.json()).verified).toBe(true);
    expect(recordTakeover).not.toHaveBeenCalled();
  });
});
