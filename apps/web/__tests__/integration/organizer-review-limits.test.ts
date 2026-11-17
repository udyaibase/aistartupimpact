import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const limits = vi.hoisted(() => ({ ok: true, keys: [] as string[] }));
vi.mock('@/lib/rate-limit', () => ({
  apiRateLimit: {}, accountCodeRateLimit: {}, authRateLimit: {},
  checkRateLimit: async (_l: unknown, key: string) => { limits.keys.push(key); return { success: limits.ok, reset: 0 }; },
  rateLimitMessage: () => 'Too many attempts.', retryAfterHeaders: () => ({}), getClientIdentifier: () => 'ip',
}));
vi.mock('@/lib/organizer-auth', () => ({ getOrganizerSession: async () => ({ id: 'org1', email: 'me@host.co', name: 'Me' }) }));
vi.mock('@/lib/organizer-auth/require-permission', () => ({
  requirePermission: async () => ({ id: 'me', email: 'me@host.co', role: 'OWNER', organizerId: 'org1' }),
  canAccessEvent: () => true,
}));
vi.mock('@udyaibase/database', () => ({ prisma: {} }));

import { POST as sendCompanyCode } from '@/app/api/organizer/company-email/send-otp/route';
import { POST as bulk } from '@/app/api/organizer/registrations/bulk/route';
import { POST as refund } from '@/app/api/organizer/registrations/[id]/refund/route';

const post = (body: unknown) => new NextRequest('http://localhost/x', { method: 'POST', body: JSON.stringify(body) });
beforeEach(() => { limits.ok = false; limits.keys = []; });

describe('per-account and per-workspace limits', () => {
  it('#4 company email codes stop after the hourly limit for the account', async () => {
    expect((await sendCompanyCode(post({ companyEmail: 'a@corp.in' }))).status).toBe(429);
    expect(limits.keys).toEqual(['organizer-company-email:org1']);
  });
  it('#6 bulk actions and refunds are limited per workspace', async () => {
    expect((await bulk(post({ action: 'approve', ids: ['r1'] }))).status).toBe(429);
    expect((await refund(post({}), { params: Promise.resolve({ id: 'r1' }) } as any)).status).toBe(429);
    expect(limits.keys).toEqual(['organizer-bulk:org1', 'organizer-refund:org1']);
  });
});
