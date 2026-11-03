import { describe, it, expect, vi, beforeEach } from 'vitest';

const m = vi.hoisted(() => ({
  me: vi.fn(), startup: vi.fn(), team: vi.fn(), update: vi.fn(),
  session: { current: { id: 'e1', role: 'OWNER' } as null | { id: string; role: string } },
}));
vi.mock('@udyaibase/database', () => ({
  prisma: {
    jobBoardEmployer: { findUnique: m.me, findFirst: m.team, update: m.update },
    startup: { findFirst: m.startup },
  },
}));
vi.mock('@/lib/employer-auth', () => ({ getEmployerSession: async () => m.session.current }));
vi.mock('@/lib/rate-limit', () => ({ apiRateLimit: null, checkRateLimit: async () => ({ success: true }) }));

const call = async () => {
  const { POST } = await import('@/app/api/employer/claim/link/route');
  return POST(new Request('http://x/api/employer/claim/link', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ startupId: 's1' }) }) as any);
};

describe('POST /api/employer/claim/link (link only; founders verify)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.session.current = { id: 'e1', role: 'OWNER' };
    m.me.mockResolvedValue({ startupId: null, startupClaimMethod: null });
    m.startup.mockResolvedValue({ id: 's1', name: 'NeuralPay', slug: 'neuralpay', isVerified: false });
    m.team.mockResolvedValue(null);
  });

  it('links without granting any verification', async () => {
    expect((await call()).status).toBe(200);
    expect(m.update.mock.calls[0][0].data).toEqual({ startupId: 's1', startupClaimMethod: null, startupClaimVerifiedAt: null });
  });

  it('a startup whose own team already hires here → ask to be invited instead', async () => {
    m.team.mockResolvedValue({ id: 'e2' });
    const res = await call();
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('team_exists');
    expect(m.update).not.toHaveBeenCalled();
  });

  it('owners only', async () => {
    m.session.current = { id: 'e1', role: 'RECRUITER' };
    expect((await call()).status).toBe(403);
  });
});
