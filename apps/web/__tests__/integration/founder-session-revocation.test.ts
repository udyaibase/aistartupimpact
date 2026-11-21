import { describe, it, expect, vi, beforeEach } from 'vitest';

// Set before the modules under test read them (imports run first otherwise).
vi.hoisted(() => {
  process.env.FOUNDER_JWT_SECRET = 'test-founder-secret-min-32-characters-long';
  process.env.USER_JWT_SECRET = 'test-user-secret-min-32-characters-long!!';
});

// A cookie jar the code under test reads and writes, so real signed tokens go through the real checks.
const jar = vi.hoisted(() => new Map<string, string>());
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (n: string) => (jar.has(n) ? { value: jar.get(n)! } : undefined),
    set: (n: string, v: string) => { jar.set(n, v); },
    delete: (n: string) => { jar.delete(n); },
  }),
}));

const db = vi.hoisted(() => ({
  founderUser: { findUnique: vi.fn() },
  founderSession: { create: vi.fn(), findFirst: vi.fn(), deleteMany: vi.fn() },
  webUserSession: { findFirst: vi.fn() },
}));
vi.mock('@udyaibase/database', () => ({ prisma: db }));

const unified = vi.hoisted(() => ({ get: vi.fn(), destroy: vi.fn() }));
vi.mock('@/lib/unified-auth', () => ({ getUnifiedSession: () => unified.get(), destroyUnifiedSession: () => unified.destroy() }));

// Raw SQL: record each statement as text plus its values.
const statements = vi.hoisted(() => [] as { text: string; values: unknown[] }[]);
vi.mock('@/lib/db', () => ({
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => { statements.push({ text: strings.join('?'), values }); return Promise.resolve([]); },
}));

import { SignJWT, decodeJwt } from 'jose';
import { clearFounderSession, createFounderToken, getFounderSession, setFounderSession } from '@/lib/founder-auth';
import { endAccountSessions, signOutEverywhere, signOutThisDevice } from '@/lib/auth/sessions';

const FOUNDER = { id: 'f1', email: 'meera@startup.test', name: 'Meera', onboardingCompleted: true, status: 'ACTIVE', deactivatedAt: null, deletedAt: null, sessionsValidAfter: null };
const sid = () => decodeJwt(jar.get('founder-token')!).sid as string;

async function userToken(claims: Record<string, unknown>) {
  return new SignJWT({ userId: 'w1', email: FOUNDER.email, name: 'Meera', ...claims })
    .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('7d')
    .sign(new TextEncoder().encode(process.env.USER_JWT_SECRET));
}

describe('founder sessions can be ended on the server', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    jar.clear();
    statements.length = 0;
    unified.get.mockResolvedValue(null);
    db.founderUser.findUnique.mockResolvedValue(FOUNDER);
    db.founderSession.create.mockResolvedValue({});
    db.founderSession.deleteMany.mockResolvedValue({ count: 1 });
  });

  describe('founder cookie', () => {
    it('signing in stores a session row and names it in the cookie', async () => {
      await setFounderSession('f1', FOUNDER.email, 'Meera', true);
      expect(sid()).toBeTruthy();
      expect(db.founderSession.create).toHaveBeenCalledWith({ data: expect.objectContaining({ id: sid(), userId: 'f1', token: sid() }) });
    });

    it('works while its session row exists', async () => {
      await setFounderSession('f1', FOUNDER.email, 'Meera', true);
      db.founderSession.findFirst.mockResolvedValue({ id: sid() });
      expect(await getFounderSession()).toEqual({ userId: 'f1', email: FOUNDER.email, name: 'Meera', onboardingCompleted: true });
      expect(db.founderSession.findFirst.mock.calls[0][0].where).toMatchObject({ id: sid(), userId: 'f1' });
    });

    it('a copy of the cookie stops working once the session row is gone (signed out)', async () => {
      await setFounderSession('f1', FOUNDER.email, 'Meera', true);
      db.founderSession.findFirst.mockResolvedValue(null);
      expect(await getFounderSession()).toBeNull();
    });

    it('stops working after "sign out everywhere" or a password change', async () => {
      await setFounderSession('f1', FOUNDER.email, 'Meera', true);
      db.founderSession.findFirst.mockResolvedValue({ id: sid() });
      db.founderUser.findUnique.mockResolvedValue({ ...FOUNDER, sessionsValidAfter: new Date(Date.now() + 5_000) });
      expect(await getFounderSession()).toBeNull();
    });

    it('a cookie from before session rows existed still works until it expires', async () => {
      jar.set('founder-token', await createFounderToken('f1', FOUNDER.email, 'Meera', true));
      expect(await getFounderSession()).toMatchObject({ userId: 'f1' });
      expect(db.founderSession.findFirst).not.toHaveBeenCalled();
    });

    it('signing in again on the same browser replaces the old session row', async () => {
      await setFounderSession('f1', FOUNDER.email, 'Meera', false);
      const first = sid();
      await setFounderSession('f1', FOUNDER.email, 'Meera', true);
      expect(db.founderSession.deleteMany).toHaveBeenCalledWith({ where: { id: first, userId: 'f1' } });
      expect(sid()).not.toBe(first);
    });

    it('clearing the session deletes its row, not just the cookie', async () => {
      await setFounderSession('f1', FOUNDER.email, 'Meera', true);
      const id = sid();
      await clearFounderSession();
      expect(db.founderSession.deleteMany).toHaveBeenCalledWith({ where: { id } });
      expect(jar.has('founder-token')).toBe(false);
    });
  });

  describe('site cookie used in the founder portal', () => {
    it('works while its site session exists', async () => {
      jar.set('user-token', await userToken({ sessionId: 's1' }));
      db.webUserSession.findFirst.mockResolvedValue({ id: 's1' });
      expect(await getFounderSession()).toMatchObject({ userId: 'f1', email: FOUNDER.email });
      expect(db.webUserSession.findFirst.mock.calls[0][0].where).toMatchObject({ id: 's1' });
    });

    it('a copy of the cookie stops working once the site session is deleted (signed out)', async () => {
      jar.set('user-token', await userToken({ sessionId: 's1' }));
      db.webUserSession.findFirst.mockResolvedValue(null);
      expect(await getFounderSession()).toBeNull();
    });
  });

  describe('signing out', () => {
    it('this device: deletes the site and founder session rows and clears every sign-in cookie', async () => {
      await setFounderSession('f1', FOUNDER.email, 'Meera', true);
      const founderSid = sid();
      jar.set('user-token', await userToken({ sessionId: 's1' }));
      jar.set('unified_session', 'x');

      await signOutThisDevice();

      const web = statements.find((s) => s.text.includes('"WebUserSession"'));
      const founder = statements.find((s) => s.text.includes('"FounderSession"'));
      expect(web?.values).toEqual(['s1']);
      expect(founder?.values).toEqual([founderSid]);
      expect(unified.destroy).toHaveBeenCalled();
      expect([...jar.keys()]).toEqual([]);
    });

    it('this device: is safe when nobody is signed in', async () => {
      await expect(signOutThisDevice()).resolves.toBeUndefined();
      expect(statements).toEqual([]);
    });

    it('everywhere: ends every kind of session for that email and marks older founder cookies invalid', async () => {
      jar.set('user-token', await userToken({ sessionId: 's1' }));
      await signOutEverywhere('Meera@Startup.test');
      const text = statements.map((s) => s.text).join('\n');
      for (const table of ['"WebUserSession"', '"UnifiedSession"', '"EventOrganizerSession"', '"FounderSession"']) expect(text).toContain(`DELETE FROM ${table}`);
      expect(text).toContain('"sessionsValidAfter" = NOW()');
      expect(statements.every((s) => s.values.includes('meera@startup.test'))).toBe(true);
      expect([...jar.keys()]).toEqual([]);
    });

    it('a password change can keep the device it was made on', async () => {
      await endAccountSessions(FOUNDER.email, { keepWebSessionId: 'keep-me' });
      const web = statements.find((s) => s.text.includes('DELETE FROM "WebUserSession"'));
      expect(web?.text).toContain('id !=');
      expect(web?.values).toContain('keep-me');
    });
  });
});
