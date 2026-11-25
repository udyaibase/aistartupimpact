import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  event: { findMany: vi.fn(), findUnique: vi.fn() },
  eventCertificate: { createMany: vi.fn(async () => ({ count: 0 })) },
  eventRegistration: { findMany: vi.fn(async () => []) },
  webUser: { findMany: vi.fn(async () => []) },
  eventOrganizer: { findUnique: vi.fn() },
}));
vi.mock('@udyaibase/database', () => ({ prisma: db }));
const allowed = vi.hoisted(() => ({ value: true }));
vi.mock('@/lib/events/plans', () => ({ effectiveHostPlan: vi.fn(() => ({ key: allowed.value ? 'PRO' : 'FREE' })), isPlatformOrganizer: vi.fn(() => false) }));

import { planLogos, fitRow } from '@/lib/events/certificate-logos';
import { certificateSettings } from '@/lib/events/after-event';
import { runScheduledCertificates } from '@/lib/events/certificates';

const base = { hasMain: true, hasPartner: true, position: 'center' as const, partnerPlacement: 'beside' as const, mainHeight: 56, partnerHeight: 56, dx: 0, dy: 0, partnerDx: 0, partnerDy: 0, full: false, plate: false };

describe('partner logo layout', () => {
  it('beside: one row, each logo at its own height', () => {
    const p = planLogos({ ...base, partnerHeight: 30 });
    expect(p.row?.items).toEqual(['main', 'partner']);
    expect(p.row?.place.heights).toEqual([56, 30]);
    expect(p.solo).toBeNull();
    expect(p.centred).toBe(true);
  });

  it('on its own spot: separate place, size and nudges, capped in a corner', () => {
    const p = planLogos({ ...base, partnerPlacement: 'right', partnerHeight: 74, partnerDx: -10, partnerDy: 4 });
    expect(p.row?.items).toEqual(['main']);
    expect(p.solo?.place).toMatchObject({ position: 'right', heights: [56], dx: -10, dy: 4 });
  });

  it('same spot as the host logo means beside it', () => {
    const p = planLogos({ ...base, position: 'left', partnerPlacement: 'left' });
    expect(p.row?.items).toEqual(['main', 'partner']);
    expect(p.solo).toBeNull();
  });

  it('without a host logo the partner takes its place with its own nudges', () => {
    const p = planLogos({ ...base, hasMain: false, partnerPlacement: 'right', partnerDx: 8 });
    expect(p.row?.items).toEqual(['partner']);
    expect(p.row?.place.dx).toBe(8);
    expect(p.solo).toBeNull();
  });

  it('keeps the old sizes when nothing new is set (centred, full page gives 16 pt back)', () => {
    expect(planLogos({ ...base, full: true }).row?.place.heights).toEqual([40, 40]);
    expect(planLogos({ ...base, position: 'left', mainHeight: 74, partnerHeight: 74 }).row?.place.heights).toEqual([56, 56]);
  });

  it('fits each picture into its own height', () => {
    const r = fitRow([2, 1], { maxWidth: 170, heights: [40, 20] });
    expect(r.sized).toEqual([{ width: 80, height: 40 }, { width: 20, height: 20 }]);
    expect(r.height).toBe(40);
  });
});

describe('certificate settings', () => {
  it('defaults: partner beside, same size, not scheduled', () => {
    expect(certificateSettings({})).toMatchObject({ partnerLogoPlacement: 'beside', partnerLogoHeight: null, partnerLogoOffsetX: 0, partnerLogoOffsetY: 0, issueWhenEnded: false });
  });
  it('cleans partner values', () => {
    expect(certificateSettings({ partnerLogoPlacement: 'top', partnerLogoHeight: 500, partnerLogoOffsetX: -999, issueWhenEnded: true }))
      .toMatchObject({ partnerLogoPlacement: 'beside', partnerLogoHeight: 74, partnerLogoOffsetX: -140, issueWhenEnded: true });
  });
});

describe('scheduled certificates', () => {
  beforeEach(() => { vi.clearAllMocks(); allowed.value = true; db.eventOrganizer.findUnique.mockResolvedValue({ plan: 'PRO', planExpiresAt: null, email: 'host@example.com' }); });

  it('looks only at events that ended in the last 6 hours with the schedule on', async () => {
    db.event.findMany.mockResolvedValue([]);
    const now = new Date('2026-11-25T12:00:00Z');
    await runScheduledCertificates(now);
    const where = db.event.findMany.mock.calls[0][0].where;
    expect(where.endAt).toEqual({ lte: now, gte: new Date('2026-11-25T06:00:00Z') });
    expect(where.certificateSettings).toEqual({ path: ['issueWhenEnded'], equals: true });
  });

  it('issues for allowed events and skips locked ones', async () => {
    db.event.findMany.mockResolvedValue([{ id: 'e1', organizerId: 'o1', certificatesPaidAt: null }]);
    db.event.findUnique.mockResolvedValue({ certificateSettings: { audience: 'REGISTERED' } });
    db.eventRegistration.findMany.mockResolvedValue([{ id: 'r1', userId: null, guestName: 'Asha', guestEmail: 'a@x.com', checkedInAt: null, hostEmailsOptOutAt: null, certificate: null }] as never);
    expect(await runScheduledCertificates()).toEqual({ events: 1, issued: 1 });
    expect(db.eventCertificate.createMany).toHaveBeenCalledTimes(1);

    vi.clearAllMocks();
    allowed.value = false;
    db.eventOrganizer.findUnique.mockResolvedValue({ plan: 'FREE', planExpiresAt: null, email: 'host@example.com' });
    db.event.findMany.mockResolvedValue([{ id: 'e1', organizerId: 'o1', certificatesPaidAt: null }]);
    expect(await runScheduledCertificates()).toEqual({ events: 1, issued: 0 });
    expect(db.eventCertificate.createMany).not.toHaveBeenCalled();
  });
});
