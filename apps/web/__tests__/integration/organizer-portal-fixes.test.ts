import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

/** The caller: role plus (for limited teammates) the events they're assigned. */
const who = vi.hoisted(() => ({ role: 'OWNER', assigned: undefined as string[] | undefined }));
const db = vi.hoisted(() => ({
  event: { findMany: vi.fn(async () => []), findUnique: vi.fn(), findFirst: vi.fn() },
  eventEmailCampaign: { findMany: vi.fn(async () => []) },
}));
const promo = vi.hoisted(() => ({ startPromo: vi.fn(async () => ({ ok: true, recipients: 3, send: async () => {} })), promoAudienceSize: vi.fn(async () => 10) }));
const limit = vi.hoisted(() => ({ ok: true }));

vi.mock('@/lib/organizer-auth/write-limit', () => ({ hostWriteLimit: async () => null }));
vi.mock('@udyaibase/database', () => ({ prisma: db }));
vi.mock('@/lib/organizer-auth/require-permission', async () => {
  const actual = await vi.importActual<any>('@/lib/organizer-auth/require-permission');
  const { hasPermission } = await vi.importActual<any>('@/lib/organizer-auth/permissions');
  return {
    ...actual,
    requirePermission: async (p: string) => {
      if (who.role !== 'OWNER' && !hasPermission(who.role, p)) return NextResponse.json({ success: false }, { status: 403 });
      return { id: 'me', email: 'me@host.co', name: 'Me', role: who.role, organizerId: 'org1', assignedEventIds: who.assigned };
    },
  };
});
vi.mock('@/lib/events/promote', () => ({ ...promo, NOTE_MAX: 280 }));
vi.mock('@/lib/events/billing', () => ({ hostPlanStatus: vi.fn(async () => null) }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: async () => ({ success: limit.ok }), apiRateLimit: {}, authRateLimit: {} }));
vi.mock('next/server', async () => ({ ...(await vi.importActual<any>('next/server')), after: () => {} }));

import { GET as promoGET, POST as promoPOST } from '@/app/api/organizer/promote/route';
import { GET as eventGET } from '@/app/api/organizer/events/[eventId]/route';

const post = (body: unknown) => new NextRequest('http://localhost/api/organizer/promote', { method: 'POST', body: JSON.stringify(body) });
beforeEach(() => { vi.clearAllMocks(); who.role = 'OWNER'; who.assigned = undefined; limit.ok = true; });

describe('promote respects a teammate’s assigned events', () => {
  it('a manager limited to one event can’t promote (or size up) another', async () => {
    who.role = 'MANAGER'; who.assigned = ['ev-mine'];
    expect((await promoPOST(post({ eventId: 'ev-other' }))).status).toBe(404);
    expect(promo.startPromo).not.toHaveBeenCalled();
    expect((await promoGET(new NextRequest('http://localhost/api/organizer/promote?eventId=ev-other'))).status).toBe(404);
    expect((await promoPOST(post({ eventId: 'ev-mine' }))).status).toBe(200);
  });
  it('lists only their events and those events’ past promotions', async () => {
    who.role = 'MANAGER'; who.assigned = ['ev-mine'];
    await promoGET(new NextRequest('http://localhost/api/organizer/promote'));
    expect((db.event.findMany.mock.calls as any)[0][0].where).toMatchObject({ organizerId: 'org1', id: { in: ['ev-mine'] } });
    expect((db.eventEmailCampaign.findMany.mock.calls as any)[0][0].where).toMatchObject({ organizerId: 'org1', eventId: { in: ['ev-mine'] } });
  });
  it('owners and admins still promote any event in the workspace', async () => {
    who.role = 'ADMIN';
    expect((await promoPOST(post({ eventId: 'ev-other' }))).status).toBe(200);
  });
});

describe('event details by role', () => {
  const call = () => eventGET(new NextRequest('http://localhost/api/organizer/events/e1'), { params: Promise.resolve({ eventId: 'e1' }) });
  beforeEach(() => { db.event.findFirst.mockReset(); db.event.findFirst.mockResolvedValue({ id: 'e1', organizerId: 'org1' }); });
  it('check-in teammates get a view-only event without the attendee list', async () => {
    who.role = 'CHECK_IN';
    const d = await (await call()).json();
    expect(d).toMatchObject({ success: true, canEdit: false, canViewAttendees: false });
    const query = (db.event.findFirst.mock.calls as any)[0][0];
    expect(query.select.registrations).toBeUndefined();
    // Only what the read-only screen shows: no meeting link or settings, and only this workspace's events.
    expect(query.select.meetingLink).toBeUndefined();
    expect(query.where.organizerId).toBeDefined();
  });
  it('staff see attendees but can’t edit; managers can edit', async () => {
    who.role = 'STAFF';
    expect(await (await call()).json()).toMatchObject({ canEdit: false, canViewAttendees: true });
    expect((db.event.findFirst.mock.calls as any)[0][0].select.registrations).toBeDefined();
    who.role = 'MANAGER';
    expect(await (await call()).json()).toMatchObject({ canEdit: true, canViewAttendees: true });
  });
});
