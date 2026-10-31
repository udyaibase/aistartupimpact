import { NextRequest, NextResponse } from "next/server";
import { checkoutSignatureValid } from "@/lib/billing/razorpay";
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
  const r = await confirmTicketPayment(orderId, paymentId);
  if (r === "unknown") return NextResponse.json({ success: false, error: "Order not found." }, { status: 404 });
  return NextResponse.json({ success: true });
}
