'use server';

import { neon } from '@neondatabase/serverless';
import { revalidatePath } from 'next/cache';
import { requireActionAuth } from '@/lib/api-auth';
import { refreshPublic } from '@/lib/refresh-public';
import { publicError } from '@/lib/public-error';

const sql = neon(process.env.DATABASE_URL!);

const TIER_SLOTS: Record<string, number> = {
  PREMIUM: 1,
  STANDARD: 4,
  BASIC: 6,
};

export async function toggleFeaturedAction(id: string, isFeatured: boolean) {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };
  // Legacy toggle — kept for backward compat but prefer scheduleFeaturedCampaign
  try {
    if (isFeatured) {
      await sql`
        UPDATE "Startup"
        SET 
          "isFeatured" = ${isFeatured},
          "featuredUntil" = NOW() + INTERVAL '30 days',
          "updatedAt" = NOW()
        WHERE id = ${id}
      `;
    } else {
      await sql`
        UPDATE "Startup"
        SET 
          "isFeatured" = ${isFeatured},
          "featuredUntil" = NULL,
          "updatedAt" = NOW()
        WHERE id = ${id}
      `;
    }

    revalidatePath('/startups-dir');
    await refreshPublic(['startups', 'funding', 'india-ai', 'home']); return { success: true };
  } catch (error) {
    console.error('Error toggling featured status:', error);
    return { success: false, error: 'Failed to update featured status' };
  }
}

// ─── Featured Campaign System ───────────────────────────────────────────────

export async function getFeaturedCampaignsAction() {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };
  try {
    const campaigns = await sql`
      SELECT fc.id, fc."startupId", fc.tier, fc."startDate", fc."endDate",
             fc.notes, fc."pricePaid", fc."cancelledAt", fc."createdAt",
             s.name AS "startupName", s."logoUrl"
      FROM "FeaturedCampaign" fc
      JOIN "Startup" s ON s.id = fc."startupId"
      ORDER BY
        CASE WHEN fc."cancelledAt" IS NOT NULL THEN 2
             WHEN fc."startDate" > NOW() THEN 1
             ELSE 0 END ASC,
        fc.tier ASC,
        fc."startDate" ASC
    `;
    return campaigns;
  } catch (error) {
    console.error('Error fetching featured campaigns:', error);
    return [];
  }
}

export async function scheduleFeaturedCampaignAction(data: {
  startupId: string;
  tier: 'PREMIUM' | 'STANDARD' | 'BASIC';
  startDate: string; // ISO date string (UTC)
  endDate: string;   // ISO date string (UTC)
  notes?: string;
  pricePaid?: number;
}) {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };
  try {
    const { startupId, tier, startDate, endDate, notes, pricePaid } = data;

    // Validate dates
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (end <= start) {
      return { success: false, error: 'End date must be after start date' };
    }

    // Check slot availability for this tier in the requested window
    const overlapping = await sql`
      SELECT COUNT(*)::int AS count
      FROM "FeaturedCampaign"
      WHERE tier = ${tier}::"FeaturedTier"
        AND "cancelledAt" IS NULL
        AND tsrange("startDate", "endDate", '[]') && tsrange(${startDate}::timestamp, ${endDate}::timestamp, '[]')
    `;

    const usedSlots = (overlapping[0] as any).count;
    const maxSlots = TIER_SLOTS[tier] || 4;

    if (usedSlots >= maxSlots) {
      // Find next available window
      const nextAvailable = await sql`
        SELECT "endDate"
        FROM "FeaturedCampaign"
        WHERE tier = ${tier}::"FeaturedTier"
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

    // Insert campaign — the DB exclusion constraint is the final safety net
    try {
      await sql`
        INSERT INTO "FeaturedCampaign" (id, "startupId", tier, "startDate", "endDate", notes, "pricePaid", "createdAt", "updatedAt")
        VALUES (gen_random_uuid(), ${startupId}, ${tier}::"FeaturedTier", ${startDate}::timestamp, ${endDate}::timestamp, ${notes || null}, ${pricePaid || null}, NOW(), NOW())
      `;
    } catch (dbError: any) {
      // Handle the exclusion constraint violation (race condition protection)
      if (dbError.message?.includes('no_overlapping_campaigns')) {
        return { success: false, error: 'Slot conflict — another campaign was just booked for this window. Please try a different date range.' };
      }
      throw dbError;
    }

    // Also update legacy isFeatured flag for backward compat on public queries
    if (start <= new Date()) {
      await sql`UPDATE "Startup" SET "isFeatured" = true, "updatedAt" = NOW() WHERE id = ${startupId}`;
    }

    revalidatePath('/startups-dir');
    await refreshPublic(['startups', 'funding', 'india-ai', 'home']); return { success: true };
  } catch (error: any) {
    console.error('Error scheduling featured campaign:', error);
    return { success: false, error: publicError(error) || 'Failed to schedule campaign' };
  }
}

export async function cancelFeaturedCampaignAction(campaignId: string) {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };
  try {
    // Soft cancel — sets cancelledAt, freeing the slot immediately
    const result = await sql`
      UPDATE "FeaturedCampaign"
      SET "cancelledAt" = NOW(), "updatedAt" = NOW()
      WHERE id = ${campaignId} AND "cancelledAt" IS NULL
      RETURNING "startupId"
    `;

    if (result.length > 0) {
      const startupId = (result[0] as any).startupId;
      // Check if startup has any other active campaign
      const activeCampaigns = await sql`
        SELECT COUNT(*)::int AS count FROM "FeaturedCampaign"
        WHERE "startupId" = ${startupId}
          AND "cancelledAt" IS NULL
          AND "startDate" <= NOW() AND "endDate" >= NOW()
      `;
      if ((activeCampaigns[0] as any).count === 0) {
        await sql`UPDATE "Startup" SET "isFeatured" = false, "updatedAt" = NOW() WHERE id = ${startupId}`;
      }
    }

    revalidatePath('/startups-dir');
    await refreshPublic(['startups', 'funding', 'india-ai', 'home']); return { success: true };
  } catch (error: any) {
    console.error('Error cancelling featured campaign:', error);
    return { success: false, error: publicError(error) || 'Failed to cancel campaign' };
  }
}

export async function getSlotAvailabilityAction(tier: string, startDate: string, endDate: string) {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };
  try {
    const overlapping = await sql`
      SELECT COUNT(*)::int AS count
      FROM "FeaturedCampaign"
      WHERE tier = ${tier}::"FeaturedTier"
        AND "cancelledAt" IS NULL
        AND tsrange("startDate", "endDate", '[]') && tsrange(${startDate}::timestamp, ${endDate}::timestamp, '[]')
    `;

    const usedSlots = (overlapping[0] as any).count;
    const maxSlots = TIER_SLOTS[tier] || 4;

    return { 
      success: true, 
      available: usedSlots < maxSlots,
      slotsUsed: usedSlots, 
      slotsMax: maxSlots,
      slotsRemaining: maxSlots - usedSlots
    };
  } catch (error: any) {
    console.error('Error checking slot availability:', error);
    return { success: false, available: false, slotsUsed: 0, slotsMax: 0, slotsRemaining: 0 };
  }
}
