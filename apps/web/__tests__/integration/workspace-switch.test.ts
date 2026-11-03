import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({ jobBoardTeamMember: { findFirst: vi.fn(), update: vi.fn() } }));
const session = vi.hoisted(() => ({ current: null as null | { email: string; id: string } }));
const setEmployerSession = vi.hoisted(() => vi.fn());
vi.mock('@udyaibase/database', () => ({ prisma: db }));
vi.mock('@/lib/employer-auth', () => ({ getEmployerSession: async () => session.current, setEmployerSession }));

const call = async (employerId: string) => {
  const { POST } = await import('@/app/api/employer/workspaces/switch/route');
  return POST(new Request('http://x/api/employer/workspaces/switch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ employerId }) }) as any);
};

describe('POST /api/employer/workspaces/switch', () => {
  beforeEach(() => { vi.clearAllMocks(); session.current = { email: 'priya@acme.ai', id: 'e1' }; });

  it('needs a session', async () => {
    session.current = null;
    expect((await call('e2')).status).toBe(401);
  });

  it('only switches to a team the same email actively belongs to', async () => {
    db.jobBoardTeamMember.findFirst.mockResolvedValue(null);
    expect((await call('e2')).status).toBe(403);
    expect(db.jobBoardTeamMember.findFirst.mock.calls[0][0].where).toMatchObject({ employerId: 'e2', email: 'priya@acme.ai', status: 'ACTIVE' });
    expect(setEmployerSession).not.toHaveBeenCalled();
  });

  it('refuses a workspace whose account owner uses two-step sign-in', async () => {
    db.jobBoardTeamMember.findFirst.mockResolvedValue({ id: 'm2', role: 'OWNER', email: 'priya@acme.ai', Employer: { id: 'e2', email: 'priya@acme.ai', twoFactorEnabled: true } });
    expect((await call('e2')).status).toBe(403);
    expect(setEmployerSession).not.toHaveBeenCalled();
  });

  it('switches with a fresh session for that membership', async () => {
    db.jobBoardTeamMember.findFirst.mockResolvedValue({ id: 'm2', role: 'RECRUITER', email: 'priya@acme.ai', Employer: { id: 'e2', email: 'owner@speakai.in', companyName: 'SpeakAI', slug: 'speakai', plan: 'FREE', twoFactorEnabled: true } });
    const res = await call('e2');
    expect((await res.json()).redirect).toBe('/employer/dashboard');
    expect(setEmployerSession.mock.calls[0][1]).toEqual({ id: 'm2', email: 'priya@acme.ai' });
  });
});
