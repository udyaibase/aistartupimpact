import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { prisma, sendEmail } = vi.hoisted(() => {
  process.env.NEXTAUTH_SECRET ??= 'test-only-secret';
  process.env.R2_PUBLIC_URL ??= 'https://media.udyaibase.com';
  const tx = {
    event: { create: vi.fn() }, eventSpeaker: { create: vi.fn() }, eventAgendaItem: { createMany: vi.fn() },
    eventTicketTier: { createMany: vi.fn() }, eventCustomQuestion: { createMany: vi.fn() },
  };
  const prisma = {
    eventRegistration: { findUnique: vi.fn() },
    eventFeedback: { upsert: vi.fn() },
    event: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
    eventSlugHistory: { findUnique: vi.fn() },
    $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
    tx,
  };
  return { prisma, sendEmail: vi.fn() };
});
vi.mock('@udyaibase/database', () => ({ prisma }));
vi.mock('@/lib/email/send', () => ({ sendEmail: (...a: unknown[]) => sendEmail(...a) }));
vi.mock('@/lib/rate-limit', () => ({ apiRateLimit: null, checkRateLimit: async () => ({ success: true, reset: 0 }), getClientIdentifier: () => 'ip', rateLimitMessage: () => 'slow', retryAfterHeaders: () => ({}) }));

import { feedbackToken } from '@/lib/events/after-event';
import { cleanFeedback, feedbackOpen, feedbackSettings, summarise } from '@/lib/events/feedback';
import { cleanGallery, cleanRecapLinks, youTubeEmbedUrl } from '@/lib/events/recap';
import { duplicateEvent } from '@/lib/events/duplicate';
import { summaryEmailHtml } from '@/lib/events/event-summary';
import { POST as feedbackPost } from '@/app/api/events/feedback/route';

beforeEach(() => {
  for (const m of [prisma.eventRegistration, prisma.eventFeedback, prisma.event, prisma.eventSlugHistory, ...Object.values(prisma.tx)]) {
    Object.values(m).forEach((f) => (f as ReturnType<typeof vi.fn>).mockReset());
  }
  sendEmail.mockReset();
});

describe('feedback rules', () => {
  it('cleans responses against the host’s questions', () => {
    expect(cleanFeedback({ rating: 6 }, [])).toBeNull();
    expect(cleanFeedback({ rating: '4', recommend: 11 }, [])).toMatchObject({ rating: 4, recommend: null });
    const r = cleanFeedback({ rating: 5, recommend: 9, answers: ['Great talks', ''], comment: '  ' }, ['What did you like?', 'Improve?']);
    expect(r).toEqual({ rating: 5, recommend: 9, answers: [{ question: 'What did you like?', answer: 'Great talks' }], comment: null });
  });
  it('settings: up to 3 questions, on by default', () => {
    expect(feedbackSettings({ questions: ['a', 'b', 'c', 'd', 5] })).toEqual({ enabled: true, questions: ['a', 'b', 'c'] });
    expect(feedbackSettings({ enabled: false }).enabled).toBe(false);
  });
  it('open from the start until 60 days after the end', () => {
    const now = new Date('2026-11-16T12:00:00Z');
    expect(feedbackOpen({ startAt: new Date('2026-11-17'), endAt: new Date('2026-11-17') }, now)).toBe(false);
    expect(feedbackOpen({ startAt: new Date('2026-11-01'), endAt: new Date('2026-11-01') }, now)).toBe(true);
    expect(feedbackOpen({ startAt: new Date('2026-08-01'), endAt: new Date('2026-08-01') }, now)).toBe(false);
  });
  it('summary: average, NPS and distribution', () => {
    const at = new Date();
    const s = summarise([
      { rating: 5, recommend: 10, answers: [{ question: 'Q', answer: 'Loved it' }], comment: 'Superb', createdAt: at },
      { rating: 4, recommend: 9, answers: null, comment: null, createdAt: at },
      { rating: 2, recommend: 3, answers: null, comment: null, createdAt: at },
      { rating: 3, recommend: null, answers: null, comment: null, createdAt: at },
    ], ['Q']);
    expect(s.averageRating).toBe(3.5);
    expect(s.nps).toBe(33); // 2 promoters, 1 detractor of 3
    expect(s.distribution).toEqual([0, 1, 1, 1, 1]);
    expect(s.answers).toEqual([{ question: 'Q', answers: ['Loved it'] }]);
    expect(s.comments).toHaveLength(1);
  });
});

describe('POST /api/events/feedback', () => {
  const post = (body: unknown) => feedbackPost(new NextRequest('http://x/api/events/feedback', { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }));
  const reg = { id: 'r1', deletedAt: null, cancelledAt: null, event: { id: 'e1', startAt: new Date(Date.now() - 864e5), endAt: new Date(Date.now() - 36e5), deletedAt: null, feedbackSettings: null } };

  it('rejects a forged link', async () => {
    expect((await post({ t: 'r1.forged', rating: 5 })).status).toBe(400);
    expect(prisma.eventFeedback.upsert).not.toHaveBeenCalled();
  });
  it('saves one response per registration', async () => {
    prisma.eventRegistration.findUnique.mockResolvedValue(reg);
    const res = await post({ t: feedbackToken('r1'), rating: 5, recommend: 10 });
    expect(res.status).toBe(200);
    expect(prisma.eventFeedback.upsert.mock.calls[0][0]).toMatchObject({ where: { registrationId: 'r1' }, create: { eventId: 'e1', rating: 5, recommend: 10 } });
  });
  it('refuses when the host turned feedback off', async () => {
    prisma.eventRegistration.findUnique.mockResolvedValue({ ...reg, event: { ...reg.event, feedbackSettings: { enabled: false } } });
    expect((await post({ t: feedbackToken('r1'), rating: 5 })).status).toBe(400);
  });
});

describe('recap rules', () => {
  it('links: https only, typed and capped', () => {
    const links = cleanRecapLinks([
      { kind: 'recording', title: 'Keynote', url: 'https://youtu.be/dQw4w9WgXcQ' },
      { kind: 'x', url: 'javascript:alert(1)' },
      { kind: 'slides', url: 'http://insecure.example.com' },
      { url: 'https://drive.google.com/file/d/abc' },
    ]);
    expect(links).toEqual([
      { kind: 'recording', title: 'Keynote', url: 'https://youtu.be/dQw4w9WgXcQ' },
      { kind: 'other', title: 'Link', url: 'https://drive.google.com/file/d/abc' },
    ]);
  });
  it('YouTube links become privacy-friendly embeds; others don’t', () => {
    expect(youTubeEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(youTubeEmbedUrl('https://youtu.be/dQw4w9WgXcQ')).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(youTubeEmbedUrl('https://vimeo.com/123')).toBeNull();
  });
  it('gallery: our own uploads only, capped by plan', () => {
    const own = Array.from({ length: 12 }, (_, i) => `https://media.udyaibase.com/e/${i}.jpg`);
    expect(cleanGallery([...own, 'https://evil.example.com/x.jpg', own[0]], 10)).toHaveLength(10);
    expect(cleanGallery(['https://evil.example.com/x.jpg'], 10)).toEqual([]);
  });
});

describe('Run it again', () => {
  const src = {
    id: 's1', organizerId: 'o1', sourceUrl: null, title: 'GenAI Meetup', subtitle: null, category: 'MEETUP', format: 'IN_PERSON',
    startAt: new Date('2026-10-10T13:00:00Z'), endAt: new Date('2026-10-10T16:00:00Z'), timezone: 'Asia/Kolkata',
    registrationDeadline: new Date('2026-10-10T10:00:00Z'), venueName: 'Hall', address: 'Bengaluru', latitude: null, longitude: null,
    meetingLink: null, revealLinkAfterRegistration: false, coverImageUrl: null, description: null, capacity: 100, visibility: 'PUBLIC',
    approvalRequired: false, metaTitle: null, metaDescription: null, socialImageUrl: null, certificateSettings: { template: 'modern' },
    followUpSettings: null, feedbackSettings: null,
    speakers: [{ id: 'sp1', name: 'Asha', title: null, company: null, headshotUrl: null, bio: null, talkTitle: null, sortOrder: 0 }],
    agendaItems: [{ id: 'a1', speakerId: 'sp1', dayNumber: 1, startTime: '18:30', endTime: '19:00', title: 'Talk', description: null, sortOrder: 0, recordingUrl: 'https://youtu.be/x' }],
    ticketTiers: [{ name: 'Free', priceCents: 0, quantity: 100, soldCount: 87, saleStart: null, saleEnd: new Date('2026-10-10T12:00:00Z'), tierType: 'REGULAR', description: null }],
    customQuestions: [],
  };
  it('moves dates to the new day at the same local time, as a draft, without attendees or recordings', async () => {
    prisma.event.findFirst.mockResolvedValue(src);
    prisma.event.findUnique.mockResolvedValue(null);
    prisma.eventSlugHistory.findUnique.mockResolvedValue(null);
    prisma.tx.event.create.mockResolvedValue({ id: 'n1', slug: 'genai-meetup' });
    prisma.tx.eventSpeaker.create.mockResolvedValue({ id: 'nsp1' });
    const future = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
    const r = await duplicateEvent('s1', 'o1', future);
    expect(r).toMatchObject({ ok: true, id: 'n1' });
    const data = prisma.tx.event.create.mock.calls[0][0].data;
    expect(data.status).toBe('DRAFT');
    // 13:00Z = 18:30 IST, kept on the new date.
    expect(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }).format(data.startAt)).toBe('18:30');
    expect(data.endAt.getTime() - data.startAt.getTime()).toBe(3 * 3_600_000);
    expect(data.startAt.getTime() - data.registrationDeadline.getTime()).toBe(3 * 3_600_000);
    expect(data).not.toHaveProperty('startupId');
    const agenda = prisma.tx.eventAgendaItem.createMany.mock.calls[0][0].data[0];
    expect(agenda).toMatchObject({ speakerId: 'nsp1', title: 'Talk' });
    expect(agenda).not.toHaveProperty('recordingUrl');
    expect(prisma.tx.eventTicketTier.createMany.mock.calls[0][0].data[0].soldCount).toBe(0);
  });
  it('refuses past dates and other hosts’ events', async () => {
    prisma.event.findFirst.mockResolvedValue(src);
    expect(await duplicateEvent('s1', 'o1', '2020-01-01')).toMatchObject({ ok: false, status: 400 });
    prisma.event.findFirst.mockResolvedValue(null);
    expect(await duplicateEvent('s1', 'other', '2030-01-01')).toMatchObject({ ok: false, status: 404 });
  });
});

describe('summary email', () => {
  it('shows totals and sources, escaped', () => {
    const html = summaryEmailHtml({ title: 'A <b>bold</b> event', id: 'e1' }, {
      registered: 120, attended: 84, attendanceRate: 70, sources: [{ label: 'Your website widget', count: 60 }],
      feedback: { responses: 12, average: 4.6 }, certificates: 80,
    }, 'Ravi');
    expect(html).toContain('A &lt;b&gt;bold&lt;/b&gt; event');
    expect(html).toContain('70%');
    expect(html).toContain('Your website widget');
    expect(html).toContain('Rated 4.6 out of 5 by 12 people');
    expect(html).toContain('/organizer/events/e1/after');
  });
});
