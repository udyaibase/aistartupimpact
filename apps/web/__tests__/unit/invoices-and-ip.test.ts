import { describe, it, expect, vi, afterEach } from 'vitest';
vi.mock('@udyaibase/database', () => ({ prisma: {} }));
import { amountInWords, financialYear } from '@/lib/billing/invoice';
import { clientIp, isCloudflareIp } from '@/lib/client-ip';

describe('GST invoices', () => {
  it('writes amounts in Indian words', () => {
    expect(amountInWords(590000)).toBe('Five Thousand Nine Hundred Rupees Only');
    expect(amountInWords(235882)).toBe('Two Thousand Three Hundred Fifty Eight Rupees and Eighty Two Paise Only');
    expect(amountInWords(1770000000)).toBe('One Crore Seventy Seven Lakh Rupees Only');
  });
  it('financial year runs April to March in IST', () => {
    expect(financialYear(new Date('2027-03-31T12:00:00Z'))).toBe('2026-27');
    expect(financialYear(new Date('2027-03-31T19:00:00Z'))).toBe('2027-28'); // already 1 April in IST
  });
});

describe('client IP (spoof-resistant)', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('knows Cloudflare ranges', () => {
    expect(isCloudflareIp('104.16.1.1')).toBe(true);
    expect(isCloudflareIp('2606:4700::1')).toBe(true);
    expect(isCloudflareIp('49.36.1.1')).toBe(false);
  });
  it('on Vercel, a forged cf-connecting-ip is ignored', () => {
    vi.stubEnv('VERCEL', '1');
    expect(clientIp(new Request('http://x', { headers: { 'cf-connecting-ip': '1.2.3.4', 'x-real-ip': '49.36.1.1' } }))).toBe('49.36.1.1');
  });
});

describe('invoice numbering and tax split', () => {
  it('numbers invoices and credit notes per financial year with 4+ digits', async () => {
    const { formatInvoiceNumber } = await import('@/lib/billing/invoice');
    expect(formatInvoiceNumber('UTPL', 'INV', '2026-27', 1)).toBe('UTPL/INV/2026-27/0001');
    expect(formatInvoiceNumber('UTPL', 'CN', '2026-27', 12345)).toBe('UTPL/CN/2026-27/12345');
  });
  it('splits GST into CGST + SGST within the seller state, IGST otherwise (paise never lost)', async () => {
    const { taxSplit } = await import('@/lib/billing/invoice');
    expect(taxSplit(90001, '37', '37')).toEqual({ intra: true, cgst: 45000, sgst: 45001, igst: 0 });
    expect(taxSplit(90000, '27', '37')).toEqual({ intra: false, cgst: 0, sgst: 0, igst: 90000 });
  });
});

describe('credit note amounts', () => {
  it('splits a GST-inclusive refund like the original payment, never losing a paisa', async () => {
    const { refundSplit } = await import('@/lib/billing/invoice');
    expect(refundSplit(295000, { amountPaise: 500000, totalPaise: 590000 })).toEqual({ amountPaise: 250000, gstPaise: 45000, totalPaise: 295000 });
    const odd = refundSplit(100001, { amountPaise: 199900, totalPaise: 235882 });
    expect(odd.amountPaise + odd.gstPaise).toBe(100001);
  });
});
