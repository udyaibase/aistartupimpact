import { describe, it, expect, vi, beforeEach } from 'vitest';

const findMany = vi.fn();
const emailCodeAllowed = vi.fn();
const resendPendingInvites = vi.fn();
const sendMemberLoginCode = vi.fn();
const sql = vi.fn();
const update = vi.fn();
const checkDomainCode = vi.fn();

vi.mock('@udyaibase/database', () => ({ prisma: { jobBoardTeamMember: { findMany: (...a: unknown[]) => findMany(...a), update: (...a: unknown[]) => update(...a) } } }));
vi.mock('@/lib/db', () => ({ sql: (...a: unknown[]) => sql(...a) }));
vi.mock('@/lib/employer-auth', () => ({ setEmployerSession: vi.fn() }));
vi.mock('@/lib/startups/domain-otp', () => ({ checkDomainCode: (...a: unknown[]) => checkDomainCode(...a) }));
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

const post = async (body: Record<string, string>) => {
  const { POST } = await import('@/app/api/employer/auth/member-code/route');
  return POST(new Request('http://x/api/employer/auth/member-code', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) as any);
};
const send = (email: string) => post({ step: 'send', email });
const verify = (email: string) => post({ step: 'verify', email, code: '123456' });

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

  it('an account owner with two-step sign-in gets a code, then must pass two-step (a code alone never signs them in)', async () => {
    const owner = [{ id: 'm1', employerId: 'e1', role: 'OWNER', status: 'ACTIVE', email: 'priya@acme.ai', Employer: { id: 'e1', email: 'priya@acme.ai', twoFactorEnabled: true } }];
    findMany.mockResolvedValue(owner);
    expect((await send('priya@acme.ai')).status).toBe(200);
    expect(sendMemberLoginCode).toHaveBeenCalledTimes(1);
    checkDomainCode.mockResolvedValue({ ok: true });
    const d = await (await verify('priya@acme.ai')).json();
    expect(d.requires2FA).toBe(true);
    expect(typeof d.challengeToken).toBe('string');
    expect(d.redirect).toBeUndefined();
  });

  it('entering the code accepts a pending invite', async () => {
    findMany.mockResolvedValue([{ id: 'm3', employerId: 'e1', role: 'RECRUITER', status: 'PENDING', email: 'rahul@acme.ai', Employer: { id: 'e1', email: 'owner@acme.ai', companyName: 'Acme', slug: 'acme', plan: 'FREE', twoFactorEnabled: false } }]);
    checkDomainCode.mockResolvedValue({ ok: true });
    const d = await (await verify('rahul@acme.ai')).json();
    expect(d.redirect).toBe('/employer/dashboard');
    expect(update.mock.calls[0][0].data).toMatchObject({ status: 'ACTIVE', inviteTokenHash: null });
  });

  it('a wrong code never signs anyone in', async () => {
    findMany.mockResolvedValue([{ id: 'm3', employerId: 'e1', role: 'RECRUITER', status: 'ACTIVE', email: 'rahul@acme.ai', Employer: { id: 'e1', email: 'owner@acme.ai', twoFactorEnabled: false } }]);
    checkDomainCode.mockResolvedValue({ ok: false, status: 400, error: 'Incorrect code.' });
    const res = await verify('rahul@acme.ai');
    expect(res.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it('active teammates get a sign-in code, not an invitation', async () => {
    findMany.mockResolvedValue([{ id: 'm1', employerId: 'e1', role: 'RECRUITER', email: 'rahul@acme.ai', Employer: { id: 'e1', email: 'owner@acme.ai', twoFactorEnabled: true } }]);
    const res = await send('rahul@acme.ai');
    expect(res.status).toBe(200);
    expect(sendMemberLoginCode).toHaveBeenCalledTimes(1);
    expect(resendPendingInvites).not.toHaveBeenCalled();
  });
});
