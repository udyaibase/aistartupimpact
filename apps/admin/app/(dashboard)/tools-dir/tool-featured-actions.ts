'use server';

import { neon } from '@neondatabase/serverless';
import { revalidatePath } from 'next/cache';
import { invalidateToolCache } from '@/lib/cache-invalidate';
import { requireActionAuth } from '@/lib/api-auth';
import { refreshPublic } from '@/lib/refresh-public';
import { publicError } from '@/lib/public-error';

const sql = neon(process.env.DATABASE_URL!);

const TOOL_TIER_SLOTS: Record<string, number> = {
  FEATURED: 1,
  PRIORITY: 4,
  FREE: 6,
};

export async function setListingTierAction(id: string, tier: string) {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };
  try {
    await sql`
      UPDATE "AiTool"
      SET "listingTier" = ${tier}::"ListingTier", "updatedAt" = NOW()
      WHERE id = ${id}
    `;
    revalidatePath('/tools-dir');
    invalidateToolCache();
    await refreshPublic(['tools', 'home']); return { success: true };
  } catch (error: any) {
    console.error('setListingTierAction error:', error);
    return { success: false, error: publicError(error) || 'Failed to update tier' };
  }
}

export async function getToolFeaturedCampaignsAction() {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };
  try {
    const campaigns = await sql`
      SELECT tfc.id, tfc."toolId", tfc.tier, tfc."startDate", tfc."endDate",
             tfc.notes, tfc."pricePaid", tfc."cancelledAt", tfc."createdAt",
             t.name AS "toolName", t."logoUrl"
      FROM "ToolFeaturedCampaign" tfc
      JOIN "AiTool" t ON t.id = tfc."toolId"
      ORDER BY
        CASE WHEN tfc."cancelledAt" IS NOT NULL THEN 2
             WHEN tfc."startDate" > NOW() THEN 1
             ELSE 0 END ASC,
        tfc.tier ASC,
        tfc."startDate" ASC
    `;
    return campaigns;
  } catch (error) {
    console.error('Error fetching tool featured campaigns:', error);
    return [];
  }
}

export async function scheduleToolFeaturedCampaignAction(data: {
  toolId: string;
  tier: 'FEATURED' | 'PRIORITY' | 'FREE';
  startDate: string;
  endDate: string;
  notes?: string;
  pricePaid?: number;
}) {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };
  try {
    const { toolId, tier, startDate, endDate, notes, pricePaid } = data;

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (end <= start) {
      return { success: false, error: 'End date must be after start date' };
    }

    // Check slot availability
    const overlapping = await sql`
      SELECT COUNT(*)::int AS count
      FROM "ToolFeaturedCampaign"
      WHERE tier = ${tier}::"ListingTier"
        AND "cancelledAt" IS NULL
        AND tsrange("startDate", "endDate", '[]') && tsrange(${startDate}::timestamp, ${endDate}::timestamp, '[]')
    `;

    const usedSlots = (overlapping[0] as any).count;
    const maxSlots = TOOL_TIER_SLOTS[tier] || 4;

    if (usedSlots >= maxSlots) {
      const nextAvailable = await sql`
        SELECT "endDate"
        FROM "ToolFeaturedCampaign"
        WHERE tier = ${tier}::"ListingTier"
          AND "cancelledAt" IS NULL
          AND "endDate" > NOW()
        ORDER BY "endDate" ASC
        LIMIT 1
      `;

      const nextDate = nextAvailable.length > 0
        ? new Date((nextAvailable[0] as any).endDate).toISOString().split('T')[0]
        : null;

      return {
        success: false,
        error: `All ${maxSlots} ${tier} slot(s) are booked for this period.`,
        nextAvailableDate: nextDate,
        slotsUsed: usedSlots,
        slotsMax: maxSlots
      };
    }

    // Insert campaign
    try {
      await sql`
        INSERT INTO "ToolFeaturedCampaign" (id, "toolId", tier, "startDate", "endDate", notes, "pricePaid", "createdAt", "updatedAt")
        VALUES (gen_random_uuid(), ${toolId}, ${tier}::"ListingTier", ${startDate}::timestamp, ${endDate}::timestamp, ${notes || null}, ${pricePaid || null}, NOW(), NOW())
      `;
    } catch (dbError: any) {
      if (dbError.message?.includes('no_overlapping_tool_campaigns')) {
        return { success: false, error: 'Slot conflict — another campaign was just booked for this window. Please try a different date range.' };
      }
      throw dbError;
    }

    // Update legacy listingTier on the tool for backward compat
    if (start <= new Date()) {
      await sql`UPDATE "AiTool" SET "listingTier" = ${tier}::"ListingTier", "updatedAt" = NOW() WHERE id = ${toolId}`;
    }

    revalidatePath('/tools-dir');
    invalidateToolCache();
    await refreshPublic(['tools', 'home']); return { success: true };
  } catch (error: any) {
    console.error('Error scheduling tool featured campaign:', error);
    return { success: false, error: publicError(error) || 'Failed to schedule campaign' };
  }
}

export async function cancelToolFeaturedCampaignAction(campaignId: string) {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };
  try {
    const result = await sql`
      UPDATE "ToolFeaturedCampaign"
      SET "cancelledAt" = NOW(), "updatedAt" = NOW()
      WHERE id = ${campaignId} AND "cancelledAt" IS NULL
      RETURNING "toolId"
    `;

    if (result.length > 0) {
      const toolId = (result[0] as any).toolId;
      const activeCampaigns = await sql`
        SELECT COUNT(*)::int AS count FROM "ToolFeaturedCampaign"
        WHERE "toolId" = ${toolId}
          AND "cancelledAt" IS NULL
          AND "startDate" <= NOW() AND "endDate" >= NOW()
      `;
      if ((activeCampaigns[0] as any).count === 0) {
        await sql`UPDATE "AiTool" SET "listingTier" = 'FREE'::"ListingTier", "updatedAt" = NOW() WHERE id = ${toolId}`;
      }
    }

    revalidatePath('/tools-dir');
    invalidateToolCache();
    await refreshPublic(['tools', 'home']); return { success: true };
  } catch (error: any) {
    console.error('Error cancelling tool featured campaign:', error);
    return { success: false, error: publicError(error) || 'Failed to cancel campaign' };
  }
}


// ─── Startup Linking ────────────────────────────────────────────────────────
