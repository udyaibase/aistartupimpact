import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => {
  const t = {
    jobBoardEmployer: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), findUniqueOrThrow: vi.fn() },
    jobBoardTeamMember: { create: vi.fn() },
    // No startup table here: anything that tried to mark the startup verified would fail these tests.
    $transaction: vi.fn(),
  };
  return t;
});
vi.mock('@udyaibase/database', () => ({ prisma: db }));
vi.mock('@/lib/db', () => ({ sql: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: async () => ({ set: vi.fn(), get: vi.fn(), delete: vi.fn() }) }));
vi.mock('@/lib/employer/owners', () => ({ CODE_ONLY_MARKER: '!code-only', ensureOwnerMember: async () => ({ id: 'm1', email: 'x' }), internalAccountEmail: (s: string) => `${s}@workspace.udyaibase.invalid` }));
vi.mock('@/lib/employer/team', () => ({ ownerInboxes: async () => [] }));
vi.mock('@/lib/employer/founder-workspace', () => ({ uniqueEmployerSlug: async (n: string) => n.toLowerCase() }));
vi.mock('@/lib/employer-auth', () => ({ setEmployerSession: vi.fn() }));
vi.mock('@/lib/email/send', () => ({ sendEmail: vi.fn(), sendEmailFireAndForget: vi.fn() }));

import { createWorkspace } from '@/lib/employer/signup';

const startup = { id: 's1', name: 'NeuralPay', logoUrl: null, websiteUrl: 'https://www.neuralpay.in', headquartersCity: null, tagline: 'x' };

describe('createWorkspace: signup never verifies a startup (only its founder can)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.jobBoardEmployer.findUnique.mockResolvedValue(null);
    db.jobBoardEmployer.findFirst.mockResolvedValue(null);
    db.jobBoardEmployer.create.mockResolvedValue({ id: 'e1' });
    db.jobBoardTeamMember.create.mockResolvedValue({ id: 'm1' });
    db.$transaction.mockImplementation((fn: (tx: typeof db) => unknown) => fn(db));
    db.jobBoardEmployer.findUniqueOrThrow.mockResolvedValue({ id: 'e1', email: 'x', companyName: 'NeuralPay', slug: 'neuralpay', plan: 'FREE' });
  });

  it('even a work email on the company domain only links the startup: drafts until the founder verifies', async () => {
    await createWorkspace('priya@neuralpay.in', startup, { name: 'NeuralPay', websiteUrl: startup.websiteUrl });
    const data = db.jobBoardEmployer.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ startupId: 's1', passwordHash: '!code-only', emailVerified: true });
    expect(data.startupClaimMethod).toBeUndefined();
    expect(data.startupClaimVerifiedAt).toBeUndefined();
  });

  it('someone who already owns a workspace gets an internal account address for the new one', async () => {
    db.jobBoardEmployer.findUnique.mockResolvedValue({ id: 'old' });
    await createWorkspace('priya@neuralpay.in', startup, { name: 'NeuralPay', websiteUrl: startup.websiteUrl });
    expect(db.jobBoardEmployer.create.mock.calls[0][0].data.email).toMatch(/@workspace\.udyaibase\.invalid$/);
  });
});
