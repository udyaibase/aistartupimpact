import { prisma } from '@udyaibase/database';
import { requirePagePermission } from '@/lib/employer/page-guard';
import { planStatus } from '@/lib/employer/billing';
import { foundingEligible, FOUNDING_LIMIT, planPrice, planSoldName, PLANS, type PlanKey } from '@/lib/employer/plans';
import BillingClient from '@/components/employer/billing/BillingClient';
import { invoicesEnabled } from '@/lib/billing/invoice';
import { BILLING_SELECT, profileFromRow } from '@/lib/billing/details';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Plans & billing' };

export default async function BillingPage() {
  const session = await requirePagePermission('account.manage');
  const [status, payments, openJobs, billing, teammates, foundingMembers] = await Promise.all([
    planStatus(session.id),
    prisma.jobBoardPayment.findMany({
      where: { employerId: session.id, status: { in: ['SUCCESS', 'FAILED'] } },
      orderBy: { createdAt: 'desc' },
      take: 24,
      select: { id: true, plan: true, cycle: true, amountPaise: true, gstPaise: true, totalPaise: true, status: true, paidAt: true, createdAt: true, periodStart: true, periodEnd: true, invoiceNumber: true, invoiceEmailedAt: true, refundAmountPaise: true, creditNoteNumber: true },
    }),
    prisma.jobBoardListing.count({ where: { employerId: session.id, status: 'OPEN', deletedAt: null } }),
    prisma.jobBoardEmployer.findUnique({ where: { id: session.id }, select: { ...BILLING_SELECT, email: true, foundingMemberAt: true, foundingLostAt: true } }),
    prisma.jobBoardTeamMember.count({ where: { employerId: session.id, status: { in: ['PENDING', 'ACTIVE'] } } }),
    prisma.jobBoardEmployer.count({ where: { foundingMemberAt: { not: null } } }),
  ]);
  const founding = billing ? foundingEligible(billing, billing.foundingMemberAt ? 0 : foundingMembers) : false;
  const keys: PlanKey[] = ['FREE', 'GROWTH', 'PRO', 'SCALE'];

  return (
    <BillingClient
      current={status!.plan.key}
      expiresAt={status!.expiresAt ? new Date(status!.expiresAt).toISOString() : null}
      ai={status!.ai}
      aiAutoScreen={status!.aiAutoScreen}
      openJobs={openJobs}
      seatsUsed={1 + teammates}
      cycle={status!.cycle}
      founding={{ eligible: founding, member: !!billing?.foundingMemberAt && founding, placesLeft: Math.max(0, FOUNDING_LIMIT - foundingMembers) }}
      plans={keys.map((k) => ({
        ...PLANS[k],
        monthly: planPrice(k, 'MONTHLY'),
        annual: planPrice(k, 'ANNUAL'),
        annualFounding: planPrice(k, 'ANNUAL', { founding: true }),
      }))}
      payments={payments.map((p) => ({
        id: p.id, label: `${planSoldName(p.plan)} plan${p.cycle === 'ANNUAL' ? ' (annual)' : ''}`, status: p.status, date: (p.paidAt ?? p.createdAt).toISOString(),
        periodStart: p.periodStart?.toISOString() ?? null, periodEnd: p.periodEnd?.toISOString() ?? null,
        amountPaise: p.amountPaise, gstPaise: p.gstPaise, totalPaise: p.totalPaise, refundedPaise: p.refundAmountPaise ?? 0,
        invoiceNumber: p.invoiceNumber, emailedAt: p.invoiceEmailedAt?.toISOString() ?? null, creditNoteNumber: p.creditNoteNumber,
      }))}
      billing={profileFromRow(billing, billing?.email ?? session.email)}
      invoices={invoicesEnabled()}
      paymentsReady={!!process.env.RAZORPAY_KEY_ID && !!process.env.RAZORPAY_KEY_SECRET}
    />
  );
}
