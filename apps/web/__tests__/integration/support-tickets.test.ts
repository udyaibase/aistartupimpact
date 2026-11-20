import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({
  jobBoardEmployer: { findUnique: vi.fn() },
  jobBoardListing: { findFirst: vi.fn(async (..._a: any[]): Promise<any> => null) },
  supportTicket: { update: vi.fn(), findMany: vi.fn(async (..._a: any[]): Promise<any> => []), count: vi.fn(async (..._a: any[]): Promise<any> => 0) },
}));
const mail = vi.hoisted(() => ({ send: vi.fn(async (_o: any) => ({ success: true })), ff: vi.fn() }));
const create = vi.hoisted(() => vi.fn(async (i: any) => ({ id: 't1', ticketNumber: 'TKT-00042', ...i })));

vi.mock('@udyaibase/database', () => ({ prisma: db, Prisma: {} }));
vi.mock('@/lib/email/send', () => ({ sendEmail: mail.send, sendEmailFireAndForget: mail.ff }));
vi.mock('@/lib/support-tickets', () => ({ createTicket: create }));

import { openEmployerTicket } from '@/lib/support/employer-tickets';
import { sendTriageDigest } from '@/lib/support/triage';

beforeEach(() => vi.clearAllMocks());
const now = new Date('2026-11-18T10:00:00+05:30'); // Wednesday 10:00 IST
const base = { employerId: 'emp1', email: 'hr@acme.co', name: 'Asha', subject: 'Publish fails', description: 'The publish button shows an error every time.', userAgent: 'Mozilla/5.0', now };

describe('report a problem', () => {
  it('Pro plan, normal problem: due in 1 working day, with the page and job they came from', async () => {
    db.jobBoardEmployer.findUnique.mockResolvedValueOnce({ plan: 'PRO', planExpiresAt: new Date('2027-01-01'), companyName: 'Acme' });
    db.jobBoardListing.findFirst.mockResolvedValueOnce({ id: 'cmwm24ue8000770egg5cb6zn5' });
    const r = await openEmployerTicket({ ...base, kind: 'broken', context: { page: '/employer/jobs/cmwm24ue8000770egg5cb6zn5/edit', jobId: 'cmwm24ue8000770egg5cb6zn5' } });
    expect(create.mock.calls[0][0]).toMatchObject({ category: 'BUG_REPORT', priority: 'MEDIUM', portal: 'EMPLOYER' });
    const data = db.supportTicket.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ planAtOpen: 'PRO', context: { page: '/employer/jobs/cmwm24ue8000770egg5cb6zn5/edit', jobId: 'cmwm24ue8000770egg5cb6zn5', kind: 'broken' } });
    expect(data.replyDueAt).toEqual(new Date('2026-11-19T10:00:00+05:30'));
    expect(r.promise.guaranteed).toBe(true);
    expect(mail.ff).toHaveBeenCalledTimes(1); // confirmation only
    expect(mail.ff.mock.calls[0][0]).toMatchObject({ to: 'hr@acme.co', type: 'support_ticket_received' });
  });

  it('urgent on a paid plan: 4 working hours and an immediate alert to our team; a job that isn’t theirs is dropped', async () => {
    db.jobBoardEmployer.findUnique.mockResolvedValueOnce({ plan: 'GROWTH', planExpiresAt: new Date('2027-01-01'), companyName: 'Acme' });
    await openEmployerTicket({ ...base, kind: 'cant_publish', context: { page: '/employer/jobs', jobId: 'cmwm24ue8000770egg5cb6zn9' } });
    const data = db.supportTicket.update.mock.calls[0][0].data;
    expect(data.replyDueAt).toEqual(new Date('2026-11-18T14:00:00+05:30'));
    expect(data.context.jobId).toBeUndefined();
    expect(create.mock.calls[0][0].priority).toBe('HIGH');
    expect(mail.ff.mock.calls.map((c) => c[0].type)).toEqual(['support_ticket_received', 'support_ticket_urgent']);
  });

  it('Free plan: no promise in the email, no alert; a page outside the portal is ignored', async () => {
    db.jobBoardEmployer.findUnique.mockResolvedValueOnce({ plan: 'FREE', planExpiresAt: null, companyName: 'Acme' });
    const r = await openEmployerTicket({ ...base, kind: 'cant_publish', context: { page: 'https://evil.example/x' } });
    expect(r.promise.guaranteed).toBe(false);
    expect(db.supportTicket.update.mock.calls[0][0].data.context.page).toBeUndefined();
    expect(mail.ff).toHaveBeenCalledTimes(1);
    expect(mail.ff.mock.calls[0][0].html).toContain('usually reply within 2 working days');
  });
});

describe('triage digest', () => {
  it('sends nothing when nothing is waiting', async () => {
    expect(await sendTriageDigest(now)).toEqual({ sent: false, waiting: 0 });
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('lists tickets waiting for a first reply, overdue flagged', async () => {
    db.supportTicket.findMany.mockResolvedValueOnce([
      { id: 't1', ticketNumber: 'TKT-1', subject: 'Locked out', portal: 'EMPLOYER', planAtOpen: 'SCALE', replyDueAt: new Date('2026-11-18T09:45:00+05:30'), createdAt: now, submitterName: 'Acme', category: 'ACCOUNT' },
      { id: 't2', ticketNumber: 'TKT-2', subject: 'Question', portal: 'FOUNDER', planAtOpen: null, replyDueAt: null, createdAt: now, submitterName: 'Ravi', category: 'OTHER' },
    ]);
    expect(await sendTriageDigest(now)).toEqual({ sent: true, waiting: 2 });
    const m = mail.send.mock.calls[0][0];
    expect(m.subject).toContain('2 waiting for a first reply, 1 overdue');
    expect(m.html).toContain('overdue by 15 min');
  });
});
