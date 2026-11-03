import { describe, it, expect, vi, beforeEach } from 'vitest';

const m = vi.hoisted(() => ({
  signupEmail: vi.fn(), setSignupPass: vi.fn(), sendSignupCode: vi.fn(), companyOptions: vi.fn(),
  requestToJoin: vi.fn(), createWorkspace: vi.fn(), addCompany: vi.fn(), continueToTeam: vi.fn(), searchStartups: vi.fn(),
  checkDomainCode: vi.fn(), verifyTurnstileToken: vi.fn(), emailCodeAllowed: vi.fn(), startupFind: vi.fn(),
}));
vi.mock('@/lib/employer/signup', () => ({ ...m, SIGNUP_PURPOSE: 'employer_signup_code' }));
vi.mock('@/lib/startups/domain-otp', () => ({ checkDomainCode: m.checkDomainCode }));
vi.mock('@/lib/turnstile', () => ({ verifyTurnstileToken: m.verifyTurnstileToken }));
vi.mock('@udyaibase/utils', () => ({ isDisposableEmail: (e: string) => e.endsWith('@mailinator.com') }));
vi.mock('@udyaibase/database', () => ({ prisma: { startup: { findFirst: m.startupFind } } }));
vi.mock('@/lib/rate-limit', () => ({
  authRateLimit: null, companyCreateRateLimit: null, getClientIdentifier: () => '1.2.3.4',
  checkRateLimit: async () => ({ success: true }), emailCodeAllowed: m.emailCodeAllowed,
}));

const post = async (body: Record<string, unknown>) => {
  const { POST } = await import('@/app/api/employer/signup/route');
  return POST(new Request('http://x/api/employer/signup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) as any);
};
const neuralpay = { id: 's1', name: 'NeuralPay', logoUrl: null, websiteUrl: 'https://neuralpay.in', headquartersCity: 'Bengaluru', tagline: 'x' };

describe('POST /api/employer/signup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.verifyTurnstileToken.mockResolvedValue(true);
    m.emailCodeAllowed.mockResolvedValue(true);
    m.sendSignupCode.mockResolvedValue({ ok: true });
  });

  it('code: needs a real email, the human check and the per-email limit', async () => {
    expect((await post({ action: 'code', email: 'nope', turnstileToken: 't' })).status).toBe(400);
    expect((await post({ action: 'code', email: 'a@mailinator.com', turnstileToken: 't' })).status).toBe(400);
    m.verifyTurnstileToken.mockResolvedValue(false);
    expect((await post({ action: 'code', email: 'priya@neuralpay.in', turnstileToken: 't' })).status).toBe(403);
    m.verifyTurnstileToken.mockResolvedValue(true);
    m.emailCodeAllowed.mockResolvedValue(false);
    expect((await post({ action: 'code', email: 'priya@neuralpay.in', turnstileToken: 't' })).status).toBe(429);
    expect(m.sendSignupCode).not.toHaveBeenCalled();
  });

  it('verify: a correct code sets the pass and returns the company options; a wrong one does not', async () => {
    m.checkDomainCode.mockResolvedValue({ ok: false, status: 400, error: 'Invalid code.' });
    expect((await post({ action: 'verify', email: 'priya@neuralpay.in', code: '111111' })).status).toBe(400);
    expect(m.setSignupPass).not.toHaveBeenCalled();
    m.checkDomainCode.mockResolvedValue({ ok: true });
    m.companyOptions.mockResolvedValue({ matches: [{ id: 's1' }], teams: [] });
    const d = await (await post({ action: 'verify', email: 'priya@neuralpay.in', code: '123456' })).json();
    expect(m.setSignupPass).toHaveBeenCalledWith('priya@neuralpay.in');
    expect(d.matches).toHaveLength(1);
  });

  it('every later step needs the verified-email pass', async () => {
    m.signupEmail.mockResolvedValue(null);
    for (const action of ['options', 'search', 'workspace', 'company', 'continue']) {
      const res = await post({ action, startupId: 's1', name: 'X', websiteUrl: 'x.ai', employerId: 'e1' });
      expect(res.status).toBe(401);
    }
    expect(m.createWorkspace).not.toHaveBeenCalled();
    expect(m.requestToJoin).not.toHaveBeenCalled();
  });

  it('workspace: a startup that already hires here gets a join request, not a second workspace', async () => {
    m.signupEmail.mockResolvedValue('priya@neuralpay.in');
    m.startupFind.mockResolvedValue(neuralpay);
    m.requestToJoin.mockResolvedValue({ requested: true, company: 'NeuralPay' });
    const d = await (await post({ action: 'workspace', startupId: 's1' })).json();
    expect(d.requested).toBe(true);
    expect(m.createWorkspace).not.toHaveBeenCalled();
  });

  it('workspace: no team yet → a new workspace, then the first-job page', async () => {
    m.signupEmail.mockResolvedValue('priya@neuralpay.in');
    m.startupFind.mockResolvedValue(neuralpay);
    m.requestToJoin.mockResolvedValue({ noTeam: true });
    m.createWorkspace.mockResolvedValue({ employerId: 'e9' });
    const d = await (await post({ action: 'workspace', startupId: 's1' })).json();
    expect(d).toMatchObject({ created: true, redirect: '/employer/jobs/new?welcome=1' });
  });
});
