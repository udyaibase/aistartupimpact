import { NextResponse } from "next/server";
import { prisma } from "@udyaibase/database";
import { requirePermission } from "@/lib/organizer-auth/require-permission";
import { hostPlanStatus, upcomingWhere } from "@/lib/events/billing";
import { EVENT_BOOST, HOST_PLANS, registrationLimit } from "@/lib/events/plans";
import { razorpayKeys, withGst } from "@/lib/billing/razorpay";
import { invoicesEnabled } from "@/lib/billing/invoice";
import HostBillingClient from "@/components/organizer/billing/HostBillingClient";
import { BILLING_SELECT, profileFromRow } from '@/lib/billing/details';

export const dynamic = "force-dynamic";
export const metadata = { title: "Plans & billing" };

export default async function HostBillingPage(props: { searchParams: Promise<{ boost?: string }> }) {
  const session = await requirePermission("billing");
  if (session instanceof NextResponse) {
    return (
      <div className="font-jakarta">
        <h1 className="portal-title">Plans &amp; billing</h1>
        <p className="portal-subtitle">Only the account owner or an admin can manage the plan.</p>
      </div>
    );
  }
  const sp = await props.searchParams;
  const [status, events, payments, billing] = await Promise.all([
    hostPlanStatus(session.organizerId),
    prisma.event.findMany({
      where: upcomingWhere(session.organizerId),
      orderBy: { startAt: "asc" },
      select: {
        id: true, title: true, startAt: true, boostedAt: true, featuredUntil: true, capacity: true, registrationCount: true,
        _count: { select: { registrations: { where: { status: "WAITLISTED", deletedAt: null } } } },
      },
    }),
    prisma.organizerPayment.findMany({
      where: { organizerId: session.organizerId, status: { in: ["SUCCESS", "FAILED"] } },
      orderBy: { createdAt: "desc" },
      take: 24,
      select: { id: true, kind: true, eventId: true, amountPaise: true, gstPaise: true, totalPaise: true, status: true, paidAt: true, createdAt: true, periodStart: true, periodEnd: true, invoiceNumber: true, invoiceEmailedAt: true, refundAmountPaise: true, creditNoteNumber: true },
    }),
    prisma.eventOrganizer.findUnique({ where: { id: session.organizerId }, select: { ...BILLING_SELECT, email: true } }),
  ]);
  const titles = Object.fromEntries(events.map((e) => [e.id, e.title]));
  const now = new Date();

  return (
    <HostBillingClient
      current={status!.plan.key}
      expiresAt={status!.expiresAt ? new Date(status!.expiresAt).toISOString() : null}
      usage={{ upcoming: status!.upcoming, team: status!.team, promo: status!.promo }}
      plans={(["FREE", "PRO"] as const).map((k) => ({ ...HOST_PLANS[k], price: withGst(HOST_PLANS[k].pricePaise) }))}
      boost={{ ...EVENT_BOOST, price: withGst(EVENT_BOOST.pricePaise) }}
      events={events.map((e) => ({
        id: e.id, title: e.title, startAt: e.startAt.toISOString(), boosted: !!e.boostedAt,
        featured: !!e.featuredUntil && e.featuredUntil > now, registered: e.registrationCount,
        limit: registrationLimit(status!.plan, e), waitlisted: e._count.registrations,
      }))}
      payments={payments.map((p) => ({
        id: p.id, label: p.kind === "PRO" ? "Pro plan" : `Event Boost${p.eventId && titles[p.eventId] ? ` · ${titles[p.eventId]}` : ""}`,
        status: p.status, date: (p.paidAt ?? p.createdAt).toISOString(),
        periodStart: p.kind === "PRO" ? p.periodStart?.toISOString() ?? null : null, periodEnd: p.kind === "PRO" ? p.periodEnd?.toISOString() ?? null : null,
        amountPaise: p.amountPaise, gstPaise: p.gstPaise, totalPaise: p.totalPaise, refundedPaise: p.refundAmountPaise ?? 0,
        invoiceNumber: p.invoiceNumber, emailedAt: p.invoiceEmailedAt?.toISOString() ?? null, creditNoteNumber: p.creditNoteNumber,
      }))}
      billing={profileFromRow(billing, billing?.email ?? '')}
      invoices={invoicesEnabled()}
      highlight={sp.boost ?? null}
      paymentsReady={!!razorpayKeys()}
    />
  );
}
