import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

const { transfer, startupM, founderUser, vlog, prisma } = vi.hoisted(() => {
  const transfer = { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn(), count: vi.fn(), create: vi.fn() };
  const startupM = { findFirst: vi.fn(), updateMany: vi.fn() };
  const founderUser = { findUnique: vi.fn() };
  const vlog = { create: vi.fn() };
  const prisma: Record<string, unknown> = { startupOwnershipTransfer: transfer, startup: startupM, founderUser, startupVerificationLog: vlog };
  prisma.$transaction = async (arg: unknown) => (typeof arg === 'function' ? (arg as (t: unknown) => unknown)(prisma) : Promise.all(arg as unknown[]));
  return { transfer, startupM, founderUser, vlog, prisma };
});
vi.mock('@udyaibase/database', () => ({ prisma }));
const session = { userId: 'f2', name: 'Ravi' };
vi.mock('@/lib/founder-auth', () => ({ requireFounderAuth: async () => session }));
const atLimit = vi.fn(async () => false);
vi.mock('@/lib/founder/limits', () => ({ founderAtStartupLimit: () => atLimit(), STARTUP_LIMIT_MESSAGE: 'limit' }));
vi.mock('@/lib/founder/activity', () => ({ logFounderActivity: vi.fn(async () => {}) }));
const sendEmail = vi.fn(async () => ({ success: true }));
vi.mock('@/lib/email/send', () => ({ sendEmail: (...a: unknown[]) => sendEmail(...(a as [])) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
const moveOwnerLinks = vi.fn(async () => {});
vi.mock('@/lib/startups/verification-lifecycle', () => ({ moveOwnerLinks: (...a: unknown[]) => moveOwnerLinks(...(a as [])) }));

import { respondTransferAction, startTransferAction } from '@/app/founder/startups/transfer-actions';

const pending = (over: Record<string, unknown> = {}) => ({
  id: 't1', status: 'PENDING', expiresAt: new Date(Date.now() + 86_400_000), toEmail: 'ravi@acme.ai', fromUserId: 'f1', startupId: 's1',
  Startup: { name: 'Acme', slug: 'acme', ownerId: 'f1', deletedAt: null, isVerified: true, verifiedDomain: 'acme.ai', verificationExpiresAt: new Date(Date.now() + 300 * 86_400_000) }, ...over,
});

beforeEach(() => {
  Object.values(transfer).forEach((f) => f.mockReset());
  startupM.findFirst.mockReset(); startupM.updateMany.mockReset(); founderUser.findUnique.mockReset(); vlog.create.mockReset();
  atLimit.mockResolvedValue(false); sendEmail.mockClear();
  session.userId = 'f2';
});

describe('startTransferAction', () => {
  it('only the owner can start a transfer', async () => {
    session.userId = 'f9';
    startupM.findFirst.mockResolvedValue({ id: 's1', name: 'Acme', slug: 'acme', ownerId: 'f1' });
    const r = await startTransferAction('s1', 'ravi@acme.ai');
    expect(r.success).toBe(false);
    expect(transfer.create).not.toHaveBeenCalled();
  });

  it('stores only a hash of the link token and emails the link', async () => {
    session.userId = 'f1';
    startupM.findFirst.mockResolvedValue({ id: 's1', name: 'Acme', slug: 'acme', ownerId: 'f1' });
    founderUser.findUnique.mockResolvedValue({ email: 'priya@acme.ai', name: 'Priya' });
    transfer.count.mockResolvedValue(0);
    transfer.updateMany.mockResolvedValue({ count: 0 });
    transfer.create.mockResolvedValue({ id: 't1', expiresAt: new Date() });
    const r = await startTransferAction('s1', 'Ravi@Acme.ai');
    expect(r.success).toBe(true);
    const { tokenHash, toEmail } = transfer.create.mock.calls[0][0].data;
    expect(toEmail).toBe('ravi@acme.ai');
    const html = (sendEmail.mock.calls[0] as unknown as [{ html: string }])[0].html;
    const token = html.match(/\/founder\/transfer\/([A-Za-z0-9_-]+)/)![1];
    expect(tokenHash).toBe(crypto.createHash('sha256').update(token).digest('hex'));
    expect(html).not.toContain(tokenHash);
  });
});

describe('respondTransferAction', () => {
  it('refuses an account with a different email', async () => {
    founderUser.findUnique.mockResolvedValue({ email: 'other@acme.ai', name: 'Other' });
    transfer.findUnique.mockResolvedValue(pending());
    const r = await respondTransferAction('tok', true);
    expect(r.success).toBe(false);
    expect(startupM.updateMany).not.toHaveBeenCalled();
  });

  it('refuses an expired link', async () => {
    founderUser.findUnique.mockResolvedValue({ email: 'ravi@acme.ai', name: 'Ravi' });
    transfer.findUnique.mockResolvedValue(pending({ expiresAt: new Date(Date.now() - 1000) }));
    expect((await respondTransferAction('tok', true)).success).toBe(false);
  });

  it('refuses when the recipient is at their startup limit', async () => {
    founderUser.findUnique.mockResolvedValue({ email: 'ravi@acme.ai', name: 'Ravi' });
    transfer.findUnique.mockResolvedValue(pending());
    atLimit.mockResolvedValue(true);
    const r = await respondTransferAction('tok', true);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toMatch(/transfer or delete that startup first/);
  });

  it('moves ownership once, logs it and tells the previous owner', async () => {
    founderUser.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
      where.id === 'f2' ? { email: 'ravi@acme.ai', name: 'Ravi' } : { email: 'priya@acme.ai', name: 'Priya' });
    transfer.findUnique.mockResolvedValue(pending());
    transfer.updateMany.mockResolvedValue({ count: 1 });
    startupM.updateMany.mockResolvedValue({ count: 1 });
    const r = await respondTransferAction('tok', true);
    expect(r).toEqual({ success: true, slug: 'acme' });
    expect(startupM.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: 's1', ownerId: 'f1' }, data: { ownerId: 'f2', claimedBy: 'f2' } });
    // ravi@acme.ai is on the verified domain, so the verification keeps its date.
    expect(startupM.updateMany.mock.calls[0][0].data.verificationExpiresAt).toBeUndefined();
    expect(moveOwnerLinks).toHaveBeenCalledWith('s1', 'f1', 'f2');
    expect(vlog.create.mock.calls[0][0].data).toMatchObject({ action: 'OWNERSHIP_TRANSFERRED', email: 'priya@acme.ai' });
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it('a new owner whose email is off the domain must re-verify within 90 days', async () => {
    founderUser.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
      where.id === 'f2' ? { email: ' Ravi@Gmail.com ', name: 'Ravi' } : { email: 'priya@acme.ai', name: 'Priya' });
    transfer.findUnique.mockResolvedValue(pending({ toEmail: 'ravi@gmail.com' }));
    transfer.updateMany.mockResolvedValue({ count: 1 });
    startupM.updateMany.mockResolvedValue({ count: 1 });
    expect((await respondTransferAction('tok', true)).success).toBe(true);
    const cap = startupM.updateMany.mock.calls[0][0].data.verificationExpiresAt as Date;
    expect(Math.round((cap.getTime() - Date.now()) / 86_400_000)).toBe(90);
  });

  it('a second accept of the same link changes nothing', async () => {
    founderUser.findUnique.mockResolvedValue({ email: 'ravi@acme.ai', name: 'Ravi' });
    transfer.findUnique.mockResolvedValue(pending());
    transfer.updateMany.mockResolvedValue({ count: 0 });
    const r = await respondTransferAction('tok', true);
    expect(r.success).toBe(false);
    expect(startupM.updateMany).not.toHaveBeenCalled();
  });
});
