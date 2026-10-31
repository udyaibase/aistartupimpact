import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@udyaibase/database";
import { requirePermission } from "@/lib/organizer-auth/require-permission";
import { checkoutSignatureValid } from "@/lib/billing/razorpay";
import { activateOrganizerPayment } from "@/lib/events/billing";

export const dynamic = "force-dynamic";

/** Checkout success callback. The webhook activates too; whichever lands first wins. */
export async function POST(request: NextRequest) {
  const result = await requirePermission("billing");
  if (result instanceof NextResponse) return result;

  const body = await request.json().catch(() => ({}));
  const orderId = String(body.razorpay_order_id ?? "");
  const paymentId = String(body.razorpay_payment_id ?? "");
  const pay = await prisma.organizerPayment.findUnique({ where: { razorpayOrderId: orderId }, select: { organizerId: true } });
  if (!pay || pay.organizerId !== result.organizerId) return NextResponse.json({ success: false, error: "Payment not found." }, { status: 404 });
  if (!checkoutSignatureValid(orderId, paymentId, String(body.razorpay_signature ?? ""))) {
    return NextResponse.json({ success: false, error: "We couldn’t confirm this payment. If money was taken, it will activate within a few minutes or be refunded." }, { status: 400 });
  }
  await activateOrganizerPayment(orderId, paymentId);
  return NextResponse.json({ success: true });
}
