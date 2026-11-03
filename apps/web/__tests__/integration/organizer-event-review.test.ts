import { describe, it, expect, vi, beforeEach } from 'vitest';

const m = vi.hoisted(() => ({
  event: null as null | Record<string, unknown>,
  update: vi.fn(), canTag: vi.fn(), decision: vi.fn(), boost: vi.fn(),
}));
vi.mock('next/server', async (orig) => ({ ...(await orig<typeof import('next/server')>()), after: () => {} }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@udyaibase/database', () => {
  const tx = { event: { update: m.update, updateMany: vi.fn() }, eventSpeaker: { deleteMany: vi.fn(), createMany: vi.fn() }, eventAgendaItem: { deleteMany: vi.fn(), createMany: vi.fn() } };
  return {
    prisma: {
      event: { findUnique: async () => m.event },
      eventOrganizer: { findUnique: async () => ({ email: 'host@community.org' }) },
      $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
    },
  };
});
vi.mock('@/lib/organizer-auth/require-permission', () => ({
  requirePermission: async () => ({ organizerId: 'o1', email: 'host@community.org', role: 'OWNER' }),
  canAccessEvent: () => true,
}));
vi.mock('@/lib/events/billing', () => ({ featuredUntilFor: async () => null, upcomingLimitProblem: async () => null }));
vi.mock('@/lib/events/payouts', () => ({ canSellTickets: async () => true }));
vi.mock('@/lib/events/tickets', () => ({ refundEventTickets: vi.fn() }));
vi.mock('@/lib/revalidate', () => ({ refreshPaths: vi.fn(), refreshSections: vi.fn() }));
vi.mock('@/lib/events/free-boost', () => ({ applyFirstEventBoost: m.boost }));
vi.mock('@/lib/events/trust', () => ({ canTagStartup: m.canTag, publishDecision: m.decision }));
vi.mock('@/lib/email/send', () => ({ sendEmailFireAndForget: vi.fn() }));

const put = async (body: Record<string, unknown>) => {
  const { PUT } = await import('@/app/api/organizer/events/[eventId]/route');
  return PUT(new Request('http://x/api/organizer/events/ev1', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) as any, { params: Promise.resolve({ eventId: 'ev1' }) });
};
const base = { organizerId: 'o1', slug: 'ai-meetup', title: 'AI Meetup', startAt: new Date(Date.now() + 864e5), endAt: new Date(Date.now() + 2 * 864e5), startupId: null, heldAt: null };
const savedStatus = () => m.update.mock.calls[0][0].data.status;

describe('organizer event publishing and review', () => {
  beforeEach(() => { vi.clearAllMocks(); m.decision.mockResolvedValue('PUBLISHED'); m.canTag.mockResolvedValue(true); m.boost.mockResolvedValue(true); });

  it('a new organizer publishing a draft goes to review, with no free Boost yet', async () => {
    m.event = { ...base, status: 'DRAFT' };
    m.decision.mockResolvedValue('PENDING_REVIEW');
    const d = await (await put({ status: 'PUBLISHED' })).json();
    expect(savedStatus()).toBe('PENDING_REVIEW');
    expect(d.data.status).toBe('PENDING_REVIEW');
    expect(m.boost).not.toHaveBeenCalled();
  });

  it('a verified organizer publishes straight away (and gets the first-event Boost check)', async () => {
    m.event = { ...base, status: 'DRAFT' };
    await put({ status: 'PUBLISHED' });
    expect(savedStatus()).toBe('PUBLISHED');
    expect(m.boost).toHaveBeenCalled();
  });

  it('an event waiting for review cannot be published by its organizer; other edits still save', async () => {
    m.event = { ...base, status: 'PENDING_REVIEW' };
    await put({ status: 'PUBLISHED', title: 'AI Meetup (updated)' });
    expect(savedStatus()).toBeUndefined();
    expect(m.update.mock.calls[0][0].data.title).toBe('AI Meetup (updated)');
  });

  it('an event hidden after reports cannot be brought back by moving it to draft and publishing again', async () => {
    m.event = { ...base, status: 'DRAFT', heldAt: new Date() };
    await put({ status: 'PUBLISHED' });
    expect(savedStatus()).toBe('PENDING_REVIEW');
    expect(m.decision).not.toHaveBeenCalled();
  });

  it('tagging a startup the organizer does not belong to is refused', async () => {
    m.event = { ...base, status: 'DRAFT' };
    m.canTag.mockResolvedValue(false);
    const res = await put({ startupId: 'sarvam' });
    expect(res.status).toBe(403);
    expect(m.update).not.toHaveBeenCalled();
  });
});
