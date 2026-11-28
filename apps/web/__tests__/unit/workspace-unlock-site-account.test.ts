import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const db = vi.hoisted(() => ({
  unifiedUser: { findUnique: vi.fn(), upsert: vi.fn() },
  webUser: { findUnique: vi.fn() },
}));
const unlock = vi.hoisted(() => vi.fn(async () => ({ status: 'unlocked', message: 'ok', redirectTo: '/organizer/events' })));
vi.mock('@udyaibase/database', () => ({ prisma: db }));
vi.mock('@/lib/unified-auth', () => ({ getUnifiedSession: async () => null }));
vi.mock('@/lib/unified-auth/workspace', () => ({ unlockWorkspace: unlock }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: async () => ({ success: true }), getClientIdentifier: () => 'ip', authRateLimit: {} }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => ({ value: 'tok' }) }) }));
vi.mock('jose', () => ({ jwtVerify: async () => ({ payload: { userId: 'w1', email: 'Asha@Example.in', sessionId: 's1' } }) }));
// The site session behind the cookie: present unless a test says the password was changed or the person signed out.
const session = vi.hoisted(() => ({ exists: true }));
vi.mock('@/lib/db', () => ({ sql: () => Promise.resolve(session.exists ? [{ ok: 1 }] : []) }));

import { POST } from '@/app/api/workspace/unlock/route';

const call = () => POST(new NextRequest('http://localhost/api/workspace/unlock', { method: 'POST', body: JSON.stringify({ workspace: 'organizer' }) }));

beforeEach(() => { vi.clearAllMocks(); session.exists = true; });

describe('opening a workspace from a site (Google or email) account', () => {
  it('creates the missing unified account from the signed-in site account, then unlocks', async () => {
    db.unifiedUser.findUnique.mockResolvedValue(null);
    db.webUser.findUnique.mockResolvedValue({ email: 'asha@example.in', name: 'Asha', avatar: null, isActive: true });
    db.unifiedUser.upsert.mockResolvedValue({ id: 'u1' });
    const res = await call();
    expect(res.status).toBe(200);
    expect(db.unifiedUser.upsert.mock.calls[0][0].create).toMatchObject({ email: 'asha@example.in', emailVerified: true });
    expect(unlock).toHaveBeenCalledWith('u1', 'organizer', expect.anything());
  });
  it('refuses when the site account is gone, deactivated, or for another email', async () => {
    db.unifiedUser.findUnique.mockResolvedValue(null);
    for (const w of [null, { email: 'asha@example.in', name: 'A', avatar: null, isActive: false }, { email: 'other@example.in', name: 'A', avatar: null, isActive: true }]) {
      db.webUser.findUnique.mockResolvedValue(w);
      expect((await call()).status).toBe(401);
    }
    expect(db.unifiedUser.upsert).not.toHaveBeenCalled();
    expect(unlock).not.toHaveBeenCalled();
  });
  it('refuses a cookie whose session was ended by a password change or a sign-out', async () => {
    session.exists = false;
    db.unifiedUser.findUnique.mockResolvedValue({ id: 'u1' });
    expect((await call()).status).toBe(401);
    expect(db.unifiedUser.findUnique).not.toHaveBeenCalled();
    expect(unlock).not.toHaveBeenCalled();
  });
});
