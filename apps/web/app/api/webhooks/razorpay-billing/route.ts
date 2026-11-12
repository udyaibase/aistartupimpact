import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { webhookSignatureValid } from '@/lib/billing/razorpay';
import { activatePayment } from '@/lib/employer/billing';
import { activateOrganizerPayment } from '@/lib/events/billing';
import { confirmTicketPayment, markTicketPaymentFailed } from '@/lib/events/tickets';
import { activateFundingPurchase, markFundingPurchaseFailed } from '@/lib/funding/purchase';
import { refreshPayoutByAccount } from '@/lib/events/payouts';

export const dynamic = 'force-dynamic';

/**
 * Razorpay webhook for subscriptions sold in the portals (events: payment.captured, order.paid, payment.failed).
 * Employer plans, event-host plans/boosts, event tickets and funding-data downloads; other products on the account
 * (e.g. founder ads) are ignored.
 */
export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (!webhookSignatureValid(raw, request.headers.get('x-razorpay-signature') ?? '')) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }
  let body: {
    event?: string; account_id?: string;
    payload?: { payment?: { entity?: { id?: string; order_id?: string; status?: string; amount?: number; currency?: string; notes?: Record<string, string> } }; account?: { entity?: { id?: string } } };
  };
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: 'Bad payload' }, { status: 400 }); }

  // Route linked-account review (host payouts): account.* and product.route.* events. Re-read the host's status
  // from Razorpay rather than trusting the event name, and email them when they can start selling tickets.
  if (body.event?.startsWith('account.') || body.event?.startsWith('product.route.')) {
    const accountId = body.payload?.account?.entity?.id ?? body.account_id;
    if (!accountId) return NextResponse.json({ status: 'ignored' });
    const status = await refreshPayoutByAccount(accountId).catch((e) => { console.error('[razorpay-billing] payout refresh', e instanceof Error ? e.message : e); return null; });
    return NextResponse.json({ status: status ?? 'unknown_account' });
  }

  const entity = body.payload?.payment?.entity;
  const purpose = entity?.notes?.purpose;
  const isEmployer = purpose === 'EMPLOYER_PLAN';
  const isHost = purpose === 'ORGANIZER_PLAN' || purpose === 'ORGANIZER_BOOST';
  const isTicket = purpose === 'EVENT_TICKET';
  const isFunding = purpose === 'FUNDING_DATA';
  if (!entity?.order_id || (!isEmployer && !isHost && !isTicket && !isFunding)) return NextResponse.json({ status: 'ignored' });

  // Activate only on captured money for exactly the amount we charged (the signed payload carries both).
  const paidEvent = body.event === 'payment.captured' || body.event === 'order.paid';
  if (paidEvent) {
    const expected = await expectedTotal(purpose!, entity.order_id);
    if (expected == null) return NextResponse.json({ status: 'unknown' });
    if (entity.status !== 'captured' || entity.currency !== 'INR' || entity.amount !== expected) {
      console.error('[razorpay-billing] not activating', entity.order_id, entity.status, entity.amount, expected);
      return NextResponse.json({ status: 'not_captured_or_mismatch' });
    }
  }

  if (isFunding) {
    if (body.event === 'payment.captured' || body.event === 'order.paid') return NextResponse.json({ status: await activateFundingPurchase(entity.order_id, String(entity.id)) });
    if (body.event === 'payment.failed') await markFundingPurchaseFailed(entity.order_id);
    return NextResponse.json({ status: 'ok' });
  }

  if (isTicket) {
    if (body.event === 'payment.captured' || body.event === 'order.paid') return NextResponse.json({ status: await confirmTicketPayment(entity.order_id, String(entity.id)) });
    if (body.event === 'payment.failed') await markTicketPaymentFailed(entity.order_id);
    return NextResponse.json({ status: 'ok' });
  }

  if (body.event === 'payment.captured' || body.event === 'order.paid') {
    const r = isEmployer ? await activatePayment(entity.order_id, String(entity.id)) : await activateOrganizerPayment(entity.order_id, String(entity.id));
    return NextResponse.json({ status: r });
  }
  if (body.event === 'payment.failed') {
    const where = { razorpayOrderId: entity.order_id, status: 'PENDING' as const };
    const data = { status: 'FAILED' as const, failedAt: new Date() };
    if (isEmployer) await prisma.jobBoardPayment.updateMany({ where, data });
    else await prisma.organizerPayment.updateMany({ where, data });
  }
  return NextResponse.json({ status: 'ok' });
}

/** What we charged for this order, by product (null when we have no record of it). */
async function expectedTotal(purpose: string, orderId: string): Promise<number | null> {
  if (purpose === 'EMPLOYER_PLAN') return (await prisma.jobBoardPayment.findUnique({ where: { razorpayOrderId: orderId }, select: { totalPaise: true } }))?.totalPaise ?? null;
  if (purpose === 'ORGANIZER_PLAN' || purpose === 'ORGANIZER_BOOST') return (await prisma.organizerPayment.findUnique({ where: { razorpayOrderId: orderId }, select: { totalPaise: true } }))?.totalPaise ?? null;
  if (purpose === 'FUNDING_DATA') return (await prisma.fundingDataPurchase.findUnique({ where: { razorpayOrderId: orderId }, select: { totalPaise: true } }))?.totalPaise ?? null;
  if (purpose === 'EVENT_TICKET') return (await prisma.eventRegistration.findFirst({ where: { razorpayOrderId: orderId }, select: { amountPaise: true } }))?.amountPaise ?? null;
  return null;
}
