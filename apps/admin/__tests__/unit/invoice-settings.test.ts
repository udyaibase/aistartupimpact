import { describe, expect, it } from 'vitest';
import { validateInvoiceSettings } from '@/lib/billing/invoice-settings';
import { payoutRow, REVIEW_SLOW_DAYS } from '@/lib/billing/payouts';

describe('invoice settings', () => {
  it('drops empty fields: empty means "use the server setting"', () => {
    const r = validateInvoiceSettings({ sellerName: '  ', gstin: '', sac: ' 998314 ' });
    expect(r).toEqual({ ok: true, data: { sac: '998314' } });
  });

  it('upper-cases and accepts a well-formed GSTIN, and rejects a malformed one', () => {
    expect(validateInvoiceSettings({ gstin: '29abcde1234f1z5' })).toEqual({ ok: true, data: { gstin: '29ABCDE1234F1Z5' } });
    const bad = validateInvoiceSettings({ gstin: '29ABCDE1234F1' });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.field).toBe('gstin');
  });

  it('accepts SAC/HSN codes of 4, 6 or 8 digits only, and names the field that is wrong', () => {
    for (const sac of ['9983', '998314', '99831400']) expect(validateInvoiceSettings({ sac }).ok).toBe(true);
    for (const sac of ['998', '99831', '9983140', 'SAC998', '998 31']) expect(validateInvoiceSettings({ sac }).ok).toBe(false);
    const bad = validateInvoiceSettings({ sac: '998314', sacOrganizer: '12' });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.field).toBe('sacOrganizer');
  });

  it('rejects characters the invoice PDF cannot print', () => {
    const bad = validateInvoiceSettings({ sellerName: 'Udyaibase टेक' });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.field).toBe('sellerName');
  });

  it('rejects an incomplete email and a malformed CIN', () => {
    expect(validateInvoiceSettings({ email: 'billing@' }).ok).toBe(false);
    expect(validateInvoiceSettings({ cin: 'U72900KA2024PTC123456' }).ok).toBe(true);
    expect(validateInvoiceSettings({ cin: '12345' }).ok).toBe(false);
  });

  it('accepts a phone number and prints the website as a bare address', () => {
    expect(validateInvoiceSettings({ phone: '+91 98765 43210', website: 'https://www.Udyaibase.com/about' })).toEqual({ ok: true, data: { phone: '+91 98765 43210', website: 'www.udyaibase.com' } });
    const badPhone = validateInvoiceSettings({ phone: 'call us' });
    expect(badPhone.ok).toBe(false);
    if (!badPhone.ok) expect(badPhone.field).toBe('phone');
    expect(validateInvoiceSettings({ website: 'not a site' }).ok).toBe(false);
  });

  it('ignores fields it does not know', () => {
    expect(validateInvoiceSettings({ prefix: 'HACK', sac: '9983' })).toEqual({ ok: true, data: { sac: '9983' } });
  });
});

describe('host payout rows', () => {
  const now = new Date('2026-11-27T06:00:00Z');
  const host = (over: Record<string, unknown> = {}) => ({
    id: 'h1', name: 'Asha', company: null, email: 'asha@example.com', payoutStatus: null, payoutNote: null,
    payoutBankLast4: null, payoutBeneficiary: null, payoutUpdatedAt: null, ...over,
  });

  it('treats a host with no payout record as not started', () => {
    expect(payoutRow(host(), 0, now).status).toBe('NOT_STARTED');
    expect(payoutRow(host({ payoutStatus: 'SOMETHING_NEW' }), 0, now).status).toBe('NOT_STARTED');
  });

  it('flags a review that has waited too long, but not a fresh one', () => {
    const old = new Date(now.getTime() - REVIEW_SLOW_DAYS * 864e5);
    expect(payoutRow(host({ payoutStatus: 'UNDER_REVIEW', payoutUpdatedAt: old }), 0, now)).toMatchObject({ waitingDays: REVIEW_SLOW_DAYS, slow: true });
    expect(payoutRow(host({ payoutStatus: 'UNDER_REVIEW', payoutUpdatedAt: new Date(now.getTime() - 864e5) }), 0, now)).toMatchObject({ waitingDays: 1, slow: false });
  });

  it('marks a host with paid tickets and no active account as blocked', () => {
    expect(payoutRow(host({ payoutStatus: 'UNDER_REVIEW' }), 2, now).blocked).toBe(true);
    expect(payoutRow(host({ payoutStatus: 'ACTIVATED' }), 2, now).blocked).toBe(false);
    expect(payoutRow(host(), 0, now).blocked).toBe(false);
  });

  it('shows the company name when there is one', () => {
    expect(payoutRow(host({ company: 'Asha Events LLP' }), 0, now).name).toBe('Asha Events LLP');
  });
});
