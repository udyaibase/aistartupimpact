import { GST_STATES } from '@/lib/billing/gst-states';
import { GSTIN_RE, INVOICE_PRODUCTS, PHONE_RE, SAC_RE, WEBSITE_RE, type InvoiceField, type InvoiceProduct, type InvoiceSettings } from '@/lib/billing/invoice-settings';

/**
 * What the live preview on Billing → Invoice settings shows: the sample invoice the website would build from the
 * form as it stands (apps/web/lib/billing/invoice.ts, buildSampleInvoicePdf). Same sample buyer, amounts and rules,
 * so the picture matches the PDF. A typed value wins; an empty field shows the server setting it falls back to.
 */

export const SAMPLE = {
  buyer: { name: 'Sample Customer Private Limited', lines: ['12 Example Road', 'Bengaluru, Karnataka, 560001', 'India'], tax: 'Unregistered (no GSTIN)', email: 'accounts@example.com', state: '29', stateName: 'Karnataka' },
  amountPaise: 199900, gstPaise: 35982, totalPaise: 235882,
  words: 'Two Thousand Three Hundred Fifty Eight Rupees and Eighty Two Paise Only',
  paymentId: 'pay_SAMPLE000000',
  line: {
    employer: 'Udyaibase Jobs Growth plan',
    organizer: 'Udyaibase Events Pro plan',
    funding: 'Udyaibase funding dataset (Full dataset), digital download',
  } satisfies Record<InvoiceProduct, string>,
} as const;

/** The four details without which no invoice is issued. */
export const REQUIRED: { field: InvoiceField; label: string }[] = [
  { field: 'sellerName', label: 'legal name' },
  { field: 'gstin', label: 'GSTIN' },
  { field: 'address', label: 'registered address' },
  { field: 'sac', label: 'default SAC code' },
];

export interface PreviewModel {
  name: string; gstin: string; pan: string; address: string; email: string; cin: string; sac: string; footerNote: string;
  /** "Andhra Pradesh, Code: 37" once the GSTIN's state is known. */
  sellerState: string;
  /** Email, phone and website on one line, as printed. */
  contact: string;
  /** Required details that are empty with nothing to fall back to. */
  missing: string[];
  /** Typed values that are not well formed yet (still shown, so the picture follows the typing). */
  invalid: string[];
  intra: boolean;
  tax: { label: string; paise: number }[];
  number: string; date: string; period: string | null; line: string;
}

const dateIn = (d: Date) => d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

/** Financial year label for a date, in India time: 2026-27 for 1 Apr 2026 to 31 Mar 2027. */
export function financialYear(d: Date): string {
  const ist = new Date(d.getTime() + 5.5 * 36e5);
  const y = ist.getUTCMonth() >= 3 ? ist.getUTCFullYear() : ist.getUTCFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
}

export function previewModel(draft: InvoiceSettings, fallback: (Partial<Record<InvoiceField, string>> & { prefix?: string }) | null, product: InvoiceProduct, now: Date): PreviewModel {
  const typed = (f: InvoiceField) => (draft[f] ?? '').trim();
  const pick = (f: InvoiceField) => typed(f) || (fallback?.[f] ?? '').trim();
  const gstin = pick('gstin').toUpperCase().replace(/\s/g, '');
  const productField = INVOICE_PRODUCTS.find((p) => p.key === product)!.field;
  const own = typed(productField);
  const sac = (SAC_RE.test(own) ? own : '') || pick('sac');

  const invalid: string[] = [];
  if (typed('gstin') && !GSTIN_RE.test(gstin)) invalid.push('GSTIN');
  for (const f of ['sac', 'sacEmployer', 'sacOrganizer', 'sacFunding'] as const) {
    if (typed(f) && !SAC_RE.test(typed(f))) { invalid.push('SAC code'); break; }
  }

  if (typed('phone') && !PHONE_RE.test(typed('phone'))) invalid.push('phone number');
  const site = pick('website').toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '') || 'udyaibase.com';
  if (typed('website') && !WEBSITE_RE.test(site)) invalid.push('website');
  const email = pick('email') || 'billing@udyaibase.com';

  const sellerState = GSTIN_RE.test(gstin) ? gstin.slice(0, 2) : SAMPLE.buyer.state;
  const intra = sellerState === SAMPLE.buyer.state;
  const cgst = Math.floor(SAMPLE.gstPaise / 2);
  return {
    name: pick('sellerName'), gstin, pan: gstin.length >= 12 ? gstin.slice(2, 12) : '', address: pick('address'),
    email, sellerState: GSTIN_RE.test(gstin) && GST_STATES[sellerState] ? `${GST_STATES[sellerState]}, Code: ${sellerState}` : '',
    contact: [email, pick('phone'), site].filter(Boolean).join('  |  '), cin: pick('cin').toUpperCase(), sac, footerNote: typed('footerNote'),
    missing: REQUIRED.filter((r) => !pick(r.field)).map((r) => r.label),
    invalid, intra,
    tax: intra ? [{ label: 'CGST @ 9%', paise: cgst }, { label: 'SGST @ 9%', paise: SAMPLE.gstPaise - cgst }] : [{ label: 'IGST @ 18%', paise: SAMPLE.gstPaise }],
    // Same shape as the website's formatInvoiceNumber: prefix, two-digit years, running number (16 characters at most).
    number: `${fallback?.prefix || 'UTPL'}/${financialYear(now).slice(2)}/0000`,
    date: dateIn(now),
    period: product === 'funding' ? null : `${dateIn(now)} - ${dateIn(new Date(now.getTime() + 30 * 864e5))}`,
    line: SAMPLE.line[product],
  };
}
