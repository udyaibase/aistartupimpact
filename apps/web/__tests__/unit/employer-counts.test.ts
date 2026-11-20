import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const db = vi.hoisted(() => ({
  jobBoardApplication: { count: vi.fn(), groupBy: vi.fn() },
  jobBoardTeamMember: { findMany: vi.fn() },
  jobBoardEmployer: { findUnique: vi.fn() },
}));
vi.mock('@udyaibase/database', () => ({ prisma: db }));

import { OVERDUE_DAYS, overdueWhere, reviewCounts, seatsUsed, toReviewWhere, unseenWhere } from '@/lib/employer/counts';
import { teamForViewer, type TeamRow } from '@/lib/employer/team';
import { VERIFIED_CLAIM_METHODS, showsVerifiedTick } from '@/lib/jobs/trust';

const NOW = Date.parse('2026-11-20T10:00:00Z');

describe('candidate counts: one definition each', () => {
  beforeEach(() => vi.clearAllMocks());

  it('unseen is a subset of to review, and overdue is a subset of to review', () => {
    expect(unseenWhere('e1').status).toBe('APPLIED');
    expect(toReviewWhere('e1').status).toEqual({ in: ['APPLIED', 'REVIEWED'] });
    const overdue = overdueWhere('e1', null, NOW);
    expect(overdue.status).toEqual({ in: ['APPLIED', 'REVIEWED'] });
    expect(overdue.appliedAt.lt.getTime()).toBe(NOW - OVERDUE_DAYS * 864e5);
  });

  it('all three leave out withdrawn, erased, not-yet-interested sourced people and deleted jobs', () => {
    for (const w of [unseenWhere('e1'), toReviewWhere('e1'), overdueWhere('e1', null, NOW)]) {
      expect(w.withdrawnAt).toBeNull();
      expect(w.NOT).toEqual({ email: { endsWith: '@deleted.invalid' } });
      expect(w.AND).toEqual([{ OR: [{ sourcedState: null }, { sourcedState: 'INTERESTED' }] }]);
      expect(w.Listing).toEqual({ employerId: 'e1', deletedAt: null });
    }
  });

  it('an interviewer limited to some jobs is counted over those jobs only', () => {
    expect(unseenWhere('e1', ['j1']).Listing).toEqual({ employerId: 'e1', deletedAt: null, id: { in: ['j1'] } });
  });

  it('reviewCounts asks for exactly those three', async () => {
    db.jobBoardApplication.count.mockResolvedValueOnce(20).mockResolvedValueOnce(42).mockResolvedValueOnce(29);
    expect(await reviewCounts('e1', null, NOW)).toEqual({ unseen: 20, toReview: 42, overdue: 29 });
    expect(db.jobBoardApplication.count.mock.calls.map((c) => c[0].where)).toEqual([unseenWhere('e1'), toReviewWhere('e1'), overdueWhere('e1', null, NOW)]);
  });

  it('no screen works these counts out for itself any more', () => {
    const read = (p: string) => readFileSync(resolve(__dirname, '../..', p), 'utf8');
    expect(read('lib/employer/portal.ts')).not.toMatch(/status: 'APPLIED'/);
    expect(read('lib/employer/insights.ts')).toContain('overdueWhere(');
    expect(read('lib/employer/insights.ts')).toContain('toReviewByJob(');
  });
});

describe('seats in use', () => {
  it('counts the owner once when they have their own team row', async () => {
    db.jobBoardEmployer.findUnique.mockResolvedValue({ email: 'Owner@acme.test' });
    db.jobBoardTeamMember.findMany.mockResolvedValue([{ email: 'owner@acme.test' }, { email: 'a@acme.test' }, { email: 'b@acme.test' }]);
    expect(await seatsUsed('e1')).toBe(3);
  });

  it('still gives an older workspace owner without a row their seat', async () => {
    db.jobBoardEmployer.findUnique.mockResolvedValue({ email: 'owner@acme.test' });
    db.jobBoardTeamMember.findMany.mockResolvedValue([{ email: 'a@acme.test' }]);
    expect(await seatsUsed('e1')).toBe(2);
  });
});

describe('the verified tick: one rule', () => {
  it('shows for an admin-verified workspace or a proven startup link, and for nothing else', () => {
    expect(showsVerifiedTick({ isVerified: true, startupId: null, startupClaimMethod: null })).toBe(true);
    for (const m of VERIFIED_CLAIM_METHODS) expect(showsVerifiedTick({ isVerified: false, startupId: 's1', startupClaimMethod: m })).toBe(true);
    expect(showsVerifiedTick({ isVerified: false, startupId: 's1', startupClaimMethod: 'SELF' })).toBe(false);
    expect(showsVerifiedTick({ isVerified: false, startupId: null, startupClaimMethod: 'FOUNDER' })).toBe(false);
  });

  it('the pages, the alert email and the search query all use it instead of their own copy', () => {
    const read = (p: string) => readFileSync(resolve(__dirname, '../..', p), 'utf8');
    expect(read('app/(public)/jobs/[slug]/page.tsx')).toContain('showsVerifiedTick(job)');
    expect(read('lib/jobs/job-alerts.ts')).toContain('showsVerifiedTick(j.Employer)');
    const search = read('lib/jobs/search.ts');
    expect(search).toContain('VERIFIED_CLAIM_METHODS');
    expect(search).not.toMatch(/'DOMAIN_OTP'/);
  });
});

describe('team list for a job-limited interviewer', () => {
  const row = (over: Partial<TeamRow>): TeamRow => ({ id: 'm', email: 'x@acme.test', name: null, role: 'RECRUITER', status: 'ACTIVE', invitedAt: null, inviteExpired: false, jobIds: [], accountOwner: false, ...over });
  const team = [
    row({ id: 'm1', email: 'owner@acme.test', name: 'Asha', role: 'OWNER' }),
    row({ id: 'm2', email: 'me@acme.test', name: 'Me', role: 'INTERVIEWER', jobIds: ['j1'] }),
    row({ id: 'm3', email: 'invited@acme.test', status: 'PENDING' }),
    row({ id: 'm4', email: 'asked@other.test', status: 'REQUESTED' }),
  ];

  it('owners and recruiters see everything', () => {
    expect(teamForViewer(team, { memberId: 'm1', jobIds: null })).toBe(team);
  });

  it('a limited interviewer sees names and roles, their own email, and no invites or requests', () => {
    const seen = teamForViewer(team, { memberId: 'm2', jobIds: ['j1'] });
    expect(seen.map((t) => t.id)).toEqual(['m1', 'm2']);
    expect(seen[0]).toMatchObject({ name: 'Asha', role: 'OWNER', email: '' });
    expect(seen[1].email).toBe('me@acme.test');
    expect(JSON.stringify(seen)).not.toMatch(/owner@|invited@|asked@/);
  });
});
