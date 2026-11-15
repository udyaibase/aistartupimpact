import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

process.env.NEXTAUTH_SECRET = 'test-secret-for-unsubscribe-links';

const db = vi.hoisted(() => ({ $queryRaw: vi.fn(), $executeRaw: vi.fn() }));
const email = vi.hoisted(() => vi.fn());
vi.mock('@udyaibase/database', () => ({ prisma: db }));
vi.mock('@/lib/email/send', () => ({ sendEmailFireAndForget: email }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: async () => ({ success: true }), strictRateLimit: null }));
vi.mock('next/headers', () => ({ cookies: vi.fn() }));

import { POST } from '@/app/api/newsletter/unsubscribe/route';
import { eventScope } from '@/lib/organizer-auth/require-permission';

const post = (body: unknown) => new NextRequest('https://udyaibase.com/api/newsletter/unsubscribe', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

describe('newsletter unsubscribe', () => {
  beforeEach(() => vi.clearAllMocks());

  it('an address alone changes nothing: the subscriber is emailed a link to confirm', async () => {
    db.$queryRaw.mockResolvedValue([{ id: 's1', email: 'reader@example.com' }]);
    const res = await POST(post({ email: 'reader@example.com' }));
    expect(await res.json()).toMatchObject({ success: true, emailed: true });
    expect(db.$executeRaw).not.toHaveBeenCalled();
    expect(email).toHaveBeenCalledTimes(1);
    expect(email.mock.calls[0][0].html).toContain('/unsubscribe?email=reader%40example.com&token=');
  });

  it('answers the same way for an address that is not subscribed, and sends nothing', async () => {
    db.$queryRaw.mockResolvedValue([]);
    const res = await POST(post({ email: 'stranger@example.com' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, emailed: true });
    expect(email).not.toHaveBeenCalled();
  });

  it('rejects a made-up token', async () => {
    const res = await POST(post({ token: 'not-a-real-token' }));
    expect(res.status).toBe(401);
    expect(db.$executeRaw).not.toHaveBeenCalled();
  });
});

describe('eventScope', () => {
  const base = { id: 'me', email: 'a@b.co', name: 'A', organizerId: 'host' };
  it('covers the whole workspace for owners and admins', () => {
    expect(eventScope({ ...base, role: 'OWNER' })).toEqual({ organizerId: 'host' });
    expect(eventScope({ ...base, role: 'ADMIN', assignedEventIds: ['e1'] })).toEqual({ organizerId: 'host' });
  });
  it('narrows a teammate limited to certain events', () => {
    expect(eventScope({ ...base, role: 'STAFF', assignedEventIds: ['e1', 'e2'] })).toEqual({ organizerId: 'host', id: { in: ['e1', 'e2'] } });
    expect(eventScope({ ...base, role: 'MANAGER' })).toEqual({ organizerId: 'host' });
  });
});
