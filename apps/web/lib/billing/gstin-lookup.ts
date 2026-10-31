import { cached } from '@/lib/cache';
import { GSTIN_RE, gstinChecksumValid } from '@/lib/billing/details';

/**
 * Looks a GSTIN up in the GST register (via Cashfree Verification) so the billing form can fill in the legal
 * name and registered address. Off until CASHFREE_VERIFICATION_CLIENT_ID and _SECRET are set; set
 * CASHFREE_VERIFICATION_ENV=sandbox to test. Results are cached for 30 days, since every call is billed.
 */

export interface GstinRecord {
  found: boolean;
  legalName: string | null;
  tradeName: string | null;
  /** As on the register: Active, Cancelled, Suspended… */
  status: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  postalCode: string | null;
}

export const gstinLookupEnabled = () => !!(process.env.CASHFREE_VERIFICATION_CLIENT_ID && process.env.CASHFREE_VERIFICATION_CLIENT_SECRET);

const NOT_FOUND: GstinRecord = { found: false, legalName: null, tradeName: null, status: null, addressLine1: null, addressLine2: null, city: null, postalCode: null };

const clean = (v: unknown) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '');
const join = (parts: unknown[]) => [...new Set(parts.map(clean).filter(Boolean))].join(', ') || null;

/** Cashfree response → our fields. The register's split address is patchy, so fall back to the one-line address. */
export function toGstinRecord(d: Record<string, unknown>): GstinRecord {
  if (d.valid !== true) return NOT_FOUND;
  const a = (d.principal_place_split_address ?? {}) as Record<string, unknown>;
  const pin = clean(a.pincode);
  const city = clean(a.city) || clean(a.district);
  const line1 = join([a.flat_number, a.building_number, a.building_name, a.street]);
  const location = clean(a.location);
  return {
    found: true,
    legalName: clean(d.legal_name_of_business) || null,
    tradeName: clean(d.trade_name_of_business) || null,
    status: clean(d.gst_in_status) || null,
    addressLine1: (line1 ?? clean(d.principal_place_address)).slice(0, 200) || null,
    addressLine2: line1 && location && location.toLowerCase() !== city.toLowerCase() ? location.slice(0, 200) : null,
    city: city.slice(0, 80) || null,
    postalCode: /^[1-9][0-9]{5}$/.test(pin) ? pin : null,
  };
}

export async function lookupGstin(gstin: string): Promise<GstinRecord | null> {
  if (!gstinLookupEnabled() || !GSTIN_RE.test(gstin) || !gstinChecksumValid(gstin)) return null;
  return cached(`gstin:${gstin}`, { ttl: 30 * 86400, metrics: false }, async () => {
    const base = process.env.CASHFREE_VERIFICATION_ENV === 'sandbox' ? 'https://sandbox.cashfree.com' : 'https://api.cashfree.com';
    const res = await fetch(`${base}/verification/gstin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-client-id': process.env.CASHFREE_VERIFICATION_CLIENT_ID!,
        'x-client-secret': process.env.CASHFREE_VERIFICATION_CLIENT_SECRET!,
      },
      body: JSON.stringify({ GSTIN: gstin }),
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    const d = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.ok) return toGstinRecord(d);
    // A GSTIN that isn't on the register is an answer worth caching; anything else (auth, quota, outage) isn't.
    if (res.status === 400 || res.status === 404) return NOT_FOUND;
    throw new Error(`GSTIN lookup failed: ${res.status}`);
  });
}
