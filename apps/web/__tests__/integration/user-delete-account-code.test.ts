import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';

vi.hoisted(() => { process.env.NEXTAUTH_SECRET = 'test-nextauth-secret-min-32-characters-long'; });

const USER = { id: 'w1', email: 'meera@startup.test', name: 'Meera' };
const mockUser = vi.fn();
vi.mock('@/lib/user-session', () => ({ getUserSession: () => mockUser() }));
vi.mock('@/lib/founder-auth', () => ({ verifyFounderToken: vi.fn(), getFounderSession: vi.fn(async () => null) }));
vi.mock('@/lib/unified-auth', () => ({ getUnifiedSession: vi.fn(async () => null), destroyUnifiedSession: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, set: vi.fn(), delete: vi.fn() }) }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn(async () => ({ success: true })), getClientIdentifier: () => 'ip', strictRateLimit: null }));
const eraseFounderAccount = vi.fn();
vi.mock('@/lib/founder/erasure', () => ({ eraseFounderAccount: (id: string) => eraseFounderAccount(id) }));
const endAccountSessions = vi.fn(async (_email: string) => {});
vi.mock('@/lib/auth/sessions', () => ({ endAccountSessions: (e: string) => endAccountSessions(e) }));
const sent = vi.hoisted(() => [] as { to: string; html: string }[]);
vi.mock('@/lib/email/send', () => ({ sendEmailFireAndForget: (m: { to: string; html: string }) => { sent.push(m); } }));

const tx = { newsletterSubscriber: { updateMany: vi.fn() }, webUser: { deleteMany: vi.fn() } };
const db = vi.hoisted(() => ({
  webUser: { findUnique: vi.fn() }, founderUser: { findUnique: vi.fn() }, unifiedUser: { findUnique: vi.fn() }, $transaction: vi.fn(),
}));
vi.mock('@udyaibase/database', () => ({ prisma: db }));

import { DELETE as deleteAccount } from '@/app/api/user/delete-account/route';
import { POST as sendCode } from '@/app/api/user/account-code/route';

const req = (url: string, method: string, body: unknown) => new NextRequest(`http://localhost${url}`, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const PASSWORD = 'Correct-Horse-9';
let hash = '';
function account(withPassword: boolean) {
  db.webUser.findUnique.mockImplementation(async ({ select }: { select: Record<string, boolean> }) =>
    select.id ? { id: USER.id, email: USER.email, passwordHash: withPassword ? hash : null } : { passwordHash: withPassword ? hash : null });
  // The same person also has a founder account: deleting from Profile erases it too.
  db.founderUser.findUnique.mockImplementation(async ({ select }: { select: Record<string, boolean> }) => (select.id ? { id: 'f1' } : { passwordHash: null }));
  db.unifiedUser.findUnique.mockResolvedValue(null);
}
const codeFrom = () => /letter-spacing[^>]*>(\d{6})</.exec(sent[0].html)![1];

describe('deleting an account from the site profile', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    sent.length = 0;
    hash ||= await bcrypt.hash(PASSWORD, 4);
    mockUser.mockResolvedValue(USER);
    db.$transaction.mockImplementation(async (fn: (t: typeof tx) => Promise<void>) => fn(tx));
  });

  it('with a password: the right one deletes (and erases the founder account), a wrong one does not', async () => {
    account(true);
    expect((await deleteAccount(req('/api/user/delete-account', 'DELETE', { password: 'nope' }))).status).toBe(401);
    expect(tx.webUser.deleteMany).not.toHaveBeenCalled();
    expect((await deleteAccount(req('/api/user/delete-account', 'DELETE', { password: PASSWORD }))).status).toBe(200);
    expect(endAccountSessions).toHaveBeenCalledWith(USER.email);
    expect(eraseFounderAccount).toHaveBeenCalledWith('f1');
    expect(tx.webUser.deleteMany).toHaveBeenCalledWith({ where: { id: 'w1' } });
  });

  it('without a password (Google sign-in): a signed-in browser alone can no longer delete', async () => {
    account(false);
    const res = await deleteAccount(req('/api/user/delete-account', 'DELETE', {}));
    expect(res.status).toBe(401);
    expect(eraseFounderAccount).not.toHaveBeenCalled();
    expect(tx.webUser.deleteMany).not.toHaveBeenCalled();
  });

  it('without a password: the emailed code deletes, a wrong code does not', async () => {
    account(false);
    const { otpToken } = await (await sendCode(req('/api/user/account-code', 'POST', { action: 'delete' }))).json();
    expect(sent[0].to).toBe(USER.email);
    const wrong = codeFrom() === '111111' ? '222222' : '111111';
    expect((await deleteAccount(req('/api/user/delete-account', 'DELETE', { otpToken, code: wrong }))).status).toBe(401);
    expect(tx.webUser.deleteMany).not.toHaveBeenCalled();
    expect((await deleteAccount(req('/api/user/delete-account', 'DELETE', { otpToken, code: codeFrom() }))).status).toBe(200);
    expect(tx.webUser.deleteMany).toHaveBeenCalled();
  });

  it('no code is sent to an account that has a password, or to someone signed out', async () => {
    account(true);
    expect((await sendCode(req('/api/user/account-code', 'POST', { action: 'delete' }))).status).toBe(400);
    mockUser.mockResolvedValue(null);
    expect((await sendCode(req('/api/user/account-code', 'POST', { action: 'delete' }))).status).toBe(401);
    expect(sent).toEqual([]);
  });
});
