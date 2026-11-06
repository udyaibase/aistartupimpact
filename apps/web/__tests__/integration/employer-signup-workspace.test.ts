import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => {
  const tx = {
    jobBoardEmployer: { create: vi.fn() },
    jobBoardTeamMember: { create: vi.fn() },
    startup: { create: vi.fn(), update: vi.fn() },
  };
  return {
    tx,
    prisma: {
      jobBoardEmployer: { findFirst: vi.fn(), findUnique: vi.fn(), findUniqueOrThrow: vi.fn() },
      startup: { findFirst: vi.fn(), findUnique: vi.fn() },
      jobBoardTeamMember: { findMany: vi.fn() },
      $transaction: vi.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    },
    session: vi.fn(),
  };
});

vi.mock('@udyaibase/database', () => ({ prisma: db.prisma }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, set: vi.fn(), delete: vi.fn() }) }));
vi.mock('@/lib/db', () => ({ sql: vi.fn() }));
vi.mock('@/lib/email/send', () => ({ sendEmail: vi.fn(), sendEmailFireAndForget: vi.fn() }));
vi.mock('@/lib/employer-auth', () => ({ setEmployerSession: db.session }));
vi.mock('@/lib/employer/team', () => ({ ownerInboxes: vi.fn(async () => []) }));
vi.mock('@/lib/employer/founder-workspace', () => ({ uniqueEmployerSlug: vi.fn(async () => 'acme') }));

process.env.EMPLOYER_JWT_SECRET = 'test-employer-secret-min-32-characters-long';
import { addCompany, createWorkspace } from '@/lib/employer/signup';

const startup = { id: 's1', name: 'Acme', logoUrl: null, websiteUrl: 'https://acme.ai', headquartersCity: null, tagline: 'x' };

describe('creating a workspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.prisma.jobBoardEmployer.findFirst.mockResolvedValue(null);
    db.prisma.jobBoardEmployer.findUnique.mockResolvedValue(null);
    db.prisma.jobBoardEmployer.findUniqueOrThrow.mockResolvedValue({ id: 'e1', email: 'a@acme.ai', companyName: 'Acme', slug: 'acme', plan: 'FREE' });
    db.prisma.startup.findFirst.mockResolvedValue(null);
    db.prisma.startup.findUnique.mockResolvedValue(null);
    db.tx.jobBoardEmployer.create.mockResolvedValue({ id: 'e1' });
    db.tx.jobBoardTeamMember.create.mockResolvedValue({ id: 'm1' });
    db.tx.startup.create.mockResolvedValue(startup);
    db.prisma.$transaction.mockImplementation((fn: (t: typeof db.tx) => unknown) => fn(db.tx));
  });

  it('creates the workspace and its owner for a verified address', async () => {
    expect(await createWorkspace('a@acme.ai', startup, { name: 'Acme', websiteUrl: 'https://acme.ai' })).toEqual({ employerId: 'e1' });
    expect(db.tx.jobBoardTeamMember.create.mock.calls[0][0].data).toMatchObject({ email: 'a@acme.ai', role: 'OWNER', status: 'ACTIVE' });
    expect(db.session).toHaveBeenCalled();
  });

  it('accepts an @udyaibase.com address, since the signup code proved it (the reported failure)', async () => {
    const out = await addCompany('someone@udyaibase.com', 'Udyaibase', 'udyaibase.com');
    expect(out).toEqual({ created: { employerId: 'e1' } });
    expect(db.tx.jobBoardTeamMember.create).toHaveBeenCalled();
    expect(db.tx.startup.update.mock.calls[0][0].data.submittedBy).toBe('employer:e1');
  });

  it('saves nothing outside one transaction, so a failure can’t leave half a company behind', async () => {
    db.tx.jobBoardTeamMember.create.mockRejectedValue(new Error('boom'));
    await expect(addCompany('a@acme.ai', 'Acme', 'acme.ai')).rejects.toThrow('boom');
    expect(db.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(db.session).not.toHaveBeenCalled();
  });

  it('answers clearly when the startup already has a workspace, such as a placeholder', async () => {
    db.prisma.jobBoardEmployer.findFirst.mockResolvedValue({ id: 'placeholder' });
    expect(await createWorkspace('a@acme.ai', startup, { name: 'Acme', websiteUrl: null })).toEqual({ taken: true });
    expect(db.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('gives the same answer when two people race for one startup', async () => {
    db.prisma.$transaction.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));
    expect(await createWorkspace('a@acme.ai', startup, { name: 'Acme', websiteUrl: null })).toEqual({ taken: true });
  });

  it('gives a second company’s workspace an internal account address', async () => {
    db.prisma.jobBoardEmployer.findUnique.mockResolvedValue({ id: 'other' });
    await createWorkspace('a@acme.ai', startup, { name: 'Acme', websiteUrl: null });
    expect(db.tx.jobBoardEmployer.create.mock.calls[0][0].data.email).toContain('@workspace.udyaibase.invalid');
    expect(db.tx.jobBoardTeamMember.create.mock.calls[0][0].data.email).toBe('a@acme.ai');
  });
});
