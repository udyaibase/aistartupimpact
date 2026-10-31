import { describe, it, expect, beforeAll } from 'vitest';
import { SignJWT, jwtVerify } from 'jose';
import { signEventUnsubscribeToken, verifyEventUnsubscribeToken, eventUnsubscribeUrl } from '@udyaibase/utils/event-campaigns';

describe('event unsubscribe tokens (shared web + admin)', () => {
  beforeAll(() => { process.env.NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET || 'test-secret-for-unsubscribe-tokens'; });
  const key = () => new TextEncoder().encode(process.env.NEXTAUTH_SECRET!);

  it('still accepts tokens issued by the old jose implementation (links already in inboxes)', async () => {
    const old = await new SignJWT({ subscriberId: 'sub_1', email: 'a@b.com' }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('30d').sign(key());
    expect(verifyEventUnsubscribeToken(old)).toEqual({ subscriberId: 'sub_1', email: 'a@b.com' });
  });

  it('issues standard JWTs that jose can verify', async () => {
    const { payload } = await jwtVerify(signEventUnsubscribeToken('sub_2', 'c@d.com'), key());
    expect(payload).toMatchObject({ subscriberId: 'sub_2', email: 'c@d.com' });
  });

  it('rejects tampered, expired or wrongly signed tokens', async () => {
    const t = signEventUnsubscribeToken('sub_3', 'e@f.com');
    const [h, , s] = t.split('.');
    const forged = Buffer.from(JSON.stringify({ subscriberId: 'sub_9', email: 'x@y.com', exp: 9e9 })).toString('base64url');
    expect(verifyEventUnsubscribeToken(`${h}.${forged}.${s}`)).toBeNull();
    expect(verifyEventUnsubscribeToken(signEventUnsubscribeToken('s', 'e@f.com', 1000))).toBeNull();
    const other = await new SignJWT({ subscriberId: 's', email: 'e' }).setProtectedHeader({ alg: 'HS256' }).sign(new TextEncoder().encode('another-secret'));
    expect(verifyEventUnsubscribeToken(other)).toBeNull();
    expect(verifyEventUnsubscribeToken('garbage')).toBeNull();
  });

  it('builds the link the web app serves', () => {
    expect(eventUnsubscribeUrl('https://udyaibase.com/', 's', 'e@f.com')).toMatch(/^https:\/\/udyaibase\.com\/api\/events\/unsubscribe\?token=[\w-]+\.[\w-]+\.[\w-]+$/);
  });
});
