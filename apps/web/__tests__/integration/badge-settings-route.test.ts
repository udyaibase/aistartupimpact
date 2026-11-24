import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const update = vi.fn(async (_a: unknown) => ({}));
let plan = 'FREE';
vi.mock('@/lib/events/after-event-access', () => ({
  afterEventAccess: vi.fn(async () => ({ session: { id: 'person-1', organizerId: 'org-1' }, event: { id: 'ev1' } })),
}));
vi.mock('@/lib/organizer-auth/write-limit', () => ({ hostWriteLimit: vi.fn(async () => null) }));
vi.mock('@udyaibase/database', () => ({
  prisma: {
    event: {
      update: (a: unknown) => update(a),
      findUnique: vi.fn(async () => ({
        badgeSettings: null,
        organizer: { plan, planExpiresAt: new Date(Date.now() + 86_400_000), email: 'host@club.in', avatar: null },
        ticketTiers: [{ id: 't1', name: 'Speaker' }],
        customQuestions: [{ id: 'q1', questionText: 'T-shirt size' }],
        sponsors: [],
      })),
    },
  },
}));

const put = async (body: unknown) => {
  const { PUT } = await import('@/app/api/organizer/events/[eventId]/badges/settings/route');
  return PUT(new NextRequest('http://localhost/api/organizer/events/ev1/badges/settings', { method: 'PUT', body: JSON.stringify(body) }), { params: Promise.resolve({ eventId: 'ev1' }) });
};

describe('saving a badge design', () => {
  beforeEach(() => { update.mockClear(); vi.resetModules(); });

  it('Free host: templates and colour save', async () => {
    plan = 'FREE';
    const res = await put({ template: 'bold', accent: '#16A34A', showLogo: true });
    expect(res.status).toBe(200);
    expect((update.mock.calls[0] as any)[0].data.badgeSettings).toMatchObject({ template: 'bold', accent: '#16A34A' });
  });

  it('Free host: Pro options are refused with 402, nothing saved', async () => {
    plan = 'FREE';
    const res = await put({ template: 'bold', tierColors: { t1: '#DC2626' } });
    expect(res.status).toBe(402);
    expect((await res.json()).code).toBe('pro_required');
    expect(update).not.toHaveBeenCalled();
  });

  it('Pro host: options save, keeping only this event’s ticket types and questions', async () => {
    plan = 'PRO';
    const res = await put({ template: 'conference', tierColors: { t1: '#DC2626', other: '#000000' }, questionIds: ['q1', 'someone-elses'] });
    expect(res.status).toBe(200);
    const saved = (update.mock.calls[0] as any)[0].data.badgeSettings;
    expect(saved.tierColors).toEqual({ t1: '#DC2626' });
    expect(saved.questionIds).toEqual(['q1']);
  });

  const DESIGN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 298 420"><rect width="298" height="420" fill="#111"/><text x="149" y="170" text-anchor="middle">{{name}}</text><rect id="qr" x="94" y="250" width="110" height="110"/><script>alert(1)</script></svg>';

  it('Pro host: an own design is stored cleaned and used', async () => {
    plan = 'PRO';
    const res = await put({ template: 'custom', customSvg: DESIGN });
    expect(res.status).toBe(200);
    const saved = (update.mock.calls[0] as any)[0].data.badgeSettings;
    expect(saved.template).toBe('custom');
    expect(saved.customSvg).toContain('{{name}}');
    expect(saved.customSvg).not.toContain('script');
  });

  it('Pro host: a design without {{name}} is refused with the reason', async () => {
    plan = 'PRO';
    const res = await put({ template: 'custom', customSvg: '<svg viewBox="0 0 10 10"><text>hi</text></svg>' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/\{\{name\}\}/);
    expect(update).not.toHaveBeenCalled();
  });

  it('Free host: an own design is a Pro feature', async () => {
    plan = 'FREE';
    const res = await put({ template: 'custom', customSvg: DESIGN });
    expect(res.status).toBe(402);
    expect(update).not.toHaveBeenCalled();
  });

  it('Every host: QR position saves', async () => {
    plan = 'FREE';
    const res = await put({ template: 'classic', qrPosition: 'left' });
    expect(res.status).toBe(200);
    expect((update.mock.calls[0] as any)[0].data.badgeSettings.qrPosition).toBe('left');
  });
});

