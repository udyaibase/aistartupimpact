import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/**
 * Every host portal API route must check who is asking, and every write must be limited. A new route that forgets
 * either fails here. Three checks are in use, each for a different kind of route:
 *   - requirePermission(...)  workspace routes: signed in, and the role allows it
 *   - afterEventAccess(...)   one event's routes: the above, plus the event belongs to the workspace
 *   - getOrganizerSession()   the person's own account: profile, password, two-step sign-in, support, workspace switch
 */
const ROOT = resolve(__dirname, '../../app/api/organizer');

// Routes for people who are not signed in yet (or are signing out). Adding to this list needs a reason.
const PUBLIC = new Set([
  'auth/forgot-password', 'auth/google', 'auth/google/callback', 'auth/login', 'auth/logout',
  'auth/reset-password', 'auth/signup', 'auth/verify', 'auth/verify-2fa',
  'reactivate',   // a deactivated account signs back in with email and password
  'team/accept',  // the invitation link, checked by its token
]);

// Writes with no limit, each for a reason.
const UNLIMITED_WRITES = new Set([
  'auth/logout',               // signing out must always work
  'check-in', 'check-in/sync', // the door: one request per guest, in bursts; a limit here would stop the queue
  'billing/verify',            // confirms a payment the gateway has already taken
  'widgets/[widgetId]/funnel', // reads statistics; POST only to carry filters
]);

const routes = (dir: string): string[] => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? routes(p) : n === 'route.ts' ? [p] : [];
});
const all = routes(ROOT).map((file) => ({ name: relative(ROOT, file).replace(/\/route\.ts$/, ''), src: readFileSync(file, 'utf8') }));

const GUARD = /requirePermission\(|afterEventAccess\(|getOrganizerSession\(\)/;
const LIMIT = /RateLimit|hostWriteLimit\(|tooMany\(/;
const WRITE = /export (?:async function|const) (POST|PUT|PATCH|DELETE)\b/;

describe('host portal API routes', () => {
  it('finds the routes', () => {
    expect(all.length).toBeGreaterThan(70);
  });

  it('every route outside the public list checks who is signed in', () => {
    const unguarded = all.filter((r) => !PUBLIC.has(r.name) && !GUARD.test(r.src)).map((r) => r.name);
    expect(unguarded).toEqual([]);
  });

  it('every write is limited, except the listed ones', () => {
    const unlimited = all.filter((r) => WRITE.test(r.src) && !UNLIMITED_WRITES.has(r.name) && !LIMIT.test(r.src)).map((r) => r.name);
    expect(unlimited).toEqual([]);
  });

  it('the exception lists hold only routes that exist', () => {
    const names = new Set(all.map((r) => r.name));
    expect([...PUBLIC, ...UNLIMITED_WRITES].filter((n) => !names.has(n))).toEqual([]);
  });

  it('the old events guard is gone', () => {
    expect(() => readFileSync(resolve(__dirname, '../../lib/events/auth.ts'))).toThrow();
  });

  it('view-only roles get a short event record, and an outside event is "not found"', () => {
    const src = all.find((r) => r.name === 'events/[eventId]')!.src;
    const get = src.slice(src.indexOf('export async function GET'));
    const viewOnly = get.slice(get.indexOf(': await prisma.event.findFirst'), get.indexOf('if (!event)'));
    for (const hidden of ['meetingLink', 'certificateSettings', 'followUpSettings', 'customQuestions']) expect(viewOnly).not.toContain(hidden);
    expect(get).toContain('organizerId: session.organizerId, deletedAt: null');
    expect(get).not.toContain('status: 403 });\n\n  // Staff');
    expect(all.find((r) => r.name === 'registrations')!.src).toContain('status: 404');
  });
});
