import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { getEmployerSession } from '@/lib/employer-auth';
import { can, forbidden } from '@/lib/employer/permissions';
import { activatePayment, checkoutSignatureValid } from '@/lib/employer/billing';

export const dynamic = 'force-dynamic';

/** Checkout success callback. The webhook activates too; whichever lands first wins. */
export async function POST(request: NextRequest) {
  const session = await getEmployerSession();
  if (!session) return NextResponse.json({ error: 'Please log in again.' }, { status: 401 });
  if (!can(session.role, 'account.manage')) return forbidden();

  const body = await request.json().catch(() => ({}));
  const orderId = String(body.razorpay_order_id ?? '');
  const paymentId = String(body.razorpay_payment_id ?? '');
  const signature = String(body.razorpay_signature ?? '');

  const pay = await prisma.jobBoardPayment.findUnique({ where: { razorpayOrderId: orderId }, select: { employerId: true } });
  if (!pay || pay.employerId !== session.id) return NextResponse.json({ error: 'Payment not found.' }, { status: 404 });
  if (!checkoutSignatureValid(orderId, paymentId, signature)) {
    return NextResponse.json({ error: 'We couldn’t confirm this payment. If money was taken, it will activate within a few minutes or be refunded.' }, { status: 400 });
  }
  await activatePayment(orderId, paymentId);
  return NextResponse.json({ success: true });
}
