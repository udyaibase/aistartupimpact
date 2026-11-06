import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const db = vi.hoisted(() => ({
  listing: { findFirst: vi.fn() },
  upload: { findUnique: vi.fn(), update: vi.fn() },
  create: vi.fn(),
  verify: vi.fn(),
}));

vi.mock('@udyaibase/database', () => ({
  prisma: {
    jobBoardListing: db.listing,
    jobBoardResumeUpload: db.upload,
    $transaction: (fn: (t: unknown) => unknown) => fn({
      jobBoardApplication: { create: db.create },
      jobBoardResumeUpload: { update: vi.fn() },
      jobBoardListing: { update: vi.fn() },
    }),
  },
}));
vi.mock('next/server', async (orig) => ({ ...(await orig<typeof import('next/server')>()), after: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: async () => ({ success: true }), getClientIdentifier: () => 'ip' }));
vi.mock('@/lib/event-rate-limit', () => ({ jobApplyRateLimit: {} }));
vi.mock('@/lib/jobs/apply-session', () => ({ verifyApplySession: db.verify }));
vi.mock('@/lib/jobs/apply-emails', () => ({ sendApplicationReceived: vi.fn(), sendNewApplicationAlert: vi.fn() }));
vi.mock('@/lib/jobs/ai-screen', () => ({ screenApplication: vi.fn(async () => ({})) }));

import { POST } from '@/app/api/jobs/[slug]/apply/route';

const listing = (form: unknown, screeningQuestions: unknown[] = []) => ({
  id: 'l1', title: 'Engineer', skills: ['SQL'], applicationType: 'INTERNAL', screeningQuestions, employerId: 'e1',
  Employer: { id: 'e1', email: 'o@acme.ai', companyName: 'Acme', passwordHash: 'x', startupId: null, startupClaimMethod: null, applyFormConfig: form, Startup: null, CareersWidgets: [] },
});
const good = { token: 't', fullName: 'Asha Rao', email: 'asha@example.com', consent: true };
const apply = (body: unknown) => POST(new NextRequest('http://t/api', { method: 'POST', body: JSON.stringify(body) }), { params: Promise.resolve({ slug: 'eng' }) });

describe('applying to a job', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.verify.mockReturnValue({ uploadId: 'u1' });
    db.upload.findUnique.mockResolvedValue({ id: 'u1', key: 'r.pdf', listingId: 'l1', applicationId: null });
    db.create.mockResolvedValue({ id: 'a1' });
    db.listing.findFirst.mockResolvedValue(listing(null));
  });

  it('accepts a complete application', async () => {
    expect((await apply(good)).status).toBe(201);
  });

  it('needs an upload session, so a bot check can’t be skipped', async () => {
    db.verify.mockReturnValue(null);
    expect((await apply(good)).status).toBe(401);
    expect(db.create).not.toHaveBeenCalled();
  });

  it('needs consent', async () => {
    expect((await apply({ ...good, consent: false })).status).toBe(400);
  });

  it('enforces the employer’s required fields on the server', async () => {
    db.listing.findFirst.mockResolvedValue(listing({ fields: { phone: 'required' } }));
    const res = await apply(good);
    expect(res.status).toBe(400);
    expect((await res.json()).errors.phone).toBeTruthy();
    expect((await apply({ ...good, phone: '98765' })).status).toBe(201);
  });

  it('doesn’t store a field the employer turned off', async () => {
    db.listing.findFirst.mockResolvedValue(listing({ fields: { phone: 'hidden', expectedCtcLakh: 'hidden' } }));
    await apply({ ...good, phone: '98765', expectedCtcLakh: 20 });
    expect(db.create.mock.calls[0][0].data.phone).toBeNull();
    expect(db.create.mock.calls[0][0].data.expectedCtcLakh).toBeNull();
  });

  it('accepts only a listed option for multiple choice', async () => {
    const q = { id: 'q', question: 'City?', type: 'choice', options: ['Pune', 'Delhi'], required: true };
    db.listing.findFirst.mockResolvedValue(listing(null, [q]));
    expect((await apply({ ...good, screeningAnswers: [{ id: 'q', answer: 'Mars' }] })).status).toBe(400);
    expect((await apply({ ...good, screeningAnswers: [{ id: 'q', answer: 'Pune' }] })).status).toBe(201);
  });

  it('refuses external jobs', async () => {
    db.listing.findFirst.mockResolvedValue({ ...listing(null), applicationType: 'EXTERNAL' });
    expect((await apply(good)).status).toBe(400);
  });
});
