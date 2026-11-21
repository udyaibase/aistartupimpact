import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

vi.hoisted(() => {
  process.env.USER_JWT_SECRET = 'test-user-secret-min-32-characters-long!!';
  process.env.ORGANIZER_JWT_SECRET = 'test-organizer-secret-min-32-characters!!';
});

const jar = vi.hoisted(() => new Map<string, string>());
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (n: string) => (jar.has(n) ? { value: jar.get(n)! } : undefined),
    set: (n: string, v: string) => { jar.set(n, v); },
    delete: (n: string) => { jar.delete(n); },
  }),
}));
const db = vi.hoisted(() => ({
  eventOrganizer: { findFirst: vi.fn(), findUnique: vi.fn() },
  eventOrganizerSession: { findUnique: vi.fn(), update: vi.fn() },
  webUserSession: { findFirst: vi.fn() },
}));
vi.mock('@udyaibase/database', () => ({ prisma: db }));
vi.mock('@/lib/unified-auth', () => ({ getUnifiedSession: vi.fn(async () => null) }));

import { SignJWT } from 'jose';
import { getOrganizerSession } from '@/lib/organizer-auth';
import { eventInstant } from '@/lib/events/zoned-time';
import { eventCity, withoutAddress } from '@/lib/events/public-place';

const HOST = { id: 'o1', email: 'host@events.test', name: 'Ritika', company: null, avatar: null, status: 'ACTIVE', deactivatedAt: null, onboardingCompleted: true, emailVerified: true };
const siteCookie = (claims: Record<string, unknown>) =>
  new SignJWT({ userId: 'w1', email: HOST.email, name: 'Ritika', ...claims })
    .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('7d')
    .sign(new TextEncoder().encode(process.env.USER_JWT_SECRET));

describe('S1: the site cookie in the host portal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    jar.clear();
    db.eventOrganizer.findFirst.mockResolvedValue(HOST);
  });

  it('opens the workspace while its site session exists', async () => {
    jar.set('user-token', await siteCookie({ sessionId: 's1' }));
    db.webUserSession.findFirst.mockResolvedValue({ id: 's1' });
    expect(await getOrganizerSession()).toMatchObject({ id: 'o1', email: HOST.email });
    expect(db.webUserSession.findFirst.mock.calls[0][0].where).toMatchObject({ id: 's1' });
  });

  it('a copy of the cookie stops working once that session is deleted (signed out)', async () => {
    jar.set('user-token', await siteCookie({ sessionId: 's1' }));
    db.webUserSession.findFirst.mockResolvedValue(null);
    expect(await getOrganizerSession()).toBeNull();
    expect(db.eventOrganizer.findFirst).not.toHaveBeenCalled();
  });
});

describe('B1: a stored event time is a UTC instant, whatever the device’s time zone', () => {
  const IST = { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true } as const;
  const shown = (value: string) => new Intl.DateTimeFormat('en-US', IST).format(eventInstant(value));

  it('text without a zone marker is UTC: 04:30 stored for an India-time event is 10:00 AM there', () => {
    expect(eventInstant('2026-11-28 04:30:00').toISOString()).toBe('2026-11-28T04:30:00.000Z');
    expect(shown('2026-11-28 04:30:00')).toBe('10:00 AM');
    expect(shown('2026-11-28T04:30:00')).toBe('10:00 AM');
    expect(shown('2026-11-28 04:30:00.000')).toBe('10:00 AM');
  });

  it('text with a marker, and Date objects, pass through unchanged', () => {
    expect(shown('2026-11-28T04:30:00.000Z')).toBe('10:00 AM');
    expect(shown('2026-11-28T10:00:00+05:30')).toBe('10:00 AM');
    const d = new Date('2026-11-28T04:30:00Z');
    expect(eventInstant(d)).toBe(d);
  });

  it('no public event query returns a time as bare text any more', () => {
    const root = resolve(__dirname, '../..');
    const files = (dir: string): string[] => readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      if (n === 'node_modules' || n.startsWith('.')) return [];
      return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
    });
    const offenders = ['app', 'lib', 'components'].flatMap((d) => files(join(root, d)))
      .filter((f) => /"(startAt|endAt|registrationDeadline)"::text|(startAt|endAt)::text/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(root, f));
    expect(offenders).toEqual([]);
  });
});

describe('S2: the street address is not public', () => {
  it('finds the city in an address', () => {
    expect(eventCity('Hosur Road, Bengaluru')).toBe('Bengaluru');
    expect(eventCity('NIMHANS Convention Centre, Hosur Road, Bengaluru, Karnataka 560029, India')).toBe('Bengaluru');
    expect(eventCity('WeWork Galaxy, 43 Residency Road, Bangalore')).toBe('Bengaluru'); // an older name for the same city
    expect(eventCity('Plot 12, Baner Road | Pune')).toBe('Pune');
  });

  it('says nothing when there is no city to find, rather than showing a street', () => {
    expect(eventCity('221B Baker Street')).toBe('');
    expect(eventCity('')).toBe('');
    expect(eventCity(null)).toBe('');
  });

  it('a public row loses its address and map position and gains the city', () => {
    const row = withoutAddress({ id: 'e1', title: 'Summit', venueName: 'NIMHANS Convention Centre', address: 'Hosur Road, Bengaluru', latitude: 12.94, longitude: 77.59 });
    expect(row).toEqual({ id: 'e1', title: 'Summit', venueName: 'NIMHANS Convention Centre', city: 'Bengaluru' });
  });

  it('the public search, the home page and the calendar download all drop the address', () => {
    const src = (p: string) => readFileSync(resolve(__dirname, '../..', p), 'utf8');
    expect(src('lib/events/search.ts')).toContain('rows.map(withoutAddress)');
    expect(src('lib/db.ts')).toMatch(/getUpcomingEventsDirect[\s\S]{0,900}\.map\(withoutAddress\)/);
    expect(src('app/api/events/calendar/route.ts')).not.toMatch(/\$\{event\.address\}/);
  });

  it('the event page removes the address and the meeting link before anything is rendered', () => {
    const page = readFileSync(resolve(__dirname, '../../app/(public)/events/[slug]/page.tsx'), 'utf8');
    for (const field of ['address', 'latitude', 'longitude', 'meetingLink']) expect(page).toContain(`delete event.${field};`);
    expect(page).not.toContain('publicMeetingLink');
    expect(page).not.toMatch(/"url": event\.meetingLink/);
  });
});
