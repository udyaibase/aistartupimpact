import { prisma } from '@udyaibase/database';
import { cleanRegistrationInput, RegistrationInputError } from '@/lib/events/registration-input';
import { razorpayApi, RazorpayApiError, razorpayKeys, refundPayment } from '@/lib/billing/razorpay';
import { effectiveHostPlan, registrationLimit } from '@/lib/events/plans';
import { generateQrToken } from '@/lib/events/qr-token';
import { handleNewsletterSubscription, sendConfirmationEmail } from '@/lib/events/register-event';
import { sendEmailFireAndForget } from '@/lib/email/send';
import { button, esc, shell } from '@/lib/jobs/apply-emails';
import { refreshPaths } from '@/lib/revalidate';
import { opsAlert } from '@/lib/ops/alert';

/**
 * Paid event tickets via Razorpay Route.
 *
 * Checkout holds a seat for HOLD_MINUTES (pending holds count against capacity and tier quantity),
 * then creates an order that splits the payment: the host's share is transferred to their linked
 * account, held until 2 days after the event ends so refunds can still reverse it; Udyaibase keeps
 * TICKET_PLATFORM_FEE_PCT (default 5%). Confirmation is idempotent (checkout callback and webhook).
 */

export const HOLD_MINUTES = 15;
const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://udyaibase.com').replace(/\/$/, '');

export function ticketFeePct(): number {
  const n = Number(process.env.TICKET_PLATFORM_FEE_PCT ?? 5);
  return Number.isFinite(n) && n >= 0 && n <= 30 ? n : 5;
}

export function splitTicket(amountPaise: number) {
  const fee = Math.round((amountPaise * ticketFeePct()) / 100);
  return { amount: amountPaise, fee, hostShare: amountPaise - fee };
}

export class TicketError extends Error {
  constructor(message: string, public status: number, public code?: string, public field?: string) { super(message); }
}

export interface CheckoutParams {
  eventId: string; ticketTierId: string; name: string; email: string; phone?: string | null; company?: string | null;
  occupation?: string | null; locationCity?: string | null; newsletterConsent?: boolean; whatsappConsent?: boolean;
  answers?: { questionId: string; answerText: string }[]; registrationSource?: 'WEBSITE' | 'EMBED';
}

export async function startTicketCheckout(p: CheckoutParams) {
  if (!razorpayKeys()) throw new TicketError('Ticket payments are not available right now.', 503);
  const now = new Date();
  // Same rules as free registration and the widget: lowercase email, one phone format, this event's answers only.
  let cleaned;
  try {
    cleaned = await cleanRegistrationInput({ eventId: p.eventId, email: p.email, phone: p.phone, company: p.company, occupation: p.occupation, answers: p.answers });
  } catch (err) {
    if (err instanceof RegistrationInputError) throw new TicketError(err.message, 400, 'invalid', err.field);
    throw err;
  }
  const { email } = cleaned;

  const event = await prisma.event.findUnique({
    where: { id: p.eventId },
    select: {
      id: true, title: true, status: true, deletedAt: true, endAt: true, capacity: true, registrationDeadline: true, boostedAt: true,
      tags: { select: { tagId: true } },
      organizer: { select: { email: true, plan: true, planExpiresAt: true, payoutAccountId: true, payoutStatus: true } },
    },
  });
  if (!event || event.deletedAt || event.status !== 'PUBLISHED') throw new TicketError('This event is not open for registration.', 404);
  if (event.endAt <= now) throw new TicketError('This event has ended.', 400);
  if (event.registrationDeadline && event.registrationDeadline < now) throw new TicketError('Registration has closed.', 400);
  if (event.organizer.payoutStatus !== 'ACTIVATED' || !event.organizer.payoutAccountId) throw new TicketError('This host can’t sell tickets right now.', 400);

  const tier = await prisma.eventTicketTier.findFirst({ where: { id: p.ticketTierId, eventId: event.id } });
  if (!tier || tier.priceCents <= 0) throw new TicketError('Choose a ticket.', 400);
  if ((tier.saleStart && tier.saleStart > now) || (tier.saleEnd && tier.saleEnd < now)) throw new TicketError(`${tier.name} tickets are not on sale right now.`, 400);

  const limit = registrationLimit(effectiveHostPlan(event.organizer), event);
  const amount = splitTicket(tier.priceCents);

  // Lock the event row so two buyers can't take the last seat; unexpired holds count as taken.
  const held = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${event.id} FOR UPDATE`;
    const existing = await tx.eventRegistration.findUnique({ where: { eventId_guestEmail: { eventId: event.id, guestEmail: email } } });
    if (existing && !existing.deletedAt && ['CONFIRMED', 'CHECKED_IN', 'PENDING_APPROVAL', 'WAITLISTED'].includes(existing.status)) {
      throw new TicketError('You are already registered for this event.', 409, 'already_registered');
    }
    // Same buyer, same ticket, hold still running (a retry or a second tab): hand back the order they already have.
    // Replacing it would leave the first order with no record, so paying it would take money and issue no ticket.
    if (
      existing && !existing.deletedAt && existing.status === 'PENDING_PAYMENT' && existing.razorpayOrderId
      && existing.ticketTierId === tier.id && existing.amountPaise === amount.amount
      && existing.paymentExpiresAt && existing.paymentExpiresAt > now
    ) {
      return { id: existing.id, orderId: existing.razorpayOrderId };
    }
    const [{ count: confirmed }] = await tx.$queryRaw<{ count: number }[]>`SELECT "registrationCount" AS count FROM "Event" WHERE id = ${event.id}`;
    const holds = await tx.eventRegistration.count({ where: { eventId: event.id, status: 'PENDING_PAYMENT', paymentExpiresAt: { gt: now }, deletedAt: null, NOT: { guestEmail: email } } });
    if (Number(confirmed) + holds >= limit) throw new TicketError('Sold out. All tickets are taken or being bought right now.', 409, 'sold_out');
    if (tier.quantity != null) {
      const tierTaken = await tx.eventRegistration.count({
        where: { ticketTierId: tier.id, deletedAt: null, NOT: { guestEmail: email }, OR: [{ status: { in: ['CONFIRMED', 'CHECKED_IN'] } }, { status: 'PENDING_PAYMENT', paymentExpiresAt: { gt: now } }] },
      });
      if (tierTaken >= tier.quantity) throw new TicketError(`${tier.name} tickets are sold out.`, 409, 'sold_out');
    }
    const data = {
      ticketTierId: tier.id, guestName: p.name.trim().slice(0, 100), guestPhone: cleaned.phone, guestCompany: cleaned.company,
      guestOccupation: cleaned.occupation, whatsappConsent: !!p.whatsappConsent, registrationSource: p.registrationSource ?? 'WEBSITE',
      status: 'PENDING_PAYMENT' as const, paymentStatus: 'PENDING', amountPaise: amount.amount, platformFeePaise: amount.fee,
      paymentExpiresAt: new Date(now.getTime() + HOLD_MINUTES * 60_000), razorpayOrderId: null, razorpayPaymentId: null, cancelledAt: null, deletedAt: null,
    };
    const reg = existing
      ? await tx.eventRegistration.update({ where: { id: existing.id }, data })
      : await tx.eventRegistration.create({ data: { ...data, eventId: event.id, guestEmail: email, qrToken: generateQrToken(16) } });
    if (cleaned.answers.length) {
      await tx.eventRegistrationAnswer.deleteMany({ where: { registrationId: reg.id } });
      await tx.eventRegistrationAnswer.createMany({ data: cleaned.answers.map((a) => ({ registrationId: reg.id, questionId: a.questionId, answerText: a.answerText })) });
    }
    return { id: reg.id, orderId: null as string | null };
  });
  const registrationId = held.id;
  const checkout = (orderId: string, keyId: string) => ({
    registrationId, keyId, orderId, amount: amount.amount, currency: 'INR', name: 'Udyaibase Events',
    description: `${tier.name} ticket · ${event.title}`.slice(0, 250), prefill: { email, name: p.name, ...(cleaned.phone ? { contact: cleaned.phone.replace(/\s/g, '') } : {}) },
    holdMinutes: HOLD_MINUTES,
  });
  if (held.orderId) return checkout(held.orderId, razorpayKeys()!.keyId);

  try {
    const holdUntil = Math.floor((event.endAt.getTime() + 2 * 864e5) / 1000);
    const { orderId, keyId } = await createRazorpayOrderWithTransfer(amount, event.organizer.payoutAccountId!, holdUntil, registrationId, event.id);
    await prisma.eventRegistration.update({ where: { id: registrationId }, data: { razorpayOrderId: orderId } });
    if (p.newsletterConsent) handleNewsletterSubscription(email, p.name, p.locationCity ?? undefined, event.id, event.tags).catch(() => {});
    return checkout(orderId, keyId);
  } catch (err) {
    // Release the hold if the order couldn't be created.
    await prisma.eventRegistration.update({ where: { id: registrationId }, data: { status: 'CANCELLED', paymentStatus: 'FAILED', cancelledAt: new Date() } }).catch(() => {});
    if (err instanceof RazorpayApiError) throw new TicketError('Payment could not be started. Try again in a minute.', 502);
    throw err;
  }
}

async function createRazorpayOrderWithTransfer(amount: ReturnType<typeof splitTicket>, accountId: string, holdUntil: number, registrationId: string, eventId: string) {
  const keys = razorpayKeys()!;
  const order = await razorpayApi<{ id: string }>('POST', '/v1/orders', {
    amount: amount.amount, currency: 'INR', receipt: `tkt_${registrationId.replace(/-/g, '').slice(0, 30)}`,
    notes: { purpose: 'EVENT_TICKET', registrationId, eventId },
    transfers: [{
      account: accountId, amount: amount.hostShare, currency: 'INR', on_hold: true, on_hold_until: holdUntil,
      notes: { registrationId, eventId },
    }],
  });
  return { orderId: order.id, keyId: keys.keyId };
}

/**
 * Mark a ticket paid and confirm the seat. Safe to call twice (checkout callback + webhook).
 *
 * A buyer whose 15-minute hold was still valid has a reserved seat and is always confirmed. A payment that lands
 * after the hold expired is confirmed only if a seat is still free (counted under the same event lock as checkout);
 * otherwise it is refunded in full, the host's transfer reversed, and the buyer emailed. Without this, a late
 * payment could confirm a seat that had meanwhile sold to someone else.
 */
export async function confirmTicketPayment(orderId: string, paymentId: string): Promise<'confirmed' | 'already' | 'unknown' | 'refunded'> {
  const reg = await prisma.eventRegistration.findFirst({
    where: { razorpayOrderId: orderId },
    select: { id: true, eventId: true, guestEmail: true, guestName: true, qrToken: true, ticketTierId: true, amountPaise: true },
  });
  if (!reg) return 'unknown';

  const outcome = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${reg.eventId} FOR UPDATE`;
    const cur = await tx.eventRegistration.findUnique({ where: { id: reg.id }, select: { status: true, paymentStatus: true, paymentExpiresAt: true } });
    if (!cur || !['PENDING', 'FAILED', 'EXPIRED'].includes(cur.paymentStatus ?? '')) return 'already' as const;
    const now = new Date();
    const holdValid = cur.status === 'PENDING_PAYMENT' && !!cur.paymentExpiresAt && cur.paymentExpiresAt > now;
    if (!holdValid && !(await seatStillFree(tx, reg.eventId, reg.ticketTierId, reg.guestEmail ?? '', now))) {
      // Claim it for refund first, so the webhook and the checkout callback can't both refund.
      await tx.eventRegistration.update({ where: { id: reg.id }, data: { status: 'CANCELLED', paymentStatus: 'REFUND_PENDING', razorpayPaymentId: paymentId, paidAt: now, paymentExpiresAt: null, cancelledAt: now } });
      return 'no_room' as const;
    }
    await tx.eventRegistration.update({
      where: { id: reg.id },
      data: { status: 'CONFIRMED', paymentStatus: 'PAID', razorpayPaymentId: paymentId, paidAt: now, paymentExpiresAt: null, cancelledAt: null },
    });
    if (reg.ticketTierId) await tx.eventTicketTier.update({ where: { id: reg.ticketTierId }, data: { soldCount: { increment: 1 } } });
    return 'confirmed' as const;
  });

  if (outcome === 'already') return 'already';
  if (outcome === 'no_room') {
    await refundSoldOutPayment(reg.id, paymentId, reg.amountPaise ?? 0, reg.eventId, reg.guestEmail, reg.guestName);
    return 'refunded';
  }
  sendConfirmationEmail(reg.eventId, reg.guestEmail!, reg.guestName || 'there', reg.qrToken).catch(() => {});
  const ev = await prisma.event.findUnique({ where: { id: reg.eventId }, select: { slug: true } });
  if (ev) refreshPaths([`/events/${ev.slug}`]); // spots left
  return 'confirmed';
}

/**
 * A captured payment arrived for a ticket order we have no record of: the buyer's hold expired, they started again
 * (which replaced the order id on their registration), and then paid the older order. The order itself says which
 * registration it was for, so read it from Razorpay:
 * - registration still unpaid at the same price → point it back at this order ('adopted'); the caller then confirms
 *   it the normal way (seat check included);
 * - anything else (already paid through the newer order, price changed, registration gone) → full refund with the
 *   host transfer reversed ('refunded').
 * Either way the admins are told. 'unknown' means the order isn't one of our tickets.
 */
export async function recoverSupersededTicketOrder(orderId: string, paymentId: string): Promise<'adopted' | 'refunded' | 'unknown'> {
  let order: { amount?: number; notes?: Record<string, string> };
  try {
    order = await razorpayApi('GET', `/v1/orders/${encodeURIComponent(orderId)}`);
  } catch {
    return 'unknown';
  }
  const registrationId = order.notes?.registrationId;
  if (order.notes?.purpose !== 'EVENT_TICKET' || !registrationId || !order.amount) return 'unknown';

  const reg = await prisma.eventRegistration.findUnique({
    where: { id: registrationId },
    select: { id: true, eventId: true, amountPaise: true, guestEmail: true, guestName: true },
  });
  if (reg && reg.amountPaise === order.amount) {
    const adopted = await prisma.eventRegistration.updateMany({
      where: { id: reg.id, paymentStatus: { in: ['PENDING', 'FAILED', 'EXPIRED'] } },
      data: { razorpayOrderId: orderId },
    });
    if (adopted.count) {
      await opsAlert('ticket-order-recovered', 'A ticket was paid on an older checkout and recovered', [`Registration ${reg.id}`, `Order ${orderId}`, 'No action needed.'], 24).catch(() => {});
      return 'adopted';
    }
  }

  let refunded = false;
  try {
    await refundPayment(paymentId, order.amount, { registrationId, reason: 'superseded_order' }, { reverseTransfers: true });
    refunded = true;
  } catch (err) {
    console.error('[ticket] superseded-order refund failed', orderId, err instanceof Error ? err.message : err);
  }
  await opsAlert(
    refunded ? 'ticket-duplicate-refunded' : 'ticket-orphan-payment',
    refunded ? 'A duplicate ticket payment was refunded' : 'Ticket payment needs a manual refund',
    [`Registration ${registrationId}`, `Order ${orderId}`, `Payment ${paymentId}`, `Amount ₹${(order.amount / 100).toLocaleString('en-IN')}`,
      refunded ? 'The buyer paid an older checkout after this ticket was already settled; the extra payment was refunded in full.' : 'The automatic refund failed. Refund this payment from the Razorpay dashboard.'],
    refunded ? 24 : 1,
  ).catch(() => {});
  if (refunded && reg?.guestEmail) {
    const ev = await prisma.event.findUnique({ where: { id: reg.eventId }, select: { title: true } });
    sendEmailFireAndForget({
      to: reg.guestEmail,
      subject: `Refund on its way: extra payment for ${ev?.title ?? 'your ticket'}`,
      type: 'event_ticket_duplicate_refund',
      html: shell(`
<h1 style="font-size:20px;margin:0 0 8px">We refunded an extra payment</h1>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6">Hi ${esc(reg.guestName || 'there')}, we received a second payment of ₹${(order.amount / 100).toLocaleString('en-IN')} for <strong>${esc(ev?.title ?? 'your ticket')}</strong> from an earlier checkout window. It has been refunded in full to your original payment method; banks usually show it in 5–7 working days. If you already have a ticket, it is not affected.</p>
<p style="margin:0">${button(`${SITE}/events`, 'Go to events')}</p>`),
    });
  }
  return 'refunded';
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** Same rule as checkout: confirmed seats plus other buyers' unexpired holds must leave room, for the event and the tier. */
async function seatStillFree(tx: Tx, eventId: string, ticketTierId: string | null, email: string, now: Date): Promise<boolean> {
  const event = await tx.event.findUnique({
    where: { id: eventId },
    select: { capacity: true, boostedAt: true, registrationCount: true, organizer: { select: { email: true, plan: true, planExpiresAt: true } } },
  });
  if (!event) return false;
  const limit = registrationLimit(effectiveHostPlan(event.organizer), event);
  const holds = await tx.eventRegistration.count({ where: { eventId, status: 'PENDING_PAYMENT', paymentExpiresAt: { gt: now }, deletedAt: null, NOT: { guestEmail: email } } });
  if (event.registrationCount + holds >= limit) return false;
  if (ticketTierId) {
    const tier = await tx.eventTicketTier.findUnique({ where: { id: ticketTierId }, select: { quantity: true } });
    if (tier?.quantity != null) {
      const taken = await tx.eventRegistration.count({
        where: { ticketTierId, deletedAt: null, NOT: { guestEmail: email }, OR: [{ status: { in: ['CONFIRMED', 'CHECKED_IN'] } }, { status: 'PENDING_PAYMENT', paymentExpiresAt: { gt: now } }] },
      });
      if (taken >= tier.quantity) return false;
    }
  }
  return true;
}

/** Refund a payment that arrived after its seat sold (full amount, host transfer reversed) and tell the buyer. */
async function refundSoldOutPayment(registrationId: string, paymentId: string, amountPaise: number, eventId: string, email: string | null, name: string | null) {
  try {
    const refundId = await refundPayment(paymentId, amountPaise, { registrationId, reason: 'sold_out_after_hold_expired' }, { reverseTransfers: true });
    await prisma.eventRegistration.update({ where: { id: registrationId }, data: { paymentStatus: 'REFUNDED', refundId, refundedAt: new Date() } });
  } catch (err) {
    // Stays REFUND_PENDING: visible to admins and retried from the dashboard; the buyer still gets told.
    console.error('[ticket] sold-out refund failed', registrationId, err instanceof Error ? err.message : err);
  }
  if (!email) return;
  const ev = await prisma.event.findUnique({ where: { id: eventId }, select: { title: true } });
  sendEmailFireAndForget({
    to: email,
    subject: `Sold out: your payment for ${ev?.title ?? 'the event'} is being refunded`,
    type: 'event_ticket_sold_out_refund',
    html: shell(`
<h1 style="font-size:20px;margin:0 0 8px">Sorry, the last seat sold while you were paying</h1>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6">Hi ${esc(name || 'there')}, your payment for <strong>${esc(ev?.title ?? 'the event')}</strong> came through after your 15-minute hold ended, and the event had sold out by then. We've refunded the full ₹${(amountPaise / 100).toLocaleString('en-IN')} to your original payment method. Banks usually show it within 5–7 working days.</p>
<p style="margin:0">${button(`${SITE}/events`, 'Find other events')}</p>`),
  });
}

export async function markTicketPaymentFailed(orderId: string) {
  await prisma.eventRegistration.updateMany({ where: { razorpayOrderId: orderId, paymentStatus: 'PENDING' }, data: { paymentStatus: 'FAILED' } });
}

/** Full refund; reverses the host's transfer too. Used for host refunds and event cancellation. */
export async function refundTicket(registrationId: string, reason: 'host' | 'event_cancelled'): Promise<{ ok: true } | { ok: false; error: string }> {
  const reg = await prisma.eventRegistration.findUnique({
    where: { id: registrationId },
    select: { id: true, paymentStatus: true, razorpayPaymentId: true, amountPaise: true, guestEmail: true, guestName: true, ticketTierId: true, event: { select: { title: true } } },
  });
  if (!reg || reg.paymentStatus !== 'PAID' || !reg.razorpayPaymentId || !reg.amountPaise) return { ok: false, error: 'Only paid tickets can be refunded.' };
  try {
    const refund = await razorpayApi<{ id: string }>('POST', `/v1/payments/${reg.razorpayPaymentId}/refund`, {
      amount: reg.amountPaise, reverse_all: 1, speed: 'normal', notes: { registrationId: reg.id, reason },
    });
    await prisma.eventRegistration.update({
      where: { id: reg.id },
      data: { status: 'CANCELLED', cancelledAt: new Date(), paymentStatus: 'REFUNDED', refundId: refund.id, refundedAt: new Date() },
    });
    if (reg.ticketTierId) await prisma.eventTicketTier.updateMany({ where: { id: reg.ticketTierId, soldCount: { gt: 0 } }, data: { soldCount: { decrement: 1 } } });
    if (reg.guestEmail) {
      sendEmailFireAndForget({
        to: reg.guestEmail,
        subject: `Refund on its way: ${reg.event.title}`,
        type: 'event_ticket_refund',
        html: shell(`
<h1 style="font-size:20px;margin:0 0 8px">Your ticket has been refunded</h1>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6">${reason === 'event_cancelled' ? `<strong>${esc(reg.event.title)}</strong> was cancelled by the host, so` : `The host of <strong>${esc(reg.event.title)}</strong> has cancelled your ticket, and`} we've refunded ₹${(reg.amountPaise / 100).toLocaleString('en-IN')} to your original payment method. Banks usually show it within 5–7 working days.</p>
<p style="margin:0">${button(`${SITE}/events`, 'Find other events')}</p>`),
      });
    }
    return { ok: true };
  } catch (err) {
    console.error('[ticket refund]', err instanceof Error ? err.message : err);
    return { ok: false, error: err instanceof RazorpayApiError ? err.message : 'Refund failed. Try again.' };
  }
}

/** Refund every paid ticket of a cancelled event. */
export async function refundEventTickets(eventId: string) {
  const paid = await prisma.eventRegistration.findMany({ where: { eventId, paymentStatus: 'PAID' }, select: { id: true } });
  let refunded = 0;
  for (const r of paid) if ((await refundTicket(r.id, 'event_cancelled')).ok) refunded++;
  return { paid: paid.length, refunded };
}

/** Daily/regular cleanup: unpaid holds past their window (plus a grace period for late webhooks) are released. */
export async function expireTicketHolds(now = new Date()) {
  const res = await prisma.eventRegistration.updateMany({
    where: { status: 'PENDING_PAYMENT', paymentStatus: { in: ['PENDING', 'FAILED'] }, paymentExpiresAt: { lt: new Date(now.getTime() - 30 * 60_000) } },
    data: { status: 'CANCELLED', paymentStatus: 'EXPIRED', cancelledAt: now },
  });
  return { ticketHoldsExpired: res.count };
}
