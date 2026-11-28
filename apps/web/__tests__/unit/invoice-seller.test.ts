import { describe, expect, it, vi } from 'vitest';
vi.mock('@udyaibase/database', () => ({ prisma: {} }));
import { freezeSeller, frozenSellerOf, sacFor, sanitizeInvoiceSettings, sellerFrom } from '@/lib/billing/seller';
import { buildSampleInvoicePdf } from '@/lib/billing/invoice';

const ENV = { INVOICE_SELLER_NAME: 'Env Tech Pvt Ltd', INVOICE_SELLER_GSTIN: '29ABCDE1234F1Z5', INVOICE_SELLER_ADDRESS: '1 Env Road, Bengaluru 560001', INVOICE_SAC: '9983', INVOICE_PREFIX: 'utpl' };

describe('invoice seller settings', () => {
  it('uses the server settings while nothing is saved', () => {
    const s = sellerFrom({}, ENV)!;
    expect(s).toMatchObject({ name: 'Env Tech Pvt Ltd', gstin: '29ABCDE1234F1Z5', sac: '9983', stateCode: '29', pan: 'ABCDE1234F', prefix: 'UTPL', footerNote: null });
  });

  it('lets a saved field replace its server setting, one field at a time', () => {
    const s = sellerFrom({ sellerName: 'Saved Name Pvt Ltd', sac: '998314' }, ENV)!;
    expect(s.name).toBe('Saved Name Pvt Ltd');
    expect(s.sac).toBe('998314');
    expect(s.address).toBe(ENV.INVOICE_SELLER_ADDRESS);
  });

  it('is off (null) until name, GSTIN, address and a SAC code all exist', () => {
    expect(sellerFrom({}, {})).toBeNull();
    expect(sellerFrom({ sellerName: 'A', gstin: '29ABCDE1234F1Z5', address: 'B' }, {})).toBeNull();
    expect(sellerFrom({ sellerName: 'A', gstin: '29ABCDE1234F1Z5', address: 'B', sac: '9983' }, {})).not.toBeNull();
  });

  it('never changes the invoice number prefix from saved settings', () => {
    expect(sellerFrom({ prefix: 'HACK' } as never, ENV)!.prefix).toBe('UTPL');
  });

  it('keeps the prefix to 4 characters so numbers fit GST’s 16-character limit', () => {
    expect(sellerFrom({}, { ...ENV, INVOICE_PREFIX: 'udyaibase-tech' })!.prefix).toBe('UDYA');
  });

  it('uses a product’s own SAC code, and the default where it has none', () => {
    const s = sellerFrom({ sacOrganizer: '998596' }, ENV)!;
    expect(sacFor(s, 'organizer')).toBe('998596');
    expect(sacFor(s, 'employer')).toBe('9983');
  });

  it('drops malformed stored values instead of printing them', () => {
    expect(sanitizeInvoiceSettings({ gstin: 'NOPE', sac: '12', sacFunding: '99831', email: 'x', sellerName: ' Fine Ltd ' })).toEqual({ sellerName: 'Fine Ltd' });
    // A bad saved GSTIN must not switch invoices off: the server setting still applies.
    expect(sellerFrom({ gstin: 'NOPE' }, ENV)!.gstin).toBe('29ABCDE1234F1Z5');
  });

  it('carries phone and website, with the site address as the default website', () => {
    expect(sellerFrom({}, ENV)).toMatchObject({ phone: null, website: 'udyaibase.com' });
    const s = sellerFrom({ phone: '+91 98765 43210', website: 'https://www.udyaibase.com/about' }, ENV)!;
    expect(s).toMatchObject({ phone: '+91 98765 43210', website: 'www.udyaibase.com' });
    expect(freezeSeller(s, 'employer')).toMatchObject({ phone: '+91 98765 43210', website: 'www.udyaibase.com' });
    expect(sanitizeInvoiceSettings({ phone: 'call us', website: 'not a site' })).toEqual({});
  });

  it('freezes the seller with the SAC of the product sold, and reads it back from an invoice', () => {
    const s = sellerFrom({ sacFunding: '998431', footerNote: 'Subject to Bengaluru jurisdiction.' }, ENV)!;
    const frozen = freezeSeller(s, 'funding');
    expect(frozen).toMatchObject({ sac: '998431', footerNote: 'Subject to Bengaluru jurisdiction.' });
    expect(frozenSellerOf({ billingName: 'Buyer', seller: frozen })).toEqual(frozen);
  });

  it('reports no frozen seller for an invoice issued before freezing existed', () => {
    expect(frozenSellerOf({ billingName: 'Buyer' })).toBeNull();
    expect(frozenSellerOf(null)).toBeNull();
    expect(frozenSellerOf({ seller: { name: 'Only a name' } })).toBeNull();
  });

  it('builds a sample invoice PDF from draft settings', async () => {
    const s = sellerFrom({ footerNote: 'Subject to Bengaluru jurisdiction.' }, ENV)!;
    const pdf = await buildSampleInvoicePdf(s, 'employer', new Date('2026-11-27T06:00:00Z'));
    expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(1000);
  });
});
