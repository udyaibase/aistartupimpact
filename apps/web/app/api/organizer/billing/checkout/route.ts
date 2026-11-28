import { ensureCatalog } from "@/lib/catalog/server";
import { holdDiscount, quoteDiscount, type Quote } from "@/lib/offers/discount";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@udyaibase/database";
import { requirePermission } from "@/lib/organizer-auth/require-permission";
import { apiRateLimit, checkRateLimit } from "@/lib/rate-limit";
import { createRazorpayOrder, razorpayKeys, withGst } from "@/lib/billing/razorpay";
import { BILLING_SELECT, profileComplete, profileFromRow } from "@/lib/billing/details";
import { EVENT_BOOST, HOST_PLANS, hostFoundingEligible, hostProPricePaise, isHostBillingCycle } from "@/lib/events/plans";
import { certificatePricePaise, certificatesAllowed } from "@/lib/events/after-event";

export const dynamic = "force-dynamic";

/**
 * Razorpay order for Pro (30 days, or a year at the founding price for the first 20 hosts) or an Event Boost.
 * Nothing changes until payment is verified.
 */
export async function POST(request: NextRequest) {
  const result = await requirePermission("billing");
  if (result instanceof NextResponse) return result;
  const session = result;

  const { success } = await checkRateLimit(apiRateLimit, `host-checkout:${session.organizerId}`);
  if (!success) return NextResponse.json({ success: false, error: "Too many attempts. Try again in a minute." }, { status: 429 });
  if (!razorpayKeys()) return NextResponse.json({ success: false, error: "Payments aren’t set up yet. Please contact us." }, { status: 503 });

  await ensureCatalog({ fresh: true }); // charge today's price, never a remembered one
  const body = await request.json().catch(() => ({}));
  const kind = body.kind === "BOOST" ? "BOOST" : body.kind === "PRO" ? "PRO" : body.kind === "CERTIFICATES" ? "CERTIFICATES" : null;
  if (!kind) return NextResponse.json({ success: false, error: "Choose Pro, an Event Boost or certificates." }, { status: 400 });

  // GST invoices need the buyer's name, address and (for businesses) GSTIN: collected once, before the first payment.
  const host = await prisma.eventOrganizer.findUnique({ where: { id: session.organizerId }, select: { ...BILLING_SELECT, email: true } });
  if (!host || !profileComplete(profileFromRow(host, host.email))) {
    return NextResponse.json({ success: false, error: "Add your invoice details to continue.", code: "BILLING_REQUIRED" }, { status: 409 });
  }

  const cycle = body.cycle === undefined ? "MONTHLY" : body.cycle;
  if (kind === "PRO" && !isHostBillingCycle(cycle)) return NextResponse.json({ success: false, error: "Choose monthly or yearly billing." }, { status: 400 });
  const yearly = kind === "PRO" && cycle === "ANNUAL";
  let founding = false;
  if (yearly) {
    const o = await prisma.eventOrganizer.findUnique({ where: { id: session.organizerId }, select: { foundingMemberAt: true, foundingLostAt: true } });
    founding = !!o && hostFoundingEligible(o, o.foundingMemberAt ? 0 : await prisma.eventOrganizer.count({ where: { foundingMemberAt: { not: null } } }));
  }
  let description = `${HOST_PLANS.PRO.name} plan · ${yearly ? `1 year${founding ? " · founding price" : ""}` : "30 days"}`;
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

  if (kind === "CERTIFICATES") {
    const ev = await prisma.event.findFirst({
      where: { id: String(body.eventId ?? ""), organizerId: session.organizerId, deletedAt: null },
      select: { id: true, title: true, organizerId: true, certificatesPaidAt: true },
    });
    if (!ev) return NextResponse.json({ success: false, error: "Choose one of your events." }, { status: 400 });
    if (await certificatesAllowed(ev)) return NextResponse.json({ success: false, error: ev.certificatesPaidAt ? "Certificates are already on for this event." : "Certificates are included in your Pro plan." }, { status: 409 });
    eventId = ev.id;
    description = `Certificates · ${ev.title}`.slice(0, 250);
  }

  let price = withGst(kind === "PRO" ? hostProPricePaise(yearly ? "ANNUAL" : "MONTHLY", { founding }) : kind === "CERTIFICATES" ? certificatePricePaise() : EVENT_BOOST.pricePaise);
  // A discount code (Admin → Billing → Offers) works on the Pro plan only, off the price before GST.
  const purchase = { plan: "PRO", cycle: yearly ? "ANNUAL" : "MONTHLY", amountPaise: price.amount };
  let quote: Extract<Quote, { ok: true }> | null = null;
  if (typeof body.code === "string" && body.code.trim()) {
    if (kind !== "PRO") return NextResponse.json({ success: false, error: "Promo codes work on the Pro plan, not on a Boost or certificates.", code: "CODE_REJECTED" }, { status: 400 });
    const q = await quoteDiscount("HOST", session.organizerId, body.code, purchase);
    if (!q.ok) return NextResponse.json({ success: false, error: q.error, code: "CODE_REJECTED" }, { status: 400 });
    quote = q;
    price = withGst(q.finalPaise);
    description += ` · code ${q.code}`;
  }
  try {
    const { orderId, keyId } = await createRazorpayOrder(price.total, `host_${session.organizerId.slice(-10)}_${Date.now()}`, {
      purpose: kind === "PRO" ? "ORGANIZER_PLAN" : kind === "CERTIFICATES" ? "ORGANIZER_CERTIFICATES" : "ORGANIZER_BOOST", organizerId: session.organizerId, ...(eventId ? { eventId } : {}),
      ...(kind === "PRO" ? { cycle: yearly ? "ANNUAL" : "MONTHLY", founding: founding ? "yes" : "no" } : {}),
      ...(quote ? { code: quote.code } : {}),
    });
    if (quote) {
      // Hold one of the code's places for this order; nothing is recorded if there is none left.
      const held = await holdDiscount(quote, purchase, orderId);
      if (!held.ok) return NextResponse.json({ success: false, error: held.error, code: "CODE_REJECTED" }, { status: 409 });
    }
    await prisma.organizerPayment.create({
      data: { organizerId: session.organizerId, kind, eventId, cycle: yearly ? "ANNUAL" : "MONTHLY", foundingPrice: founding, amountPaise: price.amount, gstPaise: price.gst, totalPaise: price.total, razorpayOrderId: orderId, paidByEmail: session.email },
    });
    return NextResponse.json({
      keyId, orderId, amount: price.total, currency: "INR", name: "Udyaibase", description,
      prefill: { email: session.email, name: session.name },
      ...(quote ? { discount: { code: quote.code, label: quote.label, discountPaise: quote.discountPaise } } : {}),
    });
  } catch (err) {
    console.error("[host checkout]", err instanceof Error ? err.message : err);
    return NextResponse.json({ success: false, error: "Couldn’t start the payment. Try again." }, { status: 502 });
  }
}
