import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({
  eventOrganizer: { findUnique: vi.fn() },
  eventRegistration: { count: vi.fn() },
  event: { count: vi.fn() },
  eventSeries: { count: vi.fn() },
  organizerPayment: { count: vi.fn() },
  embedWidget: { count: vi.fn() },
  eventTeamMember: { count: vi.fn(), findFirst: vi.fn() },
  organizerIntegration: { count: vi.fn() },
  organizerOwnershipTransfer: { findUnique: vi.fn(), update: vi.fn() },
}));
vi.mock('@udyaibase/database', () => ({ prisma: db }));
vi.mock('@/lib/email/send', () => ({ sendEmailFireAndForget: vi.fn() }));

import { acceptOwnershipTransfer, newOwnerProblem, workspaceTransferProblem, TransferError } from '@/lib/organizer-auth/ownership-transfer';

const counts = (n: Partial<Record<'event' | 'eventSeries' | 'organizerPayment' | 'embedWidget' | 'eventTeamMember' | 'organizerIntegration', number>>) => {
  for (const k of ['event', 'eventSeries', 'organizerPayment', 'embedWidget', 'eventTeamMember', 'organizerIntegration'] as const) {
    (db[k].count as any).mockResolvedValue(n[k] ?? 0);
  }
};

beforeEach(() => { vi.clearAllMocks(); counts({}); });

describe('a workspace can change hands only when nothing is owed to the current owner', () => {
  it('waits while paid ticket money is held for a recent or upcoming event', async () => {
    db.eventOrganizer.findUnique.mockResolvedValue({ status: 'ACTIVE', deactivatedAt: null, deletedAt: null });
    db.eventRegistration.count.mockResolvedValue(3);
    expect(await workspaceTransferProblem('w')).toMatch(/still being paid out/);
  });

  it('refuses a suspended or deactivated workspace', async () => {
    db.eventOrganizer.findUnique.mockResolvedValue({ status: 'SUSPENDED', deactivatedAt: null, deletedAt: null });
    expect(await workspaceTransferProblem('w')).toMatch(/suspended or deactivated/);
  });

  it('allows a free-events workspace', async () => {
    db.eventOrganizer.findUnique.mockResolvedValue({ status: 'ACTIVE', deactivatedAt: null, deletedAt: null });
    db.eventRegistration.count.mockResolvedValue(0);
    expect(await workspaceTransferProblem('w')).toBeNull();
  });
});

describe('the new owner’s own account must be empty, because it is replaced', () => {
  const active = { emailVerified: true, status: 'ACTIVE', deactivatedAt: null, deletedAt: null, payoutAccountId: null };

  it.each([
    ['events', { event: 1 }],
    ['series', { eventSeries: 1 }],
    ['payments', { organizerPayment: 2 }],
    ['a live widget', { embedWidget: 1 }],
    ['a team', { eventTeamMember: 1 }],
    ['a meeting app', { organizerIntegration: 1 }],
  ])('refuses an account with %s', async (_label, n) => {
    db.eventOrganizer.findUnique.mockResolvedValue(active);
    counts(n);
    expect(await newOwnerProblem('b')).toMatch(/already runs their own workspace/);
  });

  it('refuses an account with payouts set up', async () => {
    db.eventOrganizer.findUnique.mockResolvedValue({ ...active, payoutAccountId: 'acc_1' });
    expect(await newOwnerProblem('b')).toMatch(/already runs their own workspace/);
  });

  it('refuses an unconfirmed account', async () => {
    db.eventOrganizer.findUnique.mockResolvedValue({ ...active, emailVerified: false });
    expect(await newOwnerProblem('b')).toMatch(/isn’t active/);
  });

  it('accepts an empty, active account', async () => {
    db.eventOrganizer.findUnique.mockResolvedValue(active);
    expect(await newOwnerProblem('b')).toBeNull();
  });
});

describe('accepting', () => {
  const token = 'a'.repeat(64);

  it('only the account the request was made for can accept', async () => {
    db.organizerOwnershipTransfer.findUnique.mockResolvedValue({ id: 't', status: 'PENDING', expiresAt: new Date(Date.now() + 864e5), organizerId: 'w', toAccountId: 'b', toEmail: 'b@x.test', toMemberId: 'm' });
    db.eventOrganizer.findUnique.mockResolvedValue({ name: 'W', company: 'W Co', email: 'a@x.test', payoutAccountId: null, plan: 'FREE' });
    await expect(acceptOwnershipTransfer(token, 'someone-else')).rejects.toThrow(/Sign in as b@x.test/);
  });

  it('a used, cancelled or expired link does nothing', async () => {
    db.organizerOwnershipTransfer.findUnique.mockResolvedValue({ id: 't', status: 'ACCEPTED', expiresAt: new Date(Date.now() + 864e5) });
    await expect(acceptOwnershipTransfer(token, 'b')).rejects.toBeInstanceOf(TransferError);
    db.organizerOwnershipTransfer.findUnique.mockResolvedValue({ id: 't', status: 'PENDING', expiresAt: new Date(Date.now() - 1000) });
    await expect(acceptOwnershipTransfer(token, 'b')).rejects.toThrow(/expired or was cancelled/);
    expect(db.organizerOwnershipTransfer.update).toHaveBeenCalledWith({ where: { id: 't' }, data: expect.objectContaining({ status: 'EXPIRED' }) });
  });

  it('stops if the person is no longer an Admin', async () => {
    db.organizerOwnershipTransfer.findUnique.mockResolvedValue({ id: 't', status: 'PENDING', expiresAt: new Date(Date.now() + 864e5), organizerId: 'w', toAccountId: 'b', toEmail: 'b@x.test', toMemberId: 'm' });
    db.eventOrganizer.findUnique.mockResolvedValue({ name: 'W', company: 'W Co', email: 'a@x.test', payoutAccountId: null, plan: 'FREE' });
    db.eventTeamMember.findFirst.mockResolvedValue({ status: 'ACTIVE', role: 'MANAGER' });
    await expect(acceptOwnershipTransfer(token, 'b')).rejects.toThrow(/no longer an Admin/);
  });
});
