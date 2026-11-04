import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockGetFounderSession = vi.fn();
const mockVerifyStartupAccess = vi.fn();
const mockSql = vi.fn();
const mockPrisma = {
  article: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  startup: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
  },
  founderUser: {
    findUnique: vi.fn(),
  },
  startupTeamMember: {
    findMany: vi.fn(),
  },
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

vi.mock('@/lib/founder-auth', () => ({
  getFounderSession: () => mockGetFounderSession(),
  requireFounderAuth: () => {
    const session = mockGetFounderSession();
    if (!session) throw new Error('FOUNDER_AUTH_REQUIRED');
    return session;
  },
}));

vi.mock('@/lib/founder-content-auth', () => ({
  verifyStartupAccess: (...args: any[]) => mockVerifyStartupAccess(...args),
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
}));

function makeRequest(url: string, method = 'GET', body?: any) {
  const init: any = { method };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers = { 'Content-Type': 'application/json' };
  }
  return new NextRequest(new URL(url, 'http://localhost:3000'), init);
}

const FOUNDER_A = { userId: 'founder-a', email: 'a@example.com', name: 'Founder A', onboardingCompleted: true };
const FOUNDER_B = { userId: 'founder-b', email: 'b@example.com', name: 'Founder B', onboardingCompleted: true };

describe('IDOR — Founder A cannot access Founder B resources', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('content IDOR via verifyStartupAccess', () => {
    it('returns 403 when verifyStartupAccess denies access to article', async () => {
      mockGetFounderSession.mockResolvedValue(FOUNDER_B);
      mockPrisma.article.findUnique.mockResolvedValue({
        id: 'article-1',
        startupId: 'startup-a',
        submittedById: 'founder-a',
      });
      mockVerifyStartupAccess.mockResolvedValue(null);

      const { GET } = await import('@/app/api/founder/content/[id]/route');
      const res = await GET(
        makeRequest('/api/founder/content/article-1'),
        { params: Promise.resolve({ id: 'article-1' }) } as any
      );
      expect(res.status).toBe(403);
    });

    it('returns 404 for article that does not exist', async () => {
      mockGetFounderSession.mockResolvedValue(FOUNDER_A);
      mockPrisma.article.findUnique.mockResolvedValue(null);

      const { GET } = await import('@/app/api/founder/content/[id]/route');
      const res = await GET(
        makeRequest('/api/founder/content/nonexistent'),
        { params: Promise.resolve({ id: 'nonexistent' }) } as any
      );
      expect(res.status).toBe(404);
    });
  });

  describe('settings — uses requireFounderAuth, rejects unauthenticated', () => {
    it('rejects without session (requireFounderAuth throws → caught as 500)', async () => {
      mockGetFounderSession.mockResolvedValue(null);
      const { GET } = await import('@/app/api/founder/settings/route');
      const res = await GET(makeRequest('/api/founder/settings'));
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('delete account — uses requireFounderAuth + DELETE method', () => {
    it('rejects without session', async () => {
      mockGetFounderSession.mockResolvedValue(null);
      const { DELETE } = await import('@/app/api/founder/delete-account/route');
      const res = await DELETE(makeRequest('/api/founder/delete-account', 'DELETE', { password: 'test' }));
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });
});
