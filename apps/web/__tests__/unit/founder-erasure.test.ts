import { describe, it, expect, vi, beforeEach } from 'vitest';

const tx = vi.hoisted(() => {
  const model = () => ({
    findMany: vi.fn().mockResolvedValue([]),
    updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    count: vi.fn().mockResolvedValue(0),
    update: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
  });
  return {
    startup: model(), aiTool: model(), article: model(), newsletterSubscriber: model(), founderTeamMember: model(),
    emailLog: model(), supportTicket: model(), advPayment: model(), founderNotification: model(), founderSession: model(),
    startupVerificationLog: model(), founderUser: model(), eventOrganizer: model(), webUser: model(), unifiedUser: model(),
    jobBoardEmployer: model(), jobBoardListing: model(), listingVersion: model(), listingPendingEdit: model(), accountTwoFactor: model(),
  };
});

vi.mock('../../../../packages/database/index', () => ({
  prisma: {
    founderUser: { findUnique: vi.fn().mockResolvedValue({ id: 'f1', email: 'Founder@Acme.ai', avatar: 'https://media.test/me.png' }) },
    webUser: { findUnique: vi.fn().mockResolvedValue({ avatar: 'https://media.test/web.png' }) },
    unifiedUser: { findUnique: vi.fn().mockResolvedValue(null) },
    $transaction: (fn: (t: typeof tx) => Promise<void>) => fn(tx),
  },
}));

import { eraseFounderRecords } from '../../../../packages/database/founder-erasure';

describe('eraseFounderRecords', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tx.startup.findMany.mockResolvedValue([]);
    tx.aiTool.findMany.mockResolvedValue([]);
    tx.advPayment.count.mockResolvedValue(0);
    tx.eventOrganizer.count.mockResolvedValue(0);
  });

  it('releases a claimed directory listing, instead of deleting it', async () => {
    tx.startup.findMany.mockResolvedValue([{ id: 'seeded', submittedBy: null }, { id: 'mine', submittedBy: 'FOUNDER' }]);
    await eraseFounderRecords('f1');

    const release = tx.startup.updateMany.mock.calls[0][0];
    expect(release.where.id.in).toEqual(['seeded']);
    expect(release.data).toMatchObject({ ownerId: null, claimedBy: null, isVerified: false, claimStatus: 'UNCLAIMED' });
    // Released first, so this only removes what they submitted themselves.
    expect(tx.startup.updateMany.mock.invocationCallOrder[0]).toBeLessThan(tx.startup.deleteMany.mock.invocationCallOrder[0]);
    expect(tx.startup.deleteMany).toHaveBeenCalledWith({ where: { ownerId: 'f1' } });
  });

  it('deletes the record when there are no paid invoices', async () => {
    await eraseFounderRecords('f1');
    expect(tx.founderUser.delete).toHaveBeenCalledWith({ where: { id: 'f1' } });
    expect(tx.founderUser.update).not.toHaveBeenCalled();
  });

  it('keeps paid invoices, on a record blanked of personal data', async () => {
    tx.advPayment.count.mockResolvedValue(2);
    await eraseFounderRecords('f1');
    expect(tx.founderUser.delete).not.toHaveBeenCalled();
    const { data } = tx.founderUser.update.mock.calls[0][0];
    expect(data.email).toBe('deleted-f1@deleted.invalid');
    expect(data).toMatchObject({ name: 'Deleted founder', phone: null, passwordHash: null, twoFactorSecret: null, googleId: null });
    expect(data.deletedAt).toBeInstanceOf(Date);
  });

  it('removes the sign-in identity, matching the email in lowercase', async () => {
    await eraseFounderRecords('f1');
    expect(tx.webUser.deleteMany).toHaveBeenCalledWith({ where: { email: 'founder@acme.ai' } });
    expect(tx.unifiedUser.deleteMany).toHaveBeenCalledWith({ where: { email: 'founder@acme.ai' } });
  });

  it('keeps the sign-in identity of someone who still hosts events', async () => {
    tx.eventOrganizer.count.mockResolvedValue(1);
    await eraseFounderRecords('f1');
    expect(tx.webUser.deleteMany).not.toHaveBeenCalled();
    expect(tx.unifiedUser.deleteMany).not.toHaveBeenCalled();
  });

  it('removes photos and own listings’ media, but not a released listing’s logo', async () => {
    tx.startup.findMany.mockResolvedValue([
      { id: 'seeded', submittedBy: null, logoUrl: 'https://media.test/seeded.png', foundersData: [{ name: 'A', avatar: 'https://media.test/me.png' }] },
      { id: 'mine', submittedBy: 'FOUNDER', logoUrl: 'https://media.test/mine.png', foundersData: null },
    ]);
    tx.aiTool.findMany.mockResolvedValue([{ id: 't', submittedBy: 'f1', logoUrl: 'https://media.test/t.png', screenshotUrls: ['https://media.test/s.png'] }]);
    const urls = (await eraseFounderRecords('f1'))!.mediaUrls;
    expect(urls).toEqual(expect.arrayContaining(['https://media.test/me.png', 'https://media.test/web.png', 'https://media.test/mine.png', 'https://media.test/t.png', 'https://media.test/s.png']));
    expect(urls).not.toContain('https://media.test/seeded.png');
    // The listing that stays public stops showing their photo.
    expect(tx.startup.update).toHaveBeenCalledWith({ where: { id: 'seeded' }, data: { foundersData: [{ name: 'A', avatar: '' }] } });
  });

});
