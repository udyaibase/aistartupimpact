import { describe, it, expect, vi } from 'vitest';
vi.mock('@udyaibase/database', () => ({ prisma: {}, Prisma: {} }));
vi.mock('@/lib/user-session', () => ({ getUserSession: async () => null }));
import { isJobSeekerPath } from '@/lib/jobs/candidate-account';

describe('isJobSeekerPath (skips onboarding for sign-ins from job pages)', () => {
  it('matches job pages, the applications list and status pages', () => {
    for (const p of ['/jobs', '/jobs/data-engineer/apply', '/jobs?q=ml', '/my-applications', '/applications/abc']) expect(isJobSeekerPath(p)).toBe(true);
  });
  it('does not match other pages or look-alikes', () => {
    for (const p of ['/', '/tools', '/jobsearch', '/founder/jobs', '/my-applicationsx']) expect(isJobSeekerPath(p)).toBe(false);
  });
});
