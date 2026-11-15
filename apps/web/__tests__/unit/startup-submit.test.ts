import { describe, it, expect, vi, beforeEach } from 'vitest';

const queryRaw = vi.fn();
const executeRaw = vi.fn();
const founderFind = vi.fn();
const tx = { $queryRaw: (...a: unknown[]) => queryRaw(...a), $executeRaw: (...a: unknown[]) => executeRaw(...a) };
vi.mock('@udyaibase/database', () => ({
  prisma: {
    $queryRaw: (...a: unknown[]) => queryRaw(...a),
    $executeRaw: (...a: unknown[]) => executeRaw(...a),
    $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
    founderUser: { findUnique: (...a: unknown[]) => founderFind(...a) },
  },
  readListingFields: vi.fn(),
  saveListingEdit: vi.fn(),
}));
vi.mock('@/lib/founder-auth', () => ({ requireFounderAuth: async () => ({ userId: 'f1', name: 'Priya' }) }));
vi.mock('@/lib/founder/limits', () => ({ founderAtStartupLimit: async () => false, STARTUP_LIMIT_MESSAGE: 'limit' }));
vi.mock('@/lib/founder-email', () => ({ sendAdminReviewAlert: vi.fn(), sendSubmissionReceivedEmail: vi.fn(async () => {}) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/founder/activity', () => ({ logFounderActivity: vi.fn(async () => {}) }));
vi.mock('@/lib/founder/refresh-listing', () => ({ refreshPublicListing: vi.fn(async () => {}) }));
vi.mock('@/lib/locations', () => ({ checkLocation: async () => ({ ok: true, city: null }) }));
vi.mock('@/lib/impact-score', () => ({ calculateImpactScore: () => ({ total: 10 }) }));
const markStartupVerified = vi.fn(async () => {});
vi.mock('@/lib/startups/ownership', () => ({ markStartupVerified: (...a: unknown[]) => markStartupVerified(...(a as [])) }));
const confirmed = vi.fn(async () => true);
vi.mock('@/lib/startups/contact-email', async (orig) => ({
  ...(await orig<typeof import('@/lib/startups/contact-email')>()),
  contactEmailConfirmed: (...a: unknown[]) => confirmed(...(a as [])),
}));

import { submitStartupAction } from '@/app/founder/startups/actions';

const base = {
  name: 'Acme AI', tagline: 'AI for x', description: 'What it does', websiteUrl: 'https://acme.ai',
  foundedYear: 2024, founders: ['Priya'], stage: 'SEED', contactEmail: 'priya@gmail.com', contactEmailProof: 'p',
};
const text = (call: unknown[]) => (call[0] as string[]).join('?');

beforeEach(() => {
  queryRaw.mockReset(); executeRaw.mockReset(); founderFind.mockReset(); markStartupVerified.mockClear();
  confirmed.mockReset(); confirmed.mockResolvedValue(true);
  executeRaw.mockResolvedValue(1);
  founderFind.mockResolvedValue({ email: 'priya@gmail.com', companyEmail: null });
});

/** Route each raw query by what it asks for. */
function db({ listed = [] as unknown[], sameName = [] as unknown[] } = {}) {
  queryRaw.mockImplementation(async (strings: string[]) => {
    const q = strings.join('?');
    if (q.includes('SELECT id FROM "Startup" WHERE slug')) return [];
    if (q.includes('"verifiedDomain" =')) return listed;
    if (q.includes('LOWER(name) = LOWER(')) return sameName;
    if (q.includes('INSERT INTO "Startup"')) return [{ id: 'new-1' }];
    if (q.includes('FROM "FounderUser"')) return [{ email: 'priya@gmail.com', name: 'Priya' }];
    return [];
  });
}

describe('submitStartupAction', () => {
  it('refuses an unconfirmed contact email before touching the database', async () => {
    confirmed.mockResolvedValue(false);
    db();
    const r = await submitStartupAction(base as never);
    expect(r.success).toBe(false);
    expect(queryRaw.mock.calls.some((c) => text(c).includes('INSERT INTO "Startup"'))).toBe(false);
  });

  it('creates the startup under a per-founder lock and saves the private contact email', async () => {
    db();
    const r = await submitStartupAction(base as never);
    expect(r).toMatchObject({ success: true, startupId: 'new-1', verified: false });
    expect(text(executeRaw.mock.calls[0])).toContain('pg_advisory_xact_lock');
    expect(executeRaw.mock.calls.some((c) => text(c).includes('"contactEmail" ='))).toBe(true);
    expect(markStartupVerified).not.toHaveBeenCalled();
  });

  it('a repeat submit moments later returns the first startup instead of a second one', async () => {
    db({ listed: [{ id: 'new-1', name: 'Acme AI', slug: 'acme-ai', ownerId: 'f1', isVerified: false, createdAt: new Date(), websiteUrl: 'https://acme.ai', verifiedDomain: null }] });
    const r = await submitStartupAction(base as never);
    expect(r).toMatchObject({ success: true, startupId: 'new-1', repeated: true });
    expect(queryRaw.mock.calls.some((c) => text(c).includes('INSERT INTO "Startup"'))).toBe(false);
  });

  it('refuses a startup someone else already listed, pointing to claim', async () => {
    db({ listed: [{ id: 'old-9', name: 'Acme', slug: 'acme', ownerId: null, isVerified: false, createdAt: new Date('2025-01-01'), websiteUrl: 'https://www.acme.ai/', verifiedDomain: null }] });
    const r = await submitStartupAction(base as never);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.duplicate).toMatchObject({ id: 'old-9' });
    expect(queryRaw.mock.calls.some((c) => text(c).includes('INSERT INTO "Startup"'))).toBe(false);
  });

  it('a contact email on the website’s domain verifies the startup straight away', async () => {
    db();
    const r = await submitStartupAction({ ...base, contactEmail: 'priya@acme.ai' } as never);
    expect(r).toMatchObject({ success: true, verified: true });
    expect(markStartupVerified).toHaveBeenCalledWith(expect.anything(), 'new-1', 'acme.ai', 'f1', { method: 'EMAIL', email: 'priya@acme.ai' });
  });

  it('a contact email on a shared hosting domain does not verify anything', async () => {
    db();
    const r = await submitStartupAction({ ...base, websiteUrl: 'https://acme.vercel.app', contactEmail: 'someone@vercel.app' } as never); // hosting suffix
    expect(r).toMatchObject({ success: true, verified: false });
    expect(markStartupVerified).not.toHaveBeenCalled();
  });

  it('offers the founder’s own email on the domain first on the verify screen', async () => {
    db();
    founderFind.mockResolvedValue({ email: 'priya@gmail.com', companyEmail: 'priya@acme.ai' });
    const r = await submitStartupAction(base as never);
    expect(r).toMatchObject({ success: true, verified: false, workEmailHint: 'priya@acme.ai' });
  });
});
