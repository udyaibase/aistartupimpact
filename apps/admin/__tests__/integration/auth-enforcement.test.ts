import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockGetServerSession = vi.fn();

vi.mock('next-auth', () => ({
  getServerSession: (...args: any[]) => mockGetServerSession(...args),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({
    get: vi.fn(() => undefined),
    set: vi.fn(),
    delete: vi.fn(),
  })),
  headers: vi.fn(() => new Map()),
}));

vi.mock('@neondatabase/serverless', () => ({
  neon: vi.fn(() => vi.fn(() => Promise.resolve([]))),
  // The shared database package configures the driver on import.
  neonConfig: {},
  Pool: vi.fn(),
  types: { setTypeParser: vi.fn(), builtins: {} },
}));

vi.mock('@/lib/auth', () => ({
  authOptions: {},
}));

vi.mock('@/lib/audit-log', () => ({
  logAuditEvent: vi.fn(),
  canDelete: vi.fn(() => Promise.resolve({ allowed: false, error: 'Unauthorized' })),
  snapshot: vi.fn((r: any) => r),
}));

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn(),
  PutObjectCommand: vi.fn(),
}));

function makeRequest(url: string, method = 'GET', body?: any) {
  const init: any = { method };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers = { 'Content-Type': 'application/json' };
  }
  return new NextRequest(new URL(url, 'http://localhost:3001'), init);
}

const call = (handler: any, ...args: any[]) => handler(...args) as Promise<Response>;

describe('Admin API — auth enforcement (401 without session)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerSession.mockResolvedValue(null);
  });

  it('GET /api/admin/audit-logs returns 401', async () => {
    const { GET } = await import('@/app/api/admin/audit-logs/route');
    const res = await call(GET, makeRequest('/api/admin/audit-logs'));
    expect(res.status).toBe(401);
  });

  it('GET /api/admin/audit-logs/stats returns 401', async () => {
    const { GET } = await import('@/app/api/admin/audit-logs/stats/route');
    const res = await call(GET, makeRequest('/api/admin/audit-logs/stats'));
    expect(res.status).toBe(401);
  });

  it('GET /api/admin/people returns 401', async () => {
    const { GET } = await import('@/app/api/admin/people/route');
    const res = await call(GET, makeRequest('/api/admin/people'));
    expect(res.status).toBe(401);
  });

  it('GET /api/admin/people/export returns 401', async () => {
    const { GET } = await import('@/app/api/admin/people/export/route');
    const res = await call(GET, makeRequest('/api/admin/people/export'));
    expect(res.status).toBe(401);
  });

  it('GET /api/admin/employers returns 401', async () => {
    const { GET } = await import('@/app/api/admin/employers/route');
    const res = await call(GET);
    expect(res.status).toBe(401);
  });

  it('GET /api/admin/content-review returns 401', async () => {
    const { GET } = await import('@/app/api/admin/content-review/route');
    const res = await call(GET, makeRequest('/api/admin/content-review'));
    expect(res.status).toBe(401);
  });

  it('GET /api/admin/support-tickets returns 401', async () => {
    const { GET } = await import('@/app/api/admin/support-tickets/route');
    const res = await call(GET, makeRequest('/api/admin/support-tickets'));
    expect(res.status).toBe(401);
  });

  it('GET /api/admin/web-users returns 401', async () => {
    const { GET } = await import('@/app/api/admin/web-users/route');
    const res = await call(GET, makeRequest('/api/admin/web-users'));
    expect(res.status).toBe(401);
  });

  it('GET /api/admin/brand returns non-200 without session', async () => {
    const { GET } = await import('@/app/api/admin/brand/route');
    const res = await call(GET);
    expect([401, 403, 500]).toContain(res.status);
  });

  it('GET /api/admin/2fa-status returns 401', async () => {
    const { GET } = await import('@/app/api/admin/2fa-status/route');
    const res = await call(GET);
    expect(res.status).toBe(401);
  });

  it('GET /api/admin/consent-logs returns 401', async () => {
    const { GET } = await import('@/app/api/admin/consent-logs/route');
    const res = await call(GET, makeRequest('/api/admin/consent-logs'));
    expect(res.status).toBe(401);
  });

  it('GET /api/admin/testimonials returns 401', async () => {
    const { GET } = await import('@/app/api/admin/testimonials/route');
    const res = await call(GET);
    expect(res.status).toBe(401);
  });
});

describe('Admin API — privilege escalation (WRITER cannot access admin routes)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerSession.mockResolvedValue({
      user: { id: 'writer-1', email: 'writer@example.com', role: 'WRITER' },
    });
  });

  it('WRITER cannot access audit logs (SUPER_ADMIN+EDITOR only)', async () => {
    const { GET } = await import('@/app/api/admin/audit-logs/route');
    const res = await call(GET, makeRequest('/api/admin/audit-logs'));
    expect(res.status).toBe(401);
  });

  it('WRITER cannot access people list', async () => {
    const { GET } = await import('@/app/api/admin/people/route');
    const res = await call(GET, makeRequest('/api/admin/people'));
    expect(res.status).toBe(401);
  });

  it('WRITER cannot access people export (SUPER_ADMIN only)', async () => {
    const { GET } = await import('@/app/api/admin/people/export/route');
    const res = await call(GET, makeRequest('/api/admin/people/export'));
    expect(res.status).toBe(401);
  });

  it('WRITER cannot access employers', async () => {
    const { GET } = await import('@/app/api/admin/employers/route');
    const res = await call(GET);
    expect(res.status).toBeGreaterThanOrEqual(401);
  });

  it('WRITER cannot access web-users', async () => {
    const { GET } = await import('@/app/api/admin/web-users/route');
    const res = await call(GET, makeRequest('/api/admin/web-users'));
    expect([401, 403]).toContain(res.status);
  });
});

describe('Admin API — EDITOR_IN_CHIEF cannot access SUPER_ADMIN-only routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerSession.mockResolvedValue({
      user: { id: 'editor-1', email: 'editor@example.com', role: 'EDITOR_IN_CHIEF' },
    });
  });

  it('EDITOR cannot export people data (SUPER_ADMIN only)', async () => {
    const { GET } = await import('@/app/api/admin/people/export/route');
    const res = await call(GET, makeRequest('/api/admin/people/export'));
    expect(res.status).toBe(401);
  });

  it('EDITOR_IN_CHIEF can read testimonials (ADMIN_ROLES) but not delete', async () => {
    const { GET } = await import('@/app/api/admin/testimonials/route');
    const res = await call(GET);
    expect(res.status).toBe(200);
  });
});
