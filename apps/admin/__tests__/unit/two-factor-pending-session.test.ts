import { describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

vi.mock('@udyaibase/database', () => ({ prisma: {} }));
vi.mock('next-auth/providers/google', () => ({ default: () => ({ id: 'google' }) }));

import { authOptions, sessionOwesTwoFactor } from '@/lib/auth';

/**
 * Many server actions and a few API routes read the session themselves and check only the role. A server action
 * can be posted to a path the middleware does not cover (/login) or lets through (/verify-2fa), so the session
 * itself must be useless until the second sign-in step is done: it carries no role.
 */
const session = async (token: Record<string, unknown>) => {
  const out = await authOptions.callbacks!.session!({ session: { user: { name: 'A', email: 'a@x.in' }, expires: '' }, token: { id: 'u1', role: 'SUPER_ADMIN', slug: 'a', ...token } } as never);
  return out as unknown as { user: { role?: string }; pendingRole?: string; twoFactorVerified: boolean };
};

describe('a session that still owes its 2FA step', () => {
  it('has no role while a code is still to be entered', async () => {
    const s = await session({ twoFactorEnabled: true, twoFactorVerified: false });
    expect(s.user.role).toBeUndefined();
    expect(s.pendingRole).toBe('SUPER_ADMIN');
  });

  it('has no role while 2FA must be set up first', async () => {
    const s = await session({ require2FA: true, twoFactorEnabled: false });
    expect(s.user.role).toBeUndefined();
  });

  it('gets its role once the code is verified, or when 2FA is not in use', async () => {
    expect((await session({ twoFactorEnabled: true, twoFactorVerified: true })).user.role).toBe('SUPER_ADMIN');
    expect((await session({ twoFactorEnabled: false })).user.role).toBe('SUPER_ADMIN');
    expect((await session({ twoFactorEnabled: true, twoFactorVerified: true })).pendingRole).toBeUndefined();
  });

  it('agrees with the rule used everywhere else', () => {
    expect(sessionOwesTwoFactor({ twoFactorEnabled: true, twoFactorVerified: false })).toBe(true);
    expect(sessionOwesTwoFactor({ require2FA: true, twoFactorEnabled: false })).toBe(true);
    expect(sessionOwesTwoFactor({ twoFactorEnabled: true, twoFactorVerified: true, require2FA: true })).toBe(false);
    expect(sessionOwesTwoFactor({})).toBe(false);
  });
});

describe('code that reads the session itself', () => {
  const ROOT = join(__dirname, '..', '..');
  const walk = (dir: string, out: string[] = []): string[] => {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name === '.next' || name === '__tests__') continue;
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p, out);
      else if (/\.tsx?$/.test(name)) out.push(p);
    }
    return out;
  };

  it('always checks the role, which is what a pending session lacks', () => {
    // A direct getServerSession that only tests `session.user` would let a pending session through.
    const weak: string[] = [];
    for (const file of [...walk(join(ROOT, 'app')), ...walk(join(ROOT, 'lib'))]) {
      const rel = relative(ROOT, file);
      if (['lib/api-auth.ts', 'lib/auth.ts', 'lib/audit-log.ts'].includes(rel)) continue;
      // Reads only the name for the greeting, and renders inside the dashboard layout, which applies the 2FA check.
      if (rel === 'app/(dashboard)/dashboard/page.tsx') continue;
      const src = readFileSync(file, 'utf8');
      if (!src.includes('getServerSession(')) continue;
      // Either the file goes on to check a role, or it applies the shared two-factor check.
      if (!/\.role\b|twoFactorBlock\(|requireApiAuth\(|requireActionAuth\(|requirePageRole\(/.test(src)) weak.push(rel);
    }
    expect(weak).toEqual([]);
  });
});
