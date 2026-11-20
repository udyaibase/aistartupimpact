import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('jose', () => ({
  jwtVerify: vi.fn(() => Promise.resolve({ payload: {} })),
}));

vi.mock('@neondatabase/serverless', () => ({
  neon: vi.fn(() => vi.fn(() => Promise.resolve([]))),
}));

function makeCSRFRequest(
  pathname: string,
  method: string,
  opts: { origin?: string; referer?: string } = {}
) {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (opts.origin) headers.set('Origin', opts.origin);
  if (opts.referer) headers.set('Referer', opts.referer);
  return new NextRequest(new URL(pathname, 'http://localhost:3000'), {
    method,
    headers,
  });
}

describe('CSRF protection middleware', () => {
  let middleware: (req: NextRequest) => Promise<NextResponse | undefined>;

  beforeEach(async () => {
    vi.resetModules();
    process.env.NEXT_PUBLIC_WEB_URL = 'http://localhost:3000';
    process.env.NEXT_PUBLIC_ADMIN_URL = 'http://localhost:4000';
    process.env.DATABASE_URL = 'postgresql://test@localhost/test';
    process.env.FOUNDER_JWT_SECRET = 'test-secret';
    (process.env as any).NODE_ENV = 'test';
    const mod = await import('@/middleware');
    middleware = mod.middleware;
  });

  describe('blocks requests without Origin or Referer', () => {
    it('blocks POST to API route without Origin or Referer', async () => {
      const req = makeCSRFRequest('/api/founder/content', 'POST');
      const res = await middleware(req);
      expect(res).toBeDefined();
      expect(res!.status).toBe(403);
    });

    it('blocks PUT without Origin or Referer', async () => {
      const req = makeCSRFRequest('/api/user/profile', 'PUT');
      const res = await middleware(req);
      expect(res).toBeDefined();
      expect(res!.status).toBe(403);
    });

    it('blocks DELETE without Origin or Referer', async () => {
      const req = makeCSRFRequest('/api/employer/jobs/123', 'DELETE');
      const res = await middleware(req);
      expect(res).toBeDefined();
      expect(res!.status).toBe(403);
    });

    it('blocks PATCH without Origin or Referer', async () => {
      const req = makeCSRFRequest('/api/organizer/events', 'PATCH');
      const res = await middleware(req);
      expect(res).toBeDefined();
      expect(res!.status).toBe(403);
    });
  });

  describe('blocks requests with invalid Origin', () => {
    it('blocks POST with evil Origin', async () => {
      const req = makeCSRFRequest('/api/founder/content', 'POST', {
        origin: 'https://evil.com',
      });
      const res = await middleware(req);
      expect(res).toBeDefined();
      expect(res!.status).toBe(403);
    });

    it('blocks POST with subdomain Origin', async () => {
      const req = makeCSRFRequest('/api/founder/content', 'POST', {
        origin: 'http://evil.localhost:3000',
      });
      const res = await middleware(req);
      expect(res).toBeDefined();
      expect(res!.status).toBe(403);
    });
  });

  describe('blocks requests with invalid Referer', () => {
    it('blocks POST with a Referer that is not a URL (it used to crash the check)', async () => {
      const req = makeCSRFRequest('/api/employer/auth/logout', 'POST', { referer: 'not a url' });
      const res = await middleware(req);
      expect(res!.status).toBe(403);
    });

    it('blocks POST with evil Referer (no Origin)', async () => {
      const req = makeCSRFRequest('/api/founder/content', 'POST', {
        referer: 'https://evil.com/page',
      });
      const res = await middleware(req);
      expect(res).toBeDefined();
      expect(res!.status).toBe(403);
    });
  });

  describe('allows valid requests', () => {
    it('allows POST with valid Origin', async () => {
      const req = makeCSRFRequest('/api/founder/content', 'POST', {
        origin: 'http://localhost:3000',
      });
      const res = await middleware(req);
      if (res) {
        expect(res.status).not.toBe(403);
      }
    });

    it('allows POST with valid Referer (no Origin)', async () => {
      const req = makeCSRFRequest('/api/founder/content', 'POST', {
        referer: 'http://localhost:3000/dashboard',
      });
      const res = await middleware(req);
      if (res) {
        expect(res.status).not.toBe(403);
      }
    });

    it('allows GET requests without Origin/Referer (not state-changing)', async () => {
      const req = makeCSRFRequest('/api/founder/settings', 'GET');
      const res = await middleware(req);
      if (res) {
        expect(res.status).not.toBe(403);
      }
    });
  });

  describe('allows cron and webhook routes without Origin', () => {
    it('allows POST to webhook without Origin', async () => {
      const req = makeCSRFRequest('/api/webhook/payment', 'POST');
      const res = await middleware(req);
      if (res) {
        expect(res.status).not.toBe(403);
      }
    });

    it('allows POST to daily-digest without Origin', async () => {
      const req = makeCSRFRequest('/api/admin/daily-digest', 'POST');
      const res = await middleware(req);
      if (res) {
        expect(res.status).not.toBe(403);
      }
    });

    it('allows POST to data-retention without Origin', async () => {
      const req = makeCSRFRequest('/api/admin/data-retention', 'POST');
      const res = await middleware(req);
      if (res) {
        expect(res.status).not.toBe(403);
      }
    });
  });
});
