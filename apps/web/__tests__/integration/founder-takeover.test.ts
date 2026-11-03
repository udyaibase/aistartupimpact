import { describe, it, expect, vi, beforeEach } from 'vitest';

const m = vi.hoisted(() => ({
  existing: null as null | Record<string, unknown>,
  owners: [] as string[],
  update: vi.fn(), create: vi.fn(), listings: vi.fn(), session: vi.fn(),
}));
vi.mock('@udyaibase/database', () => ({
  prisma: {
    founderUser: { findUnique: async () => ({ email: 'arjun@neuralpay.in', name: 'Arjun', emailVerified: true }) },
    jobBoardEmployer: {
      findFirst: async (q: any) => (q.where?.startupId ? m.existing : null),
      findUnique: async () => null,
      update: async (a: any) => { m.update(a); return { id: a.where.id }; },
      create: async (a: any) => { m.create(a); return { id: 'new-ws' }; },
      findUniqueOrThrow: async (q: any) => ({ id: q.where.id, email: 'x', companyName: 'NeuralPay', slug: 'neuralpay', plan: 'FREE' }),
    },
    jobBoardListing: { updateMany: m.listings },
  },
}));
vi.mock('@/lib/startups/ownership', () => ({
  founderOwnsVerifiedStartup: async () => ({ id: 's1', name: 'NeuralPay', slug: 'neuralpay', websiteUrl: 'https://neuralpay.in', verifiedDomain: 'neuralpay.in', logoUrl: null }),
}));
vi.mock('@/lib/employer/team', () => ({ ownerInboxes: async () => m.owners }));
vi.mock('@/lib/employer/owners', () => ({ ensureOwnerMember: async () => ({ id: 'm-founder', email: 'arjun@neuralpay.in' }), internalAccountEmail: () => 'x@workspace.udyaibase.invalid' }));
vi.mock('@/lib/employer-auth', () => ({ setEmployerSession: m.session }));
vi.mock('@/lib/email/send', () => ({ sendEmailFireAndForget: vi.fn() }));

import { openFounderWorkspace } from '@/lib/employer/founder-workspace';

const recruiterWs = { id: 'ws-r', startupId: 's1', passwordHash: '!code-only', founderUserId: null, email: 'priya@neuralpay.in', startupClaimMethod: null };

describe('founder "Start hiring" taking over a workspace someone linked to the startup', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('a colleague on the startup’s domain: the founder takes the workspace over and vouches for it', async () => {
    m.existing = recruiterWs;
    m.owners = ['priya@neuralpay.in'];
    const e = await openFounderWorkspace('f1', 's1');
    expect(e.id).toBe('ws-r');
    expect(m.update.mock.calls.at(-1)?.[0]).toMatchObject({ where: { id: 'ws-r' }, data: { startupClaimMethod: 'FOUNDER', founderUserId: 'f1' } });
    expect(m.create).not.toHaveBeenCalled();
  });

  it('a stranger (personal or other-domain email): their link is released, the founder gets a fresh workspace', async () => {
    m.existing = { ...recruiterWs, email: 'attacker@gmail.com' };
    m.owners = ['attacker@gmail.com'];
    const e = await openFounderWorkspace('f1', 's1');
    expect(m.update.mock.calls[0][0]).toMatchObject({ where: { id: 'ws-r' }, data: { startupId: null, startupClaimMethod: null } });
    expect(m.create).toHaveBeenCalledTimes(1);
    expect(e.id).toBe('new-ws');
  });
});
