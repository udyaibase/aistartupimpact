import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';

vi.hoisted(() => { process.env.NEXTAUTH_SECRET = 'test-nextauth-secret-min-32-characters-long'; });

const SESSION = { userId: 'f1', email: 'meera@startup.test', name: 'Meera', onboardingCompleted: true };
const mockSession = vi.fn();
const clearFounderSession = vi.fn();
vi.mock('@/lib/founder-auth', () => ({
  getFounderSession: () => mockSession(),
  requireFounderAuth: async () => { const s = await mockSession(); if (!s) throw new Error('Unauthorized - Please login'); return s; },
  clearFounderSession: () => clearFounderSession(),
  verifyFounderToken: vi.fn(),
}));
vi.mock('@/lib/unified-auth', () => ({ getUnifiedSession: vi.fn(async () => null), destroyUnifiedSession: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, set: vi.fn(), delete: vi.fn() }) }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn(async () => ({ success: true })), getClientIdentifier: () => 'ip', strictRateLimit: null }));
vi.mock('@/lib/founder/activity', () => ({ logFounderActivity: vi.fn() }));
const eraseFounderAccount = vi.fn();
vi.mock('@/lib/founder/erasure', () => ({ eraseFounderAccount: (id: string) => eraseFounderAccount(id) }));
const endAccountSessions = vi.fn(async (_email: string) => {});
vi.mock('@/lib/auth/sessions', () => ({ endAccountSessions: (e: string) => endAccountSessions(e) }));
const sent = vi.hoisted(() => [] as { to: string; html: string }[]);
vi.mock('@/lib/email/send', () => ({ sendEmailFireAndForget: (m: { to: string; html: string }) => { sent.push(m); } }));

const tx = { founderUser: { update: vi.fn() }, startup: { updateMany: vi.fn() }, aiTool: { updateMany: vi.fn() }, founderSession: { deleteMany: vi.fn() } };
const db = vi.hoisted(() => ({
  founderUser: { findUnique: vi.fn() },
  webUser: { findUnique: vi.fn() },
  unifiedUser: { findUnique: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock('@udyaibase/database', () => ({ prisma: db }));

import { POST as deactivate } from '@/app/api/founder/deactivate/route';
import { DELETE as deleteAccount } from '@/app/api/founder/delete-account/route';
import { POST as sendCode } from '@/app/api/founder/account-code/route';

const req = (url: string, method: string, body: unknown) => new NextRequest(`http://localhost${url}`, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const PASSWORD = 'Correct-Horse-9';
let hash = '';

function account(withPassword: boolean) {
  db.founderUser.findUnique.mockImplementation(async ({ select }: { select: Record<string, boolean> }) =>
    select.passwordHash ? { passwordHash: withPassword ? hash : null } : { deactivatedAt: null });
  db.webUser.findUnique.mockResolvedValue(null);
  db.unifiedUser.findUnique.mockResolvedValue(null);
}

describe('deactivating and deleting a founder account', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    sent.length = 0;
    hash ||= await bcrypt.hash(PASSWORD, 4);
    mockSession.mockResolvedValue(SESSION);
    db.$transaction.mockImplementation(async (fn: (t: typeof tx) => Promise<void>) => fn(tx));
  });

  describe('with a password', () => {
    beforeEach(() => account(true));

    it('deactivates with the correct password (the request body is read once)', async () => {
      const res = await deactivate(req('/api/founder/deactivate', 'POST', { password: PASSWORD }));
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ success: true });
      expect(tx.founderUser.update).toHaveBeenCalledWith({ where: { id: 'f1' }, data: { deactivatedAt: expect.any(Date) } });
      expect(tx.founderSession.deleteMany).toHaveBeenCalledWith({ where: { userId: 'f1' } });
      expect(clearFounderSession).toHaveBeenCalled();
    });

    it('refuses a wrong password and changes nothing', async () => {
      const res = await deactivate(req('/api/founder/deactivate', 'POST', { password: 'nope' }));
      expect(res.status).toBe(401);
      expect(db.$transaction).not.toHaveBeenCalled();
    });

    it('deletes with the correct password, ending every session first', async () => {
      const res = await deleteAccount(req('/api/founder/delete-account', 'DELETE', { password: PASSWORD }));
      expect(res.status).toBe(200);
      expect(endAccountSessions).toHaveBeenCalledWith(SESSION.email);
      expect(eraseFounderAccount).toHaveBeenCalledWith('f1');
    });

    it('does not delete with a wrong password', async () => {
      const res = await deleteAccount(req('/api/founder/delete-account', 'DELETE', { password: 'nope' }));
      expect(res.status).toBe(401);
      expect(eraseFounderAccount).not.toHaveBeenCalled();
    });

    it('sends no email code: the password is the confirmation', async () => {
      const res = await sendCode(req('/api/founder/account-code', 'POST', { action: 'delete' }));
      expect(res.status).toBe(400);
      expect(sent).toEqual([]);
    });
  });

  describe('without a password (Google sign-in)', () => {
    beforeEach(() => account(false));
    const codeFrom = () => /letter-spacing[^>]*>(\d{6})</.exec(sent[0].html)![1];

    it('a signed-in browser alone can no longer delete the account', async () => {
      const res = await deleteAccount(req('/api/founder/delete-account', 'DELETE', {}));
      expect(res.status).toBe(401);
      expect(eraseFounderAccount).not.toHaveBeenCalled();
    });

    it('a signed-in browser alone can no longer deactivate the account', async () => {
      const res = await deactivate(req('/api/founder/deactivate', 'POST', {}));
      expect(res.status).toBe(401);
      expect(db.$transaction).not.toHaveBeenCalled();
    });

    it('deletes with the emailed code', async () => {
      const { otpToken } = await (await sendCode(req('/api/founder/account-code', 'POST', { action: 'delete' }))).json();
      expect(sent[0].to).toBe(SESSION.email);
      const res = await deleteAccount(req('/api/founder/delete-account', 'DELETE', { otpToken, code: codeFrom() }));
      expect(res.status).toBe(200);
      expect(eraseFounderAccount).toHaveBeenCalledWith('f1');
    });

    it('refuses a wrong code', async () => {
      const { otpToken } = await (await sendCode(req('/api/founder/account-code', 'POST', { action: 'delete' }))).json();
      const wrong = codeFrom() === '111111' ? '222222' : '111111';
      const res = await deleteAccount(req('/api/founder/delete-account', 'DELETE', { otpToken, code: wrong }));
      expect(res.status).toBe(401);
      expect(eraseFounderAccount).not.toHaveBeenCalled();
    });

    it('a code sent for deactivating cannot be used to delete', async () => {
      const { otpToken } = await (await sendCode(req('/api/founder/account-code', 'POST', { action: 'deactivate' }))).json();
      const res = await deleteAccount(req('/api/founder/delete-account', 'DELETE', { otpToken, code: codeFrom() }));
      expect(res.status).toBe(401);
      expect(eraseFounderAccount).not.toHaveBeenCalled();
    });

    it('a code sent to one founder cannot be used by another', async () => {
      const { otpToken } = await (await sendCode(req('/api/founder/account-code', 'POST', { action: 'deactivate' }))).json();
      const code = codeFrom();
      mockSession.mockResolvedValue({ ...SESSION, userId: 'f2' });
      const res = await deactivate(req('/api/founder/deactivate', 'POST', { otpToken, code }));
      expect(res.status).toBe(401);
    });

    it('deactivates with the emailed code', async () => {
      const { otpToken } = await (await sendCode(req('/api/founder/account-code', 'POST', { action: 'deactivate' }))).json();
      const res = await deactivate(req('/api/founder/deactivate', 'POST', { otpToken, code: codeFrom() }));
      expect(res.status).toBe(200);
      expect(tx.founderUser.update).toHaveBeenCalled();
    });
  });

  it('signed out: 401 on all three', async () => {
    mockSession.mockResolvedValue(null);
    expect((await deactivate(req('/api/founder/deactivate', 'POST', {}))).status).toBe(401);
    expect((await deleteAccount(req('/api/founder/delete-account', 'DELETE', {}))).status).toBe(401);
    expect((await sendCode(req('/api/founder/account-code', 'POST', { action: 'delete' }))).status).toBe(401);
  });
});
