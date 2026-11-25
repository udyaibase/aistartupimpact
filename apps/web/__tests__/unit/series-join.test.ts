import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const db = vi.hoisted(() => ({
  eventRegistration: { findUnique: vi.fn() },
  webUser: { findUnique: vi.fn() },
  eventSeriesFollower: { upsert: vi.fn(async () => ({})) },
}));
vi.mock('@udyaibase/database', () => ({ prisma: db }));
vi.mock('@/lib/rate-limit', () => ({ authRateLimit: null, checkRateLimit: vi.fn(async () => ({ success: true, reset: 0 })), getClientIdentifier: () => 'ip', rateLimitMessage: () => 'slow', retryAfterHeaders: () => ({}) }));
process.env.NEXTAUTH_SECRET = 'test-secret';

import { seriesJoinToken, verifySeriesJoinToken, seriesFollowToken } from '@/lib/events/after-event';
import { seriesFollowHtml } from '@/lib/events/follow-ups';
import { POST } from '@/app/api/series/follow/join/route';

const post = (t: string) => POST(new NextRequest('http://x/api/series/follow/join', { method: 'POST', body: JSON.stringify({ t }) }));

beforeEach(() => vi.clearAllMocks());

describe('follow a series from a follow-up email', () => {
  it('signs registration ids and rejects other purposes or edits', () => {
    const t = seriesJoinToken('reg-1');
    expect(verifySeriesJoinToken(t)).toBe('reg-1');
    expect(verifySeriesJoinToken(seriesFollowToken('reg-1', 'stop'))).toBeNull();
    expect(verifySeriesJoinToken(t.replace('reg-1', 'reg-2'))).toBeNull();
  });

  it('confirms the follow straight away for the registration email (lower-cased)', async () => {
    db.eventRegistration.findUnique.mockResolvedValue({ guestEmail: 'Asha@Example.com', userId: null, event: { series: { id: 's1', name: 'Meetup', slug: 'meetup' } } });
    const res = await post(seriesJoinToken('reg-1'));
    expect(res.status).toBe(200);
    expect(db.eventSeriesFollower.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { seriesId_email: { seriesId: 's1', email: 'asha@example.com' } },
      create: expect.objectContaining({ confirmedAt: expect.any(Date) }),
      update: expect.objectContaining({ unsubscribedAt: null }),
    }));
  });

  it('uses the account email for signed-in registrations', async () => {
    db.eventRegistration.findUnique.mockResolvedValue({ guestEmail: null, userId: 'u1', event: { series: { id: 's1', name: 'Meetup', slug: 'meetup' } } });
    db.webUser.findUnique.mockResolvedValue({ email: 'user@example.com' });
    await post(seriesJoinToken('reg-1'));
    expect(db.eventSeriesFollower.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { seriesId_email: { seriesId: 's1', email: 'user@example.com' } } }));
  });

  it('refuses bad links and events no longer in a series', async () => {
    expect((await post('nope')).status).toBe(400);
    db.eventRegistration.findUnique.mockResolvedValue({ guestEmail: 'a@b.com', userId: null, event: { series: null } });
    expect((await post(seriesJoinToken('reg-1'))).status).toBe(400);
    expect(db.eventSeriesFollower.upsert).not.toHaveBeenCalled();
  });

  it('escapes the series name in the email block', () => {
    const html = seriesFollowHtml('<b>AI</b> & Co', 'https://udyaibase.com/series/join?t=x');
    expect(html).toContain('&lt;b&gt;AI&lt;/b&gt; &amp; Co');
    expect(html).toContain('https://udyaibase.com/series/join?t=x');
  });
});
