import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { webhookSignatureValid } from '@/lib/billing/razorpay';
import { activatePayment } from '@/lib/employer/billing';
import { activateOrganizerPayment } from '@/lib/events/billing';
import { confirmTicketPayment, markTicketPaymentFailed } from '@/lib/events/tickets';

export const dynamic = 'force-dynamic';

/**
 * Razorpay webhook for subscriptions sold in the portals (events: payment.captured, order.paid, payment.failed).
 * Employer plans and event-host plans/boosts; other products on the account (e.g. founder ads) are ignored.
 */
export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (!webhookSignatureValid(raw, request.headers.get('x-razorpay-signature') ?? '')) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }
  let body: { event?: string; payload?: { payment?: { entity?: { id?: string; order_id?: string; notes?: Record<string, string> } } } };
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: 'Bad payload' }, { status: 400 }); }

  const entity = body.payload?.payment?.entity;
  const purpose = entity?.notes?.purpose;
  const isEmployer = purpose === 'EMPLOYER_PLAN';
  const isHost = purpose === 'ORGANIZER_PLAN' || purpose === 'ORGANIZER_BOOST';
  const isTicket = purpose === 'EVENT_TICKET';
  if (!entity?.order_id || (!isEmployer && !isHost && !isTicket)) return NextResponse.json({ status: 'ignored' });

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
