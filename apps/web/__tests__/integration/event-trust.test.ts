import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({
  eventOrganizer: { findUnique: vi.fn() },
  event: { findMany: vi.fn(), updateMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  eventRegistration: { findMany: vi.fn() },
  contentReport: { findFirst: vi.fn(), create: vi.fn(), findMany: vi.fn() },
  founderUser: { findMany: vi.fn() },
  founderTeamMember: { findMany: vi.fn() },
  jobBoardTeamMember: { findMany: vi.fn() },
  startup: { findMany: vi.fn() },
}));
const sent = vi.hoisted(() => vi.fn());
const refund = vi.hoisted(() => vi.fn());
vi.mock('@udyaibase/database', () => ({ prisma: db }));
vi.mock('@/lib/email/send', () => ({ sendEmailFireAndForget: sent }));
vi.mock('@/lib/events/tickets', () => ({ refundEventTickets: refund }));
vi.mock('@/lib/events/billing', () => ({ featuredUntilFor: async () => null }));
vi.mock('@/lib/events/free-boost', () => ({ applyFirstEventBoost: async () => true }));
vi.mock('@/lib/revalidate', () => ({ refreshSections: vi.fn() }));

import { canTagStartup, processSuspendedEvents, publishDecision, reportEvent } from '@/lib/events/trust';

describe('event trust', () => {
  beforeEach(() => vi.clearAllMocks());

  it('publish or review: Udyaibase, verified organizers and verified-startup events publish; new organizers wait', async () => {
    db.eventOrganizer.findUnique.mockResolvedValue({ email: 'host@community.org', verifiedAt: null });
    expect(await publishDecision('o1', { taggedStartup: false })).toBe('PENDING_REVIEW');
    expect(await publishDecision('o1', { taggedStartup: true })).toBe('PUBLISHED');
    db.eventOrganizer.findUnique.mockResolvedValue({ email: 'host@community.org', verifiedAt: new Date() });
    expect(await publishDecision('o1', { taggedStartup: false })).toBe('PUBLISHED');
    db.eventOrganizer.findUnique.mockResolvedValue({ email: 'events@udyaibase.com', verifiedAt: null });
    expect(await publishDecision('o1', { taggedStartup: false })).toBe('PUBLISHED');
  });

  it('a startup can be tagged only if it is verified and the person belongs to it', async () => {
    db.founderUser.findMany.mockResolvedValue([{ id: 'f1' }]);
    db.founderTeamMember.findMany.mockResolvedValue([]);
    db.jobBoardTeamMember.findMany.mockResolvedValue([]);
    db.startup.findMany.mockResolvedValue([{ id: 's1', name: 'NeuralPay', slug: 'neuralpay', logoUrl: null }]);
    expect(await canTagStartup(['arjun@neuralpay.in'], 's1')).toBe(true);
    expect(await canTagStartup(['arjun@neuralpay.in'], 'sarvam')).toBe(false);
    // Only verified startups are ever offered.
    expect(db.startup.findMany.mock.calls[0][0].where).toMatchObject({ isVerified: true, deletedAt: null });
    // Nobody connected to any startup → nothing to tag, and no startup query at all.
    db.founderUser.findMany.mockResolvedValue([]);
    db.startup.findMany.mockClear();
    expect(await canTagStartup(['random@gmail.com'], 's1')).toBe(false);
    expect(db.startup.findMany).not.toHaveBeenCalled();
  });

  it('reports: repeats are ignored; the 3rd distinct reporter hides a published event for review', async () => {
    const event = { id: 'ev1', title: 'AI Meetup', slug: 'ai-meetup' };
    db.contentReport.findFirst.mockResolvedValue({ id: 'r0' });
    expect(await reportEvent({ event, reason: 'scam', details: '', email: null, hash: 'h1' })).toEqual({ duplicate: true, held: false });
    db.contentReport.findFirst.mockResolvedValue(null);
    db.contentReport.findMany.mockResolvedValue([{ reporterHash: 'a' }, { reporterHash: 'b' }]);
    expect((await reportEvent({ event, reason: 'scam', details: '', email: null, hash: 'h2' })).held).toBe(false);
    db.contentReport.findMany.mockResolvedValue([{ reporterHash: 'a' }, { reporterHash: 'b' }, { reporterHash: 'c' }]);
    db.event.updateMany.mockResolvedValue({ count: 1 });
    expect((await reportEvent({ event, reason: 'scam', details: '', email: null, hash: 'h3' })).held).toBe(true);
    expect(db.event.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: 'ev1', status: 'PUBLISHED' }, data: { status: 'PENDING_REVIEW' } });
  });

  it('suspension: each cancelled event is handled once: attendees emailed, tickets refunded', async () => {
    db.event.findMany.mockResolvedValue([{ id: 'ev1', title: 'AI Meetup', slug: 'ai-meetup', startAt: new Date('2026-12-01'), timezone: 'Asia/Kolkata' }, { id: 'ev2', title: 'Other', slug: 'o', startAt: new Date('2026-12-02'), timezone: null }]);
    db.event.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 }); // ev2 already claimed by another run
    db.eventRegistration.findMany.mockResolvedValue([{ guestEmail: 'a@x.in', guestName: 'A' }, { guestEmail: 'b@x.in', guestName: null }]);
    refund.mockResolvedValue({ paid: 1, refunded: 1 });
    await processSuspendedEvents({ organizerId: 'o1' });
    expect(sent).toHaveBeenCalledTimes(2);
    expect(refund).toHaveBeenCalledTimes(1);
    expect(refund).toHaveBeenCalledWith('ev1');
  });
});
