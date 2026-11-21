import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

vi.hoisted(() => {
  process.env.USER_JWT_SECRET = 'test-user-secret-min-32-characters-long!!';
  process.env.FOUNDER_JWT_SECRET = 'test-founder-secret-min-32-characters-long';
});

vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, set: vi.fn(), delete: vi.fn() }) }));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(async () => ({ success: true, remaining: 9, reset: 0 })), getClientIdentifier: () => 'ip',
  authRateLimit: null, emailLinkRateLimit: null,
}));
vi.mock('@/lib/turnstile', () => ({ verifyTurnstileToken: vi.fn(async () => true) }));
vi.mock('@/lib/founder/activity', () => ({ logFounderSignIn: vi.fn(), logFounderSignInFailed: vi.fn(), logFounderActivity: vi.fn() }));
vi.mock('@/lib/auth/second-factor', () => ({ secondFactorChallenge: vi.fn(async () => null) }));
vi.mock('@/lib/auth/account-two-factor', () => ({ isTwoFactorOn: vi.fn(async () => false) }));
vi.mock('@/lib/email/send', () => ({ sendEmailFireAndForget: vi.fn() }));
vi.mock('@/lib/client-ip', () => ({ clientIp: () => '1.2.3.4' }));
vi.mock('@udyaibase/utils', () => ({ accountLockoutHtml: () => '' }));
const sentReset = vi.hoisted(() => [] as string[]);
const sentVerify = vi.hoisted(() => [] as string[]);
vi.mock('@/lib/founder-email', () => ({
  sendPasswordResetEmail: async (_e: string, _n: string, token: string) => { sentReset.push(token); },
  sendVerificationEmail: async (_e: string, _n: string, token: string) => { sentVerify.push(token); },
}));
const google = vi.hoisted(() => ({ verify: vi.fn() }));
vi.mock('@/lib/google-oauth', () => ({
  verifyGoogleToken: (c: string) => google.verify(c), isCompanyEmail: () => true, extractCompanyDomain: () => 'startup.test',
  getCompanyNameFromDomain: () => 'Startup', getGoogleAuthUrl: (state: string) => `https://accounts.google.com/o/oauth2/v2/auth?state=${encodeURIComponent(state)}`,
}));
const setFounderSession = vi.fn();
vi.mock('@/lib/founder-auth', () => ({ setFounderSession: (...a: unknown[]) => setFounderSession(...a), getFounderSession: vi.fn(async () => null) }));
vi.mock('@/lib/auth/set-password', () => ({ setAccountPassword: vi.fn() }));

// Raw SQL: answer by table, and keep every statement.
const tables = vi.hoisted(() => ({ WebUser: [] as Record<string, unknown>[], FounderUser: [] as Record<string, unknown>[], EventOrganizer: [] as Record<string, unknown>[] }));
const statements = vi.hoisted(() => [] as { text: string; values: unknown[] }[]);
vi.mock('@/lib/db', () => ({
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join('?');
    statements.push({ text, values });
    if (!/^\s*SELECT/i.test(text)) return Promise.resolve([]);
    const table = (['WebUser', 'FounderUser', 'EventOrganizer'] as const).find((t) => text.includes(`FROM "${t}"`));
    return Promise.resolve(table ? tables[table] : []);
  },
}));
const db = vi.hoisted(() => ({ founderUser: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() } }));
vi.mock('@udyaibase/database', () => ({ prisma: db }));

import { POST as login } from '@/app/api/user/auth/login/route';
import { POST as forgot } from '@/app/api/founder/auth/forgot-password/route';
import { POST as reset } from '@/app/api/founder/auth/reset-password/route';
import { POST as resend } from '@/app/api/founder/auth/resend-verification/route';
import { POST as verify } from '@/app/api/founder/auth/verify/route';
import { GET as googleStart } from '@/app/api/founder/auth/google/route';
import { GET as googleCallback } from '@/app/api/founder/auth/google/callback/route';
import { clearOAuthState, readOAuthState, startOAuthState } from '@/lib/auth/oauth-state';
import { siteOnboarding } from '@/lib/auth/site-onboarding';

const post = (url: string, body: unknown) => new NextRequest(`http://localhost${url}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const PASSWORD = 'Correct-Horse-9';
let hash = '';
const tryLogin = async (email: string, password: string) => {
  const res = await login(post('/api/user/auth/login', { email, password, turnstileToken: 't' }));
  return { status: res.status, body: await res.json() };
};
const sha = (v: string) => crypto.createHash('sha256').update(v).digest('hex');

describe('sign-in (Phase 4)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    hash ||= await bcrypt.hash(PASSWORD, 4);
    tables.WebUser = []; tables.FounderUser = []; tables.EventOrganizer = [];
    statements.length = 0; sentReset.length = 0; sentVerify.length = 0;
  });

  describe('one answer for every failed sign-in', () => {
    const founder = (over: Record<string, unknown> = {}) => ({ id: 'f1', email: 'meera@startup.test', name: 'Meera', passwordHash: hash, status: 'ACTIVE', emailVerified: true, failedLoginAttempts: 0, lockedUntil: null, ...over });

    it('unknown email, wrong password and a Google-only account all look the same', async () => {
      const unknown = await tryLogin('nobody@startup.test', PASSWORD);
      tables.FounderUser = [founder()];
      const wrong = await tryLogin('meera@startup.test', 'wrong-password');
      tables.FounderUser = [founder({ passwordHash: null })];
      const googleOnly = await tryLogin('meera@startup.test', PASSWORD);
      expect(unknown).toEqual({ status: 401, body: { error: 'Email or password is incorrect.' } });
      expect(wrong).toEqual(unknown);
      expect(googleOnly).toEqual(unknown);
    });

    it('a wrong password no longer says how many attempts are left', async () => {
      tables.FounderUser = [founder({ failedLoginAttempts: 2 })];
      expect(JSON.stringify((await tryLogin('meera@startup.test', 'wrong')).body)).not.toMatch(/attempt/i);
    });

    it('a suspended or unverified account is only revealed to someone with the right password', async () => {
      tables.FounderUser = [founder({ status: 'SUSPENDED' })];
      expect((await tryLogin('meera@startup.test', 'wrong')).body).toEqual({ error: 'Email or password is incorrect.' });
      expect((await tryLogin('meera@startup.test', PASSWORD)).body.error).toMatch(/suspended/i);
      tables.FounderUser = [founder({ emailVerified: false })];
      expect((await tryLogin('meera@startup.test', 'wrong')).body).toEqual({ error: 'Email or password is incorrect.' });
      expect((await tryLogin('meera@startup.test', PASSWORD)).body.error).toMatch(/verify your email/i);
    });

    it('a deactivated site account is only revealed with the right password', async () => {
      tables.WebUser = [{ id: 'w1', email: 'meera@startup.test', name: 'Meera', passwordHash: hash, isActive: false, failedLoginAttempts: 0, lockedUntil: null }];
      expect((await tryLogin('meera@startup.test', 'wrong')).body).toEqual({ error: 'Email or password is incorrect.' });
      expect((await tryLogin('meera@startup.test', PASSWORD)).body.error).toMatch(/deactivated/i);
    });

    it('a founder who signs in is sent to the founder dashboard, with site onboarding marked done', async () => {
      tables.WebUser = [{ id: 'w1', email: 'meera@startup.test', name: 'Meera', passwordHash: hash, isActive: true, failedLoginAttempts: 0, lockedUntil: null, onboardingCompleted: false }];
      tables.FounderUser = [{ onboardingCompleted: true }];
      const res = await tryLogin('meera@startup.test', PASSWORD);
      expect(res.body).toMatchObject({ success: true, home: '/founder/dashboard' });
      expect(statements.some((s) => /UPDATE "WebUser" SET "onboardingCompleted" = true/.test(s.text))).toBe(true);
    });

    it('someone who is not a founder lands on the home page', async () => {
      tables.WebUser = [{ id: 'w1', email: 'reader@site.test', name: 'Reader', passwordHash: hash, isActive: true, failedLoginAttempts: 0, lockedUntil: null, onboardingCompleted: true }];
      expect((await tryLogin('reader@site.test', PASSWORD)).body).toMatchObject({ success: true, home: '/' });
    });
  });

  describe('site onboarding for founders', () => {
    it('done already: stays done', async () => {
      expect(await siteOnboarding({ id: 'w1', email: 'a@b.test', onboardingCompleted: true })).toEqual({ onboardingCompleted: true, isFounder: false });
    });
    it('a founder still in founder onboarding is not marked done', async () => {
      tables.FounderUser = [{ onboardingCompleted: false }];
      expect(await siteOnboarding({ id: 'w1', email: 'a@b.test', onboardingCompleted: false })).toEqual({ onboardingCompleted: false, isFounder: true });
      expect(statements.some((s) => s.text.includes('UPDATE "WebUser"'))).toBe(false);
    });
    it('not a founder: unchanged', async () => {
      expect(await siteOnboarding({ id: 'w1', email: 'a@b.test', onboardingCompleted: false })).toEqual({ onboardingCompleted: false, isFounder: false });
    });
  });

  describe('Google sign-in state', () => {
    const callback = (state: string, cookie?: string) =>
      new NextRequest(`http://localhost/api/founder/auth/google/callback?code=abc&state=${encodeURIComponent(state)}`, cookie ? { headers: { cookie: `oauth_state=${cookie}` } } : {});
    const cookieOf = (res: Response) => /oauth_state=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')?.[1] ?? '';

    it('round trip: the state matches this browser’s cookie and carries the return page', () => {
      const { state, attach } = startOAuthState('/founder/team?tab=invites', '/founder/dashboard');
      const res = attach(NextResponse.redirect('https://accounts.google.com/'));
      expect(readOAuthState(callback(state, cookieOf(res)), '/founder/dashboard')).toBe('/founder/team?tab=invites');
      expect(clearOAuthState(NextResponse.json({})).headers.get('set-cookie')).toMatch(/oauth_state=;/);
    });

    it.each([
      ['no cookie (the sign-in was started somewhere else)', (s: string) => callback(s)],
      ['a different cookie', (s: string) => callback(s, 'someone-elses-nonce')],
      ['a state with no nonce (the old format)', () => callback(Buffer.from(JSON.stringify({ returnTo: '/founder/dashboard' })).toString('base64'), 'x')],
    ])('refused: %s', (_name, build) => {
      const { state } = startOAuthState('/founder/dashboard', '/founder/dashboard');
      expect(readOAuthState(build(state), '/founder/dashboard')).toBeNull();
    });

    it('a return page on another site falls back to the default', () => {
      const { state, attach } = startOAuthState('https://evil.example/steal', '/founder/dashboard');
      const res = attach(NextResponse.redirect('https://accounts.google.com/'));
      expect(readOAuthState(callback(state, cookieOf(res)), '/founder/dashboard')).toBe('/founder/dashboard');
    });

    it('starting sign-in sets the cookie and sends the same value to Google', async () => {
      const res = await googleStart(new NextRequest('http://localhost/api/founder/auth/google?returnTo=/founder/team'));
      const sent = new URL(res.headers.get('location')!).searchParams.get('state')!;
      expect(sent.split('.')[0]).toBe(cookieOf(res));
    });

    it('a callback without a matching cookie signs nobody in', async () => {
      const res = await googleCallback(callback('forged.state'));
      expect(res.headers.get('location')).toContain('/auth/login?error=oauth_state');
      expect(google.verify).not.toHaveBeenCalled();
      expect(setFounderSession).not.toHaveBeenCalled();
    });

    it('a matching callback signs in, lower-cases the email, and leaves a password account’s password alone', async () => {
      const start = await googleStart(new NextRequest('http://localhost/api/founder/auth/google?returnTo=/founder/team'));
      const state = new URL(start.headers.get('location')!).searchParams.get('state')!;
      google.verify.mockResolvedValue({ googleId: 'g1', email: 'Meera@Startup.test', name: 'Meera', avatar: null, emailVerified: true });
      tables.FounderUser = [{ id: 'f1', email: 'meera@startup.test', name: 'Meera', googleId: null, passwordHash: hash, authProvider: 'email', onboardingCompleted: true }];
      const res = await googleCallback(callback(state, cookieOf(start)));
      expect(res.headers.get('location')).toBe('http://localhost/founder/team');
      expect(setFounderSession).toHaveBeenCalledWith('f1', 'meera@startup.test', 'Meera', true);
      const lookup = statements.find((s) => s.text.includes('SELECT * FROM "FounderUser"'))!;
      expect(lookup.values).toEqual(['meera@startup.test']);
      const update = statements.find((s) => s.text.includes('"googleId" ='))!;
      expect(update.text).toContain(`CASE WHEN "passwordHash" IS NULL THEN 'google' ELSE "authProvider" END`);
    });

    it('an address Google has not verified cannot sign in', async () => {
      const start = await googleStart(new NextRequest('http://localhost/api/founder/auth/google'));
      const state = new URL(start.headers.get('location')!).searchParams.get('state')!;
      google.verify.mockResolvedValue({ googleId: 'g1', email: 'meera@startup.test', name: 'Meera', avatar: null, emailVerified: false });
      await googleCallback(callback(state, cookieOf(start)));
      expect(setFounderSession).not.toHaveBeenCalled();
    });
  });

  describe('emailed links', () => {
    it('a reset link is stored only as a hash, and the emailed link still works', async () => {
      db.founderUser.findUnique.mockResolvedValue({ id: 'f1', name: 'Meera', email: 'meera@startup.test' });
      await forgot(post('/api/founder/auth/forgot-password', { email: 'meera@startup.test', turnstileToken: 't' }));
      const stored = db.founderUser.update.mock.calls[0][0].data.resetToken;
      expect(sentReset).toHaveLength(1);
      expect(stored).toBe(sha(sentReset[0]));
      expect(stored).not.toBe(sentReset[0]);

      db.founderUser.findFirst.mockResolvedValue({ id: 'f1', email: 'meera@startup.test' });
      const res = await reset(post('/api/founder/auth/reset-password', { token: sentReset[0], password: 'New-Passw0rd-42', turnstileToken: 't' }));
      expect(res.status).toBe(200);
      expect(db.founderUser.findFirst.mock.calls[0][0].where.resetToken).toBe(stored);
    });

    it('an account that signs in with Google can ask for a reset link too', async () => {
      db.founderUser.findUnique.mockResolvedValue({ id: 'f1', name: 'Meera', email: 'meera@startup.test', authProvider: 'google' });
      await forgot(post('/api/founder/auth/forgot-password', { email: 'meera@startup.test', turnstileToken: 't' }));
      expect(sentReset).toHaveLength(1);
    });

    it('a verification link works for 24 hours, then asks for a new one', async () => {
      tables.FounderUser = [{ id: 'f1', email: 'meera@startup.test', name: 'Meera', emailVerified: false, status: 'PENDING' }];
      await resend(post('/api/founder/auth/resend-verification', { email: 'meera@startup.test', turnstileToken: 't' }));
      const link = sentVerify[0];
      const stored = statements.find((s) => s.text.includes('SET "verifyToken"'))!.values[0] as string;
      expect(stored).not.toContain(link.split('.')[0]); // only a hash of the random part is kept

      expect((await verify(post('/api/founder/auth/verify', { token: link }))).status).toBe(200);
      expect(statements.find((s) => s.text.includes('WHERE "verifyToken" ='))!.values).toEqual([stored]);

      const [random] = link.split('.');
      const old = `${random}.${Date.now() - 25 * 60 * 60 * 1000}`;
      const expired = await verify(post('/api/founder/auth/verify', { token: old }));
      expect(expired.status).toBe(400);
      expect((await expired.json()).error).toMatch(/expired/);
    });

    it('an old-style link with no issue time is refused', async () => {
      tables.FounderUser = [{ id: 'f1', email: 'meera@startup.test', emailVerified: false }];
      const res = await verify(post('/api/founder/auth/verify', { token: 'a'.repeat(64) }));
      expect(res.status).toBe(400);
      expect(statements.some((s) => s.text.includes('UPDATE "FounderUser"'))).toBe(false);
    });
  });
});
