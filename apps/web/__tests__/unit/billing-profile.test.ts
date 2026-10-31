import { describe, it, expect } from 'vitest';
import { formatBillingAddress, gstinChecksumValid, panFromGstin, parseBillingProfile, pinStateMismatch, profileComplete, profileFromRow } from '@/lib/billing/details';

const base = {
  billingType: 'BUSINESS', billingName: 'Acme AI', billingState: '36', billingAddressLine1: '4th Floor, Cyber Towers',
  billingCity: 'Hyderabad', billingPostalCode: '500081', billingEmail: 'Accounts@Acme.in',
};

describe('GSTIN', () => {
  it('checks the 15th-character check digit', () => {
    expect(gstinChecksumValid('27AAPFU0939F1ZV')).toBe(true);
    expect(gstinChecksumValid('27AAPFU0939F1ZW')).toBe(false); // one character off
    expect(gstinChecksumValid('29ABCDE1234F1ZW')).toBe(true);
    expect(panFromGstin('27AAPFU0939F1ZV')).toBe('AAPFU0939F');
  });
});

describe('billing profile', () => {
  it('GST-registered: GSTIN required and validated; state comes from the GSTIN', () => {
    expect(parseBillingProfile({ ...base, billingType: 'GST' })).toMatchObject({ ok: false, field: 'billingGstin' });
    expect(parseBillingProfile({ ...base, billingType: 'GST', billingGstin: '27AAPFU0939F1ZW' })).toMatchObject({ ok: false, field: 'billingGstin' });
    const r = parseBillingProfile({ ...base, billingType: 'GST', billingGstin: ' 27aapfu0939f1zv ', billingState: '36', billingPostalCode: '400001' });
    expect(r.ok && [r.data.billingGstin, r.data.billingState]).toEqual(['27AAPFU0939F1ZV', '27']);
  });

  it('unregistered business and individual: no GSTIN, but state is required (place of supply)', () => {
    const r = parseBillingProfile({ ...base, billingGstin: '27AAPFU0939F1ZV' });
    expect(r.ok && r.data.billingGstin).toBeNull();
    expect(parseBillingProfile({ ...base, billingState: '' })).toMatchObject({ ok: false, field: 'billingState' });
    expect(parseBillingProfile({ ...base, billingType: 'INDIVIDUAL', billingName: 'A' })).toMatchObject({ ok: false, field: 'billingName' });
  });

  it('address, PIN and emails', () => {
    expect(parseBillingProfile({ ...base, billingPostalCode: '05008' })).toMatchObject({ ok: false, field: 'billingPostalCode' });
    expect(parseBillingProfile({ ...base, billingCity: '' })).toMatchObject({ ok: false, field: 'billingCity' });
    expect(parseBillingProfile({ ...base, billingEmail: 'nope' })).toMatchObject({ ok: false, field: 'billingEmail' });
    expect(parseBillingProfile({ ...base, billingCcEmails: 'a@x.in, b@x.in; c@x.in d@x.in' })).toMatchObject({ ok: false, field: 'billingCcEmails' });
    const r = parseBillingProfile({ ...base, billingCcEmails: ['cfo@acme.in', 'CFO@acme.in', 'accounts@acme.in'] });
    expect(r.ok && [r.data.billingEmail, r.data.billingCcEmails]).toEqual(['accounts@acme.in', ['cfo@acme.in']]);
  });

  it('warns (but allows) a PIN that looks like it is in another state', () => {
    expect(pinStateMismatch('500081', '36')).toBe(false);
    expect(pinStateMismatch('110001', '36')).toBe(true);
    const r = parseBillingProfile({ ...base, billingPostalCode: '110001' });
    expect(r.ok && r.warnings.length).toBe(1);
  });

  it('defaults the invoice email to the account email; completeness and printed address', () => {
    const p = profileFromRow(null, 'founder@acme.in');
    expect([p.billingEmail, p.billingCountry, profileComplete(p)]).toEqual(['founder@acme.in', 'IN', false]);
    const r = parseBillingProfile(base);
    if (!r.ok) throw new Error('expected ok');
    expect(profileComplete({ ...r.data })).toBe(true);
    expect(formatBillingAddress(r.data)).toEqual(['4th Floor, Cyber Towers', 'Hyderabad, Telangana, 500081', 'India']);
  });
});
