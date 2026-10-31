import { describe, it, expect, vi, beforeEach } from 'vitest';

const findMany = vi.fn();
const emailCodeAllowed = vi.fn();
const resendPendingInvites = vi.fn();
const sendMemberLoginCode = vi.fn();
const sql = vi.fn();

vi.mock('@udyaibase/database', () => ({ prisma: { jobBoardTeamMember: { findMany: (...a: unknown[]) => findMany(...a), update: vi.fn() } } }));
vi.mock('@/lib/db', () => ({ sql: (...a: unknown[]) => sql(...a) }));
vi.mock('@/lib/employer-auth', () => ({ setEmployerSession: vi.fn() }));
vi.mock('@/lib/startups/domain-otp', () => ({ checkDomainCode: vi.fn() }));
vi.mock('@/lib/employer/team', () => ({
  resendPendingInvites: (...a: unknown[]) => resendPendingInvites(...a),
  sendMemberLoginCode: (...a: unknown[]) => sendMemberLoginCode(...a),
}));
vi.mock('@/lib/rate-limit', () => ({
  authRateLimit: null,
  checkRateLimit: async () => ({ success: true }),
  getClientIdentifier: () => '1.2.3.4',
  emailCodeAllowed: (...a: unknown[]) => emailCodeAllowed(...a),
}));

const send = async (email: string) => {
  const { POST } = await import('@/app/api/employer/auth/member-code/route');
  return POST(new Request('http://x/api/employer/auth/member-code', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ step: 'send', email }) }) as any);
};

describe('POST /api/employer/auth/member-code (send)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    emailCodeAllowed.mockResolvedValue(true);
    sql.mockResolvedValue([]);
  });

  it('limits codes per email, before revealing anything about the address', async () => {
    emailCodeAllowed.mockResolvedValue(false);
    findMany.mockResolvedValue([]);
    const res = await send('someone@acme.ai');
    expect(res.status).toBe(429);
    expect(resendPendingInvites).not.toHaveBeenCalled();
    expect(sendMemberLoginCode).not.toHaveBeenCalled();
  });

  it('someone invited but not yet joined gets the invitation again, with the same generic answer', async () => {
    findMany.mockResolvedValue([]);
    const invited = await (await send('new@acme.ai')).json();
    expect(resendPendingInvites).toHaveBeenCalledWith('new@acme.ai');
    expect(sendMemberLoginCode).not.toHaveBeenCalled();

    resendPendingInvites.mockClear();
    findMany.mockResolvedValue([]);
    const stranger = await (await send('nobody@acme.ai')).json();
    expect(stranger.message).toBe(invited.message);
  });

  it('active teammates get a sign-in code, not an invitation', async () => {
    findMany.mockResolvedValue([{ id: 'm1', employerId: 'e1', role: 'RECRUITER', email: 'rahul@acme.ai', Employer: { id: 'e1' } }]);
    const res = await send('rahul@acme.ai');
    expect(res.status).toBe(200);
    expect(sendMemberLoginCode).toHaveBeenCalledTimes(1);
    expect(resendPendingInvites).not.toHaveBeenCalled();
  });
});
