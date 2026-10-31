import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@udyaibase/database";
import { requirePermission } from "@/lib/organizer-auth/require-permission";
import { apiRateLimit, checkRateLimit } from "@/lib/rate-limit";
import { refreshPayoutStatus, setUpPayouts, validatePayoutInput } from "@/lib/events/payouts";
import { RazorpayApiError } from "@/lib/billing/razorpay";
import { ticketFeePct } from "@/lib/events/tickets";

export const dynamic = "force-dynamic";

async function status(organizerId: string) {
  const o = await prisma.eventOrganizer.findUnique({
    where: { id: organizerId },
    select: { payoutStatus: true, payoutBankLast4: true, payoutBeneficiary: true, payoutNote: true, payoutUpdatedAt: true, payoutAccountId: true },
  });
  return {
    status: o?.payoutStatus ?? "NOT_STARTED", bankLast4: o?.payoutBankLast4 ?? null, beneficiary: o?.payoutBeneficiary ?? null,
    note: o?.payoutNote ?? null, updatedAt: o?.payoutUpdatedAt ?? null, started: !!o?.payoutAccountId, feePct: ticketFeePct(),
  };
}

/** Payout (Razorpay Route) status; `?refresh=1` re-checks KYC review with Razorpay. */
export async function GET(request: NextRequest) {
  const result = await requirePermission("billing");
  if (result instanceof NextResponse) return result;
  if (request.nextUrl.searchParams.get("refresh")) await refreshPayoutStatus(result.organizerId).catch(() => null);
  return NextResponse.json({ success: true, payouts: await status(result.organizerId) });
}

/** Set up payouts: business and bank details go straight to Razorpay (only the last 4 digits are kept). */
export async function POST(request: NextRequest) {
  const result = await requirePermission("billing");
  if (result instanceof NextResponse) return result;
  const { success } = await checkRateLimit(apiRateLimit, `payouts:${result.organizerId}`);
  if (!success) return NextResponse.json({ success: false, error: "Too many attempts. Try again in a minute." }, { status: 429 });
  const parsed = validatePayoutInput(await request.json().catch(() => ({})));
  if (!parsed.ok) return NextResponse.json({ success: false, error: parsed.error, field: parsed.field }, { status: 400 });
  try {
    await setUpPayouts(result.organizerId, parsed.data);
    return NextResponse.json({ success: true, payouts: await status(result.organizerId) });
  } catch (err) {
    const msg = err instanceof RazorpayApiError ? err.message : "Could not set up payouts. Try again.";
    return NextResponse.json({ success: false, error: msg, field: err instanceof RazorpayApiError ? err.field : undefined }, { status: 400 });
  }
}
