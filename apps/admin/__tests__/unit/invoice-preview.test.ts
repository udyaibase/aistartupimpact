import { describe, expect, it } from 'vitest';
import { financialYear, previewModel, SAMPLE } from '@/lib/billing/invoice-preview';

const now = new Date('2026-11-27T06:00:00Z');
const FULL = { sellerName: 'Udyaibase Technologies Private Limited', gstin: '29ABCDE1234F1Z5', address: '1 Sample Road, Bengaluru', sac: '998314' };

describe('live invoice preview', () => {
  it('shows what is typed, and the server setting where a field is empty', () => {
    const m = previewModel({ sellerName: 'Typed Name Ltd' }, { address: 'Server Road', gstin: '29ABCDE1234F1Z5', sac: '9983', prefix: 'UTPL' }, 'employer', now);
    expect(m).toMatchObject({ name: 'Typed Name Ltd', address: 'Server Road', sac: '9983', pan: 'ABCDE1234F', missing: [] });
  });

  it('lists the required details that are missing', () => {
    expect(previewModel({}, null, 'employer', now).missing).toEqual(['legal name', 'GSTIN', 'registered address', 'default SAC code']);
    expect(previewModel(FULL, null, 'employer', now).missing).toEqual([]);
  });

  it('prints a product’s own SAC code, and the default where it has none or it is not complete yet', () => {
    expect(previewModel({ ...FULL, sacOrganizer: '998596' }, null, 'organizer', now).sac).toBe('998596');
    expect(previewModel({ ...FULL, sacOrganizer: '998596' }, null, 'employer', now).sac).toBe('998314');
    const typing = previewModel({ ...FULL, sacOrganizer: '99' }, null, 'organizer', now);
    expect(typing.sac).toBe('998314');
    expect(typing.invalid).toContain('SAC code');
  });

  it('splits tax as CGST and SGST in the sample customer’s state, IGST from another state', () => {
    const same = previewModel(FULL, null, 'employer', now);
    expect(same.tax.map((t) => t.label)).toEqual(['CGST @ 9%', 'SGST @ 9%']);
    expect(same.tax.reduce((s, t) => s + t.paise, 0)).toBe(SAMPLE.gstPaise);
    const other = previewModel({ ...FULL, gstin: '37AAECU2973K1ZU' }, null, 'employer', now);
    expect(other.tax).toEqual([{ label: 'IGST @ 18%', paise: SAMPLE.gstPaise }]);
  });

  it('flags a GSTIN that is still being typed without losing it from the picture', () => {
    const m = previewModel({ ...FULL, gstin: '29abc' }, null, 'employer', now);
    expect(m.gstin).toBe('29ABC');
    expect(m.invalid).toContain('GSTIN');
  });

  it('numbers the sample in the current financial year and omits the service period for a download', () => {
    expect(financialYear(new Date('2026-03-31T10:00:00Z'))).toBe('2025-26');
    expect(financialYear(new Date('2026-03-31T19:00:00Z'))).toBe('2026-27'); // already 1 April in India
    expect(previewModel(FULL, { prefix: 'UTPL' }, 'employer', now).number).toBe('UTPL/26-27/0000');
    expect(previewModel(FULL, null, 'funding', now).period).toBeNull();
    expect(previewModel(FULL, null, 'employer', now).period).not.toBeNull();
  });

  it('prints the seller’s state with its code, and email, phone and website on one line', () => {
    const m = previewModel({ ...FULL, gstin: '37AAECU2973K1ZU', phone: '+91 98765 43210', website: 'https://udyaibase.com/' }, null, 'employer', now);
    expect(m.sellerState).toBe('Andhra Pradesh, Code: 37');
    expect(m.contact).toBe('billing@udyaibase.com  |  +91 98765 43210  |  udyaibase.com');
    expect(previewModel({ ...FULL, gstin: '37AA' }, null, 'employer', now).sellerState).toBe('');
  });

  it('adds up like the sample the website draws', () => {
    expect(SAMPLE.amountPaise + SAMPLE.gstPaise).toBe(SAMPLE.totalPaise);
  });
});
