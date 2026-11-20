import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';

const sql = vi.hoisted(() => vi.fn());
const setEmployerSession = vi.hoisted(() => vi.fn());
vi.mock('@/lib/db', () => ({ sql: (...a: unknown[]) => sql(...a) }));
vi.mock('@/lib/turnstile', () => ({ verifyTurnstileToken: async () => true }));
vi.mock('@/lib/rate-limit', () => ({ authRateLimit: null, checkRateLimit: async () => ({ success: true }), getClientIdentifier: () => '1.2.3.4' }));
vi.mock('@/lib/employer-auth', () => ({ setEmployerSession }));
vi.mock('@/lib/workspace-activity', () => ({ logEmployerActivity: vi.fn() }));
vi.mock('@/lib/email/send', () => ({ sendEmailFireAndForget: vi.fn() }));
vi.mock('@udyaibase/utils', () => ({ securityAlertHtml: () => '' }));
vi.mock('@/lib/employer/owners', () => ({ ensureOwnerMember: vi.fn(async () => {}), CODE_ONLY_MARKER: '!code-only' }));
vi.mock('@/lib/employer/founder-workspace', () => ({ FOUNDER_SSO_MARKER: '!founder-sso' }));
vi.mock('@/lib/employer/sign-in', () => ({ passwordSignInOpen: () => true, twoFactorChallenge: async () => 'challenge' }));

const PASSWORD = 'Right-Password-1';
const hash = bcrypt.hashSync(PASSWORD, 4);
const account = (over: Record<string, unknown> = {}) => ({
  id: 'e1', companyName: 'Acme', slug: 'acme', email: 'owner@acme.test', passwordHash: hash, plan: 'FREE', isActive: true, emailVerified: true,
  failedLoginAttempts: 0, lockedUntil: null, twoFactorEnabled: false, deactivatedAt: null, onboardingCompleted: true, ...over,
});
/** The first query finds the account; later ones are updates. */
const found = (row: Record<string, unknown> | null) => { sql.mockReset(); sql.mockResolvedValueOnce(row ? [row] : []).mockResolvedValue([]); };

const login = async (password: string) => {
  const { POST } = await import('@/app/api/employer/auth/login/route');
  const res = await POST(new Request('http://x/api/employer/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'owner@acme.test', password, turnstileToken: 't' }),
  }) as any);
  return { status: res.status, body: JSON.stringify(await res.json()) };
};

describe('POST /api/employer/auth/login: one answer for every failure', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('no account, wrong password, locked, founder-only, code-only and suspended-with-wrong-password all look the same', async () => {
    const answers: { status: number; body: string }[] = [];
    found(null); answers.push(await login('whatever'));
    found(account()); answers.push(await login('wrong'));
    found(account({ failedLoginAttempts: 4 })); answers.push(await login('wrong')); // the attempt that locks
    found(account({ lockedUntil: new Date(Date.now() + 600_000).toISOString().replace('Z', '') })); answers.push(await login(PASSWORD));
    found(account({ passwordHash: '!founder-sso' })); answers.push(await login('whatever'));
    found(account({ passwordHash: '!code-only' })); answers.push(await login('whatever'));
    found(account({ isActive: false })); answers.push(await login('wrong'));

    expect(new Set(answers.map((a) => `${a.status} ${a.body}`)).size).toBe(1);
    expect(answers[0].status).toBe(401);
    expect(answers[0].body).not.toMatch(/attempt|locked|suspended|founder/i);
    expect(setEmployerSession).not.toHaveBeenCalled();
  });

  it('the right password signs in', async () => {
    found(account());
    expect((await login(PASSWORD)).status).toBe(200);
    expect(setEmployerSession).toHaveBeenCalledTimes(1);
  });

  it('an account whose email was never confirmed gets no session from a password', async () => {
    found(account({ emailVerified: false }));
    const r = await login(PASSWORD);
    expect(r.status).toBe(403);
    expect(r.body).toContain('useCode');
    expect(setEmployerSession).not.toHaveBeenCalled();
  });

  it('a deactivated workspace is not brought back by a password', async () => {
    found(account({ deactivatedAt: new Date().toISOString() }));
    const r = await login(PASSWORD);
    expect(r.status).toBe(403);
    expect(setEmployerSession).not.toHaveBeenCalled();
  });
});
