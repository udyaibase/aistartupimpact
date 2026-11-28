import { NextRequest, NextResponse } from 'next/server';
import { authRateLimit, checkRateLimit } from '@/lib/rate-limit';
import { requirePermission } from '@/lib/organizer-auth/require-permission';
import { redeemAnyCode } from '@/lib/offers/discount';

export const dynamic = 'force-dynamic';

/** A promo code typed on Plans & billing: a free-plan code is applied at once, a discount code is checked for checkout. */
export async function POST(request: NextRequest) {
  const result = await requirePermission('billing');
  if (result instanceof NextResponse) return result;
  // Few tries per account, so codes can't be guessed.
  const { success } = await checkRateLimit(authRateLimit, `offer-code:host:${result.organizerId}`);
  if (!success) return NextResponse.json({ success: false, error: 'Too many tries. Try again in 15 minutes.' }, { status: 429 });
  const body = await request.json().catch(() => ({}));
  const r = await redeemAnyCode('HOST', result.organizerId, body.code);
  if (!r.ok) return NextResponse.json({ success: false, error: r.error }, { status: 400 });
  // A discount code is only checked here: the page sends it with the next checkout, where the price is reduced.
  if (r.kind === 'discount') return NextResponse.json({ success: true, kind: 'discount', code: r.code, label: r.label, plan: r.plan, cycle: r.cycle });
  return NextResponse.json({ success: true, kind: 'free', headline: r.headline, plan: r.plan, endsAt: r.endsAt.toISOString() });
}
