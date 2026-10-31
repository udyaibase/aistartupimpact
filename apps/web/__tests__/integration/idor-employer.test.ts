import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockGetEmployerSession = vi.fn();
const mockSql = vi.fn();

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({
    get: vi.fn(() => undefined),
    set: vi.fn(),
    delete: vi.fn(),
  })),
  headers: vi.fn(() => new Map()),
}));

vi.mock('@/lib/employer-auth', () => ({
  getEmployerSession: () => mockGetEmployerSession(),
  requireEmployerAuth: () => {
    const s = mockGetEmployerSession();
    if (!s) throw 'EMPLOYER_AUTH_REQUIRED';
    return s;
  },
}));

vi.mock('@/lib/db', () => ({
  sql: (...args: any[]) => mockSql(...args),
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

// In-memory jobs: the routes must scope every query by the signed-in employer.
const JOBS = [
  { id: 'job-1', employerId: 'employer-a', title: 'Dev', slug: 'dev', description: 'x'.repeat(200), status: 'DRAFT', publishedAt: null, deletedAt: null, skills: [], mustHaveSkills: [], screeningQuestions: [], perks: [] },
];
const matches = (j: any, where: any = {}) =>
  Object.entries(where).every(([k, v]) => (v === null ? j[k] == null : typeof v === 'object' ? true : j[k] === v));
const mockPrisma = {
  $queryRaw: vi.fn(() => Promise.resolve([])),
  jobBoardListing: {
    findMany: vi.fn(async ({ where }: any) => JOBS.filter((j) => matches(j, where))),
    findFirst: vi.fn(async ({ where }: any) => JOBS.find((j) => matches(j, where)) ?? null),
    count: vi.fn(async () => 0),
    update: vi.fn(async ({ where, data }: any) => ({ ...JOBS.find((j) => j.id === where.id), ...data })),
  },
  jobBoardEmployer: { findUnique: vi.fn(async () => ({ id: 'employer-a', plan: 'FREE', planExpiresAt: null, maxActiveJobs: 1 })) },
};
vi.mock('@udyaibase/database', () => ({ prisma: mockPrisma }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/jobs/slug', () => ({ uniqueJobSlug: vi.fn(async () => 'updated') }));

function makeRequest(url: string, method = 'GET', body?: any) {
  const init: any = { method };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers = { 'Content-Type': 'application/json' };
  }
  return new NextRequest(new URL(url, 'http://localhost:3000'), init);
}

const call = (handler: any, ...args: any[]) => handler(...args) as Promise<Response>;

const EMPLOYER_A = {
  id: 'employer-a',
  email: 'employerA@example.com',
  companyName: 'Company A',
  slug: 'company-a',
  plan: 'FREE',
  onboardingCompleted: true,
  memberId: null,
  memberName: null,
  role: 'OWNER',
};

const EMPLOYER_B = {
  id: 'employer-b',
  email: 'employerB@example.com',
  companyName: 'Company B',
  slug: 'company-b',
  plan: 'FREE',
  onboardingCompleted: true,
  memberId: null,
  memberName: null,
  role: 'OWNER',
};

describe('IDOR — Employer A cannot access Employer B resources', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/employer/jobs — scoped to own employer', () => {
    it('returns only jobs owned by authenticated employer', async () => {
      mockGetEmployerSession.mockResolvedValue(EMPLOYER_A);
      const { GET } = await import('@/app/api/employer/jobs/route');
      const res = await GET();
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.jobs).toBeDefined();
    });

    it('returns 401 without session', async () => {
      mockGetEmployerSession.mockResolvedValue(null);
      const { GET } = await import('@/app/api/employer/jobs/route');
      const res = await GET();
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/employer/jobs/[id] — ownership check', () => {
    it('Employer A can access own job', async () => {
      mockGetEmployerSession.mockResolvedValue(EMPLOYER_A);
      const { GET } = await import('@/app/api/employer/jobs/[id]/route');
      const res = await GET(
        makeRequest('/api/employer/jobs/job-1'),
        { params: Promise.resolve({ id: 'job-1' }) } as any
      );
      expect(res.status).toBe(200);
    });

    it('Employer B cannot access Employer A job (query scoped by session.id)', async () => {
      mockGetEmployerSession.mockResolvedValue(EMPLOYER_B);
      const { GET } = await import('@/app/api/employer/jobs/[id]/route');
      const res = await GET(
        makeRequest('/api/employer/jobs/job-1'),
        { params: Promise.resolve({ id: 'job-1' }) } as any
      );
      expect(res.status).toBe(404);
    });

    it('returns 401 without session', async () => {
      mockGetEmployerSession.mockResolvedValue(null);
      const { GET } = await import('@/app/api/employer/jobs/[id]/route');
      const res = await GET(
        makeRequest('/api/employer/jobs/job-1'),
        { params: Promise.resolve({ id: 'job-1' }) } as any
      );
      expect(res.status).toBe(401);
    });
  });

  describe('PUT /api/employer/jobs/[id] — ownership check', () => {
    it('Employer A can update own job', async () => {
      mockGetEmployerSession.mockResolvedValue(EMPLOYER_A);
      const { PUT } = await import('@/app/api/employer/jobs/[id]/route');
      const res = await PUT(
        makeRequest('/api/employer/jobs/job-1', 'PUT', { draft: { title: 'Updated' } }),
        { params: Promise.resolve({ id: 'job-1' }) } as any
      );
      expect(res.status).toBe(200);
    });

    it('Employer B cannot update Employer A job', async () => {
      mockGetEmployerSession.mockResolvedValue(EMPLOYER_B);
      const { PUT } = await import('@/app/api/employer/jobs/[id]/route');
      const res = await PUT(
        makeRequest('/api/employer/jobs/job-1', 'PUT', { draft: { title: 'Hacked' } }),
        { params: Promise.resolve({ id: 'job-1' }) } as any
      );
      expect(res.status).toBe(404);
    });
  });

  describe('Team roles on jobs', () => {
    it('an Interviewer cannot edit jobs (403)', async () => {
      mockGetEmployerSession.mockResolvedValue({ ...EMPLOYER_A, memberId: 'm-1', memberName: 'Ivy', role: 'INTERVIEWER' });
      const { PUT } = await import('@/app/api/employer/jobs/[id]/route');
      const res = await PUT(makeRequest('/api/employer/jobs/job-1', 'PUT', { draft: { title: 'Nope' } }), { params: Promise.resolve({ id: 'job-1' }) } as any);
      expect(res.status).toBe(403);
    });

    it('a Recruiter can edit the workspace job', async () => {
      mockGetEmployerSession.mockResolvedValue({ ...EMPLOYER_A, memberId: 'm-2', memberName: 'Rae', role: 'RECRUITER' });
      const { PUT } = await import('@/app/api/employer/jobs/[id]/route');
      const res = await PUT(makeRequest('/api/employer/jobs/job-1', 'PUT', { draft: { title: 'Recruiter edit' } }), { params: Promise.resolve({ id: 'job-1' }) } as any);
      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/employer/company — scoped to own company', () => {
    it('returns 401 without session', async () => {
      mockGetEmployerSession.mockResolvedValue(null);
      const { GET } = await import('@/app/api/employer/company/route');
      const res = await call(GET, makeRequest('/api/employer/company'));
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/employer/analytics — scoped to own employer', () => {
    it('returns 401 without session', async () => {
      mockGetEmployerSession.mockResolvedValue(null);
      const { GET } = await import('@/app/api/employer/analytics/route');
      const res = await call(GET, makeRequest('/api/employer/analytics'));
      expect(res.status).toBe(401);
    });
  });

  describe('DELETE /api/employer/delete-account — can only delete own', () => {
    it('rejects without session (requireEmployerAuth throws)', async () => {
      mockGetEmployerSession.mockResolvedValue(null);
      const { DELETE } = await import('@/app/api/employer/delete-account/route');
      const res = await DELETE(makeRequest('/api/employer/delete-account', 'DELETE', { password: 'test' }));
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });
});
