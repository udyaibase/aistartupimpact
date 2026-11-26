import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockGetFounderSession = vi.fn();
const mockGetEmployerSession = vi.fn();
const mockGetOrganizerSession = vi.fn();
const mockCookiesGet = vi.fn();
const mockJwtVerify = vi.fn();
const mockSql = vi.fn();

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({
    get: (name: string) => mockCookiesGet(name),
    set: vi.fn(),
    delete: vi.fn(),
  })),
  headers: vi.fn(() => new Map()),
}));

vi.mock('jose', () => ({
  jwtVerify: (...args: any[]) => mockJwtVerify(...args),
  SignJWT: vi.fn().mockReturnValue({
    setProtectedHeader: vi.fn().mockReturnThis(),
    setExpirationTime: vi.fn().mockReturnThis(),
    setIssuedAt: vi.fn().mockReturnThis(),
    sign: vi.fn(() => Promise.resolve('mock-token')),
  }),
}));

vi.mock('@/lib/founder-auth', () => ({
  getFounderSession: () => mockGetFounderSession(),
  requireFounderAuth: () => {
    const s = mockGetFounderSession();
    if (!s) throw new Error('FOUNDER_AUTH_REQUIRED');
    return s;
  },
}));

vi.mock('@/lib/employer-auth', () => ({
  getEmployerSession: () => mockGetEmployerSession(),
  requireEmployerAuth: () => {
    const s = mockGetEmployerSession();
    if (!s) throw 'EMPLOYER_AUTH_REQUIRED';
    return s;
  },
}));

vi.mock('@/lib/organizer-auth', () => ({
  getOrganizerSession: () => mockGetOrganizerSession(),
}));

vi.mock('@/lib/user-session', () => ({
  getUserSession: vi.fn(() => Promise.resolve(null)),
  isAuthenticated: vi.fn(() => Promise.resolve(false)),
  // The shared cookie check: the ids always come from the verified token, never from the request body.
  verifyUserToken: vi.fn(async (token?: string) => {
    if (!token) return null;
    try {
      const { payload } = await mockJwtVerify(token);
      return payload?.userId ? { userId: payload.userId, email: payload.email ?? '', sessionId: payload.sessionId ?? null } : null;
    } catch { return null; }
  }),
  getUserIds: vi.fn(() => Promise.resolve(null)),
}));

vi.mock('@/lib/db', () => ({
  sql: (...args: any[]) => mockSql(...args),
}));

vi.mock('@udyaibase/database', () => ({
  prisma: { $queryRaw: vi.fn(() => Promise.resolve([])) },
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(() => Promise.resolve({ success: true })),
  getClientIdentifier: vi.fn(() => 'test-ip'),
  apiRateLimit: {},
  strictRateLimit: {},
}));

vi.mock('@neondatabase/serverless', () => ({
  neon: vi.fn(() => vi.fn(() => Promise.resolve([]))),
}));

vi.mock('@/lib/founder-content-auth', () => ({
  verifyStartupAccess: vi.fn(() => Promise.resolve(null)),
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

describe('privilege escalation — cross-role access denied', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.USER_JWT_SECRET = 'test-secret';
    // Default: all sessions null (no auth)
    mockGetFounderSession.mockResolvedValue(null);
    mockGetEmployerSession.mockResolvedValue(null);
    mockGetOrganizerSession.mockResolvedValue(null);
    mockCookiesGet.mockReturnValue(undefined);
  });

  describe('user token cannot access founder APIs', () => {
    it('user gets rejected on founder settings (requireFounderAuth)', async () => {
      mockGetFounderSession.mockResolvedValue(null);
      const { GET } = await import('@/app/api/founder/settings/route');
      const res = await call(GET, makeRequest('/api/founder/settings'));
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('user gets 401 on founder content (getFounderSession + null check)', async () => {
      mockGetFounderSession.mockResolvedValue(null);
      const { POST } = await import('@/app/api/founder/content/route');
      const res = await call(POST, makeRequest('/api/founder/content', 'POST', { title: 'test' }));
      expect(res.status).toBe(401);
    });

    it('user gets rejected on founder export-data (requireFounderAuth)', async () => {
      mockGetFounderSession.mockResolvedValue(null);
      const { GET } = await import('@/app/api/founder/export-data/route');
      const res = await call(GET, makeRequest('/api/founder/export-data'));
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('user token cannot access employer APIs', () => {
    it('user gets 401 on employer jobs', async () => {
      mockGetEmployerSession.mockResolvedValue(null);
      const { GET } = await import('@/app/api/employer/jobs/route');
      const res = await GET();
      expect(res.status).toBe(401);
    });

    it('user gets 401 on employer company', async () => {
      mockGetEmployerSession.mockResolvedValue(null);
      const { GET } = await import('@/app/api/employer/company/route');
      const res = await call(GET, makeRequest('/api/employer/company'));
      expect(res.status).toBe(401);
    });

    it('user gets 401 on employer analytics', async () => {
      mockGetEmployerSession.mockResolvedValue(null);
      const { GET } = await import('@/app/api/employer/analytics/route');
      const res = await call(GET, makeRequest('/api/employer/analytics'));
      expect(res.status).toBe(401);
    });
  });

  describe('user token cannot access organizer APIs', () => {
    it('user gets 401 on organizer events', async () => {
      mockGetOrganizerSession.mockResolvedValue(null);
      const { GET } = await import('@/app/api/organizer/events/route');
      const res = await call(GET, makeRequest('/api/organizer/events'));
      expect(res.status).toBe(401);
    });

    it('user gets 401 on organizer profile', async () => {
      mockGetOrganizerSession.mockResolvedValue(null);
      const { GET } = await import('@/app/api/organizer/profile/route');
      const res = await call(GET, makeRequest('/api/organizer/profile'));
      expect(res.status).toBe(401);
    });

    it('user gets 401 on organizer attendees', async () => {
      mockGetOrganizerSession.mockResolvedValue(null);
      const { GET } = await import('@/app/api/organizer/attendees/route');
      const res = await call(GET, makeRequest('/api/organizer/attendees'));
      expect(res.status).toBe(401);
    });
  });

  describe('founder token cannot access employer APIs', () => {
    it('founder gets 401 on employer jobs', async () => {
      mockGetFounderSession.mockResolvedValue({
        userId: 'founder-1', email: 'f@example.com', name: 'Founder', onboardingCompleted: true,
      });
      mockGetEmployerSession.mockResolvedValue(null);
      const { GET } = await import('@/app/api/employer/jobs/route');
      const res = await GET();
      expect(res.status).toBe(401);
    });
  });

  describe('employer token cannot access founder APIs', () => {
    it('employer gets rejected on founder settings', async () => {
      mockGetEmployerSession.mockResolvedValue({
        id: 'emp-1', email: 'e@example.com', companyName: 'Corp', slug: 'corp', plan: 'FREE', onboardingCompleted: true,
      });
      mockGetFounderSession.mockResolvedValue(null);
      const { GET } = await import('@/app/api/founder/settings/route');
      const res = await call(GET, makeRequest('/api/founder/settings'));
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('employer token cannot access organizer APIs', () => {
    it('employer gets 401 on organizer events', async () => {
      mockGetEmployerSession.mockResolvedValue({
        id: 'emp-1', email: 'e@example.com', companyName: 'Corp', slug: 'corp', plan: 'FREE', onboardingCompleted: true,
      });
      mockGetOrganizerSession.mockResolvedValue(null);
      const { GET } = await import('@/app/api/organizer/events/route');
      const res = await call(GET, makeRequest('/api/organizer/events'));
      expect(res.status).toBe(401);
    });
  });

  describe('organizer token cannot access founder APIs', () => {
    it('organizer gets rejected on founder settings', async () => {
      mockGetOrganizerSession.mockResolvedValue({
        id: 'org-1', email: 'o@example.com', name: 'Organizer',
      });
      mockGetFounderSession.mockResolvedValue(null);
      const { GET } = await import('@/app/api/founder/settings/route');
      const res = await call(GET, makeRequest('/api/founder/settings'));
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('request body manipulation — backend ignores client-supplied auth fields', () => {
    it('sending role:admin in body does not grant admin access to founder API', async () => {
      mockGetFounderSession.mockResolvedValue(null);
      const { POST } = await import('@/app/api/founder/content/route');
      const res = await POST(
        makeRequest('/api/founder/content', 'POST', {
          title: 'test',
          role: 'admin',
          isAdmin: true,
        })
      );
      expect(res.status).toBe(401);
    });

    it('sending userId of another user in body does not change profile update target', async () => {
      mockCookiesGet.mockImplementation((name: string) => {
        if (name === 'user-token') return { value: 'valid-token' };
        return undefined;
      });
      mockJwtVerify.mockResolvedValue({
        payload: { userId: 'user-a', email: 'a@example.com' },
      });
      mockSql.mockResolvedValue([{ id: 'user-a', email: 'a@example.com', name: 'Hacker' }]);
      const { PUT } = await import('@/app/api/user/profile/route');
      const res = await PUT(
        makeRequest('/api/user/profile', 'PUT', {
          name: 'Hacker',
          userId: 'user-b',
          isAdmin: true,
          role: 'admin',
          subscription: 'premium',
        })
      );
      expect(res.status).toBe(200);
    });

    it('sending subscription:premium in employer body does not upgrade plan', async () => {
      mockGetEmployerSession.mockResolvedValue(null);
      const { POST } = await import('@/app/api/employer/jobs/route');
      const res = await POST(
        makeRequest('/api/employer/jobs', 'POST', {
          title: 'Test Job',
          subscription: 'premium',
          plan: 'ENTERPRISE',
        })
      );
      expect(res.status).toBe(401);
    });
  });
});
