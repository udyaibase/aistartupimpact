"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@udyaibase/database";
import { logAuditEvent } from "@/lib/audit-log";
import { publicError } from '@/lib/public-error';
import { tooMany } from '@/lib/rate-limit';
import { sectionRoles } from '@/lib/section-access';

const ALLOWED = sectionRoles('/advertise/payments');

export async function getPaymentStatsAction() {
  const session: any = await getServerSession(authOptions);
  if (!session?.user || !ALLOWED.includes(session.user.role))
    return { success: false, error: "Unauthorized" };

  try {
    const [total, success, pending, failed, revenue] = await Promise.all([
      prisma.$queryRaw<any[]>`SELECT COUNT(*)::int as count FROM "AdvPayment"`,
      prisma.$queryRaw<any[]>`SELECT COUNT(*)::int as count FROM "AdvPayment" WHERE status = 'SUCCESS'`,
      prisma.$queryRaw<any[]>`SELECT COUNT(*)::int as count FROM "AdvPayment" WHERE status = 'PENDING'`,
      prisma.$queryRaw<any[]>`SELECT COUNT(*)::int as count FROM "AdvPayment" WHERE status = 'FAILED'`,
      prisma.$queryRaw<any[]>`SELECT COALESCE(SUM("totalPaise"), 0)::bigint as total FROM "AdvPayment" WHERE status = 'SUCCESS'`,
    ]);
    return {
      success: true,
      data: {
        total: Number(total[0]?.count || 0),
        success: Number(success[0]?.count || 0),
        pending: Number(pending[0]?.count || 0),
        failed: Number(failed[0]?.count || 0),
        revenue: Number(revenue[0]?.total || 0),
      },
    };
  } catch (e: any) {
    return { success: false, error: publicError(e) };
  }
}

export async function getAdvPaymentsAction() {
  const session: any = await getServerSession(authOptions);
  if (!session?.user || !ALLOWED.includes(session.user.role))
    return { success: false, error: "Unauthorized", data: [] };

  try {
    const payments = await prisma.$queryRaw<any[]>`
      SELECT
        p.id, p.purpose, p."amountPaise", p."gstPaise", p."totalPaise",
        p.currency, p."razorpayOrderId", p."razorpayPaymentId",
        p.status, p."paidAt", p."failedAt", p."refundedAt", p."refundAmountPaise",
        p."createdAt",
        f.id as "founderId", f.name as "founderName", f.email as "founderEmail",
        pkg.tier as "packageTier"
      FROM "AdvPayment" p
      JOIN "FounderUser" f ON f.id = p."founderId"
      LEFT JOIN "AdvPackage" pkg ON pkg.id = p."packageId"
      ORDER BY p."createdAt" DESC
    `;
    return {
      success: true,
      data: payments.map((p: any) => ({
        ...p,
        amountPaise: Number(p.amountPaise || 0),
        gstPaise: Number(p.gstPaise || 0),
        totalPaise: Number(p.totalPaise || 0),
        refundAmountPaise: p.refundAmountPaise ? Number(p.refundAmountPaise) : null,
      })),
    };
  } catch (e: any) {
    return { success: false, error: publicError(e), data: [] };
  }
}

export async function markRefundAction(paymentId: string, refundAmountPaise: number) {
  const session: any = await getServerSession(authOptions);
  if (!session?.user || !["SUPER_ADMIN"].includes(session.user.role))
    return { success: false, error: "Only Super Admins can process refunds" };
  const paused = tooMany(session.user.id, 'refund');
  if (paused) return { success: false, error: paused };

  try {
    const payment = await prisma.$queryRaw<any[]>`
      SELECT id, status, "totalPaise", "founderId", purpose FROM "AdvPayment" WHERE id = ${paymentId} LIMIT 1
    `;
    if (!payment.length) return { success: false, error: "Payment not found" };
    if (payment[0].status !== "SUCCESS") return { success: false, error: "Only successful payments can be refunded" };

    await prisma.$executeRaw`
      UPDATE "AdvPayment"
      SET status = 'REFUNDED', "refundedAt" = NOW(), "refundAmountPaise" = ${refundAmountPaise}, "updatedAt" = NOW()
      WHERE id = ${paymentId}
    `;

    await logAuditEvent({
      action: "UPDATE",
      resourceType: "ADV_PAYMENT",
      resourceId: paymentId,
      resourceName: `${payment[0].purpose} refund`,
      before: { status: payment[0].status },
      after: { status: "REFUNDED", refundAmountPaise },
    });

    return { success: true };
  } catch (e: any) {
    return { success: false, error: publicError(e) };
  }
}
