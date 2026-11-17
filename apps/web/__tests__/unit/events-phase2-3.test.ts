import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const { prisma, session } = vi.hoisted(() => {
  process.env.NEXTAUTH_SECRET ??= 'test-only-secret';
  process.env.R2_PUBLIC_URL ??= 'https://media.udyaibase.com';
  const prisma = {
    event: { findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn(), update: vi.fn(), count: vi.fn() },
    eventRegistration: { updateMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    eventSeries: { findMany: vi.fn(), update: vi.fn() },
    eventSeriesFollower: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  };
  return { prisma, session: { organizerId: 'org1', allEvents: true } };
});
vi.mock('@udyaibase/database', () => ({ prisma, Prisma: { AnyNull: 'AnyNull', DbNull: 'DbNull' } }));
vi.mock('@/lib/email/send', () => ({ sendEmail: vi.fn(async () => ({ success: true })), sendEmailBatch: vi.fn(async (items: unknown[]) => items.map(() => ({ success: true }))) }));
vi.mock('@/lib/rate-limit', () => ({ authRateLimit: null, strictRateLimit: null, checkRateLimit: async () => ({ success: true, reset: 0 }), getClientIdentifier: () => 'ip', rateLimitMessage: () => 'slow', retryAfterHeaders: () => ({}) }));
vi.mock('@/lib/organizer-auth/require-permission', () => ({ requirePermission: vi.fn(async () => session), canAccessEvent: () => true }));
vi.mock('@/lib/events/certificates', () => ({ issueCertificateOnCheckIn: vi.fn() }));
vi.mock('next/server', async (orig) => ({ ...(await orig<typeof import('next/server')>()), after: (fn: () => unknown) => { void fn; } }));

import { cleanSponsors, sponsorReportCsv, sponsorTarget } from '@/lib/events/sponsors';
import { clampScanTime, findInRoster, parseScanValue, searchRoster, type RosterRow } from '@/lib/events/checkin-rules';
import { renderBadgesPdf } from '@/lib/events/badges';
import { cleanRecurrence, describeRecurrence, occurrencesBetween, slugifySeries } from '@/lib/events/series';
import { seriesFollowToken, verifySeriesFollowToken } from '@/lib/events/after-event';
import { POST as syncPost } from '@/app/api/organizer/check-in/sync/route';

beforeEach(() => vi.clearAllMocks());

describe('sponsors', () => {
  it('keeps only https sites and our own logo uploads, and needs a name', () => {
    const out = cleanSponsors([{ name: ' Acme ', tier: 'GOLD', logoUrl: 'https://evil.com/x.png', websiteUrl: 'javascript:alert(1)' }, { name: 'B', tier: 'NOPE', logoUrl: 'https://media.udyaibase.com/a.png', websiteUrl: 'https://b.com' }]);
    expect(out).toEqual([
      { id: undefined, name: 'Acme', tier: 'GOLD', logoUrl: null, websiteUrl: null, startupId: null },
      { id: undefined, name: 'B', tier: 'PARTNER', logoUrl: 'https://media.udyaibase.com/a.png', websiteUrl: 'https://b.com/', startupId: null },
    ]);
    expect(cleanSponsors([{ name: '  ' }])).toEqual({ error: 'Every sponsor needs a name.' });
  });

  it('report CSV escapes quotes and shows click rate', () => {
    const csv = sponsorReportCsv('Summit "24"', [{ name: 'A', tier: 'GOLD', impressions: 200, clicks: 5 }, { name: 'B', tier: 'SILVER', impressions: 0, clicks: 0 }]);
    const lines = csv.split('\r\n');
    expect(lines[1]).toBe('"Summit ""24""","A","Gold","200","5","2.5%"');
    expect(lines[2]).toBe('"Summit ""24""","B","Silver","0","0",""');
  });

  it('click target: website first, then the startup page', () => {
    expect(sponsorTarget({ websiteUrl: 'https://a.com/', startupSlug: 'a' })).toBe('https://a.com/');
    expect(sponsorTarget({ websiteUrl: null, startupSlug: 'a' })).toBe('/startups/a');
    expect(sponsorTarget({ websiteUrl: null })).toBeNull();
  });
});

describe('offline check-in rules', () => {
  const rows: RosterRow[] = [
    { id: 'r1', qrToken: 'tok1', name: 'Asha Rao', email: 'asha@x.com', company: null, occupation: null, tier: null, status: 'CONFIRMED', checkedInAt: null },
    { id: 'r2', qrToken: 'tok2', name: 'Ravi Kumar', email: 'Ravi@Y.com', company: null, occupation: null, tier: null, status: 'CANCELLED', checkedInAt: null },
  ];
  it('reads tokens from raw codes and ticket links', () => {
    expect(parseScanValue('tok1')).toBe('tok1');
    expect(parseScanValue('https://udyaibase.com/e/tok1?x=1')).toBe('tok1');
    expect(parseScanValue('https://udyaibase.com/ticket?token=tok2')).toBe('tok2');
  });
  it('finds by token, then email (any case), then name', () => {
    expect(findInRoster(rows, 'tok2')?.id).toBe('r2');
    expect(findInRoster(rows, 'ravi@y.COM')?.id).toBe('r2');
    // A name is a search, never an exact match: it must not admit anyone by itself.
    expect(findInRoster(rows, 'asha')).toBeNull();
    expect(searchRoster(rows, 'asha').map((r) => r.id)).toEqual(['r1']);
    expect(searchRoster(rows, 'a')).toEqual([]);
    expect(findInRoster(rows, 'a')).toBeNull();
    expect(findInRoster(rows, 'nobody')).toBeNull();
  });
  it('clamps device times to the last 3 days and never the future', () => {
    const now = new Date('2026-11-16T10:00:00Z');
    expect(clampScanTime('2026-11-17T10:00:00Z', now).toISOString()).toBe(now.toISOString());
    expect(clampScanTime('2026-11-01T10:00:00Z', now).toISOString()).toBe('2026-11-13T10:00:00.000Z');
    expect(clampScanTime('garbage', now).toISOString()).toBe(now.toISOString());
  });
});

describe('offline sync API', () => {
  const req = (body: unknown) => new NextRequest('https://udyaibase.com/api/organizer/check-in/sync', { method: 'POST', body: JSON.stringify(body) });
  it('checks in once with the earliest scan, and reports duplicates and blocked', async () => {
    prisma.event.findFirst.mockResolvedValue({ id: 'e1' });
    prisma.eventRegistration.updateMany.mockImplementation(async ({ where }: { where: { id: string } }) => ({ count: where.id === 'a' ? 1 : 0 }));
    prisma.eventRegistration.findFirst.mockImplementation(async ({ where }: { where: { id: string } }) =>
      where.id === 'b' ? { status: 'CHECKED_IN', checkedInAt: new Date('2026-11-16T09:00:00Z') } : where.id === 'c' ? { status: 'CANCELLED', checkedInAt: null } : null);
    const recent = new Date(Date.now() - 60_000).toISOString();
    const earlier = new Date(Date.now() - 120_000).toISOString();
    const res = await syncPost(req({ eventId: 'e1', scans: [
      { registrationId: 'a', scannedAt: recent }, { registrationId: 'a', scannedAt: earlier },
      { registrationId: 'b', scannedAt: recent }, { registrationId: 'c', scannedAt: recent }, { registrationId: 'd', scannedAt: recent },
    ] }));
    const d = await res.json();
    expect(prisma.eventRegistration.updateMany).toHaveBeenCalledTimes(4);
    const first = prisma.eventRegistration.updateMany.mock.calls[0][0];
    expect(first.where).toMatchObject({ id: 'a', eventId: 'e1', status: 'CONFIRMED' });
    expect(first.data.checkedInAt.toISOString()).toBe(earlier);
    expect(d.results.map((r: { status: string }) => r.status)).toEqual(['CHECKED_IN', 'ALREADY_CHECKED_IN', 'BLOCKED', 'NOT_FOUND']);
    // b was checked in earlier elsewhere: its time is kept.
    expect(prisma.eventRegistration.update).not.toHaveBeenCalled();
  });
  it('refuses other hosts’ events', async () => {
    prisma.event.findFirst.mockResolvedValue(null);
    const res = await syncPost(req({ eventId: 'e9', scans: [] }));
    expect(res.status).toBe(404);
    expect(res).toBeInstanceOf(NextResponse);
  });
});

describe('badges', () => {
  it('renders every layout, including long names and missing QR codes', async () => {
    const people = [
      { name: 'Venkata Subrahmanya Lakshmi Narasimha Prasad', company: 'A very long company name private limited', occupation: 'Founder', tier: 'VIP', qrToken: 'abc' },
      { name: 'José Ñúñez', company: null, occupation: null, tier: null, qrToken: null },
    ];
    for (const layout of ['a4', 'label', 'a6'] as const) {
      const pdf = await renderBadgesPdf({ eventTitle: 'AI Summit 2026', eventDate: '16 November 2026', layout, people });
      expect(Buffer.from(pdf).subarray(0, 5).toString()).toBe('%PDF-');
    }
  });
});

describe('series', () => {
  const base = { templateEventId: 'e1', createAheadDays: 21 };
  it('cleans repeat rules', () => {
    expect(cleanRecurrence({ ...base, freq: 'WEEKLY', interval: 9 })).toMatchObject({ freq: 'WEEKLY', interval: 4, monthWeek: null });
    expect(cleanRecurrence({ ...base, freq: 'MONTHLY', monthWeek: 7 })).toMatchObject({ monthWeek: 1, interval: 1 });
    expect(cleanRecurrence({ freq: 'MONTHLY' })).toBeNull();
    expect(cleanRecurrence({ ...base, freq: 'DAILY' })).toBeNull();
  });
  it('weekly dates step from the template', () => {
    const rule = cleanRecurrence({ ...base, freq: 'WEEKLY', interval: 2 })!;
    expect(occurrencesBetween(rule, '2026-11-04', '2026-11-16', '2026-12-31')).toEqual(['2026-11-18', '2026-12-02', '2026-12-16', '2026-12-30']);
  });
  it('monthly: nth and last weekday', () => {
    // 2026-11-05 is the first Thursday of November.
    const first = cleanRecurrence({ ...base, freq: 'MONTHLY', monthWeek: 1 })!;
    expect(occurrencesBetween(first, '2026-11-05', '2026-11-05', '2027-02-28')).toEqual(['2026-12-03', '2027-01-07', '2027-02-04']);
    const last = cleanRecurrence({ ...base, freq: 'MONTHLY', monthWeek: -1 })!;
    expect(occurrencesBetween(last, '2026-11-26', '2026-11-26', '2027-01-31')).toEqual(['2026-12-31', '2027-01-28']);
    expect(describeRecurrence(last, 4)).toBe('The last Thursday of every month');
  });
  it('slugs and signed follow links', () => {
    expect(slugifySeries('Bengaluru AI Meetup!')).toBe('bengaluru-ai-meetup');
    const t = seriesFollowToken('f1', 'confirm');
    expect(verifySeriesFollowToken(t, 'confirm')).toBe('f1');
    expect(verifySeriesFollowToken(t, 'stop')).toBeNull();
    expect(verifySeriesFollowToken(`${t}x`, 'confirm')).toBeNull();
  });
});

import { cleanSessions, cleanTracks, sessionTimes } from '@/lib/events/agenda';
import { cfpIsOpen, cfpSettings, cleanSubmission } from '@/lib/events/cfp';
import { buildIcs } from '@/lib/events/ics';

describe('agenda', () => {
  it('validates sessions and drops unknown tracks, speakers and unsafe links', () => {
    const ok = cleanSessions([{ title: 'Keynote', startTime: '10:00', endTime: '10:45', track: 'Main', speakerId: 's1', recordingUrl: 'http://x.com', dayNumber: 99 }], { tracks: ['Main'], speakerIds: new Set(['s1']) });
    expect(ok).toEqual({ sessions: [expect.objectContaining({ title: 'Keynote', track: 'Main', speakerId: 's1', recordingUrl: null, dayNumber: 1 })] });
    expect(cleanSessions([{ title: 'X', startTime: '11:00', endTime: '10:00' }], { tracks: [], speakerIds: new Set() })).toMatchObject({ row: 0 });
    expect(cleanSessions([{ title: '', startTime: '11:00' }], { tracks: [], speakerIds: new Set() })).toMatchObject({ error: 'Every session needs a title.' });
  });
  it('cleans tracks and places sessions on the right day in the event time zone', () => {
    expect(cleanTracks(['Main', ' main ', '', 'Workshop'])).toEqual(['Main', 'Workshop']);
    const { start, end } = sessionTimes({ dayNumber: 2, startTime: '09:30', endTime: '' }, { startAt: '2026-12-01T04:30:00Z', timezone: 'Asia/Kolkata' });
    expect(start?.toISOString()).toBe('2026-12-02T04:00:00.000Z');
    expect(end?.toISOString()).toBe('2026-12-02T04:30:00.000Z');
  });
  it('.ics escapes text and uses CRLF', () => {
    const ics = buildIcs([{ uid: 'a', title: 'Talk; with, commas', start: new Date('2026-12-02T04:00:00Z'), end: new Date('2026-12-02T04:30:00Z') }]);
    expect(ics).toContain('SUMMARY:Talk\; with\\, commas');
    expect(ics).toContain('DTSTART:20261202T040000Z');
    expect(ics.split('\r\n')[0]).toBe('BEGIN:VCALENDAR');
  });
});

describe('call for speakers', () => {
  const event = { endAt: new Date('2026-12-01'), status: 'PUBLISHED', deletedAt: null };
  it('is open only while the host allows it, before the close date and the event end', () => {
    const now = new Date('2026-11-16');
    expect(cfpIsOpen(cfpSettings({ open: true }), event, now)).toBe(true);
    expect(cfpIsOpen(cfpSettings({ open: true, closesAt: '2026-11-10T00:00:00Z' }), event, now)).toBe(false);
    expect(cfpIsOpen(cfpSettings({ open: false }), event, now)).toBe(false);
    expect(cfpIsOpen(cfpSettings({ open: true }), { ...event, status: 'DRAFT' }, now)).toBe(false);
  });
  it('validates proposals', () => {
    const good = { name: 'Asha', email: 'ASHA@x.com', title: 'Scaling RAG', abstract: 'x'.repeat(60), linkedinUrl: 'javascript:1', format: 'Talk', track: 'Nope' };
    expect(cleanSubmission(good, { formats: ['Talk'], tracks: ['Main'] })).toMatchObject({ email: 'asha@x.com', linkedinUrl: null, format: 'Talk', track: null });
    expect(cleanSubmission({ ...good, abstract: 'short' }, { formats: [], tracks: [] })).toMatchObject({ field: 'abstract' });
    expect(cleanSubmission({ ...good, email: 'nope' }, { formats: [], tracks: [] })).toMatchObject({ field: 'email' });
  });
});
