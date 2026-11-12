import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@udyaibase/database";
import { checkoutSignatureValid, ensureCaptured } from "@/lib/billing/razorpay";
import { confirmTicketPayment } from "@/lib/events/tickets";

export const dynamic = "force-dynamic";

/** Checkout success callback for a ticket. The Razorpay signature proves the payment; the webhook confirms too. */
export async function POST(request: NextRequest) {
  const b = await request.json().catch(() => ({}));
  const orderId = String(b.razorpay_order_id ?? "");
  const paymentId = String(b.razorpay_payment_id ?? "");
  if (!checkoutSignatureValid(orderId, paymentId, String(b.razorpay_signature ?? ""))) {
    return NextResponse.json({ success: false, error: "We couldn’t confirm this payment yet. If money was taken, your ticket will be confirmed by email within a few minutes, or refunded." }, { status: 400 });
  }
  const reg = await prisma.eventRegistration.findFirst({ where: { razorpayOrderId: orderId }, select: { amountPaise: true } });
  if (!reg?.amountPaise) return NextResponse.json({ success: false, error: "Order not found." }, { status: 404 });
  // The signature proves authorisation only; confirm on money actually captured, for the ticket price.
  if (!(await ensureCaptured(paymentId, orderId, reg.amountPaise)).ok) {
    return NextResponse.json({ success: false, error: "We couldn’t confirm this payment yet. If money was taken, your ticket will be confirmed by email within a few minutes, or refunded." }, { status: 402 });
  }
  const r = await confirmTicketPayment(orderId, paymentId);
  if (r === "unknown") return NextResponse.json({ success: false, error: "Order not found." }, { status: 404 });
  if (r === "refunded") {
    return NextResponse.json({ success: false, error: "Sorry — the last seat sold while you were paying. Your payment has been fully refunded; banks usually show it in 5–7 working days." }, { status: 409 });
  }
  return NextResponse.json({ success: true });
}
