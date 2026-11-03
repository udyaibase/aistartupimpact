import { describe, it, expect, vi, beforeEach } from 'vitest';

const zone = vi.hoisted(() => ({ records: {} as Record<string, string[][] | Error> }));
vi.mock('dns/promises', () => ({
  default: {
    resolveTxt: async (host: string) => {
      const r = zone.records[host];
      if (r instanceof Error) throw r;
      if (!r) throw Object.assign(new Error('not found'), { code: 'ENOTFOUND' });
      return r;
    },
  },
}));

import { generateVerificationToken, verifyDNS } from '@udyaibase/utils/src/verification/dns';

describe('verifyDNS (founder portal and every DNS check)', () => {
  beforeEach(() => { zone.records = {}; });

  it('finds the record at the root of the domain (@)', async () => {
    zone.records['neuralpay.in'] = [['v=spf1 include:_spf.google.com ~all'], ['udyaibase-verify=ub_abc123']];
    expect(await verifyDNS('https://www.neuralpay.in/about', 'ub_abc123')).toEqual({ verified: true });
  });

  it('still accepts the older _udyaibase-verify location during the transition', async () => {
    zone.records['_udyaibase-verify.neuralpay.in'] = [['udyaibase-verify=oldtoken']];
    expect((await verifyDNS('neuralpay.in', 'oldtoken')).verified).toBe(true);
  });

  it('joins long TXT values that arrive in chunks', async () => {
    zone.records['neuralpay.in'] = [['udyaibase-verify=', 'ub_abc123']];
    expect((await verifyDNS('neuralpay.in', 'ub_abc123')).verified).toBe(true);
  });

  it('needs the exact value: a record that only contains the token does not count', async () => {
    zone.records['neuralpay.in'] = [['something udyaibase-verify=ub_abc123 extra'], ['udyaibase-verify=ub_abc1234']];
    const r = await verifyDNS('neuralpay.in', 'ub_abc123');
    expect(r.verified).toBe(false);
    expect(r.error).toMatch(/at @/);
  });

  it('a resolver failure says to try again, not that the record is missing', async () => {
    zone.records['neuralpay.in'] = Object.assign(new Error('timeout'), { code: 'ETIMEOUT' });
    expect((await verifyDNS('neuralpay.in', 'x')).error).toMatch(/couldn't check DNS/);
  });

  it('new tokens carry the ub_ prefix', () => {
    expect(generateVerificationToken()).toMatch(/^ub_[0-9a-f]{32}$/);
  });
});
