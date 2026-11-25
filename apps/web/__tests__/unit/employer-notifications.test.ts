import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const db = vi.hoisted(() => ({
  jobBoardEmployer: { findUnique: vi.fn() },
  jobBoardTeamMember: { findMany: vi.fn(), findFirst: vi.fn() },
  employerNotification: { createMany: vi.fn(async (_a: unknown) => ({ count: 1 })), findMany: vi.fn(async (_a: unknown) => []), count: vi.fn(async (_a: unknown) => 0), updateMany: vi.fn(async (_a: unknown) => ({ count: 1 })), deleteMany: vi.fn(async (_a: unknown) => ({ count: 1 })) },
}));
const guard = vi.hoisted(() => ({ session: { id: 'emp1', memberId: null as string | null, role: 'OWNER', email: 'owner@acme.com' } }));
vi.mock('@udyaibase/database', () => ({ prisma: db }));
vi.mock('@/lib/employer/api-session', () => ({ employerApi: vi.fn(async () => ({ session: guard.session })) }));
vi.mock('@/lib/rate-limit', () => ({ apiRateLimit: null, checkRateLimit: vi.fn(async () => ({ success: true, reset: 0 })), rateLimitMessage: () => 'slow', retryAfterHeaders: () => ({}) }));

import { notifyEmployer } from '@/lib/employer/notify';
import { GET, PATCH, DELETE } from '@/app/api/employer/notifications/feed/route';

const note = { type: 'new_application', title: 'New applicant', message: 'Asha applied.' };
const rows = () => ((db.employerNotification.createMany.mock.calls as unknown[][]).at(-1)?.[0] as { data: { memberId: string | null }[] } | undefined)?.data.map((d) => d.memberId);

beforeEach(() => {
  vi.clearAllMocks();
  db.jobBoardEmployer.findUnique.mockResolvedValue({ email: 'owner@acme.com', passwordHash: 'x' });
  guard.session = { id: 'emp1', memberId: null, role: 'OWNER', email: 'owner@acme.com' };
  db.jobBoardTeamMember.findMany.mockResolvedValue([]);
});

const member = (id: string, email: string, role: string) => ({ id, email, role });
const argsOf = (fn: { mock: { calls: unknown[][] } }) => fn.mock.calls[0]?.[0] as { where: Record<string, unknown> };

describe('who gets an employer note', () => {
  it('team: the owner and active owners/recruiters, never interviewers', async () => {
    db.jobBoardTeamMember.findMany.mockResolvedValue([member('m1', 'rec@acme.com', 'RECRUITER'), member('m2', 'co@acme.com', 'OWNER'), member('m3', 'int@acme.com', 'INTERVIEWER')]);
    await notifyEmployer('emp1', note);
    expect(rows()).toEqual([null, 'm1', 'm2']);
  });

  it('owners: the owner and Owner-role members only', async () => {
    db.jobBoardTeamMember.findMany.mockResolvedValue([member('m1', 'rec@acme.com', 'RECRUITER'), member('m2', 'co@acme.com', 'OWNER')]);
    await notifyEmployer('emp1', note, 'owners');
    expect(rows()).toEqual([null, 'm2']);
  });

  it('the owner with their own member row gets one note, under that member', async () => {
    db.jobBoardTeamMember.findMany.mockResolvedValue([member('mo', 'Owner@Acme.com', 'OWNER'), member('m1', 'rec@acme.com', 'RECRUITER')]);
    await notifyEmployer('emp1', note);
    expect(rows()).toEqual(['mo', 'm1']);
    await notifyEmployer('emp1', note, { email: 'owner@acme.com' });
    expect(rows()).toEqual(['mo']);
  });

  it('by email: a member, or nobody outside the workspace', async () => {
    db.jobBoardTeamMember.findMany.mockResolvedValue([member('m9', 'rec@acme.com', 'RECRUITER')]);
    await notifyEmployer('emp1', note, { email: 'REC@acme.com' });
    expect(rows()).toEqual(['m9']);
    db.employerNotification.createMany.mockClear();
    await notifyEmployer('emp1', note, { email: 'stranger@x.com' });
    expect(db.employerNotification.createMany).not.toHaveBeenCalled();
  });

  it('skips the owner of an admin-managed placeholder workspace and never throws', async () => {
    db.jobBoardEmployer.findUnique.mockResolvedValue({ email: 'x@acme.com', passwordHash: '' });
    await notifyEmployer('emp1', note, 'owner');
    expect(db.employerNotification.createMany).not.toHaveBeenCalled();
    db.jobBoardEmployer.findUnique.mockRejectedValue(new Error('db down'));
    await expect(notifyEmployer('emp1', note)).resolves.toBeUndefined();
  });
});

describe('employer bell API', () => {
  it('a recruiter sees only their own notes', async () => {
    guard.session = { id: 'emp1', memberId: 'm1', role: 'RECRUITER', email: 'rec@acme.com' };
    await GET();
    expect(argsOf(db.employerNotification.findMany).where).toEqual({ employerId: 'emp1', memberId: 'm1' });
  });

  it('the owner signed in as their member also sees notes filed for the account owner', async () => {
    guard.session = { id: 'emp1', memberId: 'mo', role: 'OWNER', email: 'Owner@acme.com' };
    await GET();
    expect(argsOf(db.employerNotification.findMany).where).toEqual({ employerId: 'emp1', OR: [{ memberId: 'mo' }, { memberId: null }] });
  });

  it('marks read and removes within the person’s own notes', async () => {
    await PATCH(new NextRequest('http://x', { method: 'PATCH', body: JSON.stringify({ notificationId: 'n1' }) }));
    expect(argsOf(db.employerNotification.updateMany).where).toEqual({ employerId: 'emp1', memberId: null, id: 'n1' });
    await DELETE(new NextRequest('http://x?id=n2', { method: 'DELETE' }));
    expect(argsOf(db.employerNotification.deleteMany).where).toEqual({ employerId: 'emp1', memberId: null, id: 'n2' });
  });
});
