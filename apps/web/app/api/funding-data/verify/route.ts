import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { checkoutSignatureValid } from '@/lib/billing/razorpay';
import { activateFundingPurchase, downloadUrl } from '@/lib/funding/purchase';

export const dynamic = 'force-dynamic';

/** Checkout success callback: confirm the signature, activate (the webhook does too), return the download link. */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const orderId = String(body.razorpay_order_id ?? '');
  const paymentId = String(body.razorpay_payment_id ?? '');
  const signature = String(body.razorpay_signature ?? '');

  const p = await prisma.fundingDataPurchase.findUnique({ where: { razorpayOrderId: orderId }, select: { id: true } });
  if (!p) return NextResponse.json({ error: 'Payment not found.' }, { status: 404 });
  if (!checkoutSignatureValid(orderId, paymentId, signature)) {
    return NextResponse.json({ error: 'We couldn’t confirm this payment. If money was taken, the download link will be emailed within a few minutes.' }, { status: 400 });
  }
  await activateFundingPurchase(orderId, paymentId);
  return NextResponse.json({ success: true, downloadUrl: downloadUrl(p.id) });
}
