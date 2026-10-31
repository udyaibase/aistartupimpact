import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@neondatabase/serverless', () => ({
  neon: vi.fn(() => vi.fn(() => Promise.resolve([]))),
  neonConfig: {},
  Pool: vi.fn(),
  types: { setTypeParser: vi.fn(), builtins: {} },
}));

vi.mock('@/lib/db', () => ({
  sql: vi.fn(() => Promise.resolve([{
    id: 'user-1', email: 'test@example.com', name: 'Test', avatar: null,
    slug: 'test', bio: null, twitter: null, linkedin: null, isActive: true,
    deactivatedAt: null, termsAcceptedAt: null,
  }])),
}));

vi.mock('jose', () => ({
  SignJWT: vi.fn().mockImplementation(() => ({
    setProtectedHeader: vi.fn().mockReturnThis(),
    setExpirationTime: vi.fn().mockReturnThis(),
    sign: vi.fn(() => Promise.resolve('mock-jwt-token')),
  })),
  jwtVerify: vi.fn(() => Promise.resolve({
    payload: { userId: 'user-1', sessionId: 'sess-1' },
  })),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(() => Promise.resolve({ success: true })),
  getClientIdentifier: vi.fn(() => 'test-ip'),
  authRateLimit: {},
  strictRateLimit: {},
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({
    get: vi.fn((name: string) => {
      if (name === 'user-token') return { value: 'mock-jwt-token' };
      return undefined;
    }),
    set: vi.fn(),
    delete: vi.fn(),
  })),
  headers: vi.fn(() => new Map()),
}));

describe('Cookie security — auth token flags', () => {
  beforeEach(() => vi.clearAllMocks());

  it('founder cookie is set with httpOnly, secure (prod), sameSite lax', async () => {
    const mod = await import('@/lib/founder-auth');
    const src = await import('fs').then(fs =>
      fs.readFileSync('lib/founder-auth.ts', 'utf8')
    );
    expect(src).toContain('httpOnly: true');
    expect(src).toContain("secure: process.env.NODE_ENV === 'production'");
    expect(src).toContain("sameSite: 'lax'");
  });

  it('employer cookie is set with httpOnly, secure (prod), sameSite lax', async () => {
    const src = await import('fs').then(fs =>
      fs.readFileSync('lib/employer-auth.ts', 'utf8')
    );
    expect(src).toContain('httpOnly: true');
    expect(src).toContain("secure: process.env.NODE_ENV === 'production'");
    expect(src).toContain("sameSite: 'lax'");
  });

  it('user-token cookie is set with httpOnly, secure, sameSite lax', async () => {
    const src = await import('fs').then(fs =>
      fs.readFileSync('app/api/user/auth/verify-2fa/route.ts', 'utf8')
    );
    expect(src).toContain('httpOnly: true');
    expect(src).toContain("secure: process.env.NODE_ENV === 'production'");
    expect(src).toContain("sameSite: 'lax'");
  });

  it('user-token google callback cookie uses secure flags', async () => {
    const src = await import('fs').then(fs =>
      fs.readFileSync('app/api/user/auth/google/callback/route.ts', 'utf8')
    );
    expect(src).toContain('httpOnly: true');
    expect(src).toContain("sameSite: 'lax'");
  });
});

describe('Cookie security — session token has expiration', () => {
  it('founder token has maxAge set', async () => {
    const src = await import('fs').then(fs =>
      fs.readFileSync('lib/founder-auth.ts', 'utf8')
    );
    expect(src).toMatch(/maxAge:\s*\d+/);
  });

  it('user token has maxAge set (7 days)', async () => {
    const src = await import('fs').then(fs =>
      fs.readFileSync('app/api/user/auth/verify-2fa/route.ts', 'utf8')
    );
    expect(src).toMatch(/maxAge:\s*7\s*\*\s*24\s*\*\s*60\s*\*\s*60/);
  });
});
