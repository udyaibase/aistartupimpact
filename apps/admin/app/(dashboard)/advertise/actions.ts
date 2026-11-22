"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@udyaibase/database";
import { logAuditEvent } from "@/lib/audit-log";

const ALLOWED = ["SUPER_ADMIN", "EDITOR_IN_CHIEF", "AD_MANAGER"];

export async function getAdvStatsAction() {
  const session: any = await getServerSession(authOptions);
  if (!session?.user || !ALLOWED.includes(session.user.role))
    return { success: false, error: "Unauthorized" };

  try {
    const [total, active, free, revenue] = await Promise.all([
      prisma.$queryRaw<any[]>`SELECT COUNT(*)::int as count FROM "AdvPackage"`,
      prisma.$queryRaw<any[]>`SELECT COUNT(*)::int as count FROM "AdvPackage" WHERE status = 'ACTIVE'`,
      prisma.$queryRaw<any[]>`SELECT COUNT(*)::int as count FROM "AdvPackage" WHERE tier = 'FREE'`,
      prisma.$queryRaw<any[]>`SELECT COALESCE(SUM("totalPaise"), 0)::bigint as total FROM "AdvPayment" WHERE status = 'SUCCESS'`,
    ]);
    return {
      success: true,
      data: {
        total: Number(total[0]?.count || 0),
        active: Number(active[0]?.count || 0),
        free: Number(free[0]?.count || 0),
        revenue: Number(revenue[0]?.total || 0),
      },
    };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function getAdvPackagesAction() {
  const session: any = await getServerSession(authOptions);
  if (!session?.user || !ALLOWED.includes(session.user.role))
    return { success: false, error: "Unauthorized", data: [] };

  try {
    const packages = await prisma.$queryRaw<any[]>`
      SELECT
        p.id, p.tier, p.status, p."purchasedAt", p."expiresAt",
        p."upgradedFromId", p."upgradedToId", p."cancelledAt",
        f.id as "founderId", f.name as "founderName", f.email as "founderEmail",
        (SELECT COUNT(*)::int FROM "AdvZoneActivation" WHERE "packageId" = p.id) as "zoneCount",
        (SELECT COUNT(*)::int FROM "AdvSocialPostOrder" WHERE "packageId" = p.id) as "socialPostCount",
        (SELECT COALESCE(SUM("totalPaise"), 0)::bigint FROM "AdvPayment" WHERE "packageId" = p.id AND status = 'SUCCESS') as "totalPaid"
      FROM "AdvPackage" p
      JOIN "FounderUser" f ON f.id = p."founderId"
      ORDER BY p."createdAt" DESC
    `;
    return {
      success: true,
      data: packages.map((p: any) => ({
        ...p,
        totalPaid: Number(p.totalPaid || 0),
      })),
    };
  } catch (e: any) {
    return { success: false, error: e.message, data: [] };
  }
}

export async function getAdvPackageDetailAction(packageId: string) {
  const session: any = await getServerSession(authOptions);
  if (!session?.user || !ALLOWED.includes(session.user.role))
    return { success: false, error: "Unauthorized" };

  try {
    const [zones, socialPosts, payments] = await Promise.all([
      prisma.$queryRaw<any[]>`
        SELECT id, zone, "zoneTier", status, "startsAt", "endsAt",
               "freeDaysUsed", "extensionDays", "extensionRate", "extensionTotal"
        FROM "AdvZoneActivation"
        WHERE "packageId" = ${packageId}
        ORDER BY "createdAt" DESC
      `,
      prisma.$queryRaw<any[]>`
        SELECT id, "postType", status, "contentBrief", "publishedUrl", "publishedAt", "amountPaise"
        FROM "AdvSocialPostOrder"
        WHERE "packageId" = ${packageId}
        ORDER BY "createdAt" DESC
      `,
      prisma.$queryRaw<any[]>`
        SELECT id, purpose, "amountPaise", "gstPaise", "totalPaise", status,
               "razorpayOrderId", "razorpayPaymentId", "paidAt", "createdAt"
        FROM "AdvPayment"
        WHERE "packageId" = ${packageId}
        ORDER BY "createdAt" DESC
      `,
    ]);
    return {
      success: true,
      data: {
        zones: zones.map((z: any) => ({ ...z, extensionTotal: Number(z.extensionTotal || 0) })),
        socialPosts: socialPosts.map((s: any) => ({ ...s, amountPaise: Number(s.amountPaise || 0) })),
        payments: payments.map((p: any) => ({
          ...p,
          amountPaise: Number(p.amountPaise || 0),
          gstPaise: Number(p.gstPaise || 0),
          totalPaise: Number(p.totalPaise || 0),
        })),
      },
    };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function cancelAdvPackageAction(packageId: string) {
  const session: any = await getServerSession(authOptions);
  if (!session?.user || !["SUPER_ADMIN", "AD_MANAGER"].includes(session.user.role))
    return { success: false, error: "Unauthorized" };

  try {
    const pkg = await prisma.$queryRaw<any[]>`
      SELECT id, status, tier, "founderId" FROM "AdvPackage" WHERE id = ${packageId} LIMIT 1
    `;
    if (!pkg.length) return { success: false, error: "Package not found" };
    if (pkg[0].status !== "ACTIVE") return { success: false, error: "Only active packages can be cancelled" };

    await prisma.$executeRaw`
      UPDATE "AdvPackage" SET status = 'CANCELLED', "cancelledAt" = NOW(), "updatedAt" = NOW()
      WHERE id = ${packageId}
    `;

    await logAuditEvent({
      action: "UPDATE",
      resourceType: "ADV_PACKAGE",
      resourceId: packageId,
      resourceName: `${pkg[0].tier} package`,
      before: { status: pkg[0].status },
      after: { status: "CANCELLED" },
    });

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function updateSocialPostAction(postId: string, data: { status?: string; publishedUrl?: string }) {
  const session: any = await getServerSession(authOptions);
  if (!session?.user || !ALLOWED.includes(session.user.role))
    return { success: false, error: "Unauthorized" };

  try {
    const post = await prisma.$queryRaw<any[]>`
      SELECT id, status, "publishedUrl", "postType" FROM "AdvSocialPostOrder" WHERE id = ${postId} LIMIT 1
    `;
    if (!post.length) return { success: false, error: "Social post not found" };

    // Values go to the database as parameters, never pasted into the SQL text: a link containing a quote could
    // otherwise rewrite the statement.
    const STATUSES = ["PENDING_PAYMENT", "PAID", "SCHEDULED", "PUBLISHED", "CANCELLED"] as const;
    const status = data.status === undefined ? undefined : data.status.trim().toUpperCase();
    if (status !== undefined && !(STATUSES as readonly string[]).includes(status)) {
      return { success: false, error: "Unknown status." };
    }
    let publishedUrl: string | null | undefined;
    if (data.publishedUrl !== undefined) {
      const url = data.publishedUrl.trim();
      if (url && !/^https:\/\/[^\s"'<>]+$/i.test(url)) return { success: false, error: "The post link must start with https://" };
      publishedUrl = url ? url.slice(0, 500) : null;
    }

    await prisma.$executeRaw`
      UPDATE "AdvSocialPostOrder" SET
        status = COALESCE(${status ?? null}::"AdvSocialPostStatus", status),
        "publishedUrl" = CASE WHEN ${publishedUrl !== undefined} THEN ${publishedUrl ?? null} ELSE "publishedUrl" END,
        "publishedAt" = CASE WHEN ${status === "PUBLISHED"} THEN NOW() ELSE "publishedAt" END,
        "updatedAt" = NOW()
      WHERE id = ${postId}
    `;

    await logAuditEvent({
      action: "UPDATE",
      resourceType: "ADV_SOCIAL_POST",
      resourceId: postId,
      resourceName: `${post[0].postType} post`,
      before: { status: post[0].status, publishedUrl: post[0].publishedUrl },
      after: data,
    });

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}
