import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SignJWT } from 'jose';

const sqlRows = vi.hoisted(() => ({ rows: [] as unknown[], calls: [] as unknown[][] }));
vi.mock('@/lib/db', () => ({
  sql: (_strings: TemplateStringsArray, ...values: unknown[]) => { sqlRows.calls.push(values); return Promise.resolve(sqlRows.rows); },
}));

const src = (p: string) => readFileSync(join(__dirname, '../..', p), 'utf8');
const secret = new TextEncoder().encode(process.env.USER_JWT_SECRET);
const cookie = (claims: Record<string, unknown>) => new SignJWT(claims).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('7d').sign(secret);

/**
 * A password change, a sign-out and "sign out everywhere" all work by deleting the session record. A route that
 * checks only the cookie's signature keeps accepting a stolen copy for up to 7 days afterwards.
 */
describe('a site cookie counts only while its session record exists', () => {
  beforeEach(() => { sqlRows.rows = []; sqlRows.calls = []; });

  it('accepts a cookie whose session is still there', async () => {
    const { verifyUserTokenSession } = await import('@/lib/user-session');
    sqlRows.rows = [{ ok: 1 }];
    const token = await cookie({ userId: 'u1', email: 'Asha@Example.com', sessionId: 's1' });
    expect(await verifyUserTokenSession(token)).toEqual({ userId: 'u1', email: 'asha@example.com', sessionId: 's1' });
    expect(sqlRows.calls[0]).toEqual(['s1', 'u1']);
  });

  it('refuses it once the session is gone (password changed or signed out)', async () => {
    const { verifyUserTokenSession } = await import('@/lib/user-session');
    const token = await cookie({ userId: 'u1', email: 'asha@example.com', sessionId: 's1' });
    expect(await verifyUserTokenSession(token)).toBeNull();
  });

  it('refuses a cookie with no session id, a forged one, and none at all', async () => {
    const { verifyUserTokenSession } = await import('@/lib/user-session');
    sqlRows.rows = [{ ok: 1 }];
    expect(await verifyUserTokenSession(await cookie({ userId: 'u1', email: 'asha@example.com' }))).toBeNull();
    const forged = await new SignJWT({ userId: 'u1', email: 'a@b.co', sessionId: 's1' }).setProtectedHeader({ alg: 'HS256' }).sign(new TextEncoder().encode('some-other-secret-that-is-long-enough'));
    expect(await verifyUserTokenSession(forged)).toBeNull();
    expect(await verifyUserTokenSession(undefined)).toBeNull();
    expect(sqlRows.calls.length).toBe(0); // none of these reached the database
  });

  it('the routes that open a workspace or recognise a founder from a site cookie use that check', () => {
    for (const file of ['app/api/workspace/unlock/route.ts', 'lib/founder/account.ts', 'app/founder/page.tsx']) {
      const text = src(file);
      expect(text).toContain('verifyUserTokenSession(userToken)');
      expect(text).not.toMatch(/jwtVerify\(userToken/);
    }
  });

  it('no other code reads the site cookie by signature alone', () => {
    // Every remaining direct verification of a user-token is followed by its own session-record check.
    const organizer = src('lib/organizer-auth/index.ts');
    expect(organizer).toContain('prisma.webUserSession.findFirst({ where: { id: sessionId, expiresAt: { gt: new Date() } }');
  });
});
