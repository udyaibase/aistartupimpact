import { describe, expect, it, vi, beforeEach } from 'vitest';

const findUnique = vi.fn();
vi.mock('@udyaibase/database', () => ({ prisma: { user: { findUnique: (...a: unknown[]) => findUnique(...a) }, setting: { findUnique: vi.fn().mockResolvedValue(null) }, $queryRaw: vi.fn().mockResolvedValue([]), $queryRawUnsafe: vi.fn().mockResolvedValue([]) } }));
vi.mock('next-auth', () => ({ getServerSession: vi.fn() }));

describe('a deactivated or deleted admin loses access at the next session refresh', () => {
  beforeEach(() => findUnique.mockReset());

  async function refresh(dbUser: unknown) {
    findUnique.mockResolvedValue(dbUser);
    const { authOptions } = await import('@/lib/auth');
    const jwt = authOptions.callbacks!.jwt! as unknown as (a: unknown) => Promise<Record<string, unknown>>;
    // twoFactorCheckedAt long ago → the refresh is due.
    return jwt({ token: { email: 'a@x.com', id: 'u1', sid: 's1', role: 'SUPER_ADMIN', twoFactorCheckedAt: 1 } });
  }

  it('keeps an active account signed in with its current role', async () => {
    const token = await refresh({ id: 'u1', role: 'EDITOR_IN_CHIEF', slug: 'a', twoFactorEnabled: false, isActive: true });
    expect(token.revoked).toBe(false);
    expect(token.role).toBe('EDITOR_IN_CHIEF');
  });

  it('revokes a deactivated account and removes its role', async () => {
    const token = await refresh({ id: 'u1', role: 'SUPER_ADMIN', slug: 'a', twoFactorEnabled: false, isActive: false });
    expect(token.revoked).toBe(true);
    expect(token.role).toBeUndefined();
  });

  it('revokes a deleted account', async () => {
    const token = await refresh(null);
    expect(token.revoked).toBe(true);
    expect(token.role).toBeUndefined();
  });

  it('refuses a revoked session in API routes and server actions', async () => {
    const { getServerSession } = await import('next-auth');
    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: 'u1', role: 'SUPER_ADMIN' }, revoked: true });
    const { requireApiAuth, requireActionAuth } = await import('@/lib/api-auth');
    expect((await requireApiAuth(['SUPER_ADMIN'])).error?.status).toBe(401);
    expect((await requireActionAuth(['SUPER_ADMIN'])).error).toBe('Unauthorized');
  });
});
