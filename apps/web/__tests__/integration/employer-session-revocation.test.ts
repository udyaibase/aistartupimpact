import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.EMPLOYER_JWT_SECRET = 'test-employer-secret-min-32-characters-long';

// A cookie jar the code under test reads and writes, so real signed tokens go through the real checks.
const jar = vi.hoisted(() => new Map<string, string>());
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (n: string) => (jar.has(n) ? { value: jar.get(n)! } : undefined),
    set: (n: string, v: string) => { jar.set(n, v); },
    delete: (n: string) => { jar.delete(n); },
  }),
}));

const db = vi.hoisted(() => ({
  jobBoardEmployer: { findUnique: vi.fn(), updateMany: vi.fn() },
  jobBoardTeamMember: { findFirst: vi.fn(), updateMany: vi.fn() },
}));
vi.mock('@udyaibase/database', () => ({ prisma: db }));

import { getEmployerSession, revokeEmployerSessions, setEmployerSession } from '@/lib/employer-auth';
import { decodeJwt } from 'jose';

const WORKSPACE = { id: 'e1', email: 'owner@acme.test', companyName: 'Name in the cookie', slug: 'old-slug', plan: 'FREE', onboardingCompleted: true };
const member = (over: Record<string, unknown> = {}) => ({ id: 'm1', name: 'Priya', role: 'RECRUITER', jobIds: [], sessionsValidAfter: null, revokedSessionIds: [], ...over });
const employerRow = (m: Record<string, unknown> | null, over: Record<string, unknown> = {}) => ({
  isActive: true, deactivatedAt: null, sessionsValidAfter: null, companyName: 'Acme Labs', slug: 'acme', plan: 'PRO', onboardingCompleted: false,
  ...(m ? { TeamMembers: [m] } : { TeamMembers: [] }), ...over,
});
const sid = () => decodeJwt(jar.get('employer_session')!).sid as string;

describe('employer sessions can be ended', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    jar.clear();
    await setEmployerSession(WORKSPACE, { id: 'm1', email: 'priya@acme.test' });
  });

  it('a teammate session works, and reads company, plan and role from the database, not the cookie', async () => {
    db.jobBoardEmployer.findUnique.mockResolvedValue(employerRow(member()));
    const s = await getEmployerSession();
    expect(s).toMatchObject({ id: 'e1', email: 'priya@acme.test', memberId: 'm1', role: 'RECRUITER', companyName: 'Acme Labs', slug: 'acme', plan: 'PRO' });
    expect(db.jobBoardEmployer.findUnique).toHaveBeenCalledTimes(1);
    const token = decodeJwt(jar.get('employer_session')!);
    expect(token.companyName).toBeUndefined();
    expect(token.plan).toBeUndefined();
  });

  it('a removed teammate has no session', async () => {
    db.jobBoardEmployer.findUnique.mockResolvedValue(employerRow(null));
    expect(await getEmployerSession()).toBeNull();
  });

  it('a signed-out session id no longer works, even with the cookie still in hand', async () => {
    db.jobBoardEmployer.findUnique.mockResolvedValue(employerRow(member({ revokedSessionIds: ['other', sid()] })));
    expect(await getEmployerSession()).toBeNull();
  });

  it('"sign out everywhere" ends sessions issued before it', async () => {
    db.jobBoardEmployer.findUnique.mockResolvedValue(employerRow(member({ sessionsValidAfter: new Date(Date.now() + 5_000) })));
    expect(await getEmployerSession()).toBeNull();
  });

  it('signing out records this session id for that person only', async () => {
    db.jobBoardTeamMember.findFirst.mockResolvedValue({ revokedSessionIds: ['earlier'] });
    await revokeEmployerSessions('this');
    expect(db.jobBoardTeamMember.updateMany).toHaveBeenCalledWith({ where: { id: 'm1' }, data: { revokedSessionIds: ['earlier', sid()] } });
    expect(db.jobBoardEmployer.updateMany).not.toHaveBeenCalled();
  });

  it('signing out everywhere sets the person’s cut-off', async () => {
    await revokeEmployerSessions('all');
    const call = db.jobBoardTeamMember.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({ id: 'm1', employerId: 'e1' });
    expect(call.data.sessionsValidAfter).toBeInstanceOf(Date);
  });

  it('a password sign-in to the workspace account is ended through the workspace cut-off', async () => {
    jar.clear();
    await setEmployerSession(WORKSPACE);
    await revokeEmployerSessions('this');
    expect(db.jobBoardEmployer.updateMany.mock.calls[0][0].where).toEqual({ id: 'e1' });
    db.jobBoardEmployer.findUnique.mockResolvedValue(employerRow(null, { sessionsValidAfter: new Date(Date.now() + 5_000) }));
    expect(await getEmployerSession()).toBeNull();
  });

  it('signing out never throws, even if the database is down', async () => {
    db.jobBoardTeamMember.findFirst.mockRejectedValue(new Error('down'));
    await expect(revokeEmployerSessions('this')).resolves.toBeUndefined();
  });
});
