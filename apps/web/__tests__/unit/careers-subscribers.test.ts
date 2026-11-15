import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({
  jobBoardCareersSubscriber: {
    findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), findMany: vi.fn(), updateMany: vi.fn(),
  },
  jobBoardEmployer: { findUnique: vi.fn() },
  jobBoardListing: { count: vi.fn(async () => 1) },
}));
const careers = vi.hoisted(() => ({ getCareersCompany: vi.fn() }));
const limits = vi.hoisted(() => ({ allowed: true }));
const mail = vi.hoisted(() => ({ sendEmailFireAndForget: vi.fn(), sendEmailBatch: vi.fn(async (items: unknown[]) => items.map(() => ({ success: true }))) }));
vi.mock('@udyaibase/database', () => ({ prisma: db }));
vi.mock('@/lib/email/send', () => mail);
vi.mock('@/lib/jobs/careers', () => careers);
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn(async () => ({ success: limits.allowed })) }));
vi.mock('@/lib/event-rate-limit', () => ({ careersConfirmPerEmailRateLimit: null }));

process.env.EMPLOYER_JWT_SECRET = 'test-secret-for-careers-notify-0123456789';

import {
  confirmCareersSubscription, normalizeEmail, notifyCareersSubscribers, subscribeToCareers, subscriberToken, unsubscribeCareers,
} from '@/lib/jobs/careers-subscribers';

const base = { employerId: 'e1', company: 'Acme AI', email: 'a@b.co', source: 'WIDGET' as const };

beforeEach(() => { vi.clearAllMocks(); limits.allowed = true; db.jobBoardListing.count.mockResolvedValue(1); });

describe('subscribeToCareers', () => {
  it('new address: saves the consent and sends a confirmation link', async () => {
    db.jobBoardCareersSubscriber.findUnique.mockResolvedValue(null);
    await subscribeToCareers(base);
    const data = db.jobBoardCareersSubscriber.create.mock.calls[0][0].data;
    expect(data.consentText).toContain('share my email with Acme AI');
    expect(data.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(mail.sendEmailFireAndForget).toHaveBeenCalledTimes(1);
    expect(mail.sendEmailFireAndForget.mock.calls[0][0].html).toContain('/job-alerts?t=');
  });

  it('already confirmed: does nothing (and the caller answers the same way)', async () => {
    db.jobBoardCareersSubscriber.findUnique.mockResolvedValue({ id: 's1', confirmedAt: new Date(), unsubscribedAt: null, consentAt: new Date() });
    await subscribeToCareers(base);
    expect(db.jobBoardCareersSubscriber.update).not.toHaveBeenCalled();
    expect(mail.sendEmailFireAndForget).not.toHaveBeenCalled();
  });

  it('pending and asked again within the hour: no second email', async () => {
    db.jobBoardCareersSubscriber.findUnique.mockResolvedValue({ id: 's1', confirmedAt: null, unsubscribedAt: null, consentAt: new Date() });
    await subscribeToCareers(base);
    expect(mail.sendEmailFireAndForget).not.toHaveBeenCalled();
  });

  it('caps confirmation emails per address across companies (no inbox flooding)', async () => {
    db.jobBoardCareersSubscriber.findUnique.mockResolvedValue(null);
    limits.allowed = false;
    await subscribeToCareers(base);
    expect(db.jobBoardCareersSubscriber.create).toHaveBeenCalled(); // still saved
    expect(mail.sendEmailFireAndForget).not.toHaveBeenCalled(); // but no email
  });

  it('previously unsubscribed: asks them to confirm again', async () => {
    db.jobBoardCareersSubscriber.findUnique.mockResolvedValue({ id: 's1', confirmedAt: new Date(), unsubscribedAt: new Date(), consentAt: new Date(0) });
    await subscribeToCareers(base);
    expect(db.jobBoardCareersSubscriber.update.mock.calls[0][0].data).toMatchObject({ unsubscribedAt: null, confirmedAt: null });
    expect(mail.sendEmailFireAndForget).toHaveBeenCalledTimes(1);
  });
});

describe('links', () => {
  it('confirm and unsubscribe look the token up by its hash', async () => {
    db.jobBoardCareersSubscriber.findUnique.mockResolvedValue({ id: 's1', confirmedAt: null, unsubscribedAt: null, Employer: { companyName: 'Acme AI', slug: 'acme' } });
    expect(await confirmCareersSubscription(subscriberToken('s1'))).toEqual({ ok: true, company: 'Acme AI', slug: 'acme' });
    expect(db.jobBoardCareersSubscriber.findUnique.mock.calls[0][0].where.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(await unsubscribeCareers(subscriberToken('s1'))).toMatchObject({ ok: true });
    db.jobBoardCareersSubscriber.findUnique.mockResolvedValue(null);
    expect(await confirmCareersSubscription('nope')).toEqual({ ok: false });
  });

  it('normalizes emails', () => {
    expect(normalizeEmail('  A@B.Co ')).toBe('a@b.co');
    expect(normalizeEmail('not-an-email')).toBeNull();
  });
});

describe('notifyCareersSubscribers', () => {
  it('emails confirmed subscribers once, with one-click unsubscribe, and marks them notified', async () => {
    careers.getCareersCompany.mockResolvedValue({ name: 'Acme AI', slug: 'acme' });
    db.jobBoardCareersSubscriber.findMany
      .mockResolvedValueOnce([{ id: 's1', email: 'a@b.co' }, { id: 's2', email: 'c@d.co' }])
      .mockResolvedValueOnce([]);
    expect(await notifyCareersSubscribers('e1', { title: 'ML Engineer', slug: 'ml-engineer' })).toBe(2);
    const where = db.jobBoardCareersSubscriber.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ employerId: 'e1', confirmedAt: { not: null }, unsubscribedAt: null });
    const items = mail.sendEmailBatch.mock.calls[0][0] as any[];
    expect(items[0].subject).toBe('Acme AI is hiring: ML Engineer');
    expect(items[0].headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    expect(db.jobBoardCareersSubscriber.updateMany).toHaveBeenCalledTimes(1);
  });

  it('sends nothing for a job candidates cannot open (held for review, hidden or closed)', async () => {
    careers.getCareersCompany.mockResolvedValue({ name: 'Acme AI', slug: 'acme' });
    db.jobBoardListing.count.mockResolvedValue(0);
    expect(await notifyCareersSubscribers('e1', { title: 'T', slug: 't' })).toBe(0);
    expect(mail.sendEmailBatch).not.toHaveBeenCalled();
  });

  it('sends nothing for a deactivated workspace and never throws', async () => {
    careers.getCareersCompany.mockResolvedValue(null);
    expect(await notifyCareersSubscribers('e1', { title: 'T', slug: 't' })).toBe(0);
    careers.getCareersCompany.mockRejectedValue(new Error('db down'));
    expect(await notifyCareersSubscribers('e1', { title: 'T', slug: 't' })).toBe(0);
    expect(mail.sendEmailBatch).not.toHaveBeenCalled();
  });
});
