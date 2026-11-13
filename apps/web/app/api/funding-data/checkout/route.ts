import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { apiRateLimit, checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';
import { createRazorpayOrder, razorpayKeys } from '@/lib/billing/razorpay';
import { GSTIN_RE, gstinChecksumValid } from '@/lib/billing/details';
import { GST_STATES } from '@/lib/billing/gst-states';
import { verifyEmailPass } from '@/lib/funding/access';
import { loadDataset, selectStartups } from '@/lib/funding/dataset';
import { CONSENT_TEXT, isPackKey, packOptions, PACKS, parseFilters, splitInclusive, type PackKey } from '@/lib/funding/packs';

export const dynamic = 'force-dynamic';

type Billing =
  | { billingType: 'INDIVIDUAL'; billingName: string; billingState: string; billingGstin: null }
  | { billingType: 'GST'; billingName: string; billingState: string; billingGstin: string; billingAddressLine1: string; billingCity: string; billingPostalCode: string };

/**
 * Bill-to for the invoice. Individuals: name and state (place of supply); every pack is far below the ₹50,000 at
 * which a B2C invoice must show the buyer's address. Businesses: a valid GSTIN plus the registered address, which a
 * B2B tax invoice must show (the state comes from the GSTIN). Keys match the billing-profile fields the invoice reads.
 */
function parseBilling(raw: unknown): { ok: true; data: Billing } | { ok: false; error: string } {
  const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '');
  const name = str(b.billingName, 120);
  if (name.length < 2) return { ok: false, error: 'Enter the name for the invoice.' };
  if (b.billingType === 'GST') {
    const gstin = str(b.billingGstin, 15).toUpperCase().replace(/\s/g, '');
    if (!GSTIN_RE.test(gstin) || !gstinChecksumValid(gstin) || !GST_STATES[gstin.slice(0, 2)]) return { ok: false, error: 'That GSTIN isn’t valid. Check it for a typo, or buy as an individual.' };
    const line1 = str(b.billingAddressLine1, 200);
    if (line1.length < 3) return { ok: false, error: 'Enter the registered address for the GST invoice.' };
    const city = str(b.billingCity, 80);
    if (city.length < 2) return { ok: false, error: 'Enter the city.' };
    const pin = str(b.billingPostalCode, 6);
    if (!/^[1-9][0-9]{5}$/.test(pin)) return { ok: false, error: 'Enter a 6-digit PIN code.' };
    return { ok: true, data: { billingType: 'GST', billingName: name, billingState: gstin.slice(0, 2), billingGstin: gstin, billingAddressLine1: line1, billingCity: city, billingPostalCode: pin } };
  }
  const state = str(b.billingState, 2);
  if (!GST_STATES[state]) return { ok: false, error: 'Choose your state.' };
  return { ok: true, data: { billingType: 'INDIVIDUAL', billingName: name, billingState: state, billingGstin: null } };
}

/**
 * Create the Razorpay order for a funding-data pack. Needs a verified email (pass from the code check) and the
 * consent box. The price comes from the pack on the server, and the pack must make sense for the filters
 * (no paying for a 1,000-startup pack when 300 match).
 */
export async function POST(request: NextRequest) {
  const { success } = await checkRateLimit(apiRateLimit, `funding-checkout:${getClientIdentifier(request)}`);
  if (!success) return NextResponse.json({ error: 'Too many attempts. Try again in a minute.' }, { status: 429 });

  const body = await request.json().catch(() => ({}));
  const email = verifyEmailPass(body.pass);
  if (!email) return NextResponse.json({ error: 'Your email check has expired. Verify your email again.', code: 'PASS_EXPIRED' }, { status: 401 });
  if (body.consent !== true) return NextResponse.json({ error: 'Please tick the box to agree before paying.' }, { status: 400 });
  if (!isPackKey(body.pack)) return NextResponse.json({ error: 'Choose a pack.' }, { status: 400 });
  const billing = parseBilling(body.billing);
  if (!billing.ok) return NextResponse.json({ error: billing.error }, { status: 400 });
  if (!razorpayKeys()) return NextResponse.json({ error: 'Payments aren’t set up yet. Please contact us.' }, { status: 503 });

  const pack = PACKS[body.pack as PackKey];
  const filters = parseFilters(body.filters);
  const all = await loadDataset();
  const { matched } = selectStartups(all, filters, null);
  const option = packOptions(matched, all.length).find((o) => o.key === pack.key);
  if (!option?.available) return NextResponse.json({ error: option?.note || 'This pack isn’t available for your selection.' }, { status: 400 });

  const price = splitInclusive(pack.totalPaise);
  try {
    const { orderId, keyId } = await createRazorpayOrder(price.total, `fund_${Date.now()}`, { purpose: 'FUNDING_DATA', pack: pack.key, email });
    await prisma.fundingDataPurchase.create({
      data: {
        email, pack: pack.key, startupLimit: pack.limit, filters: filters as object, matchedAtPurchase: pack.key === 'FULL' ? all.length : matched,
        amountPaise: price.amount, gstPaise: price.gst, totalPaise: price.total, razorpayOrderId: orderId,
        billingDetails: { ...billing.data, billingCountry: 'IN', billingEmail: email },
        consentAt: new Date(), consentText: CONSENT_TEXT,
      },
    });
    return NextResponse.json({
      keyId, orderId, amount: price.total, currency: 'INR', name: 'Udyaibase',
      description: `${pack.name} funding dataset · ${option.gets.toLocaleString('en-IN')} startups`,
      prefill: { email, name: billing.data.billingName },
    });
  } catch (err) {
    console.error('[funding-data checkout]', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Couldn’t start the payment. Try again.' }, { status: 502 });
  }
}
