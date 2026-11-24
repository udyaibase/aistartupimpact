import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const who = vi.hoisted(() => ({ session: { id: 'emp1', email: 'hr@acme.co', role: 'OWNER', jobIds: null, memberId: null, memberName: null } as any }));
const db = vi.hoisted(() => ({
  jobBoardReferrer: { findUnique: vi.fn(), create: vi.fn() },
  jobAlertSubscription: { findFirst: vi.fn(), count: vi.fn(async (..._a: any[]): Promise<any> => 0), create: vi.fn(), update: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(async (..._a: any[]): Promise<any> => []), updateMany: vi.fn(async (..._a: any[]): Promise<any> => ({ count: 1 })) },
  jobBoardListing: { findFirst: vi.fn(), findMany: vi.fn(async (..._a: any[]): Promise<any> => []) },
  jobBoardApplication: { findMany: vi.fn(async (..._a: any[]): Promise<any> => []), findFirst: vi.fn() },
  jobBoardTalentInvite: { findMany: vi.fn(async (..._a: any[]): Promise<any> => []), findFirst: vi.fn(), create: vi.fn(), count: vi.fn(async () => 0) },
  jobBoardShortlistShare: { create: vi.fn(), findUnique: vi.fn(), count: vi.fn(async (..._a: any[]): Promise<any> => 0), update: vi.fn(async (..._a: any[]): Promise<any> => ({})), updateMany: vi.fn() },
  jobBoardShortlistVote: { upsert: vi.fn(), findMany: vi.fn(async (..._a: any[]): Promise<any> => []) },
  jobBoardApplicationEvent: { findMany: vi.fn(async (..._a: any[]): Promise<any> => []) },
}));
const mail = vi.hoisted(() => ({ one: vi.fn(), batch: vi.fn(async (items: unknown[]) => items.map(() => ({ success: true }))) }));

vi.mock('@udyaibase/database', () => ({ prisma: db }));
vi.mock('@/lib/employer-auth', () => ({ getEmployerSession: vi.fn(async () => who.session) }));
vi.mock('@/lib/employer/write-limit', () => ({ writeLimited: async () => null }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: async () => ({ success: true }), getClientIdentifier: () => 'ip', apiRateLimit: {} }));
vi.mock('@/lib/event-rate-limit', () => ({ applicationStatusRateLimit: {}, careersConfirmPerEmailRateLimit: {}, careersSubscribeRateLimit: {} }));
vi.mock('@/lib/email/send', () => ({ sendEmailFireAndForget: mail.one, sendEmailBatch: mail.batch, sendEmail: vi.fn() }));
vi.mock('@/lib/employer/applications', () => ({ employerContext: async () => ({ company: 'Acme', bookingUrl: null, email: 'hr@acme.co' }) }));

import { referrerFor, isReferralCode, newReferralCode } from '@/lib/employer/referrals';
import { alertTitle, cleanFilters, subscribeToJobAlert, runJobAlerts, MAX_ALERTS_PER_EMAIL } from '@/lib/jobs/job-alerts';
import { poolMatchesForJob, inviteFromPool } from '@/lib/employer/talent-invite';
import { castVote, createShare, shareByToken } from '@/lib/employer/shortlist-share';
import { POST as SHARE, DELETE as UNSHARE } from '@/app/api/employer/jobs/[id]/shortlist-share/route';

process.env.EMPLOYER_JWT_SECRET = 'test-employer-secret-min-32-characters-long';

beforeEach(() => {
  vi.clearAllMocks();
  who.session = { id: 'emp1', email: 'hr@acme.co', role: 'OWNER', jobIds: null, memberId: null, memberName: null };
});

describe('referral links', () => {
  it('codes are short, unambiguous and only count for the company that owns them', async () => {
    const code = newReferralCode();
    expect(isReferralCode(code)).toBe(true);
    expect(code).not.toMatch(/[01lo]/);
    expect(isReferralCode('https://evil.example')).toBe(false);
    db.jobBoardReferrer.findUnique.mockResolvedValueOnce({ id: 'r1', name: 'Asha', employerId: 'emp1' });
    expect(await referrerFor('abcd2345', 'emp1')).toEqual({ id: 'r1', name: 'Asha' });
    db.jobBoardReferrer.findUnique.mockResolvedValueOnce({ id: 'r1', name: 'Asha', employerId: 'emp1' });
    expect(await referrerFor('abcd2345', 'other-company')).toBeNull();
    expect(await referrerFor(undefined, 'emp1')).toBeNull();
  });
});

describe('job alerts', () => {
  it('cleans filters and names the alert', () => {
    expect(cleanFilters({ category: 'ML_ENGINEER', city: '  Bengaluru ', remoteOnly: false })).toEqual({ category: 'ML_ENGINEER', city: 'Bengaluru', remoteOnly: false });
    expect(cleanFilters({ category: 'HACKER' }).category).toBeNull();
    expect(alertTitle({ category: 'ML_ENGINEER', city: 'Pune' })).toBe('ML Engineer jobs in Pune');
    expect(alertTitle({ category: null, city: 'Pune', remoteOnly: true })).toBe('Remote AI jobs');
  });

  it('new alerts send one confirmation; the 6th alert for an address is refused', async () => {
    db.jobAlertSubscription.findFirst.mockResolvedValueOnce(null);
    expect(await subscribeToJobAlert('a@x.co', { category: 'AI_ENGINEER', city: 'Pune', remoteOnly: false })).toBe('ok');
    expect(db.jobAlertSubscription.create.mock.calls[0][0].data).toMatchObject({ email: 'a@x.co', category: 'AI_ENGINEER', city: 'Pune', workType: null, tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(mail.one.mock.calls[0][0].subject).toBe('Confirm your job alert: AI Engineer jobs in Pune');
    db.jobAlertSubscription.findFirst.mockResolvedValueOnce(null);
    db.jobAlertSubscription.count.mockResolvedValueOnce(MAX_ALERTS_PER_EMAIL);
    expect(await subscribeToJobAlert('a@x.co', { category: null, city: null, remoteOnly: false })).toBe('limit');
  });

  it('an already-confirmed alert gets no second email', async () => {
    db.jobAlertSubscription.findFirst.mockResolvedValueOnce({ id: 'x', confirmedAt: new Date(), unsubscribedAt: null, consentAt: new Date() });
    await subscribeToJobAlert('a@x.co', { category: null, city: null, remoteOnly: false });
    expect(mail.one).not.toHaveBeenCalled();
    expect(db.jobAlertSubscription.create).not.toHaveBeenCalled();
  });

  it('weekly run claims each alert first, and skips alerts with nothing new', async () => {
    db.jobAlertSubscription.findMany.mockResolvedValueOnce([
      { id: 'a1', email: 'a@x.co', category: null, city: null, workType: null, lastSentAt: null, confirmedAt: new Date('2026-11-01') },
      { id: 'a2', email: 'b@x.co', category: null, city: null, workType: null, lastSentAt: null, confirmedAt: new Date('2026-11-01') },
    ]);
    db.jobAlertSubscription.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 }); // a2 claimed by another run
    db.jobBoardListing.findMany.mockResolvedValueOnce([{ title: 'ML Engineer', slug: 'ml', city: 'Pune', workType: 'ONSITE', Employer: { companyName: 'Acme', isVerified: true, startupId: null, startupClaimMethod: null, Startup: null } }]);
    const r = await runJobAlerts(new Date('2026-11-23T04:30:00Z'));
    expect(r.sent).toBe(1);
    const sentItems = mail.batch.mock.calls[0][0] as any[];
    expect(sentItems).toHaveLength(1);
    expect(sentItems[0].to).toBe('a@x.co');
    expect(sentItems[0].html).toContain('Verified');
    expect(sentItems[0].headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
  });
});

describe('past applicants who match a new job', () => {
  const job = { skills: ['Python', 'PyTorch'], mustHaveSkills: [], experienceMin: null, experienceMax: null, workType: 'REMOTE', city: null, salaryMax: null, salaryCurrency: 'INR', maxNoticeDays: null, screeningQuestions: null };
  const person = (id: string, email: string, skills: string[]) => ({ id, email, fullName: id, currentTitle: null, city: null, experienceYears: 3, noticePeriodDays: 30, expectedCtcLakh: null, confirmedSkills: skills, matchedSkills: skills, status: 'REJECTED', appliedAt: new Date('2026-10-01'), Listing: { title: 'Old role', isGeneral: false } });

  it('leaves out people who applied, were hired or were already invited, and weak matches', async () => {
    db.jobBoardListing.findFirst.mockResolvedValueOnce(job);
    db.jobBoardApplication.findMany
      .mockResolvedValueOnce([person('good', 'g@x.co', ['Python', 'PyTorch']), person('weak', 'w@x.co', []), person('applied', 'ap@x.co', ['Python', 'PyTorch']), person('hired', 'h@x.co', ['Python', 'PyTorch'])])
      .mockResolvedValueOnce([{ email: 'AP@x.co' }])
      .mockResolvedValueOnce([{ email: 'h@x.co' }]);
    db.jobBoardTalentInvite.findMany.mockResolvedValueOnce([]);
    const m = await poolMatchesForJob('emp1', 'job2');
    expect(m.map((x) => x.id)).toEqual(['good']);
  });

  it('says how far each match got with you and which skills fit the job', async () => {
    db.jobBoardListing.findFirst.mockResolvedValueOnce({ ...job, mustHaveSkills: ['Kubernetes'] });
    db.jobBoardApplication.findMany.mockResolvedValueOnce([{ ...person('good', 'g@x.co', ['Docker', 'Python', 'PyTorch']), id: 'a1' }]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    db.jobBoardTalentInvite.findMany.mockResolvedValueOnce([]);
    db.jobBoardApplicationEvent.findMany.mockResolvedValueOnce([{ applicationId: 'a1', toStatus: 'INTERVIEW' }]);
    const [m] = await poolMatchesForJob('emp1', 'job2');
    expect(m).toMatchObject({ stage: 'Interviewed, not selected', stageRank: 3, matchedSkills: ['Python', 'PyTorch'], missingMustHaves: ['Kubernetes'] });
    expect(m!.skills.slice(0, 2)).toEqual(['Python', 'PyTorch']);
  });

  it('never invites someone who already applied', async () => {
    db.jobBoardApplication.findFirst.mockResolvedValueOnce({ id: 'p1', email: 'g@x.co', fullName: 'G' }).mockResolvedValueOnce({ id: 'existing' }).mockResolvedValueOnce(null);
    db.jobBoardTalentInvite.findFirst.mockResolvedValueOnce(null);
    expect(await inviteFromPool({ employerId: 'emp1', invitedByEmail: 'hr@acme.co', company: 'Acme', applicationId: 'p1', listing: { id: 'job2', title: 'ML', slug: 'ml' } })).toBe('applied');
    expect(db.jobBoardTalentInvite.create).not.toHaveBeenCalled();
    expect(mail.one).not.toHaveBeenCalled();
  });
});

describe('shared shortlist link', () => {
  it('stores only a hash of the token and expires in 14 days', async () => {
    db.jobBoardShortlistShare.create.mockImplementationOnce(async (a: any) => ({ id: 's1', expiresAt: a.data.expiresAt }));
    const now = new Date('2026-11-18T00:00:00Z');
    const s = await createShare({ employerId: 'emp1', listingId: 'job1', sharedWithName: ' Rahul ', createdByEmail: 'hr@acme.co', now });
    const token = s.link.split('/').pop()!;
    const data = db.jobBoardShortlistShare.create.mock.calls[0][0].data;
    expect(data.tokenHash).not.toContain(token);
    expect(data.sharedWithName).toBe('Rahul');
    expect(new Date(s.expiresAt).getTime() - now.getTime()).toBe(14 * 864e5);
  });

  it('a revoked or expired link opens nothing', async () => {
    const token = 'a'.repeat(43);
    db.jobBoardShortlistShare.findUnique.mockResolvedValueOnce({ id: 's1', employerId: 'emp1', listingId: 'job1', sharedWithName: 'R', expiresAt: new Date(Date.now() + 864e5), revokedAt: new Date() });
    expect(await shareByToken(token)).toBeNull();
    db.jobBoardShortlistShare.findUnique.mockResolvedValueOnce({ id: 's1', employerId: 'emp1', listingId: 'job1', sharedWithName: 'R', expiresAt: new Date(Date.now() - 1), revokedAt: null });
    expect(await shareByToken(token)).toBeNull();
    expect(await shareByToken('short')).toBeNull();
  });

  it('votes only on candidates the link shows, with a known answer', async () => {
    const token = 'b'.repeat(43);
    const live = { id: 's1', employerId: 'emp1', listingId: 'job1', sharedWithName: 'R', expiresAt: new Date(Date.now() + 864e5), revokedAt: null };
    expect(await castVote(token, 'a1', 'LOVE_IT', null)).toBe('invalid');
    db.jobBoardShortlistShare.findUnique.mockResolvedValueOnce(live);
    db.jobBoardListing.findFirst.mockResolvedValueOnce({ id: 'job1', title: 'ML' });
    db.jobBoardApplication.findFirst.mockResolvedValueOnce(null); // not on this shortlist
    expect(await castVote(token, 'other-company-app', 'YES', null)).toBe('invalid');
    expect(db.jobBoardApplication.findFirst.mock.calls[0][0].where).toMatchObject({ listingId: 'job1', status: { in: ['SHORTLISTED', 'INTERVIEW'] } });
    db.jobBoardShortlistShare.findUnique.mockResolvedValueOnce(live);
    db.jobBoardListing.findFirst.mockResolvedValueOnce({ id: 'job1', title: 'ML' });
    db.jobBoardApplication.findFirst.mockResolvedValueOnce({ id: 'a1' });
    expect(await castVote(token, 'a1', 'YES', '  strong   systems design ')).toBe('ok');
    expect(db.jobBoardShortlistVote.upsert.mock.calls[0][0].create).toMatchObject({ shareId: 's1', applicationId: 'a1', vote: 'YES', comment: 'strong systems design' });
  });

  it('only owners and recruiters can share, and only their own jobs', async () => {
    const call = () => SHARE(new NextRequest('http://localhost/x', { method: 'POST', body: JSON.stringify({ name: 'Rahul' }) }), { params: Promise.resolve({ id: 'job1' }) });
    who.session.role = 'INTERVIEWER';
    expect((await call()).status).toBe(403);
    who.session.role = 'OWNER';
    db.jobBoardListing.findFirst.mockResolvedValueOnce(null);
    expect((await call()).status).toBe(404);
    db.jobBoardShortlistShare.updateMany.mockResolvedValueOnce({ count: 0 });
    const del = await UNSHARE(new NextRequest('http://localhost/x?share=s-other', { method: 'DELETE' }), { params: Promise.resolve({ id: 'job1' }) });
    expect(del.status).toBe(404);
    expect(db.jobBoardShortlistShare.updateMany.mock.calls[0][0].where).toMatchObject({ id: 's-other', employerId: 'emp1', listingId: 'job1' });
  });
});
