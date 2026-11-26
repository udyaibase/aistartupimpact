import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SignJWT } from 'jose';

const sql = vi.hoisted(() => vi.fn());
vi.mock('@/lib/db', () => ({ sql }));
vi.mock('next/headers', () => ({ cookies: vi.fn() }));

import { verifyUserToken } from '@/lib/user-session';

const key = new TextEncoder().encode(process.env.USER_JWT_SECRET);
const token = (claims: Record<string, unknown>, k = key) => new SignJWT(claims).setProtectedHeader({ alg: 'HS256' }).setExpirationTime('1h').sign(k);

describe('the shared website sign-in check', () => {
  beforeEach(() => sql.mockReset());

  it('accepts a signed token for an open account with a live sign-in', async () => {
    sql.mockResolvedValue([{ id: 'u1', email: 'a@b.co' }]);
    expect(await verifyUserToken(await token({ userId: 'u1', sessionId: 's1' }))).toEqual({ userId: 'u1', email: 'a@b.co', sessionId: 's1' });
    // One query, asking for the account and the sign-in together.
    expect(sql).toHaveBeenCalledTimes(1);
    const text = (sql.mock.calls[0][0] as string[]).join('?');
    expect(text).toContain('"isActive" = true');
    expect(text).toContain('"deactivatedAt" IS NULL');
    expect(text).toContain('"WebUserSession"');
  });

  it('rejects a correctly signed token once the sign-in was ended or the account closed', async () => {
    sql.mockResolvedValue([]); // the database finds no open account with that live sign-in
    expect(await verifyUserToken(await token({ userId: 'u1', sessionId: 'ended' }))).toBeNull();
  });

  it('rejects a missing, forged or malformed token without touching the database', async () => {
    expect(await verifyUserToken(undefined)).toBeNull();
    expect(await verifyUserToken('not-a-token')).toBeNull();
    expect(await verifyUserToken(await token({ userId: 'u1' }, new TextEncoder().encode('another-secret-entirely-0123456789')))).toBeNull();
    expect(await verifyUserToken(await token({ email: 'no-user-id@b.co' }))).toBeNull();
    expect(sql).not.toHaveBeenCalled();
  });
});
