import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  eventSeries: { findMany: vi.fn(), update: vi.fn(async () => ({})) },
  event: { findFirst: vi.fn(), count: vi.fn(async () => 0), update: vi.fn(async () => ({})) },
}));
const dup = vi.hoisted(() => vi.fn(async (_id: string, _org: string, date: string) => ({ ok: true, id: `ev-${date}`, title: 'Meetup' })));
vi.mock('@udyaibase/database', () => ({ prisma: db, Prisma: { AnyNull: 'AnyNull' } }));
vi.mock('@/lib/events/duplicate', () => ({ duplicateEvent: dup }));
vi.mock('@/lib/email/send', () => ({ sendEmail: vi.fn(async () => ({ success: true })), sendEmailBatch: vi.fn(async () => []) }));
vi.mock('@/lib/organizer-notify', () => ({ notifyOrganizer: vi.fn(async () => {}) }));
vi.mock('@/lib/events/after-event', () => ({ seriesFollowToken: () => 't' }));

import { generateRecurringDrafts } from '@/lib/events/series';

// Template on Wednesday 4 Nov 2026, weekly, drafts 21 days ahead; "now" is 25 Nov 2026 (IST).
const NOW = new Date('2026-11-25T06:00:00Z');
const series = (rule: Record<string, unknown>) => ({
  id: 's1', name: 'Meetup', organizerId: 'o1', lastGeneratedFor: null, organizer: { email: '', name: 'Host' },
  recurrence: { freq: 'WEEKLY', interval: 1, createAheadDays: 21, templateEventId: 'tpl', ...rule },
});

beforeEach(() => {
  vi.clearAllMocks();
  db.event.findFirst.mockResolvedValue({ id: 'tpl', startAt: new Date('2026-11-04T12:30:00Z'), timezone: 'Asia/Kolkata' });
});

describe('repeat draft job', () => {
  it('makes drafts for the next dates (max 3 per run)', async () => {
    db.eventSeries.findMany.mockResolvedValue([series({})]);
    const r = await generateRecurringDrafts(NOW);
    expect(dup.mock.calls.map((c) => c[2])).toEqual(['2026-12-02', '2026-12-09', '2026-12-16']);
    expect(r.created).toBe(3);
  });

  it('makes nothing while paused', async () => {
    db.eventSeries.findMany.mockResolvedValue([series({ paused: true })]);
    expect((await generateRecurringDrafts(NOW)).created).toBe(0);
    expect(dup).not.toHaveBeenCalled();
    expect(db.eventSeries.update).not.toHaveBeenCalled();
  });

  it('passes over skipped dates but records them as done', async () => {
    db.eventSeries.findMany.mockResolvedValue([series({ skipDates: ['2026-12-09'] })]);
    await generateRecurringDrafts(NOW);
    expect(dup.mock.calls.map((c) => c[2])).toEqual(['2026-12-02', '2026-12-16']);
    expect(db.eventSeries.update).toHaveBeenCalledWith({ where: { id: 's1' }, data: { lastGeneratedFor: new Date('2026-12-09T12:00:00Z') } });
  });

  it('stops at the end date', async () => {
    db.eventSeries.findMany.mockResolvedValue([series({ ends: 'on', endOn: '2026-12-05' })]);
    await generateRecurringDrafts(NOW);
    expect(dup.mock.calls.map((c) => c[2])).toEqual(['2026-12-02']);
  });

  it('stops after the set number of events', async () => {
    // After 4 events from 4 Nov: 11, 18, 25 Nov and 2 Dec. Only 2 Dec is still ahead.
    db.eventSeries.findMany.mockResolvedValue([series({ ends: 'after', endAfter: 4 })]);
    await generateRecurringDrafts(NOW);
    expect(dup.mock.calls.map((c) => c[2])).toEqual(['2026-12-02']);
  });
});
