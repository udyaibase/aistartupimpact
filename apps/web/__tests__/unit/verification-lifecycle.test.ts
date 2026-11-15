import { describe, it, expect, vi, beforeEach } from 'vitest';

const { startup, vlog, founderUser, employer } = vi.hoisted(() => ({
  employer: { updateMany: vi.fn() },
  startup: { findMany: vi.fn(), update: vi.fn() },
  vlog: { findFirst: vi.fn(), create: vi.fn() },
  founderUser: { findUnique: vi.fn() },
}));
vi.mock('@udyaibase/database', () => ({ prisma: { startup, startupVerificationLog: vlog, founderUser, jobBoardEmployer: employer } }));
const verifyDNS = vi.fn();
vi.mock('@udyaibase/utils/src/verification/dns', () => ({ verifyDNS: (...a: unknown[]) => verifyDNS(...a) }));
const sendEmail = vi.fn(async () => ({ success: true }));
vi.mock('@/lib/email/send', () => ({ sendEmail: (...a: unknown[]) => sendEmail(...(a as [])) }));
vi.mock('@/lib/founder/refresh-listing', () => ({ refreshPublicListing: vi.fn(async () => {}) }));
vi.mock('@/lib/startups/claim', () => ({ claimToken: () => 'ub_token' }));
vi.mock('@/lib/startups/ownership', () => ({ VERIFICATION_VALID_DAYS: 365 }));

import { runVerificationLifecycle } from '@/lib/startups/verification-lifecycle';

const DAY = 86_400_000;
const now = new Date('2026-11-14T00:00:00Z');

/** findMany is called in order: legacy, DNS due, expiring soon, expired. */
function queue(legacy: unknown[], dns: unknown[], soon: unknown[], expired: unknown[]) {
  startup.findMany.mockReset();
  startup.findMany.mockResolvedValueOnce(legacy).mockResolvedValueOnce(dns).mockResolvedValueOnce(soon).mockResolvedValueOnce(expired);
}

beforeEach(() => {
  startup.update.mockReset(); vlog.findFirst.mockReset(); vlog.create.mockReset(); verifyDNS.mockReset(); sendEmail.mockClear();
  founderUser.findUnique.mockResolvedValue({ email: 'owner@acme.ai', name: 'Priya' });
});

describe('runVerificationLifecycle', () => {
  it('gives startups verified before expiry existed a 90-day grace period', async () => {
    queue([{ id: 's1', verifiedAt: new Date('2025-01-01') }], [], [], []);
    vlog.findFirst.mockResolvedValue({ method: 'DNS' });
    const r = await runVerificationLifecycle(now);
    expect(r.backfilled).toBe(1);
    const data = startup.update.mock.calls[0][0].data;
    expect(data.verificationMethod).toBe('DNS');
    expect(data.verificationExpiresAt.getTime()).toBe(now.getTime() + 90 * DAY);
  });

  it('renews a DNS verification for a year while the record is still there', async () => {
    queue([], [{ id: 's1', ownerId: 'f1', verifiedDomain: 'acme.ai', verificationToken: 'ub_token' }], [], []);
    verifyDNS.mockResolvedValue({ verified: true });
    const r = await runVerificationLifecycle(now);
    expect(r).toMatchObject({ rechecked: 1, renewed: 1 });
    expect(verifyDNS).toHaveBeenCalledWith('acme.ai', 'ub_token');
    expect(startup.update.mock.calls[0][0].data.verificationExpiresAt.getTime()).toBe(now.getTime() + 365 * DAY);
  });

  it('one missed DNS check changes nothing but the counter', async () => {
    const far = new Date(now.getTime() + 300 * DAY);
    queue([], [{ id: 's1', ownerId: 'f1', verifiedDomain: 'acme.ai', verificationToken: 'ub_token', verificationDnsMisses: 0, verificationExpiresAt: far }], [], []);
    verifyDNS.mockResolvedValue({ verified: false });
    const r = await runVerificationLifecycle(now);
    expect(r.renewed).toBe(0);
    expect(startup.update.mock.calls[0][0].data).toEqual({ verificationCheckedAt: now, verificationDnsMisses: 1 });
    expect(vlog.create).not.toHaveBeenCalled();
  });

  it('three misses in a row: the record is treated as gone and the verification ends within 30 days', async () => {
    const far = new Date(now.getTime() + 300 * DAY);
    queue([], [{ id: 's1', ownerId: 'f1', verifiedDomain: 'acme.ai', verificationToken: 'ub_token', verificationDnsMisses: 2, verificationExpiresAt: far }], [], []);
    verifyDNS.mockResolvedValue({ verified: false });
    await runVerificationLifecycle(now);
    const data = startup.update.mock.calls[0][0].data;
    expect(data.verificationDnsMisses).toBe(3);
    expect(data.verificationExpiresAt.getTime()).toBe(now.getTime() + 30 * DAY);
    expect(vlog.create.mock.calls[0][0].data.action).toBe('DNS_RECORD_GONE');
  });

  it('a resolver failure is not counted as a miss', async () => {
    queue([], [{ id: 's1', ownerId: 'f1', verifiedDomain: 'acme.ai', verificationToken: 'ub_token', verificationDnsMisses: 2, verificationExpiresAt: new Date(now.getTime() + 300 * DAY) }], [], []);
    verifyDNS.mockResolvedValue({ verified: false, lookupFailed: true });
    await runVerificationLifecycle(now);
    expect(startup.update.mock.calls[0][0].data).toEqual({ verificationCheckedAt: now });
  });

  it('stops DNS checks when the time budget runs out', async () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({ id: `s${i}`, ownerId: 'f1', verifiedDomain: 'acme.ai', verificationToken: 't', verificationDnsMisses: 0, verificationExpiresAt: null }));
    queue([], rows, [], []);
    verifyDNS.mockResolvedValue({ verified: true });
    const r = await runVerificationLifecycle(now, -1);
    expect(r.rechecked).toBe(0);
  });

  it('reminds the owner 30 days out, then again in the last week, not every day', async () => {
    const base = { id: 's1', name: 'Acme', slug: 'acme', ownerId: 'f1', verificationMethod: 'EMAIL', verifiedDomain: 'acme.ai' };
    queue([], [], [{ ...base, verifiedEmail: 'priya@acme.ai', verificationExpiresAt: new Date(now.getTime() + 20 * DAY), verificationRemindedAt: null }], []);
    founderUser.findUnique.mockResolvedValue({ email: 'priya@gmail.com', name: 'Priya' });
    expect((await runVerificationLifecycle(now)).reminded).toBe(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    // Account email gets it, the work email used to verify is copied, and the button opens the send-code step.
    const mail = (sendEmail.mock.calls[0] as unknown as [{ to: string; cc?: string[]; html: string }])[0];
    expect(mail.to).toBe('priya@gmail.com');
    expect(mail.cc).toEqual(['priya@acme.ai']);
    expect(mail.html).toContain('/founder/claim/s1?method=email');

    queue([], [], [{ ...base, verificationExpiresAt: new Date(now.getTime() + 20 * DAY), verificationRemindedAt: new Date(now.getTime() - 5 * DAY) }], []);
    expect((await runVerificationLifecycle(now)).reminded).toBe(0);

    queue([], [], [{ ...base, verificationExpiresAt: new Date(now.getTime() + 5 * DAY), verificationRemindedAt: new Date(now.getTime() - 20 * DAY) }], []);
    expect((await runVerificationLifecycle(now)).reminded).toBe(1);
  });

  it('removes the tick when it lapses, keeps the owner, and tells them', async () => {
    queue([], [], [], [{ id: 's1', name: 'Acme', ownerId: 'f1', verificationMethod: 'EMAIL' }]);
    const r = await runVerificationLifecycle(now);
    expect(r.lapsed).toBe(1);
    expect(startup.update.mock.calls[0][0].data).toEqual({ isVerified: false, claimStatus: 'CLAIMED' });
    expect(vlog.create.mock.calls[0][0].data.action).toBe('VERIFICATION_LAPSED');
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });
});
