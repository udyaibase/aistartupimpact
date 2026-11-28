import { describe, expect, it, vi } from 'vitest';
vi.mock('@udyaibase/database', () => ({ prisma: {} }));
import { buildSystemChecks } from '@/lib/monitoring/systems';

const now = new Date('2026-11-27T06:00:00Z');
const healthy = { dbMs: 40, web: { reachable: true, invoicesOn: true }, lastPaidAt: new Date(now.getTime() - 3 * 36e5), failed7d: 0, uninvoiced: 0, uncredited: 0, payoutsSlow: 0, payoutsNeedDetails: 0, payoutsBlocked: 0, now };
const by = (checks: ReturnType<typeof buildSystemChecks>, key: string) => checks.find((c) => c.key === key)!;

describe('money-path health checks', () => {
  it('reports nothing wrong when everything works', () => {
    expect(buildSystemChecks(healthy).filter((c) => c.ok === false)).toEqual([]);
  });

  it('flags a database that is slow or silent', () => {
    expect(by(buildSystemChecks({ ...healthy, dbMs: 2500 }), 'db').ok).toBe(false);
    expect(by(buildSystemChecks({ ...healthy, dbMs: null }), 'db').ok).toBe(false);
  });

  it('flags invoices being off, and says unknown when the website cannot be asked', () => {
    expect(by(buildSystemChecks({ ...healthy, web: { reachable: true, invoicesOn: false } }), 'invoices-on').ok).toBe(false);
    const down = buildSystemChecks({ ...healthy, web: { reachable: false, invoicesOn: null } });
    expect(by(down, 'web').ok).toBe(false);
    expect(by(down, 'invoices-on').ok).toBeNull();
  });

  it('flags paid payments without an invoice and refunds without a credit note', () => {
    const c = buildSystemChecks({ ...healthy, uninvoiced: 2, uncredited: 1 });
    expect(by(c, 'uninvoiced')).toMatchObject({ ok: false });
    expect(by(c, 'uninvoiced').detail).toContain('2 payments');
    expect(by(c, 'uncredited').detail).toContain('1 refund ');
  });

  it('treats failed payments as information, not an outage', () => {
    expect(by(buildSystemChecks({ ...healthy, failed7d: 3 }), 'failed').ok).toBeNull();
  });

  it('flags stuck host payouts and says which kind', () => {
    const c = by(buildSystemChecks({ ...healthy, payoutsSlow: 1, payoutsBlocked: 2 }), 'payouts');
    expect(c.ok).toBe(false);
    expect(c.detail).toContain('1 review waiting');
    expect(c.detail).toContain('2 hosts with paid tickets');
  });
});
