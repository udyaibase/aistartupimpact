import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { activatePayment, checkoutSignatureValid } from '@/lib/employer/billing';
import { ensureCaptured } from '@/lib/billing/razorpay';
import { writeLimited } from '@/lib/employer/write-limit';
import { employerApi } from '@/lib/employer/api-session';

export const dynamic = 'force-dynamic';

/** Checkout success callback. The webhook activates too; whichever lands first wins. */
export async function POST(request: NextRequest) {
  const limited = await writeLimited(request, 'billing/verify');
  if (limited) return limited;
  const guard = await employerApi('account.manage');
  if (guard.error) return guard.error;
  const session = guard.session;

  const body = await request.json().catch(() => ({}));
  const orderId = String(body.razorpay_order_id ?? '');
  const paymentId = String(body.razorpay_payment_id ?? '');
  const signature = String(body.razorpay_signature ?? '');

  const pay = await prisma.jobBoardPayment.findUnique({ where: { razorpayOrderId: orderId }, select: { employerId: true, totalPaise: true } });
  if (!pay || pay.employerId !== session.id) return NextResponse.json({ error: 'Payment not found.' }, { status: 404 });
  if (!checkoutSignatureValid(orderId, paymentId, signature)) {
    return NextResponse.json({ error: 'We couldn’t confirm this payment. If money was taken, it will activate within a few minutes or be refunded.' }, { status: 400 });
  }
  // The signature proves authorisation only; activate on money actually captured, for the amount we charged.
  if (!(await ensureCaptured(paymentId, orderId, pay.totalPaise)).ok) {
    return NextResponse.json({ error: 'We couldn’t confirm this payment yet. If money was taken, it will activate within a few minutes or be refunded.' }, { status: 402 });
  }
  await activatePayment(orderId, paymentId);
  return NextResponse.json({ success: true });
}
