"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@udyaibase/database";
import { refreshPublic } from '@/lib/refresh-public';

const ALLOWED = ["SUPER_ADMIN", "EDITOR_IN_CHIEF", "AD_MANAGER"];

// ── Stats ─────────────────────────────────────────────────────────────────────

export async function getPlacementStatsAction() {
  const session: any = await getServerSession(authOptions);
  if (!session?.user || !ALLOWED.includes(session.user.role))
    return { success: false, error: "Unauthorized" };

  try {
    const [total, active, open] = await Promise.all([
      prisma.$queryRaw<any[]>`SELECT COUNT(*) as count FROM "AdCampaign"`,
      prisma.$queryRaw<any[]>`SELECT COUNT(*) as count FROM "AdCampaign" WHERE status = 'ACTIVE'`,
      prisma.$queryRaw<any[]>`SELECT COUNT(*) as count FROM "AdCampaign" WHERE status = 'PENDING_REVIEW'`,
    ]);
    return {
      success: true,
      data: {
        total: Number(total[0]?.count || 0),
        active: Number(active[0]?.count || 0),
        open: Number(open[0]?.count || 0),
      },
    };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// ── List ──────────────────────────────────────────────────────────────────────

export async function getPlacementsAction() {
  const session: any = await getServerSession(authOptions);
  if (!session?.user || !ALLOWED.includes(session.user.role))
    return { success: false, error: "Unauthorized", data: [] };

  try {
    const rows = await prisma.$queryRaw<any[]>`
      SELECT
        c.id, c."clientName", c."companyName", c."clientEmail",
        c.status, c."startDate"::text AS "startDate", c."endDate"::text AS "endDate",
        c."totalBudgetPaise", c.notes, c."createdAt"::text AS "createdAt",
        COALESCE(
          json_agg(
            json_build_object(
              'id', cr.id, 'zone', cr.zone, 'headline', cr.headline,
              'bodyText', cr."bodyText", 'ctaText', cr."ctaText", 'ctaUrl', cr."ctaUrl",
              'imageUrl', cr."imageUrl", 'isActive', cr."isActive",
              'impressionCount', cr."impressionCount", 'clickCount', cr."clickCount"
            )
          ) FILTER (WHERE cr.id IS NOT NULL),
          '[]'
        ) AS creatives
      FROM "AdCampaign" c
      LEFT JOIN "AdCreative" cr ON cr."campaignId" = c.id
      GROUP BY c.id
      ORDER BY c."createdAt" DESC
    `;
    return { success: true, data: rows };
  } catch (e: any) {
    return { success: false, error: e.message, data: [] };
  }
}

// ── Save Campaign ─────────────────────────────────────────────────────────────

export async function savePlacementAction(payload: {
  id?: string;
  clientName: string;
  companyName: string;
  clientEmail: string;
  startDate: string;
  endDate: string;
  totalBudgetPaise: number;
  notes?: string;
  status?: string;
}) {
  const session: any = await getServerSession(authOptions);
  if (!session?.user || !ALLOWED.includes(session.user.role))
    return { success: false, error: "Unauthorized" };

  const { id, clientName, companyName, clientEmail, startDate, endDate, totalBudgetPaise, notes, status } = payload;

  try {
    if (id) {
      await prisma.$executeRaw`
        UPDATE "AdCampaign"
        SET "clientName" = ${clientName}, "companyName" = ${companyName},
            "clientEmail" = ${clientEmail},
            "startDate" = ${new Date(startDate)}, "endDate" = ${new Date(endDate)},
            "totalBudgetPaise" = ${totalBudgetPaise},
            notes = ${notes || null},
            status = ${(status || 'PENDING_REVIEW')}::"CampaignStatus",
            "updatedAt" = NOW()
        WHERE id = ${id}
      `;
      await refreshPublic(['all']); return { success: true, id };
    } else {
      const rows = await prisma.$queryRaw<any[]>`
        INSERT INTO "AdCampaign"
          (id, "clientName", "companyName", "clientEmail", status,
           "startDate", "endDate", "totalBudgetPaise", notes, "createdAt", "updatedAt")
        VALUES (
          gen_random_uuid(), ${clientName}, ${companyName}, ${clientEmail},
          'PENDING_REVIEW'::"CampaignStatus",
          ${new Date(startDate)}, ${new Date(endDate)},
          ${totalBudgetPaise}, ${notes || null}, NOW(), NOW()
        )
        RETURNING id
      `;
      await refreshPublic(['all']); return { success: true, id: rows[0]?.id };
    }
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// ── Save Creative (zone/headline) ─────────────────────────────────────────────

export async function saveCreativeAction(payload: {
  id?: string;
  campaignId: string;
  zone: string;
  headline: string;
  bodyText: string;
  ctaText: string;
  ctaUrl: string;
  imageUrl?: string;
}) {
  const session: any = await getServerSession(authOptions);
  if (!session?.user || !ALLOWED.includes(session.user.role))
    return { success: false, error: "Unauthorized" };

  const { id, campaignId, zone, headline, bodyText, ctaText, ctaUrl, imageUrl } = payload;

  try {
    if (id) {
      await prisma.$executeRaw`
        UPDATE "AdCreative"
        SET zone = ${zone}::"AdZoneType", headline = ${headline},
            "bodyText" = ${bodyText}, "ctaText" = ${ctaText},
            "ctaUrl" = ${ctaUrl}, "imageUrl" = ${imageUrl || null},
            "updatedAt" = NOW()
        WHERE id = ${id}
      `;
    } else {
      await prisma.$executeRaw`
        INSERT INTO "AdCreative"
          (id, "campaignId", zone, headline, "bodyText", "ctaText", "ctaUrl", "imageUrl",
           "isActive", "impressionCount", "clickCount", "createdAt", "updatedAt")
        VALUES (
          gen_random_uuid(), ${campaignId}, ${zone}::"AdZoneType",
          ${headline}, ${bodyText}, ${ctaText}, ${ctaUrl}, ${imageUrl || null},
          true, 0, 0, NOW(), NOW()
        )
      `;
    }
    await refreshPublic(['all']); return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// ── Update Status ─────────────────────────────────────────────────────────────

export async function updatePlacementStatusAction(id: string, status: string) {
  const session: any = await getServerSession(authOptions);
  if (!session?.user || !ALLOWED.includes(session.user.role))
    return { success: false, error: "Unauthorized" };

  try {
    await prisma.$executeRaw`
      UPDATE "AdCampaign"
      SET status = ${status}::"CampaignStatus", "updatedAt" = NOW()
      WHERE id = ${id}
    `;
    await refreshPublic(['all']); return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// ── Delete ────────────────────────────────────────────────────────────────────

export async function deletePlacementAction(id: string) {
  const session: any = await getServerSession(authOptions);
  if (!session?.user || !["SUPER_ADMIN", "AD_MANAGER"].includes(session.user.role))
    return { success: false, error: "Unauthorized" };

  try {
    await prisma.$executeRaw`DELETE FROM "AdCreative" WHERE "campaignId" = ${id}`;
    await prisma.$executeRaw`DELETE FROM "AdCampaign" WHERE id = ${id}`;
    await refreshPublic(['all']); return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}
