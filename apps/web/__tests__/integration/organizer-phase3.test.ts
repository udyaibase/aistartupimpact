import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.hoisted(() => { process.env.NEXTAUTH_SECRET = 'test-secret-for-signed-links-min-32-chars!!'; });

const db = vi.hoisted(() => ({
  eventRegistration: { findFirst: vi.fn(), findUnique: vi.fn(), count: vi.fn(), update: vi.fn() },
}));
vi.mock('@udyaibase/database', () => ({ prisma: db }));
const promote = vi.hoisted(() => vi.fn(async () => 1));
vi.mock('@/lib/events/waitlist', () => ({ promoteWaitlist: promote, sendRegistrationStatusEmail: vi.fn(), notifyHostPlanLimit: vi.fn() }));
vi.mock('@/lib/revalidate', () => ({ refreshPaths: vi.fn() }));

import { emailBlocked, emailOverDailyLimit, reportNotMe, DAILY_REGISTRATIONS_PER_EMAIL, NOT_ME_BLOCK_DAYS, NOT_ME_REASON } from '@/lib/events/registration-trust';
import { notMeToken, verifyNotMeToken, hostOptOutToken } from '@/lib/events/after-event';
import { eventRegistrationHtml } from '@udyaibase/utils';

const src = (p: string) => readFileSync(resolve(__dirname, '../..', p), 'utf8');

beforeEach(() => vi.clearAllMocks());

describe('S4: one address, a few registrations a day', () => {
  it('counts the last 24 hours of guest registrations, not walk-ins', async () => {
    db.eventRegistration.count.mockResolvedValue(DAILY_REGISTRATIONS_PER_EMAIL - 1);
    expect(await emailOverDailyLimit('a@b.co')).toBe(false);
    db.eventRegistration.count.mockResolvedValue(DAILY_REGISTRATIONS_PER_EMAIL);
    expect(await emailOverDailyLimit('a@b.co')).toBe(true);
    const where = db.eventRegistration.count.mock.calls[0][0].where;
    expect(where.guestEmail).toBe('a@b.co');
    expect(where.registrationSource).toEqual({ not: 'WALK_IN' });
    expect(Date.now() - where.registeredAt.gt.getTime()).toBeLessThan(864e5 + 5000);
  });
});

describe('S4: "I didn\'t register"', () => {
  const reg = (over: Record<string, unknown> = {}) => ({ id: 'r1', eventId: 'e1', status: 'CONFIRMED', paymentStatus: null, waitlistReason: null, deletedAt: null, event: { slug: 'summit' }, ...over });

  it('the link names one registration and cannot be made from another kind of link', () => {
    const t = notMeToken('r1');
    expect(verifyNotMeToken(t)).toBe('r1');
    expect(verifyNotMeToken(hostOptOutToken('r1'))).toBeNull();
    expect(verifyNotMeToken('r1.' + 'A'.repeat(32))).toBeNull();
    expect(verifyNotMeToken(undefined)).toBeNull();
  });

  it('cancels the registration, marks it, and gives the seat to the next person waiting', async () => {
    db.eventRegistration.findUnique.mockResolvedValue(reg());
    expect(await reportNotMe('r1')).toBe('cancelled');
    expect(db.eventRegistration.update.mock.calls[0][0].data).toMatchObject({ status: 'CANCELLED', waitlistReason: NOT_ME_REASON });
    expect(promote).toHaveBeenCalledWith('e1');
  });

  it('is safe to press twice', async () => {
    db.eventRegistration.findUnique.mockResolvedValue(reg({ status: 'CANCELLED', waitlistReason: NOT_ME_REASON }));
    expect(await reportNotMe('r1')).toBe('already');
    expect(db.eventRegistration.update).not.toHaveBeenCalled();
  });

  it('leaves a paid ticket and a used ticket alone', async () => {
    db.eventRegistration.findUnique.mockResolvedValue(reg({ paymentStatus: 'PAID' }));
    expect(await reportNotMe('r1')).toBe('paid');
    db.eventRegistration.findUnique.mockResolvedValue(reg({ status: 'CHECKED_IN' }));
    expect(await reportNotMe('r1')).toBe('attended');
    db.eventRegistration.findUnique.mockResolvedValue(null);
    expect(await reportNotMe('r1')).toBe('missing');
    expect(db.eventRegistration.update).not.toHaveBeenCalled();
  });

  it('the address is then blocked for 90 days, and only by a "not me" cancellation', async () => {
    db.eventRegistration.findFirst.mockResolvedValue({ id: 'r1' });
    expect(await emailBlocked('a@b.co')).toBe(true);
    const where = db.eventRegistration.findFirst.mock.calls[0][0].where;
    expect(where).toMatchObject({ guestEmail: 'a@b.co', status: 'CANCELLED', waitlistReason: NOT_ME_REASON });
    expect(Math.round((Date.now() - where.cancelledAt.gt.getTime()) / 864e5)).toBe(NOT_ME_BLOCK_DAYS);
    db.eventRegistration.findFirst.mockResolvedValue(null);
    expect(await emailBlocked('a@b.co')).toBe(false);
  });

  it('only a POST cancels: opening the page changes nothing', () => {
    expect(src('app/(public)/events/not-me/page.tsx')).not.toMatch(/reportNotMe|\.update\(/);
    const route = src('app/api/events/not-me/route.ts');
    expect(route).toContain('export async function POST');
    expect(route).not.toContain('export async function GET');
  });
});

describe('S7: a repeat registration looks like a first one', () => {
  const lib = src('lib/events/register-event.ts');

  it('the public forms never receive the ticket code or the record id', () => {
    for (const p of ['app/api/events/register/route.ts', 'app/api/embed/register/route.ts']) {
      expect(src(p)).toContain('data: publicRegistrationReply(result)');
      expect(src(p)).not.toContain('data: result }');
    }
    const reply = lib.slice(lib.indexOf('export function publicRegistrationReply'), lib.indexOf('type ExistingRegistration'));
    expect(reply).not.toMatch(/qrToken|registrationId/);
  });

  it('"already registered" is said only to a host adding a walk-in', () => {
    const said = lib.split('\n').filter((l) => l.includes('already_registered'));
    expect(said.length).toBe(2);
    expect(said[0]).toContain('if (!guestForm)');
    expect(lib).toContain('return repeatRegistration(existingReg');
  });

  it('the ticket is re-sent to the address, at most twice a day', () => {
    expect(lib).toContain('checkRateLimit(repeatRegistrationEmailRateLimit, `${ev.eventId}:${ev.email}`)');
    expect(src('lib/rate-limit.ts')).toMatch(/repeatRegistrationEmailRateLimit[\s\S]{0,120}slidingWindow\(2, "1 d"\)/);
  });
});

describe('the confirmation email', () => {
  const data = { eventTitle: 'AI <Summit>', eventSlug: 'summit', eventDate: 'Sat', eventTime: '10:00 am', eventTimezone: 'Asia/Kolkata', format: 'IN_PERSON', venueName: 'Hall "A"', qrToken: 'q', googleCalendarUrl: 'https://calendar.google.com/x' };

  it('S9: a name or title with HTML in it is shown as text', () => {
    const html = eventRegistrationHtml('<img src=x onerror=alert(1)>', data);
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x');
    expect(html).toContain('AI &lt;Summit&gt;');
  });

  it('carries the "Didn\'t register?" link when there is one', () => {
    expect(eventRegistrationHtml('Asha', { ...data, notMeUrl: 'https://udyaibase.com/events/not-me?t=abc' })).toContain('href="https://udyaibase.com/events/not-me?t=abc"');
    expect(eventRegistrationHtml('Asha', data)).not.toContain('not-me');
  });

  it('S9: angle brackets are removed from a name before it is saved', () => {
    expect(src('lib/events/register-event.ts')).toContain(".replace(/[<>]/g, '')");
  });

  it('shows the time in the event’s time zone, not the server’s', () => {
    const lib = src('lib/events/register-event.ts');
    const fn = lib.slice(lib.indexOf('export async function sendConfirmationEmail'));
    expect(fn).toMatch(/toLocaleTimeString\("en-IN", \{\s*hour: "2-digit", minute: "2-digit", timeZone,/);
  });
});

describe('found by the end-to-end host test', () => {
  it('an event cannot end before it starts, on create or on edit', async () => {
    const { cleanEventInput } = await import('@/lib/events/event-input');
    const bad = cleanEventInput({ title: 'X', startAt: '2026-12-01T10:00:00.000Z', endAt: '2026-12-01T09:00:00.000Z' });
    expect(bad).toMatchObject({ ok: false, field: 'endAt' });
    expect(cleanEventInput({ title: 'X', startAt: '2026-12-01T10:00:00.000Z', endAt: '2026-12-01T10:00:00.000Z' })).toMatchObject({ ok: false });
    expect(cleanEventInput({ title: 'X', startAt: '2026-12-01T10:00:00.000Z', endAt: '2026-12-01T12:00:00.000Z' })).toMatchObject({ ok: true });
    // An edit that sends only one of the two is compared with the saved event.
    expect(src('app/api/organizer/events/[eventId]/route.ts')).toContain('if (start && end && end <= start)');
  });

  it('nobody can register for an event that has ended (walk-ins excepted)', () => {
    const lib = src('lib/events/register-event.ts');
    expect(lib).toContain('if (registrationSource !== "WALK_IN" && event.endAt < new Date())');
    expect(lib.indexOf('event.endAt < new Date()')).toBeLessThan(lib.indexOf('emailBlocked(email)'));
  });

  it('the join link for an online event is in the ticket email, and nowhere public', () => {
    const data = { eventTitle: 'Webinar', eventSlug: 'w', eventDate: 'Sat', eventTime: '10:00 am', eventTimezone: 'Asia/Kolkata', format: 'VIRTUAL', qrToken: 'q', googleCalendarUrl: 'https://calendar.google.com/x' };
    const withLink = eventRegistrationHtml('Asha', { ...data, meetingLink: 'https://meet.google.com/abc-defg-hij' });
    expect(withLink).toContain('href="https://meet.google.com/abc-defg-hij"');
    expect(eventRegistrationHtml('Asha', data)).toContain('the host will send the link before the event');
    expect(eventRegistrationHtml('Asha', { ...data, meetingLink: 'javascript:alert(1)' })).not.toContain('javascript:');
    expect(src('app/(public)/events/[slug]/page.tsx')).not.toContain('publicMeetingLink');
    expect(src('lib/events/register-event.ts')).toContain('meetingLink: eventForEmail.format !== "IN_PERSON"');
  });

  it('a new or changed join link is emailed to the people already registered', () => {
    const route = src('app/api/organizer/events/[eventId]/route.ts');
    expect(route).toContain('data.meetingLink !== event.meetingLink');
    expect(route).toContain('sendMeetingLinkUpdate(params.eventId)');
    const lib = src('lib/events/waitlist.ts');
    const fn = lib.slice(lib.indexOf('export async function sendMeetingLinkUpdate'), lib.indexOf('/** Tell the host, once per event'));
    // Only people with a seat, only for a published online or hybrid event that hasn't ended, only an https link.
    expect(fn).toContain("status: { in: ['CONFIRMED', 'CHECKED_IN'] }");
    expect(fn).toContain("status: 'PUBLISHED'");
    expect(fn).toContain("ev.format === 'IN_PERSON' || ev.endAt < new Date()");
    expect(fn).toContain('esc(ev.meetingLink)');
  });

  it('raising an event’s capacity gives the new seats to the waitlist', () => {
    expect(src('app/api/organizer/events/[eventId]/route.ts')).toContain('if (data.capacity !== undefined) await promoteWaitlist(params.eventId)');
  });
});
