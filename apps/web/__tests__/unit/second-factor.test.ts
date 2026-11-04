import { describe, it, expect, vi, beforeEach } from 'vitest';
import { jwtVerify } from 'jose';

const db = vi.hoisted(() => ({
  webUser: { findUnique: vi.fn() },
  founderUser: { findUnique: vi.fn() },
  eventOrganizer: { findFirst: vi.fn() },
  accountTwoFactor: { findUnique: vi.fn() },
}));
vi.mock('@udyaibase/database', () => ({ prisma: db }));
vi.mock('@/lib/founder/account', () => ({ accountHasPassword: vi.fn(), confirmAccountPassword: vi.fn() }));

import { secondFactorChallenge } from '@/lib/auth/second-factor';

const key = (s: string) => new TextEncoder().encode(s);

describe('secondFactorChallenge', () => {
  beforeEach(() => {
    process.env.USER_JWT_SECRET = 'user-secret';
    process.env.FOUNDER_JWT_SECRET = 'founder-secret';
    db.accountTwoFactor.findUnique.mockResolvedValue({ enabled: true });
    db.webUser.findUnique.mockResolvedValue({ id: 'w1' });
    db.founderUser.findUnique.mockResolvedValue({ id: 'f1' });
    db.eventOrganizer.findFirst.mockResolvedValue(null);
  });

  it('asks nothing when the one setting is off, or was never set', async () => {
    db.accountTwoFactor.findUnique.mockResolvedValue({ enabled: false });
    expect(await secondFactorChallenge('a@b.co')).toBeNull();
    db.accountTwoFactor.findUnique.mockResolvedValue(null);
    expect(await secondFactorChallenge('a@b.co')).toBeNull();
  });

  it('reads the one setting by lowercase email', async () => {
    await secondFactorChallenge('A@B.co');
    expect(db.accountTwoFactor.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { email: 'a@b.co' } }));
  });

  it('answers on the main account when there is one', async () => {
    const c = await secondFactorChallenge('a@b.co');
    expect(c?.userType).toBe('webuser');
    const { payload } = await jwtVerify(c!.challengeToken, key('user-secret'));
    expect(payload).toMatchObject({ userId: 'w1', purpose: '2fa-challenge' });
  });

  it('falls back to the founder account', async () => {
    db.webUser.findUnique.mockResolvedValue(null);
    const c = await secondFactorChallenge('a@b.co');
    expect(c?.userType).toBe('founder');
    const { payload } = await jwtVerify(c!.challengeToken, key('founder-secret'));
    expect(payload.userId).toBe('f1');
  });

  it('then to an event host account', async () => {
    db.webUser.findUnique.mockResolvedValue(null);
    db.founderUser.findUnique.mockResolvedValue(null);
    db.eventOrganizer.findFirst.mockResolvedValue({ id: 'o1' });
    expect((await secondFactorChallenge('a@b.co'))?.userType).toBe('organizer');
  });
});
