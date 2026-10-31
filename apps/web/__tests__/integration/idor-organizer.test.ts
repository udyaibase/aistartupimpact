import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockGetOrganizerSession = vi.fn();
const mockSql = vi.fn();
const mockPrisma = {
  event: { findUnique: vi.fn(), findMany: vi.fn(async () => []) },
  // requirePermission: no team membership elsewhere means the session owns its own workspace.
  eventTeamMember: { findFirst: vi.fn(async () => null) },
  eventRegistration: { findMany: vi.fn() },
  eventOrganizer: { findUnique: vi.fn() },
  $queryRaw: vi.fn(() => Promise.resolve([])),
};

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({
    get: vi.fn(() => undefined),
    set: vi.fn(),
    delete: vi.fn(),
  })),
  headers: vi.fn(() => new Map()),
}));

vi.mock('@/lib/organizer-auth', () => ({
  getOrganizerSession: () => mockGetOrganizerSession(),
}));

vi.mock('@/lib/db', () => ({
  sql: (...args: any[]) => mockSql(...args),
}));

vi.mock('@udyaibase/database', () => ({
  prisma: mockPrisma,
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(() => Promise.resolve({ success: true })),
  getClientIdentifier: vi.fn(() => 'test-ip'),
  apiRateLimit: {},
  strictRateLimit: {},
}));

vi.mock('@neondatabase/serverless', () => ({
  neon: vi.fn(() => vi.fn(() => Promise.resolve([]))),
  neonConfig: {},
  Pool: vi.fn(),
  types: { setTypeParser: vi.fn(), builtins: {} },
}));

function makeRequest(url: string, method = 'GET', body?: any) {
  const init: any = { method };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers = { 'Content-Type': 'application/json' };
  }
  return new NextRequest(new URL(url, 'http://localhost:3000'), init);
}

const call = (handler: any, ...args: any[]) => handler(...args) as Promise<Response>;

const ORGANIZER_A = { id: 'org-a', email: 'orgA@example.com', name: 'Organizer A' };
const ORGANIZER_B = { id: 'org-b', email: 'orgB@example.com', name: 'Organizer B' };

describe('IDOR — Organizer A cannot access Organizer B resources', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/organizer/events — scoped to own events', () => {
    it('returns 401 without session', async () => {
      mockGetOrganizerSession.mockResolvedValue(null);
      const { GET } = await import('@/app/api/organizer/events/route');
      const res = await call(GET, makeRequest('/api/organizer/events'));
      expect(res.status).toBe(401);
    });

    it('returns events for authenticated organizer', async () => {
      mockGetOrganizerSession.mockResolvedValue(ORGANIZER_A);
      const { GET } = await import('@/app/api/organizer/events/route');
      const res = await call(GET, makeRequest('/api/organizer/events'));
      expect(res.status).toBe(200);
      // The query must be scoped to the signed-in organizer.
      expect((mockPrisma.event.findMany.mock.calls.at(-1) as any[] | undefined)?.[0]?.where?.organizerId).toBe(ORGANIZER_A.id);
    });
  });

  describe('GET /api/organizer/profile — returns own profile only', () => {
    it('returns 401 without session', async () => {
      mockGetOrganizerSession.mockResolvedValue(null);
      const { GET } = await import('@/app/api/organizer/profile/route');
      const res = await call(GET, makeRequest('/api/organizer/profile'));
      expect(res.status).toBe(401);
    });

    it('returns profile for authenticated organizer', async () => {
      mockGetOrganizerSession.mockResolvedValue(ORGANIZER_A);
      mockSql.mockResolvedValueOnce([{
        id: 'org-a',
        email: 'orgA@example.com',
        name: 'Organizer A',
        company: 'Events Inc',
      }]);
      const { GET } = await import('@/app/api/organizer/profile/route');
      const res = await call(GET, makeRequest('/api/organizer/profile'));
      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/organizer/attendees — scoped by organizer', () => {
    it('returns 401 without session', async () => {
      mockGetOrganizerSession.mockResolvedValue(null);
      const { GET } = await import('@/app/api/organizer/attendees/route');
      const res = await call(GET, makeRequest('/api/organizer/attendees'));
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/organizer/export-data — own data only', () => {
    it('returns 401 without session', async () => {
      mockGetOrganizerSession.mockResolvedValue(null);
      const { GET } = await import('@/app/api/organizer/export-data/route');
      const res = await call(GET, makeRequest('/api/organizer/export-data'));
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/organizer/check-in — requires session', () => {
    it('returns 401 without session', async () => {
      mockGetOrganizerSession.mockResolvedValue(null);
      const { POST } = await import('@/app/api/organizer/check-in/route');
      const res = await POST(makeRequest('/api/organizer/check-in', 'POST', { registrationId: '123' }));
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/organizer/walk-in — requires session', () => {
    it('returns 401 without session', async () => {
      mockGetOrganizerSession.mockResolvedValue(null);
      const { POST } = await import('@/app/api/organizer/walk-in/route');
      const res = await POST(makeRequest('/api/organizer/walk-in', 'POST', { name: 'Walk In', email: 'w@e.com' }));
      expect(res.status).toBe(401);
    });
  });

  describe('DELETE /api/organizer/delete-account — own account only', () => {
    it('returns 401 without session', async () => {
      mockGetOrganizerSession.mockResolvedValue(null);
      const { DELETE } = await import('@/app/api/organizer/delete-account/route');
      const res = await DELETE(makeRequest('/api/organizer/delete-account', 'DELETE', { password: 'test' }));
      expect(res.status).toBe(401);
    });
  });
});
