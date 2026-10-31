import { prisma } from '@udyaibase/database';
import { requirePagePermission } from '@/lib/employer/page-guard';
import { planStatus } from '@/lib/employer/billing';
import { PLANS, planPrice } from '@/lib/employer/plans';
import BillingClient from '@/components/employer/billing/BillingClient';
import { invoicesEnabled } from '@/lib/billing/invoice';
import { BILLING_SELECT, profileFromRow } from '@/lib/billing/details';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Plans & billing' };

export default async function BillingPage() {
  const session = await requirePagePermission('account.manage');
  const [status, payments, openJobs, billing] = await Promise.all([
    planStatus(session.id),
    prisma.jobBoardPayment.findMany({
      where: { employerId: session.id, status: { in: ['SUCCESS', 'FAILED'] } },
      orderBy: { createdAt: 'desc' },
      take: 24,
      select: { id: true, plan: true, amountPaise: true, gstPaise: true, totalPaise: true, status: true, paidAt: true, createdAt: true, periodStart: true, periodEnd: true, invoiceNumber: true, invoiceEmailedAt: true, refundAmountPaise: true, creditNoteNumber: true },
    }),
    prisma.jobBoardListing.count({ where: { employerId: session.id, status: 'OPEN', deletedAt: null } }),
    prisma.jobBoardEmployer.findUnique({ where: { id: session.id }, select: { ...BILLING_SELECT, email: true } }),
  ]);

  return (
    <BillingClient
      current={status!.plan.key}
      expiresAt={status!.expiresAt ? new Date(status!.expiresAt).toISOString() : null}
      ai={status!.ai}
      aiAutoScreen={status!.aiAutoScreen}
      openJobs={openJobs}
      plans={(['FREE', 'FEATURED', 'PREMIUM'] as const).map((k) => ({ ...PLANS[k], price: planPrice(k) }))}
      payments={payments.map((p) => ({
        id: p.id, label: `${PLANS[p.plan].name} plan`, status: p.status, date: (p.paidAt ?? p.createdAt).toISOString(),
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
