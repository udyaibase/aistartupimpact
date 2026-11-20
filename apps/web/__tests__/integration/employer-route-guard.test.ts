import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const mockSession = vi.fn();
vi.mock('@/lib/employer-auth', () => ({ getEmployerSession: () => mockSession() }));

const ROOT = resolve(__dirname, '../../app/api/employer');

/** Routes that are reached before anyone is signed in, or that report the session itself. Everything else is guarded. */
const OPEN_ROUTES = new Set([
  'auth/forgot-password', 'auth/founder', 'auth/login', 'auth/logout', 'auth/member-code', 'auth/reset-password',
  'auth/send-otp', 'auth/signup', 'auth/verify-2fa', 'auth/verify-otp',
  'signup',                    // creating a workspace: guarded by its own verified-email pass
  'team/accept',               // accepting an invite: the emailed link is the proof
  'weekly-report/unsubscribe', // one-click unsubscribe from an email: a signed link
  'session',                   // answers "am I signed in?"
]);
/** The import routes share one guard built on employerApi (it needs two permissions and full job access). */
const SHARED_GUARD = /importSession\(\)/;

function routes(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? routes(p) : name === 'route.ts' ? [p] : [];
  });
}

describe('every hiring-portal API route goes through the one guard', () => {
  const all = routes(ROOT).map((p) => ({ key: relative(ROOT, p).replace(/\/route\.ts$/, ''), src: readFileSync(p, 'utf8') }));

  it('finds the routes', () => {
    expect(all.length).toBeGreaterThan(80);
  });

  it('each handler of each guarded route calls employerApi (or the shared import guard)', () => {
    const unguarded: string[] = [];
    for (const r of all) {
      if (OPEN_ROUTES.has(r.key)) continue;
      const handlers = r.src.split(/export async function (?=GET|POST|PUT|PATCH|DELETE)/).slice(1);
      handlers.forEach((h) => {
        if (!/employerApi\(/.test(h) && !SHARED_GUARD.test(h)) unguarded.push(`${r.key} ${h.slice(0, h.indexOf('('))}`);
      });
    }
    expect(unguarded).toEqual([]);
  });

  it('no guarded route reads the session or checks the role by hand', () => {
    const byHand = all
      .filter((r) => !OPEN_ROUTES.has(r.key))
      .filter((r) => /getEmployerSession\(|requireEmployerAuth\(|requireEmployerPermission\(/.test(r.src))
      .map((r) => r.key);
    expect(byHand).toEqual([]);
  });

  it('the list of open routes has no stale entries', () => {
    const keys = new Set(all.map((r) => r.key));
    expect([...OPEN_ROUTES].filter((k) => !keys.has(k))).toEqual([]);
  });
});

describe('employerApi', () => {
  const base = { id: 'e1', email: 'me@acme.test', companyName: 'Acme', slug: 'acme', plan: 'FREE', onboardingCompleted: true, memberId: 'm1', memberName: 'Me' };
  beforeEach(() => mockSession.mockReset());
  const guard = async (...a: Parameters<typeof import('@/lib/employer/api-session').employerApi>) => (await import('@/lib/employer/api-session')).employerApi(...a);

  it('401 when nobody is signed in', async () => {
    mockSession.mockResolvedValue(null);
    expect((await guard('jobs.view')).error?.status).toBe(401);
  });

  it('403 when the role lacks the permission, or any one of several', async () => {
    mockSession.mockResolvedValue({ ...base, role: 'INTERVIEWER', jobIds: null });
    expect((await guard('candidates.move')).error?.status).toBe(403);
    expect((await guard(['candidates.view', 'candidates.move'])).error?.status).toBe(403);
    expect((await guard('candidates.view')).session?.id).toBe('e1');
  });

  it('404 for a job outside an interviewer’s list; fine for one inside it or with no limit', async () => {
    mockSession.mockResolvedValue({ ...base, role: 'INTERVIEWER', jobIds: ['job-a'] });
    expect((await guard('jobs.view', { job: 'job-b' })).error?.status).toBe(404);
    expect((await guard('jobs.view', { job: 'job-a' })).session).toBeTruthy();
    mockSession.mockResolvedValue({ ...base, role: 'RECRUITER', jobIds: null });
    expect((await guard('jobs.view', { job: 'job-b' })).session).toBeTruthy();
  });

  it('with no permission named, any signed-in teammate passes', async () => {
    mockSession.mockResolvedValue({ ...base, role: 'INTERVIEWER', jobIds: ['job-a'] });
    expect((await guard()).session?.memberId).toBe('m1');
  });
});
