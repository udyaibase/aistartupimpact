import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const ROOT = resolve(__dirname, '../../app/api/founder');

/** Routes reached before anyone is signed in. Each has its own proof (a password, an emailed link, a signed token). */
const OPEN_ROUTES = new Set([
  'auth/forgot-password', 'auth/google', 'auth/google/callback', 'auth/logout', 'auth/resend-verification',
  'auth/reset-password', 'auth/verify', 'auth/verify-2fa',
  'reactivate',         // a deactivated account has no session: it proves itself with its password again
  'team/accept',        // accepting an invite: the emailed link is the proof
  'email-preferences',  // one-click unsubscribe from an email: a signed link
]);
/** hiring/team shares one wrapper built on founderApi; reactivate reads the deactivated account behind the cookie. */
const GUARD = /founderApi\(|workspaceFor\(|founderFromCookies\(/;
/** content/[id]/report is for any signed-in reader, not only founders. */
const READER_ROUTES = new Set(['content/[id]/report']);

function routes(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? routes(p) : name === 'route.ts' ? [p] : [];
  });
}

describe('founder API routes', () => {
  const all = routes(ROOT).map((p) => ({ key: relative(ROOT, p).replace(/\/route\.ts$/, ''), src: readFileSync(p, 'utf8') }));

  it('finds the routes', () => {
    expect(all.length).toBeGreaterThan(45);
  });

  it('every handler outside the sign-in routes goes through the one guard', () => {
    const unguarded: string[] = [];
    for (const r of all) {
      if (OPEN_ROUTES.has(r.key)) continue;
      const check = READER_ROUTES.has(r.key) ? /getUserSession\(/ : GUARD;
      const handlers = r.src.split(/export async function (?=GET|POST|PUT|PATCH|DELETE)/).slice(1);
      handlers.forEach((h) => { if (!check.test(h) ) unguarded.push(`${r.key} ${h.slice(0, h.indexOf('('))}`); });
    }
    expect(unguarded).toEqual([]);
  });

  it('no guarded route reads the session by hand (a thrown check used to become a 500)', () => {
    const byHand = all
      .filter((r) => !OPEN_ROUTES.has(r.key))
      .filter((r) => /getFounderSession\(|requireFounderAuth\(/.test(r.src.replace(/^import .*$/gm, '')))
      .map((r) => r.key);
    expect(byHand).toEqual([]);
  });

  it('routes that had no limit now have one', () => {
    const limited = ['settings', 'notifications', 'hiring', 'hiring/switch', 'startups/[id]/slug', 'tools/[id]/slug', 'startups/[id]/verify', 'tools/[id]/verify', '2fa-setup', 'auth/reset-password', 'auth/verify'];
    const missing = limited.filter((key) => !/tooMany\(|checkRateLimit\(/.test(all.find((r) => r.key === key)!.src));
    expect(missing).toEqual([]);
  });

  it('the open list has no stale entries', () => {
    const keys = new Set(all.map((r) => r.key));
    expect([...OPEN_ROUTES].filter((k) => !keys.has(k))).toEqual([]);
  });

  it('the development-only "verify any email" route is gone', () => {
    expect(existsSync(join(ROOT, 'auth/manual-verify/route.ts'))).toBe(false);
  });

  it('account actions read the request body once', () => {
    for (const key of ['deactivate', 'delete-account']) {
      const src = all.find((r) => r.key === key)!.src;
      expect(src.match(/request\.json\(\)/g)?.length, key).toBe(1);
    }
  });

});
