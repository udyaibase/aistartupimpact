import { describe, it, expect, vi } from 'vitest';
vi.mock('next/headers', () => ({ cookies: vi.fn() }));
vi.mock('@udyaibase/database', () => ({ prisma: {} }));
process.env.EMPLOYER_JWT_SECRET = 'test-employer-secret-min-32-characters-long';

import { issuedBefore, sessionCutoff } from '@/lib/employer-auth';
import { hashResetToken } from '@/lib/employer/reset-token';

describe('signing out other devices', () => {
  it('rejects sessions issued before the cut-off', () => {
    const cutoff = new Date('2026-11-05T10:00:00Z');
    expect(issuedBefore(cutoff.getTime() / 1000 - 1, cutoff)).toBe(true);
    expect(issuedBefore(undefined, cutoff)).toBe(true);
  });

  it('accepts newer sessions, and everything when there’s no cut-off', () => {
    const cutoff = new Date('2026-11-05T10:00:00Z');
    expect(issuedBefore(cutoff.getTime() / 1000 + 1, cutoff)).toBe(false);
    expect(issuedBefore(100, null)).toBe(false);
  });

  it('keeps the session issued straight after a password change', () => {
    const now = Date.parse('2026-11-05T10:00:00.900Z');
    const cutoff = sessionCutoff(now);
    expect(issuedBefore(Math.floor(now / 1000), cutoff)).toBe(false);
  });
});

describe('reset tokens', () => {
  it('stores a hash that differs from the emailed token, and is stable', () => {
    expect(hashResetToken('abc')).not.toBe('abc');
    expect(hashResetToken('abc')).toHaveLength(64);
    expect(hashResetToken('abc')).toBe(hashResetToken('abc'));
  });
});
