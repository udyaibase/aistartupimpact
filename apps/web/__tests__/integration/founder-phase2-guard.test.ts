import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockSession = vi.fn();
vi.mock('@/lib/founder-auth', () => ({ getFounderSession: () => mockSession() }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, set: vi.fn(), delete: vi.fn() }), headers: async () => new Map() }));

const limit = vi.hoisted(() => ({ check: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: (...a: unknown[]) => limit.check(...a),
  getClientIdentifier: () => 'ip',
  rateLimitMessage: () => 'Too many attempts. Please try again in 1 minute.',
  retryAfterHeaders: () => ({ 'Retry-After': '60' }),
  strictRateLimit: null, apiRateLimit: null, founderWriteRateLimit: null, dnsCheckRateLimit: null, emailLinkRateLimit: null, contentWriteRateLimit: null,
}));

const sqlCalls = vi.hoisted(() => [] as { text: string; values: unknown[] }[]);
vi.mock('@/lib/db', () => ({
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => {
    sqlCalls.push({ text: strings.join('?'), values });
    return Promise.resolve(strings.join('').includes('COUNT(*)') ? [{ count: '0' }] : []);
  },
}));

const db = vi.hoisted(() => ({
  startup: { findFirst: vi.fn() },
  founderTeamMember: { findFirst: vi.fn() },
  founderMilestone: { findMany: vi.fn(), create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  founderUser: { findUnique: vi.fn() },
  contentActivityLog: { create: vi.fn() },
}));
vi.mock('@udyaibase/database', () => ({ prisma: db }));
vi.mock('@/lib/founder/activity', () => ({ logFounderActivity: vi.fn() }));
vi.mock('@/lib/workspace-activity', () => ({ logEmployerActivity: vi.fn(), employerActor: vi.fn() }));
vi.mock('@/lib/email/send', () => ({ sendEmailFireAndForget: vi.fn() }));
vi.mock('@/lib/support/tickets', () => ({ listTickets: vi.fn(), createTicket: vi.fn(), getTicketDetail: vi.fn(), addMessage: vi.fn() }));

import { founderApi, tooMany } from '@/lib/founder/api-session';
import { verifyStartupAccess } from '@/lib/founder-content-auth';
import * as notifications from '@/app/api/founder/notifications/route';
import * as settings from '@/app/api/founder/settings/route';
import * as exportData from '@/app/api/founder/export-data/route';
import * as changeEmail from '@/app/api/founder/change-email/route';
import * as milestones from '@/app/api/founder/milestones/route';

const SESSION = { userId: 'f1', email: 'meera@startup.test', name: 'Meera', onboardingCompleted: true };
const req = (url: string, method = 'GET', body?: unknown) =>
  new NextRequest(`http://localhost${url}`, { method, ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}) });

describe('founder API: one guard, right answers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sqlCalls.length = 0;
    mockSession.mockResolvedValue(SESSION);
    limit.check.mockResolvedValue({ success: true, reset: 0 });
  });

  describe('founderApi', () => {
    it('gives the session when signed in', async () => {
      expect(await founderApi()).toEqual({ session: SESSION });
    });

    it('gives a ready 401 when signed out', async () => {
      mockSession.mockResolvedValue(null);
      const guard = await founderApi();
      expect(guard.session).toBeUndefined();
      expect(guard.error!.status).toBe(401);
      expect(await guard.error!.json()).toEqual({ success: false, error: 'Please sign in again.' });
    });
  });

  describe('signed out: 401, where these used to answer 500', () => {
    beforeEach(() => mockSession.mockResolvedValue(null));
    const cases: [string, () => Promise<Response>][] = [
      ['notifications GET', () => notifications.GET(req('/api/founder/notifications'))],
      ['notifications PATCH', () => notifications.PATCH(req('/api/founder/notifications', 'PATCH', { markAllRead: true }))],
      ['notifications DELETE', () => notifications.DELETE(req('/api/founder/notifications?deleteAll=true', 'DELETE'))],
      ['settings GET', () => settings.GET(req('/api/founder/settings'))],
      ['settings PATCH', () => settings.PATCH(req('/api/founder/settings', 'PATCH', { publicProfile: false }))],
      ['export-data GET', () => exportData.GET(req('/api/founder/export-data'))],
      ['change-email POST', () => changeEmail.POST(req('/api/founder/change-email', 'POST', { newEmail: 'a@b.test', password: 'x' }))],
      ['milestones POST', () => milestones.POST(req('/api/founder/milestones', 'POST', {}))],
    ];
    it.each(cases)('%s', async (_name, call) => {
      expect((await call()).status).toBe(401);
      expect(sqlCalls).toEqual([]);
    });
  });

  describe('bad input', () => {
    const limitUsed = () => sqlCalls.find((c) => c.text.includes('LIMIT'))!.values.at(-1);

    it.each([['abc', 50], ['', 50], ['0', 1], ['-5', 1], ['99999999', 100], ['20', 20]])('notifications?limit=%s uses %i', async (given, used) => {
      const res = await notifications.GET(req(`/api/founder/notifications?limit=${given}`));
      expect(res.status).toBe(200);
      expect(limitUsed()).toBe(used);
    });

    it('a milestone with an invalid date is refused with a clear message, not a server error', async () => {
      const res = await milestones.POST(req('/api/founder/milestones', 'POST', { startupId: 's1', type: 'FUNDING', title: 'Raised a seed round', date: 'not-a-date' }));
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: 'Enter a valid date' });
      expect(db.founderMilestone.create).not.toHaveBeenCalled();
    });

    it('a startup nobody owns gives no access (it used to crash the lookup)', async () => {
      db.startup.findFirst.mockResolvedValue({ id: 's1', ownerId: null, isVerified: false });
      expect(await verifyStartupAccess('s1')).toBeNull();
      expect(db.founderTeamMember.findFirst).not.toHaveBeenCalled();
    });

    it('a deleted startup gives no access', async () => {
      db.startup.findFirst.mockResolvedValue(null);
      expect(await verifyStartupAccess('s1')).toBeNull();
      expect(db.startup.findFirst.mock.calls[0][0].where).toEqual({ id: 's1', deletedAt: null });
    });

    it('the owner still has access', async () => {
      db.startup.findFirst.mockResolvedValue({ id: 's1', ownerId: 'f1', isVerified: true });
      expect(await verifyStartupAccess('s1')).toMatchObject({ role: 'OWNER', startupVerified: true });
    });
  });

  describe('limits', () => {
    it('tooMany passes while under the limit', async () => {
      expect(await tooMany(null, 'k')).toBeNull();
    });

    it('tooMany answers 429 with a retry time once over it', async () => {
      limit.check.mockResolvedValue({ success: false, reset: Date.now() + 60_000 });
      const res = await tooMany(null, 'k');
      expect(res!.status).toBe(429);
      expect(res!.headers.get('Retry-After')).toBe('60');
    });

    it('settings changes are limited per founder', async () => {
      limit.check.mockResolvedValue({ success: false, reset: 0 });
      const res = await settings.PATCH(req('/api/founder/settings', 'PATCH', { publicProfile: false }));
      expect(res.status).toBe(429);
      expect(limit.check.mock.calls[0][1]).toBe('settings:f1');
      expect(sqlCalls).toEqual([]);
    });
  });
});
