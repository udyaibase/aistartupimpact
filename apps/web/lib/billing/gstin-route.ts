import { NextResponse } from 'next/server';
import { GSTIN_RE, gstinChecksumValid } from '@/lib/billing/details';
import { gstinLookupEnabled, lookupGstin } from '@/lib/billing/gstin-lookup';
import { checkRateLimit, gstinLookupRateLimit } from '@/lib/rate-limit';

/** Shared by the employer and host billing routes, after each checks its own session. */
export async function gstinLookupResponse(request: Request, accountKey: string) {
  if (!gstinLookupEnabled()) return NextResponse.json({ enabled: false });
  const gstin = String(new URL(request.url).searchParams.get('gstin') ?? '').toUpperCase();
  if (!GSTIN_RE.test(gstin) || !gstinChecksumValid(gstin)) return NextResponse.json({ error: 'Enter a valid GSTIN.' }, { status: 400 });
  const rl = await checkRateLimit(gstinLookupRateLimit, accountKey);
  if (!rl.success) return NextResponse.json({ error: 'Too many lookups. Fill in the details yourself, or try again in an hour.' }, { status: 429 });
  try {
    const record = await lookupGstin(gstin);
    return NextResponse.json({ enabled: true, record }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    console.error('[gstin]', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Couldn’t reach the GST register. Fill in the details yourself.' }, { status: 502 });
  }
}
