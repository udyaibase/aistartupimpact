import { GST_STATES } from '@/lib/billing/gst-states';

/**
 * Billing profile shared by employer and event-host accounts: who invoices are made out to, and where they're
 * emailed. GST-registered businesses give a GSTIN (state and PAN come from it); unregistered businesses and
 * individuals get B2C invoices but still need an address and state (place of supply).
 * Client-safe: also used by the form for live checks.
 */

export const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
export const BILLING_TYPES = ['GST', 'BUSINESS', 'INDIVIDUAL'] as const;
export type BillingType = (typeof BILLING_TYPES)[number];
export const MAX_CC_EMAILS = 3;

const GSTIN_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** GSTIN check digit (15th character), so a mistyped GSTIN is caught before it reaches an invoice. */
export function gstinChecksumValid(gstin: string): boolean {
  if (!GSTIN_RE.test(gstin)) return false;
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const product = GSTIN_CHARS.indexOf(gstin[i]) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return GSTIN_CHARS[(36 - (sum % 36)) % 36] === gstin[14];
}

export const panFromGstin = (gstin: string) => gstin.slice(2, 12);

/** First digit of an Indian PIN code → GST state codes it can belong to (9 = army postal, any state). */
const PIN_ZONES: Record<string, string[]> = {
  '1': ['01', '02', '03', '04', '06', '07', '38'],
  '2': ['05', '09'],
  '3': ['08', '24', '25', '26'],
  '4': ['22', '23', '27', '30'],
  '5': ['29', '36', '37'],
  '6': ['31', '32', '33', '34'],
  '7': ['11', '12', '13', '14', '15', '16', '17', '18', '19', '21', '35'],
  '8': ['10', '20'],
};
/** Soft check (a few PINs cross state lines): true when the PIN looks like it's in another state. */
export function pinStateMismatch(pin: string, state: string): boolean {
  const zone = PIN_ZONES[pin[0]];
  return !!zone && !zone.includes(state);
}

export interface BillingProfile {
  billingType: BillingType | null;
  billingName: string | null;
  billingGstin: string | null;
  billingAddressLine1: string | null;
  billingAddressLine2: string | null;
  billingCity: string | null;
  billingState: string | null;
  billingPostalCode: string | null;
  billingCountry: string;
  billingPoNumber: string | null;
  billingEmail: string | null;
  billingCcEmails: string[];
}

/** Prisma select for the profile (same columns on JobBoardEmployer and EventOrganizer). */
export const BILLING_SELECT = {
  billingType: true, billingName: true, billingGstin: true, billingAddressLine1: true, billingAddressLine2: true,
  billingCity: true, billingState: true, billingPostalCode: true, billingCountry: true, billingPoNumber: true,
  billingEmail: true, billingCcEmails: true,
} as const;

/** Stored row → profile; the invoice email falls back to the account email until one is set. */
export function profileFromRow(row: Partial<Record<keyof BillingProfile, unknown>> | null, accountEmail: string): BillingProfile {
  const r = row ?? {};
  const s = (v: unknown) => (typeof v === 'string' && v ? v : null);
  return {
    billingType: BILLING_TYPES.includes(r.billingType as BillingType) ? (r.billingType as BillingType) : null,
    billingName: s(r.billingName),
    billingGstin: s(r.billingGstin),
    billingAddressLine1: s(r.billingAddressLine1),
    billingAddressLine2: s(r.billingAddressLine2),
    billingCity: s(r.billingCity),
    billingState: s(r.billingState),
    billingPostalCode: s(r.billingPostalCode),
    billingCountry: s(r.billingCountry) ?? 'IN',
    billingPoNumber: s(r.billingPoNumber),
    billingEmail: s(r.billingEmail) ?? accountEmail,
    billingCcEmails: Array.isArray(r.billingCcEmails) ? (r.billingCcEmails as string[]) : [],
  };
}

/** Enough to issue a correct invoice: name, full address with state and PIN, and an invoice email. */
export function profileComplete(p: BillingProfile): boolean {
  return !!(p.billingType && p.billingName && p.billingAddressLine1 && p.billingCity && p.billingState && p.billingPostalCode && p.billingEmail
    && (p.billingType !== 'GST' || p.billingGstin));
}

/** Address as printed on invoices, one line per entry. */
export function formatBillingAddress(p: Pick<BillingProfile, 'billingAddressLine1' | 'billingAddressLine2' | 'billingCity' | 'billingState' | 'billingPostalCode'>): string[] {
  const cityLine = [p.billingCity, p.billingState && GST_STATES[p.billingState], p.billingPostalCode].filter(Boolean).join(', ');
  return [p.billingAddressLine1, p.billingAddressLine2, cityLine, 'India'].filter((l): l is string => !!l);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
type ParseResult = { ok: true; data: Omit<BillingProfile, 'billingCountry'> & { billingCountry: 'IN' }; warnings: string[] } | { ok: false; error: string; field: string };

/** Validate a submitted profile. Errors block saving; warnings (e.g. PIN in another state) are shown but allowed. */
export function parseBillingProfile(b: Record<string, unknown>): ParseResult {
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '');
  const type = str(b.billingType, 12).toUpperCase() as BillingType;
  if (!BILLING_TYPES.includes(type)) return { ok: false, error: 'Choose how you’re billed.', field: 'billingType' };

  const name = str(b.billingName, 120);
  if (name.length < 2) return { ok: false, error: type === 'INDIVIDUAL' ? 'Enter your full name.' : 'Enter the legal business name.', field: 'billingName' };

  let gstin = '';
  let state = str(b.billingState, 2);
  if (type === 'GST') {
    gstin = str(b.billingGstin, 15).toUpperCase().replace(/\s/g, '');
    if (!GSTIN_RE.test(gstin)) return { ok: false, error: 'Enter a 15-character GSTIN, e.g. 29ABCDE1234F1Z5.', field: 'billingGstin' };
    if (!gstinChecksumValid(gstin)) return { ok: false, error: 'That GSTIN’s check digit doesn’t match. Check it for a typo.', field: 'billingGstin' };
    if (!GST_STATES[gstin.slice(0, 2)]) return { ok: false, error: 'That GSTIN’s state code isn’t valid.', field: 'billingGstin' };
    state = gstin.slice(0, 2); // place of supply is the registered state
  } else if (!GST_STATES[state]) {
    return { ok: false, error: 'Choose your state.', field: 'billingState' };
  }

  const line1 = str(b.billingAddressLine1, 200);
  if (line1.length < 3) return { ok: false, error: 'Enter the street address.', field: 'billingAddressLine1' };
  const city = str(b.billingCity, 80);
  if (city.length < 2) return { ok: false, error: 'Enter the city.', field: 'billingCity' };
  const pin = str(b.billingPostalCode, 6);
  if (!/^[1-9][0-9]{5}$/.test(pin)) return { ok: false, error: 'Enter a 6-digit PIN code.', field: 'billingPostalCode' };

  const email = str(b.billingEmail, 254).toLowerCase();
  if (!EMAIL_RE.test(email)) return { ok: false, error: 'Enter the email invoices should go to.', field: 'billingEmail' };
  const ccRaw = Array.isArray(b.billingCcEmails) ? b.billingCcEmails : typeof b.billingCcEmails === 'string' ? b.billingCcEmails.split(/[,;\s]+/) : [];
  const cc = [...new Set(ccRaw.map((e) => str(e, 254).toLowerCase()).filter(Boolean))].filter((e) => e !== email);
  if (cc.length > MAX_CC_EMAILS) return { ok: false, error: `Add up to ${MAX_CC_EMAILS} CC emails.`, field: 'billingCcEmails' };
  const badCc = cc.find((e) => !EMAIL_RE.test(e));
  if (badCc) return { ok: false, error: `${badCc} isn’t a valid email.`, field: 'billingCcEmails' };

  const warnings: string[] = [];
  if (pinStateMismatch(pin, state)) warnings.push(`PIN ${pin} usually belongs to a different state than ${GST_STATES[state]}. Check both.`);

  return {
    ok: true,
    warnings,
    data: {
      billingType: type,
      billingName: name,
      billingGstin: gstin || null,
      billingAddressLine1: line1,
      billingAddressLine2: str(b.billingAddressLine2, 200) || null,
      billingCity: city,
      billingState: state,
      billingPostalCode: pin,
      billingCountry: 'IN',
      billingPoNumber: str(b.billingPoNumber, 60) || null,
      billingEmail: email,
      billingCcEmails: cc,
    },
  };
}
