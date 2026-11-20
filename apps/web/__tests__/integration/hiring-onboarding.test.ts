import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({
  jobBoardEmployer: { findUnique: vi.fn(), findMany: vi.fn(async (..._a: any[]): Promise<any> => []), update: vi.fn(async (..._a: any[]): Promise<any> => ({})), updateMany: vi.fn(async (..._a: any[]): Promise<any> => ({ count: 1 })) },
  jobBoardListing: { findMany: vi.fn(async (..._a: any[]): Promise<any> => []), update: vi.fn(), updateMany: vi.fn(), count: vi.fn(async (..._a: any[]): Promise<any> => 0) },
  jobBoardTeamMember: { findFirst: vi.fn(async (..._a: any[]): Promise<any> => null) },
  jobBoardOnboardingStep: { createMany: vi.fn(async (..._a: any[]): Promise<any> => ({ count: 1 })) },
}));
const mail = vi.hoisted(() => ({ send: vi.fn(async (_o: any) => ({ success: true })), ff: vi.fn() }));
const pub = vi.hoisted(() => ({ waiting: vi.fn(async (..._a: any[]) => ({ published: ['j1'], skipped: [] })) }));

vi.mock('@udyaibase/database', () => ({ prisma: db, Prisma: {} }));
vi.mock('@/lib/email/send', () => ({ sendEmail: mail.send, sendEmailFireAndForget: mail.ff }));
vi.mock('@/lib/employer/publish', () => ({ publishWaiting: pub.waiting }));

import { askFounder, cleanCin, decideCompanyReview, remindFounders, requestCompanyReview } from '@/lib/employer/company-check';
import { markStep } from '@/lib/employer/onboarding';

beforeEach(() => vi.clearAllMocks());
const now = new Date('2026-11-18T06:00:00Z');

describe('company number', () => {
  it('accepts a CIN or LLPIN, rejects anything else', () => {
    expect(cleanCin(' u72900ka2021ptc123456 ')).toBe('U72900KA2021PTC123456');
    expect(cleanCin('AAB-1234')).toBe('AAB-1234');
    expect(cleanCin('')).toBeNull();
    expect(cleanCin('12345')).toBe('invalid');
  });
});

describe('onboarding steps', () => {
  it('records each step once and never throws', async () => {
    await markStep('emp1', 'FIRST_DRAFT');
    expect(db.jobBoardOnboardingStep.createMany).toHaveBeenCalledWith({ data: [{ employerId: 'emp1', step: 'FIRST_DRAFT' }], skipDuplicates: true });
    db.jobBoardOnboardingStep.createMany.mockRejectedValueOnce(new Error('db down'));
    await expect(markStep('emp1', 'FIRST_JOB_LIVE')).resolves.toBeUndefined();
  });
});

describe('company check', () => {
  it('the first request marks it pending and tells our team; a repeat does nothing', async () => {
    db.jobBoardEmployer.findUnique.mockResolvedValueOnce({ companyName: 'Acme', websiteUrl: 'https://acme.ai', linkedinUrl: null, companyCin: null });
    await requestCompanyReview('emp1', 'asha@acme.ai', now);
    expect(db.jobBoardEmployer.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: 'emp1', companyReview: null }, data: { companyReview: 'PENDING', companyReviewRequestedBy: 'asha@acme.ai' } });
    expect(mail.ff.mock.calls[0][0]).toMatchObject({ type: 'admin_company_check' });
    db.jobBoardEmployer.updateMany.mockResolvedValueOnce({ count: 0 });
    await requestCompanyReview('emp1', 'asha@acme.ai', now);
    expect(mail.ff).toHaveBeenCalledTimes(1);
  });

  it('passing publishes the waiting jobs', async () => {
    db.jobBoardEmployer.findUnique.mockResolvedValueOnce({ id: 'emp1', companyName: 'Acme', companyReviewRequestedBy: 'asha@acme.ai', email: 'asha@acme.ai' });
    const r = await decideCompanyReview({ employerId: 'emp1', approve: true, note: null, reviewer: 'hari@udyaibase.com', now });
    expect(r).toEqual({ ok: true, published: 1 });
    expect(db.jobBoardEmployer.update.mock.calls[0][0].data).toMatchObject({ companyReview: 'APPROVED', companyReviewedBy: 'hari@udyaibase.com' });
    expect(pub.waiting).toHaveBeenCalledWith('emp1', now);
  });

  it('failing needs a reason, stops the waiting and emails the team', async () => {
    expect(await decideCompanyReview({ employerId: 'emp1', approve: false, note: ' ', reviewer: 'hari', now })).toMatchObject({ ok: false });
    db.jobBoardEmployer.findUnique.mockResolvedValueOnce({ id: 'emp1', companyName: 'Acme', companyReviewRequestedBy: 'asha@acme.ai', email: 'asha@acme.ai' });
    expect(await decideCompanyReview({ employerId: 'emp1', approve: false, note: 'Website is a placeholder', reviewer: 'hari', now })).toEqual({ ok: true, published: 0 });
    expect(db.jobBoardListing.updateMany.mock.calls[0][0].data).toEqual({ publishWaitingAt: null, publishWaitingBy: null });
    expect(mail.ff.mock.calls[0][0]).toMatchObject({ to: 'asha@acme.ai', type: 'employer_company_check_failed' });
    expect(pub.waiting).not.toHaveBeenCalled();
  });
});

describe('send to your founder', () => {
  const ws = (over: Record<string, unknown> = {}) => ({ companyName: 'Acme', startupId: 's1', startupClaimMethod: null, founderAskedAt: null, Startup: { name: 'Acme', slug: 'acme', isVerified: false }, ...over });

  it('emails the founder the verify link and records it', async () => {
    db.jobBoardEmployer.findUnique.mockResolvedValueOnce(ws());
    expect(await askFounder({ employerId: 'emp1', memberEmail: 'asha@acme.ai', founderEmail: ' Ravi@Acme.ai ', now })).toEqual({ ok: true });
    expect(mail.send.mock.calls[0][0]).toMatchObject({ to: 'ravi@acme.ai', replyTo: 'asha@acme.ai', type: 'employer_founder_ask' });
    expect(mail.send.mock.calls[0][0].html).toContain('/startups/claim/acme');
    expect(db.jobBoardEmployer.update.mock.calls[0][0].data).toMatchObject({ founderAskEmail: 'ravi@acme.ai', founderAskedAt: now, founderAskRemindedAt: null });
  });

  it('refuses your own email, a second ask within 12 hours, and an already verified startup', async () => {
    expect(await askFounder({ employerId: 'emp1', memberEmail: 'asha@acme.ai', founderEmail: 'asha@acme.ai', now })).toMatchObject({ ok: false, status: 400 });
    db.jobBoardEmployer.findUnique.mockResolvedValueOnce(ws({ founderAskedAt: new Date(now.getTime() - 3600_000) }));
    expect(await askFounder({ employerId: 'emp1', memberEmail: 'asha@acme.ai', founderEmail: 'ravi@acme.ai', now })).toMatchObject({ ok: false, status: 429 });
    db.jobBoardEmployer.findUnique.mockResolvedValueOnce(ws({ startupClaimMethod: 'FOUNDER', Startup: { name: 'Acme', slug: 'acme', isVerified: true } }));
    expect(await askFounder({ employerId: 'emp1', memberEmail: 'asha@acme.ai', founderEmail: 'ravi@acme.ai', now })).toMatchObject({ ok: false, status: 409 });
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('reminds once after a day, skipping startups verified since', async () => {
    db.jobBoardEmployer.findMany.mockResolvedValueOnce([
      { id: 'e1', founderAskEmail: 'ravi@acme.ai', founderAskedAt: new Date(now.getTime() - 30 * 3600_000), startupId: 's1', startupClaimMethod: null, Startup: { name: 'Acme', slug: 'acme', isVerified: false } },
      { id: 'e2', founderAskEmail: 'meera@beta.ai', founderAskedAt: new Date(now.getTime() - 30 * 3600_000), startupId: 's2', startupClaimMethod: 'FOUNDER', Startup: { name: 'Beta', slug: 'beta', isVerified: true } },
    ]);
    db.jobBoardTeamMember.findFirst.mockResolvedValueOnce({ email: 'asha@acme.ai' });
    expect(await remindFounders(now)).toBe(1);
    expect(db.jobBoardEmployer.update).toHaveBeenCalledTimes(2);
    expect(mail.send.mock.calls[0][0]).toMatchObject({ to: 'ravi@acme.ai', type: 'employer_founder_ask_reminder', replyTo: 'asha@acme.ai' });
    const where = db.jobBoardEmployer.findMany.mock.calls[0][0].where;
    expect(where.founderAskRemindedAt).toBeNull();
    expect(where.founderAskedAt.lte.getTime()).toBe(now.getTime() - 864e5);
  });
});
