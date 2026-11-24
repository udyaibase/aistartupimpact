import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const db = vi.hoisted(() => ({
  organizerNotification: {
    findMany: vi.fn(async () => [{ id: 'n1', type: 'event_approved', title: 'Live', message: 'm', link: null, read: false, createdAt: new Date() }]),
    count: vi.fn(async () => 1),
    updateMany: vi.fn(async () => ({ count: 1 })),
    deleteMany: vi.fn(async () => ({ count: 1 })),
    create: vi.fn(async () => ({})),
    findFirst: vi.fn(async () => null),
    update: vi.fn(async () => ({})),
  },
  eventRegistration: { count: vi.fn(async () => 3) },
}));
const guard = vi.hoisted(() => ({ result: { organizerId: 'ws1', role: 'OWNER' } as unknown }));
vi.mock('@udyaibase/database', () => ({ prisma: db }));
vi.mock('@/lib/organizer-auth/require-permission', () => ({ requirePermission: vi.fn(async () => guard.result) }));
vi.mock('@/lib/rate-limit', () => ({ apiRateLimit: null, checkRateLimit: vi.fn(async () => ({ success: true, reset: 0 })), rateLimitMessage: () => 'slow down', retryAfterHeaders: () => ({}) }));

import { GET, PATCH, DELETE } from '@/app/api/organizer/notifications/route';
import { notifyOrganizer, notifyPendingApprovals } from '@/lib/organizer-notify';

const req = (method: string, body?: unknown, q = '') => new NextRequest(`https://udyaibase.com/api/organizer/notifications${q}`, { method, body: body ? JSON.stringify(body) : undefined, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => { vi.clearAllMocks(); guard.result = { organizerId: 'ws1', role: 'OWNER' }; });

describe('organizer notifications API', () => {
  it('lists only the workspace’s own notes, with the unread count', async () => {
    const res = await GET();
    const data = await res.json();
    expect(data).toMatchObject({ success: true, unreadCount: 1 });
    expect(db.organizerNotification.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organizerId: 'ws1' } }));
  });

  it('signed out (or no access) gets the guard’s response', async () => {
    guard.result = NextResponse.json({ error: 'no' }, { status: 401 });
    expect((await GET()).status).toBe(401);
    expect(db.organizerNotification.findMany).not.toHaveBeenCalled();
  });

  it('marking read and removing are scoped to the workspace (another workspace’s id changes nothing)', async () => {
    await PATCH(req('PATCH', { notificationId: 'other-ws-note' }));
    expect(db.organizerNotification.updateMany).toHaveBeenCalledWith({ where: { id: 'other-ws-note', organizerId: 'ws1' }, data: { read: true } });
    await PATCH(req('PATCH', { markAllRead: true }));
    expect(db.organizerNotification.updateMany).toHaveBeenLastCalledWith({ where: { organizerId: 'ws1', read: false }, data: { read: true } });
    await DELETE(req('DELETE', undefined, '?id=n9'));
    expect(db.organizerNotification.deleteMany).toHaveBeenCalledWith({ where: { id: 'n9', organizerId: 'ws1' } });
    expect((await PATCH(req('PATCH', {}))).status).toBe(400);
  });
});

describe('creating organizer notes', () => {
  it('never throws, even when saving fails', async () => {
    db.organizerNotification.create.mockRejectedValueOnce(new Error('db down'));
    await expect(notifyOrganizer('ws1', { type: 't', title: 'x', message: 'y' })).resolves.toBeUndefined();
    await expect(notifyOrganizer(null, { type: 't', title: 'x', message: 'y' })).resolves.toBeUndefined();
  });

  it('keeps one “waiting for approval” note per event up to date instead of one per registration', async () => {
    await notifyPendingApprovals('ws1', 'ev1', 'AI Meetup');
    expect(db.organizerNotification.create).toHaveBeenCalledWith({ data: expect.objectContaining({ type: 'approval_pending', title: '3 people are waiting for approval', link: '/organizer/events/ev1' }) });
    db.organizerNotification.findFirst.mockResolvedValueOnce({ id: 'open1' } as never);
    db.eventRegistration.count.mockResolvedValueOnce(4);
    await notifyPendingApprovals('ws1', 'ev1', 'AI Meetup');
    expect(db.organizerNotification.update).toHaveBeenCalledWith({ where: { id: 'open1' }, data: expect.objectContaining({ title: '4 people are waiting for approval' }) });
    expect(db.organizerNotification.create).toHaveBeenCalledTimes(1);
  });
});
