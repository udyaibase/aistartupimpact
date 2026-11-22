import { describe, it, expect } from 'vitest';
import { createHash } from 'crypto';
import { THEME_SCRIPT, GA_CONSENT_SCRIPT, INLINE_SCRIPT_HASHES, buildPortalCsp, isPortalPath, newNonce } from '@/lib/csp';
import * as admin from '../../../admin/lib/csp';

const hash = (s: string) => `'sha256-${createHash('sha256').update(s, 'utf8').digest('base64')}'`;

describe('portal CSP (signed-in areas)', () => {
  it('allows the root layout inline scripts by their exact hash (change a script, update its hash)', () => {
    expect(INLINE_SCRIPT_HASHES).toEqual([hash(THEME_SCRIPT), hash(GA_CONSENT_SCRIPT)]);
  });

  it('allows the admin layout theme script by its exact hash', () => {
    expect(admin.THEME_SCRIPT_HASH).toBe(hash(admin.THEME_SCRIPT));
  });

  it('uses a nonce and strict-dynamic in production, with no unsafe-eval', () => {
    const csp = buildPortalCsp('abc123', false);
    const scriptSrc = csp.split('; ').find((d) => d.startsWith('script-src'))!;
    expect(scriptSrc).toContain("'nonce-abc123'");
    expect(scriptSrc).toContain("'strict-dynamic'");
    expect(scriptSrc).not.toContain('unsafe-eval');
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    const adminScript = admin.buildAdminCsp('xyz', false).split('; ').find((d) => d.startsWith('script-src'))!;
    expect(adminScript).toContain("'nonce-xyz'");
    expect(adminScript).not.toContain('unsafe-eval');
  });

  it('nonces are fresh each time', () => {
    const a = newNonce(), b = newNonce();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(22);
  });

  it('covers the three portals but not public pages that share a prefix', () => {
    for (const p of ['/founder', '/founder/dashboard', '/employer', '/employer/login', '/organizer/check-in']) expect(isPortalPath(p)).toBe(true);
    for (const p of ['/founder-team', '/founders', '/employers', '/organizers', '/events', '/']) expect(isPortalPath(p)).toBe(false);
  });
});
