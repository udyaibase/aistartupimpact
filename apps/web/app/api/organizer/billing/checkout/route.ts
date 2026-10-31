import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@udyaibase/database";
import { requirePermission } from "@/lib/organizer-auth/require-permission";
import { apiRateLimit, checkRateLimit } from "@/lib/rate-limit";
import { createRazorpayOrder, razorpayKeys, withGst } from "@/lib/billing/razorpay";
import { EVENT_BOOST, HOST_PLANS } from "@/lib/events/plans";

export const dynamic = "force-dynamic";

/** Razorpay order for Pro (30 days) or an Event Boost. Nothing changes until payment is verified. */
export async function POST(request: NextRequest) {
  const result = await requirePermission("billing");
  if (result instanceof NextResponse) return result;
  const session = result;

  const { success } = await checkRateLimit(apiRateLimit, `host-checkout:${session.organizerId}`);
  if (!success) return NextResponse.json({ success: false, error: "Too many attempts. Try again in a minute." }, { status: 429 });
  if (!razorpayKeys()) return NextResponse.json({ success: false, error: "Payments aren’t set up yet. Please contact us." }, { status: 503 });

  const body = await request.json().catch(() => ({}));
  const kind = body.kind === "BOOST" ? "BOOST" : body.kind === "PRO" ? "PRO" : null;
  if (!kind) return NextResponse.json({ success: false, error: "Choose Pro or an Event Boost." }, { status: 400 });

  let description = `${HOST_PLANS.PRO.name} plan · 30 days`;
  let eventId: string | null = null;
  if (kind === "BOOST") {
    const ev = await prisma.event.findFirst({
      where: { id: String(body.eventId ?? ""), organizerId: session.organizerId, status: "PUBLISHED", deletedAt: null, endAt: { gt: new Date() } },
      select: { id: true, title: true, boostedAt: true },
    });
    if (!ev) return NextResponse.json({ success: false, error: "Choose an upcoming, published event." }, { status: 400 });
    if (ev.boostedAt) return NextResponse.json({ success: false, error: "This event is already boosted." }, { status: 409 });
    eventId = ev.id;
    description = `Event Boost · ${ev.title}`.slice(0, 250);
  }

  const price = withGst(kind === "PRO" ? HOST_PLANS.PRO.pricePaise : EVENT_BOOST.pricePaise);
  try {
    const { orderId, keyId } = await createRazorpayOrder(price.total, `host_${session.organizerId.slice(-10)}_${Date.now()}`, {
      purpose: kind === "PRO" ? "ORGANIZER_PLAN" : "ORGANIZER_BOOST", organizerId: session.organizerId, ...(eventId ? { eventId } : {}),
    });
    await prisma.organizerPayment.create({
      data: { organizerId: session.organizerId, kind, eventId, amountPaise: price.amount, gstPaise: price.gst, totalPaise: price.total, razorpayOrderId: orderId, paidByEmail: session.email },
    });
    return NextResponse.json({
      keyId, orderId, amount: price.total, currency: "INR", name: "Udyaibase", description,
      prefill: { email: session.email, name: session.name },
    });
  } catch (err) {
    console.error("[host checkout]", err instanceof Error ? err.message : err);
    return NextResponse.json({ success: false, error: "Couldn’t start the payment. Try again." }, { status: 502 });
  }
}
