import { describe, it, expect, vi, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';

// Every database or email call would be a failure here: the bot check must stop the request first.
const tripwire = new Proxy({}, { get: () => { throw new Error('reached the database before the bot check'); } });
vi.mock('@udyaibase/database', () => ({ prisma: tripwire }));
vi.mock('@/lib/db', () => ({ sql: () => { throw new Error('reached the database before the bot check'); } }));
vi.mock('@/lib/rate-limit', async (orig) => ({
  ...(await orig<typeof import('@/lib/rate-limit')>()),
  checkRateLimit: vi.fn(async () => ({ success: true, limit: 9, remaining: 9, reset: 0 })),
}));

const ROUTES: [string, string, Record<string, unknown>?][] = [
  ['/api/contact', '@/app/api/contact/route'],
  ['/api/newsletter/subscribe', '@/app/api/newsletter/subscribe/route'],
  ['/api/auth/otp/send', '@/app/api/auth/otp/send/route', { email: 'a@b.co', purpose: 'signup' }],
  ['/api/careers/apply', '@/app/api/careers/apply/route'],
  ['/api/jobs/alerts', '@/app/api/jobs/alerts/route'],
  ['/api/jobs/notify', '@/app/api/jobs/notify/route'],
  ['/api/reports', '@/app/api/reports/route'],
  ['/api/jobs/x/report', '@/app/api/jobs/[slug]/report/route'],
  ['/api/events/x/report', '@/app/api/events/[slug]/report/route'],
  ['/api/startups/submit', '@/app/api/startups/submit/route'],
  ['/api/funding-data/send-code', '@/app/api/funding-data/send-code/route', { email: 'a@b.co' }],
];

describe('public form routes refuse requests without the bot check', () => {
  beforeAll(() => { process.env.TURNSTILE_SECRET_KEY = 'test-secret'; });

  for (const [path, mod, body] of ROUTES) {
    it(`${path} → 400 "Complete the security check"`, async () => {
      vi.resetModules();
      const { POST } = await import(mod);
      const req = new NextRequest(`http://localhost:3000${path}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
        body: JSON.stringify(body ?? { email: 'a@b.co', name: 'Bot', message: 'hello' }),
      });
      const res = await POST(req, { params: Promise.resolve({ slug: 'x' }) });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/security check/i);
    });
  }
});
