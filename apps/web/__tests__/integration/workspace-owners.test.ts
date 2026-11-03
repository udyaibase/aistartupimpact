import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({
  jobBoardTeamMember: { findUnique: vi.fn(), count: vi.fn(), upsert: vi.fn() },
  jobBoardEmployer: { findUnique: vi.fn() },
}));
vi.mock('@udyaibase/database', () => ({ prisma: db }));

import { ensureOwnerMember, internalAccountEmail, isRealInbox, ownerChangeProblem } from '@/lib/employer/owners';

describe('workspace owners', () => {
  beforeEach(() => vi.clearAllMocks());

  it('internal and Udyaibase addresses are never treated as inboxes', () => {
    expect(isRealInbox('priya@neuralpay.in')).toBe(true);
    expect(isRealInbox('jobs@udyaibase.com')).toBe(false);
    expect(isRealInbox(internalAccountEmail('neuralpay'))).toBe(false);
    expect(isRealInbox(null)).toBe(false);
  });

  it('the last active owner cannot be removed or demoted; other owners can', async () => {
    db.jobBoardTeamMember.findUnique.mockResolvedValue({ email: 'arjun@neuralpay.in', role: 'OWNER', status: 'ACTIVE' });
    db.jobBoardEmployer.findUnique.mockResolvedValue({ email: 'priya@neuralpay.in' });
    db.jobBoardTeamMember.count.mockResolvedValue(1);
    expect(await ownerChangeProblem('e1', 'm1', 'remove')).toMatch(/at least one owner/);
    db.jobBoardTeamMember.count.mockResolvedValue(2);
    expect(await ownerChangeProblem('e1', 'm1', 'demote')).toBeNull();
  });

  it('the account owner (workspace email) is never removed, even with other owners', async () => {
    db.jobBoardTeamMember.findUnique.mockResolvedValue({ email: 'Priya@NeuralPay.in', role: 'OWNER', status: 'ACTIVE' });
    db.jobBoardEmployer.findUnique.mockResolvedValue({ email: 'priya@neuralpay.in' });
    db.jobBoardTeamMember.count.mockResolvedValue(3);
    expect(await ownerChangeProblem('e1', 'm1', 'remove')).toMatch(/account owner/);
  });

  it('recruiters and interviewers are never blocked by the owner rule', async () => {
    db.jobBoardTeamMember.findUnique.mockResolvedValue({ email: 'rahul@neuralpay.in', role: 'RECRUITER', status: 'ACTIVE' });
    expect(await ownerChangeProblem('e1', 'm2', 'remove')).toBeNull();
  });

  it('owner rows are created for real workspaces only (never admin placeholders or internal addresses)', async () => {
    db.jobBoardEmployer.findUnique.mockResolvedValue({ email: 'x@y.in', passwordHash: '', companyName: 'X', FounderUser: null });
    expect(await ensureOwnerMember('e1')).toBeNull();
    db.jobBoardEmployer.findUnique.mockResolvedValue({ email: internalAccountEmail('x'), passwordHash: '!founder-sso', companyName: 'X', FounderUser: null });
    expect(await ensureOwnerMember('e1')).toBeNull();
    expect(db.jobBoardTeamMember.upsert).not.toHaveBeenCalled();

    // A founder's second workspace: the founder's own email becomes the owner row.
    db.jobBoardTeamMember.upsert.mockResolvedValue({ id: 'm9' });
    await ensureOwnerMember('e1', { email: 'Arjun@NeuralPay.in', name: 'Arjun' });
    const arg = db.jobBoardTeamMember.upsert.mock.calls[0][0];
    expect(arg.create).toMatchObject({ email: 'arjun@neuralpay.in', role: 'OWNER', status: 'ACTIVE' });
    expect(arg.update).toMatchObject({ role: 'OWNER', status: 'ACTIVE', inviteTokenHash: null });
  });
});
