import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';
import speakeasy from 'speakeasy';
import { NextRequest } from 'next/server';

const m = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  getToken: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
  queryRawUnsafe: vi.fn(),
  logAuditEvent: vi.fn(),
}));

vi.mock('next-auth', () => ({ getServerSession: (...a: any[]) => m.getServerSession(...a) }));
vi.mock('next-auth/jwt', () => ({ getToken: (...a: any[]) => m.getToken(...a) }));
vi.mock('next-auth/providers/google', () => ({ default: () => ({ id: 'google' }) }));
vi.mock('@udyaibase/database', () => ({
  prisma: {
    user: { findUnique: (...a: any[]) => m.findUnique(...a), update: (...a: any[]) => m.update(...a) },
    $queryRawUnsafe: (...a: any[]) => m.queryRawUnsafe(...a),
  },
}));
vi.mock('@/lib/audit-log', () => ({ logAuditEvent: (...a: any[]) => m.logAuditEvent(...a) }));

process.env.NEXTAUTH_SECRET = 'test-nextauth-secret';
process.env.ENCRYPTION_KEY = 'test-encryption-key';

import {
  encryptSecret, decryptSecret, verifyTOTPToken, verifyBackupCode, hashBackupCodes,
  createTwoFactorProof, verifyTwoFactorProof, TwoFactorConfigError,
} from '@/lib/two-factor';
import { twoFactorBlock } from '@/lib/api-auth';
import { authOptions } from '@/lib/auth';

const SECRET = speakeasy.generateSecret({ length: 20 }).base32;
const codeNow = () => speakeasy.totp({ secret: SECRET, encoding: 'base32' });
const wrongCode = () => (codeNow() === '000000' ? '111111' : '000000');

const req = (body: unknown) =>
  new NextRequest('http://localhost/api', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });

const staffSession = (extra: Record<string, unknown> = {}) => ({
  user: { id: 'u1', email: 'a@x.com', role: 'SUPER_ADMIN' },
  twoFactorEnabled: false, twoFactorVerified: true, require2FA: false, ...extra,
});

function dbUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'u1', email: 'a@x.com', twoFactorEnabled: true, twoFactorSecret: encryptSecret(SECRET),
    twoFactorBackupCodes: [] as string[], failedLoginAttempts: 0, lockedUntil: null as Date | null, ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  m.update.mockResolvedValue({ id: 'u1', email: 'a@x.com' });
  m.queryRawUnsafe.mockResolvedValue([]);
});

describe('two-factor library', () => {
  it('encrypts with AES-GCM and still reads the earlier CBC format', () => {
    const enc = encryptSecret(SECRET);
    expect(enc.startsWith('v2:')).toBe(true);
    expect(decryptSecret(enc)).toBe(SECRET);

    // A secret stored by the previous version (AES-256-CBC "iv:ciphertext").
    const iv = crypto.randomBytes(16);
    const key = crypto.createHash('sha256').update('test-encryption-key').digest();
    const c = crypto.createCipheriv('aes-256-cbc', key, iv);
    const legacy = `${iv.toString('hex')}:${c.update(SECRET, 'utf8', 'hex')}${c.final('hex')}`;
    expect(decryptSecret(legacy)).toBe(SECRET);
  });

  it('rejects a tampered ciphertext', () => {
    const parts = encryptSecret(SECRET).split(':');
    parts[3] = (parts[3][0] === 'a' ? 'b' : 'a') + parts[3].slice(1);
    expect(() => decryptSecret(parts.join(':'))).toThrow();
  });

  it('refuses to run without ENCRYPTION_KEY in production', () => {
    const env = process.env as Record<string, string | undefined>;
    const [key, nodeEnv] = [env.ENCRYPTION_KEY, env.NODE_ENV];
    delete env.ENCRYPTION_KEY;
    env.NODE_ENV = 'production';
    try {
      expect(() => encryptSecret(SECRET)).toThrow(TwoFactorConfigError);
    } finally {
      env.ENCRYPTION_KEY = key;
      env.NODE_ENV = nodeEnv;
    }
  });

  it('accepts only the current code ±1 step', () => {
    expect(verifyTOTPToken(codeNow(), SECRET)).toBe(true);
    const old = speakeasy.totp({ secret: SECRET, encoding: 'base32', time: Math.floor(Date.now() / 1000) - 120 });
    if (old !== codeNow()) expect(verifyTOTPToken(old, SECRET)).toBe(false);
    expect(verifyTOTPToken('12345', SECRET)).toBe(false);
  });

  it('accepts backup codes in any case and with separators', async () => {
    const hashed = await hashBackupCodes(['A1B2C3D4']);
    expect(await verifyBackupCode('a1b2-c3d4', hashed)).toBe(0);
    expect(await verifyBackupCode('FFFFFFFF', hashed)).toBe(-1);
  });

  it('binds proofs to the user and the sign-in, and expires them', () => {
    const proof = createTwoFactorProof('u1', 'sid-1');
    expect(verifyTwoFactorProof(proof, 'u1', 'sid-1')).toBe(true);
    expect(verifyTwoFactorProof(proof, 'u2', 'sid-1')).toBe(false);
    expect(verifyTwoFactorProof(proof, 'u1', 'sid-2')).toBe(false);
    expect(verifyTwoFactorProof(proof, 'u1', 'sid-1', Date.now() + 3 * 60 * 1000)).toBe(false);
    expect(verifyTwoFactorProof('9999999999999.forged', 'u1', 'sid-1')).toBe(false);
    expect(verifyTwoFactorProof(true, 'u1', 'sid-1')).toBe(false);
  });
});

describe('POST /api/admin/verify-2fa', () => {
  const load = async () => (await import('@/app/api/admin/verify-2fa/route')).POST;

  it('returns a proof for a correct code', async () => {
    m.getToken.mockResolvedValue({ id: 'u1', sid: 'sid-1' });
    m.findUnique.mockResolvedValue(dbUser());
    const res = await (await load())(req({ token: codeNow() }));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(verifyTwoFactorProof(data.proof, 'u1', 'sid-1')).toBe(true);
  });

  it('counts wrong codes and locks after 5', async () => {
    m.getToken.mockResolvedValue({ id: 'u1', sid: 'sid-1' });
    m.findUnique.mockResolvedValue(dbUser({ failedLoginAttempts: 3 }));
    const res = await (await load())(req({ token: wrongCode() }));
    expect(res.status).toBe(400);
    expect(m.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { failedLoginAttempts: 4 } });

    m.findUnique.mockResolvedValue(dbUser({ failedLoginAttempts: 4 }));
    const locked = await (await load())(req({ token: wrongCode() }));
    expect(locked.status).toBe(429);
    expect(m.update.mock.calls.at(-1)![0].data.lockedUntil).toBeInstanceOf(Date);
  });

  it('refuses even a correct code while locked', async () => {
    m.getToken.mockResolvedValue({ id: 'u1', sid: 'sid-1' });
    m.findUnique.mockResolvedValue(dbUser({ lockedUntil: new Date(Date.now() + 60_000), failedLoginAttempts: 5 }));
    const res = await (await load())(req({ token: codeNow() }));
    expect(res.status).toBe(429);
  });

  it('uses up a backup code', async () => {
    m.getToken.mockResolvedValue({ id: 'u1', sid: 'sid-1' });
    m.findUnique.mockResolvedValue(dbUser({ twoFactorBackupCodes: await hashBackupCodes(['A1B2C3D4', 'BBBBBBBB']) }));
    const res = await (await load())(req({ backupCode: 'a1b2c3d4' }));
    expect((await res.json()).remainingBackupCodes).toBe(1);
  });

  it('needs a signed-in session', async () => {
    m.getToken.mockResolvedValue(null);
    expect((await (await load())(req({ token: '123456' }))).status).toBe(401);
  });
});

describe('POST /api/admin/2fa-setup', () => {
  const load = async () => (await import('@/app/api/admin/2fa-setup/route')).POST;

  it('will not replace the authenticator while 2FA is on', async () => {
    m.getServerSession.mockResolvedValue(staffSession({ twoFactorEnabled: true, twoFactorVerified: false }));
    m.findUnique.mockResolvedValue(dbUser());
    const res = await (await load())(req({ action: 'generate' }));
    expect(res.status).toBe(409);
    expect(m.update).not.toHaveBeenCalled();
  });

  it('enables 2FA with a correct code and returns backup codes', async () => {
    m.getServerSession.mockResolvedValue(staffSession());
    m.getToken.mockResolvedValue({ id: 'u1', sid: 'sid-1' });
    m.findUnique.mockResolvedValue(dbUser({ twoFactorEnabled: false }));
    const res = await (await load())(req({ action: 'verify', token: codeNow() }));
    const data = await res.json();
    expect(data.backupCodes).toHaveLength(10);
    expect(verifyTwoFactorProof(data.proof, 'u1', 'sid-1')).toBe(true);
    expect(m.update.mock.calls[0][0].data.twoFactorEnabled).toBe(true);
  });
});

describe('POST /api/admin/2fa-disable', () => {
  it('needs a correct current code', async () => {
    const { POST } = await import('@/app/api/admin/2fa-disable/route');
    m.getServerSession.mockResolvedValue(staffSession({ twoFactorEnabled: true }));
    m.findUnique.mockResolvedValue(dbUser());
    expect((await POST(req({ token: wrongCode() }))).status).toBe(400);
    expect((await POST(req({ token: codeNow() }))).status).toBe(200);
    expect(m.update.mock.calls.at(-1)![0].data.twoFactorEnabled).toBe(false);
  });
});

describe('session (jwt callback)', () => {
  const jwt = (args: any) => (authOptions.callbacks!.jwt as any)(args);

  it('marks a new sign-in with 2FA as not yet verified', async () => {
    m.findUnique.mockResolvedValue({ id: 'u1', role: 'SUPER_ADMIN', slug: 'a', twoFactorEnabled: true });
    const token = await jwt({ token: { email: 'a@x.com' }, user: { email: 'a@x.com' } });
    expect(token.twoFactorVerified).toBe(false);
    expect(typeof token.sid).toBe('string');
  });

  it('ignores a client claiming it passed without a valid proof', async () => {
    m.findUnique.mockResolvedValue({ id: 'u1', role: 'SUPER_ADMIN', slug: 'a', twoFactorEnabled: true });
    const base = { email: 'a@x.com', id: 'u1', sid: 'sid-1', twoFactorEnabled: true, twoFactorVerified: false, twoFactorCheckedAt: Date.now() };
    for (const session of [{ twoFactorPassed: true }, { twoFactorVerified: true }, { twoFactorProof: 'forged.sig' }, { twoFactorProof: createTwoFactorProof('u1', 'other-sid') }]) {
      const token = await jwt({ token: { ...base }, trigger: 'update', session });
      expect(token.twoFactorVerified).toBe(false);
    }
  });

  it('accepts a valid proof for this sign-in', async () => {
    m.findUnique.mockResolvedValue({ id: 'u1', role: 'SUPER_ADMIN', slug: 'a', twoFactorEnabled: true });
    const base = { email: 'a@x.com', id: 'u1', sid: 'sid-1', twoFactorEnabled: true, twoFactorVerified: false, twoFactorCheckedAt: Date.now() };
    const token = await jwt({ token: base, trigger: 'update', session: { twoFactorProof: createTwoFactorProof('u1', 'sid-1') } });
    expect(token.twoFactorVerified).toBe(true);
  });

  it('leaves accounts without 2FA exactly as before', async () => {
    m.findUnique.mockResolvedValue({ id: 'u1', role: 'WRITER', slug: 'a', twoFactorEnabled: false });
    const token = await jwt({ token: { email: 'a@x.com' }, user: { email: 'a@x.com' } });
    expect(token.twoFactorVerified).toBe(true);
    expect(twoFactorBlock({ twoFactorEnabled: false, twoFactorVerified: true, require2FA: false })).toBeNull();
  });
});

describe('server-side guard', () => {
  it('blocks sessions that still owe a code or must set up 2FA', () => {
    expect(twoFactorBlock({ twoFactorEnabled: true, twoFactorVerified: false })?.status).toBe(401);
    expect(twoFactorBlock({ twoFactorEnabled: false, require2FA: true })?.status).toBe(403);
    expect(twoFactorBlock({ twoFactorEnabled: true, twoFactorVerified: true, require2FA: true })).toBeNull();
  });

  it('applies to requireApiAuth', async () => {
    const { requireApiAuth } = await import('@/lib/api-auth');
    m.getServerSession.mockResolvedValue(staffSession({ twoFactorEnabled: true, twoFactorVerified: false }));
    expect((await requireApiAuth(['SUPER_ADMIN'])).error?.status).toBe(401);
    expect((await requireApiAuth(['SUPER_ADMIN'], { allowPending2FA: true })).error).toBeNull();
  });
});
