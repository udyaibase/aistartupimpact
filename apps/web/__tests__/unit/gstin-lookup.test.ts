import { describe, expect, it } from 'vitest';
import { toGstinRecord } from '@/lib/billing/gstin-lookup';

describe('toGstinRecord', () => {
  it('maps a register entry to billing fields', () => {
    const r = toGstinRecord({
      valid: true,
      legal_name_of_business: 'UJJIVAN SMALL FINANCE BANK LIMITED',
      trade_name_of_business: 'UJJIVAN SMALL FINANCE BANK',
      gst_in_status: 'Active',
      principal_place_address: 'First Floor 3512-DISPUR Prithivi Mansion opp. KFC building G.S. Road, Lachit Nagar Assam 781007',
      principal_place_split_address: {
        building_name: 'Prithivi Mansion', street: 'G.S. Road', location: 'Lachit Nagar', building_number: '3512-DISPUR',
        district: 'Guwahati', state: 'Assam', city: 'Dispur', flat_number: 'First Floor', pincode: '781007',
      },
    });
    expect(r).toEqual({
      found: true,
      legalName: 'UJJIVAN SMALL FINANCE BANK LIMITED',
      tradeName: 'UJJIVAN SMALL FINANCE BANK',
      status: 'Active',
      addressLine1: 'First Floor, 3512-DISPUR, Prithivi Mansion, G.S. Road',
      addressLine2: 'Lachit Nagar',
      city: 'Dispur',
      postalCode: '781007',
    });
  });

  it('falls back to the one-line address and district when the split address is empty', () => {
    const r = toGstinRecord({
      valid: true, legal_name_of_business: 'ACME AI PRIVATE LIMITED', gst_in_status: 'Cancelled',
      principal_place_address: '12 MG Road Bengaluru 560001',
      principal_place_split_address: { building_name: '', street: '', location: 'Bengaluru', district: 'Bengaluru Urban', city: '', pincode: '' },
    });
    expect(r.addressLine1).toBe('12 MG Road Bengaluru 560001');
    expect(r.addressLine2).toBeNull();
    expect(r.city).toBe('Bengaluru Urban');
    expect(r.postalCode).toBeNull();
    expect(r.status).toBe('Cancelled');
  });

  it('reports GSTINs that are not on the register', () => {
    expect(toGstinRecord({ valid: false, message: "GSTIN Doesn't Exist" }).found).toBe(false);
  });
});
