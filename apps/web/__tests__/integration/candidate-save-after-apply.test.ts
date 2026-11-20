import { describe, it, expect, vi, beforeEach } from 'vitest';

const human = vi.hoisted(() => vi.fn());
const appliedEmailFor = vi.hoisted(() => vi.fn());
const claimApplications = vi.hoisted(() => vi.fn());
const createOtp = vi.hoisted(() => vi.fn());
const checkEmailCode = vi.hoisted(() => vi.fn());
const sendCandidateCode = vi.hoisted(() => vi.fn());
const sql = vi.hoisted(() => vi.fn());
const startWebUserSession = vi.hoisted(() => vi.fn());

vi.mock('@/lib/turnstile', () => ({ verifyTurnstileToken: (...a: unknown[]) => human(...a) }));
vi.mock('@/lib/jobs/candidate-account', () => ({
  appliedEmailFor: (...a: unknown[]) => appliedEmailFor(...a),
  claimApplications: (...a: unknown[]) => claimApplications(...a),
  isJobSeekerPath: () => true,
}));
vi.mock('@/lib/otp', () => ({ createOtp: (...a: unknown[]) => createOtp(...a), checkEmailCode: (...a: unknown[]) => checkEmailCode(...a) }));
vi.mock('@/lib/jobs/candidate-emails', () => ({ sendCandidateCode: (...a: unknown[]) => sendCandidateCode(...a) }));
vi.mock('@/lib/db', () => ({ sql: (...a: unknown[]) => sql(...a) }));
vi.mock('@/lib/rate-limit', () => ({ authRateLimit: null, checkRateLimit: async () => ({ success: true }), getClientIdentifier: () => '1.2.3.4' }));
vi.mock('@/lib/auth/second-factor', () => ({ secondFactorChallenge: async () => null }));
vi.mock('@/lib/auth/web-user-session', () => ({ startWebUserSession: (...a: unknown[]) => startWebUserSession(...a) }));

const post = async (body: Record<string, unknown>) => {
  const { POST } = await import('@/app/api/user/auth/email-code/route');
  return POST(new Request('http://x/api/user/auth/email-code', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) as any);
};

describe('saving an application to an account right after applying', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    human.mockResolvedValue(false); // no human-check token is ever sent in these tests
    createOtp.mockResolvedValue({ otp: '123456' });
    claimApplications.mockResolvedValue(1);
  });

  it('emails a code to the address they just applied with, without a second human check', async () => {
    appliedEmailFor.mockResolvedValue('asha@example.com');
    const res = await post({ action: 'send', email: 'Asha@Example.com', applyToken: 'signed-apply-session' });
    expect(res.status).toBe(200);
    expect(sendCandidateCode).toHaveBeenCalledWith(expect.objectContaining({ to: 'asha@example.com' }));
  });

  it('still asks for the human check for any other address, or with no valid apply session', async () => {
    appliedEmailFor.mockResolvedValue('asha@example.com');
    expect((await post({ action: 'send', email: 'someone-else@example.com', applyToken: 'signed-apply-session' })).status).toBe(400);
    appliedEmailFor.mockResolvedValue(null);
    expect((await post({ action: 'send', email: 'asha@example.com', applyToken: 'expired-or-forged' })).status).toBe(400);
    expect((await post({ action: 'send', email: 'asha@example.com' })).status).toBe(400);
    expect(sendCandidateCode).not.toHaveBeenCalled();
  });

  it('attaches their earlier guest applications the moment the code signs them in', async () => {
    checkEmailCode.mockResolvedValue({ ok: true });
    sql.mockResolvedValueOnce([{ id: 'u1', email: 'asha@example.com', name: 'Asha', isActive: true, deactivatedAt: null, onboardingCompleted: true }]).mockResolvedValue([]);
    const res = await post({ action: 'verify', email: 'asha@example.com', code: '123456', returnTo: '/my-applications', agreeToTerms: true });
    expect(res.status).toBe(200);
    expect(claimApplications).toHaveBeenCalledWith({ id: 'u1', email: 'asha@example.com', name: 'Asha', emailVerified: true });
    expect(startWebUserSession).toHaveBeenCalledTimes(1);
  });

  it('a wrong code attaches nothing', async () => {
    checkEmailCode.mockResolvedValue({ ok: false, reason: 'wrong', left: 2 });
    expect((await post({ action: 'verify', email: 'asha@example.com', code: '000000' })).status).toBe(400);
    expect(claimApplications).not.toHaveBeenCalled();
  });
});
