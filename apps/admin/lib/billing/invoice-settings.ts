/**
 * The seller details and SAC codes printed on GST invoices (Billing → Invoice settings).
 * Stored as the `invoiceSettings` site setting and read by the web app (apps/web/lib/billing/seller.ts), which
 * applies the same rules; keep the two in step. Every field may be empty: empty means "use the server setting".
 */

export const INVOICE_SETTINGS_KEY = 'invoiceSettings';

export const INVOICE_FIELDS = ['sellerName', 'gstin', 'address', 'email', 'phone', 'website', 'cin', 'sac', 'sacEmployer', 'sacOrganizer', 'sacFunding', 'footerNote'] as const;
export type InvoiceField = (typeof INVOICE_FIELDS)[number];
export type InvoiceSettings = Partial<Record<InvoiceField, string>>;

export const INVOICE_PRODUCTS = [
  { key: 'employer', field: 'sacEmployer', label: 'Employer plans' },
  { key: 'organizer', field: 'sacOrganizer', label: 'Event host purchases (Pro, Boost, certificates)' },
  { key: 'funding', field: 'sacFunding', label: 'Funding data downloads' },
] as const;
export type InvoiceProduct = (typeof INVOICE_PRODUCTS)[number]['key'];

export const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
/** A Services Accounting Code (or HSN code for goods): 4, 6 or 8 digits. */
export const SAC_RE = /^(\d{4}|\d{6}|\d{8})$/;
/** +91 98765 43210, 080-4123-4567: digits with optional +, spaces and hyphens. */
export const PHONE_RE = /^\+?[0-9][0-9 -]{6,18}[0-9]$/;
/** udyaibase.com or www.udyaibase.com: a bare host, as printed. */
export const WEBSITE_RE = /^([a-z0-9-]+\.)+[a-z]{2,}$/;
const CIN_RE = /^[LU][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$/;
export const FOOTER_NOTE_MAX = 200;

const MAX: Record<InvoiceField, number> = { sellerName: 120, gstin: 15, address: 300, email: 120, phone: 20, website: 80, cin: 21, sac: 8, sacEmployer: 8, sacOrganizer: 8, sacFunding: 8, footerNote: FOOTER_NOTE_MAX };

export type InvoiceSettingsResult = { ok: true; data: InvoiceSettings } | { ok: false; error: string; field: InvoiceField };

/** Check what was typed. Empty fields are dropped; a filled field must be well formed. */
export function validateInvoiceSettings(raw: unknown): InvoiceSettingsResult {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const data: InvoiceSettings = {};
  for (const f of INVOICE_FIELDS) {
    let v = typeof r[f] === 'string' ? (r[f] as string).trim().replace(/\s+/g, ' ') : '';
    if (f === 'gstin' || f === 'cin') v = v.toUpperCase().replace(/\s/g, '');
    // Printed as a bare host: https://www.udyaibase.com/about becomes www.udyaibase.com.
    if (f === 'website') v = v.toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!v) continue;
    if (v.length > MAX[f]) return { ok: false, field: f, error: f === 'footerNote' ? `Keep the footer note to ${FOOTER_NOTE_MAX} characters.` : 'That is too long.' };
    data[f] = v;
  }
  if (data.gstin && !GSTIN_RE.test(data.gstin)) return { ok: false, field: 'gstin', error: 'Enter the 15-character GSTIN, like 29ABCDE1234F1Z5.' };
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return { ok: false, field: 'email', error: 'Enter a complete email address.' };
  if (data.phone && !PHONE_RE.test(data.phone)) return { ok: false, field: 'phone', error: 'Enter a phone number with digits, like +91 98765 43210.' };
  if (data.website && !WEBSITE_RE.test(data.website)) return { ok: false, field: 'website', error: 'Enter the website address, like udyaibase.com.' };
  if (data.cin && !CIN_RE.test(data.cin)) return { ok: false, field: 'cin', error: 'Enter the 21-character CIN, like U72900KA2024PTC123456.' };
  for (const f of ['sac', 'sacEmployer', 'sacOrganizer', 'sacFunding'] as const) {
    if (data[f] && !SAC_RE.test(data[f]!)) return { ok: false, field: f, error: 'A SAC or HSN code is 4, 6 or 8 digits.' };
  }
  // Printed with a standard PDF font: letters outside basic Latin would be dropped from the invoice.
  for (const f of ['sellerName', 'address', 'footerNote'] as const) {
    if (data[f] && /[^\x20-\x7E]/.test(data[f]!)) return { ok: false, field: f, error: 'Use plain English letters, numbers and punctuation; other characters do not print on the invoice.' };
  }
  return { ok: true, data };
}
