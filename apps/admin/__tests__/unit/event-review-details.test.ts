import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({ event: { findFirst: vi.fn() } }));
vi.mock('@udyaibase/database', () => ({ prisma: db }));
vi.mock('@/lib/api-auth', () => ({ requireActionAuth: async () => ({ error: null, session: { user: { email: 'admin@udyaibase.test' } } }) }));
vi.mock('@/lib/audit-log', () => ({ logAuditEvent: vi.fn() }));
vi.mock('@/lib/refresh-public', () => ({ refreshPublic: vi.fn(), requestEventApproved: vi.fn(), requestOrganizerSuspended: vi.fn() }));
vi.mock('@/lib/email-send', () => ({ sendEmailFireAndForget: vi.fn() }));
vi.mock('@udyaibase/utils/event-moderation', () => ({ SUSPENSION_NOTE: '' }));

import { getReviewDetailsAction } from '@/app/(dashboard)/events/review/actions';

const event = (over: Record<string, unknown> = {}) => ({
  id: 'e1', title: 'GenAI Meetup', subtitle: null, category: 'MEETUP', format: 'HYBRID', visibility: 'PUBLIC', approvalRequired: false,
  startAt: new Date(Date.now() + 10 * 36e5), endAt: new Date(Date.now() + 13 * 36e5), timezone: 'Asia/Kolkata', registrationDeadline: null,
  venueName: null, address: null, meetingLink: 'https://totally-legit-meet.xyz/room', revealLinkAfterRegistration: true,
  coverImageUrl: null, galleryImageUrls: [], capacity: 100, sourceUrl: null, sourceName: null,
  description: { html: '<p>Hi <a href="https://bit.ly/x" onclick="steal()">join</a></p><script>alert(1)</script>', text: 'Hi join' },
  ticketTiers: [{ name: 'VIP', tierType: 'VIP', priceCents: 3000000, quantity: 10, saleStart: null, saleEnd: null, description: null, createdAt: new Date() }],
  speakers: [{ name: 'Asha', title: 'CTO', company: 'X', headshotUrl: null, bio: 'https://linkedin.com/in/asha' }],
  agendaItems: [], customQuestions: [], tags: [{ tag: { name: 'LLMs' } }],
  Startup: { name: 'Fake Co', slug: 'fake', isVerified: false },
  organizer: { payoutStatus: null, payoutAccountId: null },
  ...over,
});

beforeEach(() => vi.clearAllMocks());

describe('admin event review: full details', () => {
  it('returns what the organizer submitted, with a safe description', async () => {
    db.event.findFirst.mockResolvedValue(event());
    const r = await getReviewDetailsAction('e1');
    if (!r.success) throw new Error(r.error);
    expect(r.details.basics.tags).toEqual(['LLMs']);
    expect(r.details.tickets.tiers[0]).toMatchObject({ name: 'VIP', priceRupees: 30000 });
    expect(r.details.details.speakers[0].link).toBe('https://linkedin.com/in/asha');
    expect(r.details.details.descriptionHtml).not.toMatch(/script|onclick/);
    expect(r.details.details.descriptionHtml).toContain('rel="noopener noreferrer nofollow ugc"');
  });
  it('flags what a reviewer should look at', async () => {
    db.event.findFirst.mockResolvedValue(event());
    const r = await getReviewDetailsAction('e1');
    if (!r.success) throw new Error(r.error);
    const text = r.details.flags.map((f) => f.text).join('\n');
    for (const want of [/Starts in \d+ hours/, /No cover image/, /Very short description/, /bit\.ly/, /payout account isn't active/, /High ticket price/, /totally-legit-meet\.xyz/, /without a venue/, /isn't a verified startup/]) {
      expect(text).toMatch(want);
    }
  });
  it('a complete, ordinary event has nothing to warn about', async () => {
    db.event.findFirst.mockResolvedValue(event({
      startAt: new Date(Date.now() + 10 * 864e5), endAt: new Date(Date.now() + 10 * 864e5 + 3 * 36e5), format: 'IN_PERSON', meetingLink: null,
      venueName: 'IISc', address: 'Bengaluru', coverImageUrl: 'https://media.example.com/c.jpg', Startup: null,
      description: { html: `<p>${'A well described meetup. '.repeat(10)}</p>`, text: 'A well described meetup. '.repeat(10) },
      ticketTiers: [{ name: 'Free', tierType: 'REGULAR', priceCents: 0, quantity: null, saleStart: null, saleEnd: null, description: null, createdAt: new Date() }],
    }));
    const r = await getReviewDetailsAction('e1');
    if (!r.success) throw new Error(r.error);
    expect(r.details.flags.filter((f) => f.level === 'warn')).toEqual([]);
  });
});
