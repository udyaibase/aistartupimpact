import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

/** Who is calling: the workspace owner, or a teammate with a role. */
const who = vi.hoisted(() => ({ role: 'OWNER', teamMemberId: undefined as string | undefined }));
const db = vi.hoisted(() => ({
  eventTeamMember: { findFirst: vi.fn(), findMany: vi.fn(async () => []), update: vi.fn(async (a: any) => ({ id: a.where.id, ...a.data })), create: vi.fn() },
  eventTeamAssignment: { deleteMany: vi.fn((a: any) => a), createMany: vi.fn((a: any) => a) },
  event: { findMany: vi.fn(async () => [{ id: 'ev-own' }]) },
  $transaction: vi.fn(async (ops: unknown[]) => ops),
}));

vi.mock('@/lib/organizer-auth/write-limit', () => ({ hostWriteLimit: async () => null }));
vi.mock('@udyaibase/database', () => ({ prisma: db }));
vi.mock('@/lib/organizer-auth/require-permission', async () => {
  const { hasPermission } = await vi.importActual<any>('@/lib/organizer-auth/permissions');
  return {
    requirePermission: async (p: string) => {
      if (who.role !== 'OWNER' && !hasPermission(who.role, p)) return NextResponse.json({ success: false }, { status: 403 });
      return { id: 'me', email: 'me@host.co', name: 'Me', role: who.role, organizerId: 'org1', teamMemberId: who.teamMemberId };
    },
  };
});
vi.mock('@/lib/workspace-activity', () => ({ logOrganizerActivity: vi.fn(), organizerActor: () => null }));
vi.mock('@/lib/events/billing', () => ({ hostPlanStatus: vi.fn(async () => null) }));
vi.mock('@/lib/email/send', () => ({ sendEmailFireAndForget: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({ apiRateLimit: null, checkRateLimit: async () => ({ success: true }), rateLimitMessage: () => '', retryAfterHeaders: () => ({}) }));
vi.mock('@udyaibase/utils', () => ({ teamInviteHtml: () => '<p>invite</p>' }));

import { GET, POST } from '@/app/api/organizer/team/route';
import { PUT, DELETE } from '@/app/api/organizer/team/[id]/route';

const req = (method: string, body?: unknown) =>
  new NextRequest('http://localhost:3000/api/organizer/team/m1', { method, body: body ? JSON.stringify(body) : undefined, headers: { 'Content-Type': 'application/json' } });
const params = { params: Promise.resolve({ id: 'm1' }) };
const member = (role: string, status = 'ACTIVE') => db.eventTeamMember.findFirst.mockResolvedValue({ id: 'm1', organizerId: 'org1', email: 'x@y.co', role, status });

beforeEach(() => { vi.clearAllMocks(); who.role = 'OWNER'; who.teamMemberId = undefined; });

describe('changing a teammate role', () => {
  it('owner can promote staff to admin and demote an admin', async () => {
    member('STAFF');
    expect((await PUT(req('PUT', { role: 'ADMIN' }), params)).status).toBe(200);
    expect(db.eventTeamMember.update).toHaveBeenCalledWith({ where: { id: 'm1' }, data: { role: 'ADMIN' } });
    member('ADMIN');
    expect((await PUT(req('PUT', { role: 'STAFF' }), params)).status).toBe(200);
  });

  it('admin can change roles below admin, but not make admins or touch other admins', async () => {
    who.role = 'ADMIN'; who.teamMemberId = 'me-member';
    member('STAFF');
    expect((await PUT(req('PUT', { role: 'MANAGER' }), params)).status).toBe(200);
    expect((await PUT(req('PUT', { role: 'ADMIN' }), params)).status).toBe(403);
    member('ADMIN');
    expect((await PUT(req('PUT', { role: 'STAFF' }), params)).status).toBe(403);
  });

  it('manager and staff cannot change roles at all', async () => {
    for (const role of ['MANAGER', 'STAFF', 'CHECK_IN']) {
      who.role = role;
      member('CHECK_IN');
      expect((await PUT(req('PUT', { role: 'STAFF' }), params)).status).toBe(403);
    }
    expect(db.eventTeamMember.update).not.toHaveBeenCalled();
  });

  it('rejects unknown roles, OWNER, self-edits and removed members', async () => {
    member('STAFF');
    expect((await PUT(req('PUT', { role: 'SUPERUSER' }), params)).status).toBe(400);
    expect((await PUT(req('PUT', { role: 'OWNER' }), params)).status).toBe(400);
    who.role = 'ADMIN'; who.teamMemberId = 'm1';
    expect((await PUT(req('PUT', { role: 'STAFF' }), params)).status).toBe(403);
    expect((await DELETE(req('DELETE'), params)).status).toBe(403);
    who.role = 'OWNER'; who.teamMemberId = undefined;
    member('STAFF', 'REVOKED');
    expect((await PUT(req('PUT', { role: 'MANAGER' }), params)).status).toBe(409);
  });

  it('only keeps events from this workspace', async () => {
    member('STAFF');
    expect((await PUT(req('PUT', { eventIds: ['ev-own', 'ev-other-host'] }), params)).status).toBe(200);
    expect((db.event.findMany.mock.calls as any)[0][0].where).toMatchObject({ organizerId: 'org1' });
    expect(db.eventTeamAssignment.createMany).toHaveBeenCalledWith({ data: [{ teamMemberId: 'm1', eventId: 'ev-own' }] });
    expect((await PUT(req('PUT', { eventIds: 'all' }), params)).status).toBe(400);
  });
});

describe('team list and invites', () => {
  it('tells the page what the viewer may do and never returns invite tokens', async () => {
    db.eventTeamMember.findMany.mockResolvedValue([{ id: 'm1', email: 'x@y.co', role: 'STAFF', status: 'ACTIVE', inviteToken: 'secret', passwordHash: 'h' }] as any);
    const d = await (await GET()).json();
    expect(d.viewer).toEqual({ role: 'OWNER', canManage: true, assignableRoles: ['ADMIN', 'MANAGER', 'STAFF', 'CHECK_IN'] });
    expect(d.members[0]).toMatchObject({ canEdit: true });
    expect(d.members[0].inviteToken).toBeUndefined();
    who.role = 'MANAGER';
    const m = await (await GET()).json();
    expect(m.viewer.canManage).toBe(false);
    expect(m.members[0].canEdit).toBe(false);
  });

  it('invite: validates email and role, and an admin cannot invite an admin', async () => {
    db.eventTeamMember.findFirst.mockResolvedValue(null);
    expect((await POST(req('POST', { email: 'nope' }))).status).toBe(400);
    expect((await POST(req('POST', { email: 'a@b.co', role: 'GOD' }))).status).toBe(400);
    who.role = 'ADMIN';
    expect((await POST(req('POST', { email: 'a@b.co', role: 'ADMIN' }))).status).toBe(403);
  });
});
