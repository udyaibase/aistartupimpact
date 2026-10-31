'use server';

import { neon } from '@neondatabase/serverless';
import { revalidatePath } from 'next/cache';
import { calculateImpactScore } from '@/lib/impact-score';
import { standardizeCityName } from '@udyaibase/utils/src/cities';
import { logAuditEvent, canDelete } from '@/lib/audit-log';
import { startupApprovalHtml } from '@udyaibase/utils';
import { sendEmailFireAndForget } from '@/lib/email-send';
import { requireActionAuth } from '@/lib/api-auth';
import { refreshPublic } from '@/lib/refresh-public';

const sql = neon(process.env.DATABASE_URL!);

export async function getStartupsAction() {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };
  try {
    const startups = await sql`
      SELECT 
        id, name, slug, "slugChangedAt", "previousSlugs", tagline, description, "logoUrl", "websiteUrl", "linkedinUrl", "twitterUrl",
        "foundedYear", "headquartersCity", stage, status, "totalFundingInr", "employeeCount",
        "isFeatured", "featuredUntil", "impactScore", "isApproved", "approvedAt",
        "isVerified", "claimStatus", "contentReviewed",
        "ownerId", category, "businessType", founders, "foundersData", "createdAt", "updatedAt"
      FROM "Startup"
      WHERE "deletedAt" IS NULL
      ORDER BY "isApproved" ASC, "isFeatured" DESC, "createdAt" DESC
    `;
    return startups;
  } catch (error) {
    console.error('Error fetching startups:', error);
    return [];
  }
}

export async function getStartupFundingRoundsAction(startupId: string) {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };
  try {
    const fundingRounds = await sql`
      SELECT 
        id, "startupId", "roundType", "amountUsd", "amountInr", "announcedAt", "leadInvestors", "allInvestors", "createdAt"
      FROM "FundingRound"
      WHERE "startupId" = ${startupId}
      ORDER BY "announcedAt" DESC
    `;
    return fundingRounds;
  } catch (error) {
    console.error('Error fetching startup funding rounds:', error);
    return [];
  }
}


export async function getStartupFAQsAction(startupId: string) {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };
  try {
    const faqs = await sql`
      SELECT id, "startupId", question, answer, "order", "createdAt", "updatedAt"
      FROM "StartupFAQ"
      WHERE "startupId" = ${startupId}
      ORDER BY "order" ASC
    `;
    return faqs;
  } catch (error) {
    console.error('Error fetching startup FAQs:', error);
    return [];
  }
}

export async function createStartupAction(data: {
  name: string;
  tagline: string;
  description: string;
  logoUrl?: string;
  websiteUrl?: string;
  linkedinUrl?: string;
  twitterUrl?: string;
  stage: string;
  headquartersCity?: string;
  isFeatured?: boolean;
  foundedYear?: number | null;
  employeeCount?: number | null;
  category?: string;
  businessType?: string;
  status?: string;
  faqs?: Array<{ question: string; answer: string; order: number }>;
  fundingRounds?: Array<{
    roundType: string;
    amountUsd: number;
    amountInr: number;
    announcedAt: string;
    leadInvestors: string[];
    allInvestors: string[];
  }>;
  foundersData?: Array<{
    name: string;
    role: string;
    prev?: string;
    bio: string;
    avatar: string;
    linkedin: string;
    twitter?: string;
  }>;
  socialLinks?: Array<{
    platform: string;
    url: string;
  }>;
}) {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };
  try {
    // Generate clean SEO-friendly slug
    const { slugify } = await import('@/lib/slug-utils');
    const baseSlug = slugify(data.name);
    let slug = baseSlug;
    let counter = 1;
    while (true) {
      const taken = await sql`SELECT id FROM "Startup" WHERE slug = ${slug} LIMIT 1`;
      if (taken.length === 0) break;
      counter++;
      slug = `${baseSlug}-${counter}`;
    }

    // Check for duplicate name
    const existingStartup = await sql`
      SELECT id FROM "Startup"
      WHERE LOWER(name) = LOWER(${data.name}) AND "deletedAt" IS NULL
      LIMIT 1
    `;
    if (existingStartup.length > 0) {
      return { success: false, error: 'A startup with this name already exists' };
    }

    // Auto-calculate impact score from funding rounds + employees + stage + age
    const totalFundingUsdCents = (data.fundingRounds || []).reduce((sum, r) => sum + (r.amountUsd || 0), 0);
    const { total: impactScore } = calculateImpactScore({
      totalFundingUsdCents,
      employeeCount: data.employeeCount ?? null,
      stage: data.stage,
      foundedYear: data.foundedYear ?? null,
    });
    const foundersDataJson = data.foundersData && data.foundersData.length > 0
      ? JSON.stringify(data.foundersData)
      : null;
    const foundersNames = data.foundersData
      ? data.foundersData.filter(f => f.name.trim()).map(f => f.name)
      : [];
    const socialLinksJson = data.socialLinks && data.socialLinks.length > 0
      ? JSON.stringify(data.socialLinks)
      : null;

    // Resolve cityId from headquartersCity name
    let cityId: string | null = null;
    if (data.headquartersCity) {
      const cityMatch = await sql`
        SELECT id FROM "City"
        WHERE LOWER(name) = LOWER(${data.headquartersCity})
          OR ${data.headquartersCity.toLowerCase()} = ANY(aliases)
        LIMIT 1
      `;
      cityId = cityMatch.length > 0 ? (cityMatch[0] as any).id : null;
    }
    
    const finalCity = data.headquartersCity ? standardizeCityName(data.headquartersCity) : null;
    
    const result = await sql`
      INSERT INTO "Startup" (
        id, name, slug, tagline, description, "logoUrl", "websiteUrl", "linkedinUrl", "twitterUrl", stage, "headquartersCity", "cityId",
        "isFeatured", "isIndian", "impactScore", "foundedYear", "employeeCount", category, "businessType", status,
        founders, "foundersData", "socialLinks", "isApproved", "approvedAt", "createdAt", "updatedAt"
      )
      VALUES (
        gen_random_uuid(), ${data.name}, ${slug}, ${data.tagline}, ${data.description},
        ${data.logoUrl || null}, ${data.websiteUrl || null}, ${data.linkedinUrl || null}, ${data.twitterUrl || null}, ${data.stage}::"StartupStage", ${finalCity}, ${cityId},
        ${data.isFeatured || false}, true, ${impactScore}, ${data.foundedYear || null}, ${data.employeeCount || null}, ${data.category || null}, ${data.businessType || null}, ${data.status || 'ACTIVE'}::"CompanyStatus",
        ${foundersNames}::text[], ${foundersDataJson}::jsonb, ${socialLinksJson}::jsonb, true, NOW(), NOW(), NOW()
      )
      RETURNING id
    `;

    const startupId = result[0]?.id;

    // Insert FAQs if provided
    if (startupId && data.faqs && data.faqs.length > 0) {
      for (const faq of data.faqs) {
        await sql`
          INSERT INTO "StartupFAQ" (id, "startupId", question, answer, "order", "createdAt", "updatedAt")
          VALUES (gen_random_uuid(), ${startupId}, ${faq.question}, ${faq.answer}, ${faq.order}, NOW(), NOW())
        `;
      }
    }

    // Insert Funding Rounds if provided
    let totalFundingInr = BigInt(0);
    if (startupId && data.fundingRounds && data.fundingRounds.length > 0) {
      for (const round of data.fundingRounds) {
        totalFundingInr += BigInt(round.amountInr || 0);
        await sql`
          INSERT INTO "FundingRound" (id, "startupId", "roundType", "amountUsd", "amountInr", "announcedAt", "leadInvestors", "allInvestors", "createdAt")
          VALUES (gen_random_uuid(), ${startupId}, ${round.roundType}, ${round.amountUsd}, ${round.amountInr}, ${round.announcedAt}::timestamp, ${round.leadInvestors}::text[], ${round.allInvestors}::text[], NOW())
        `;
      }
    }

    if (startupId) {
      await sql`
        UPDATE "Startup"
        SET "totalFundingInr" = ${totalFundingInr.toString()}::bigint
        WHERE id = ${startupId}
      `;
    }

    revalidatePath('/startups-dir');
    
    // Audit log
    await logAuditEvent({
      action: 'CREATE',
      resourceType: 'STARTUP',
      resourceId: startupId,
      after: { name: data.name, slug, stage: data.stage, headquartersCity: data.headquartersCity },
    });

    await refreshPublic(['startups', 'funding', 'india-ai', 'home']); return { success: true };
  } catch (error: any) {
    console.error('Error creating startup:', error);
    return { success: false, error: error.message || 'Failed to create startup' };
  }
}

export async function updateStartupAction(id: string, data: {
  name: string;
  tagline: string;
  description: string;
  logoUrl?: string;
  websiteUrl?: string;
  linkedinUrl?: string;
  twitterUrl?: string;
  stage: string;
  status?: string;
  headquartersCity?: string;
  isFeatured?: boolean;
  foundedYear?: number | null;
  employeeCount?: number | null;
  category?: string;
  businessType?: string;
  faqs?: Array<{ question: string; answer: string; order: number }>;
  fundingRounds?: Array<{
    roundType: string;
    amountUsd: number;
    amountInr: number;
    announcedAt: string;
    leadInvestors: string[];
    allInvestors: string[];
  }>;
  foundersData?: Array<{
    name: string;
    role: string;
    prev?: string;
    bio: string;
    avatar: string;
    linkedin: string;
    twitter?: string;
  }>;
  socialLinks?: Array<{
    platform: string;
    url: string;
  }>;
}) {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };
  try {
    // Auto-calculate impact score from funding + employees + stage + age
    let totalFundingUsdCents = 0;
    if (data.fundingRounds !== undefined) {
      totalFundingUsdCents = (data.fundingRounds || []).reduce((sum, r) => sum + (r.amountUsd || 0), 0);
    } else {
      const fundingResult = await sql`
        SELECT COALESCE(SUM("amountUsd"), 0)::bigint AS total
        FROM "FundingRound" WHERE "startupId" = ${id}
      `;
      totalFundingUsdCents = Number(fundingResult[0]?.total || 0);
    }

    const { total: impactScore } = calculateImpactScore({
      totalFundingUsdCents,
      employeeCount: data.employeeCount ?? null,
      stage: data.stage,
      foundedYear: data.foundedYear ?? null,
    });

    const socialLinksJson = data.socialLinks && data.socialLinks.length > 0
      ? JSON.stringify(data.socialLinks)
      : null;

    const finalCity = data.headquartersCity ? standardizeCityName(data.headquartersCity) : null;

    // Resolve cityId for the update
    let updateCityId: string | null = null;
    if (data.headquartersCity) {
      const cityMatch = await sql`
        SELECT id FROM "City"
        WHERE LOWER(name) = LOWER(${data.headquartersCity})
          OR ${data.headquartersCity.toLowerCase()} = ANY(aliases)
        LIMIT 1
      `;
      updateCityId = cityMatch.length > 0 ? (cityMatch[0] as any).id : null;
    }

    await sql`
      UPDATE "Startup"
      SET 
        name = ${data.name},
        tagline = ${data.tagline},
        description = ${data.description},
        "logoUrl" = ${data.logoUrl || null},
        "websiteUrl" = ${data.websiteUrl || null},
        "linkedinUrl" = ${data.linkedinUrl || null},
        "twitterUrl" = ${data.twitterUrl || null},
        stage = ${data.stage}::"StartupStage",
        status = ${data.status || 'ACTIVE'}::"CompanyStatus",
        "headquartersCity" = ${finalCity},
        "cityId" = ${updateCityId},
        "isFeatured" = ${data.isFeatured || false},
        "foundedYear" = ${data.foundedYear || null},
        "employeeCount" = ${data.employeeCount || null},
        "impactScore" = ${impactScore},
        category = ${data.category || null},
        "businessType" = ${data.businessType || null},
        "socialLinks" = ${socialLinksJson}::jsonb,
        "updatedAt" = NOW()
      WHERE id = ${id}
    `;

    // Update FAQs if provided
    if (data.faqs !== undefined) {
      // Delete existing FAQs
      await sql`DELETE FROM "StartupFAQ" WHERE "startupId" = ${id}`;
      
      // Insert new FAQs
      if (data.faqs.length > 0) {
        for (const faq of data.faqs) {
          await sql`
            INSERT INTO "StartupFAQ" (id, "startupId", question, answer, "order", "createdAt", "updatedAt")
            VALUES (gen_random_uuid(), ${id}, ${faq.question}, ${faq.answer}, ${faq.order}, NOW(), NOW())
          `;
        }
      }
    }

    // Update Funding Rounds if provided
    if (data.fundingRounds !== undefined) {
      // Delete existing rounds
      await sql`DELETE FROM "FundingRound" WHERE "startupId" = ${id}`;
      
      // Insert new rounds
      let totalFundingInr = BigInt(0);
      if (data.fundingRounds.length > 0) {
        for (const round of data.fundingRounds) {
          totalFundingInr += BigInt(round.amountInr || 0);
          await sql`
            INSERT INTO "FundingRound" (id, "startupId", "roundType", "amountUsd", "amountInr", "announcedAt", "leadInvestors", "allInvestors", "createdAt")
            VALUES (gen_random_uuid(), ${id}, ${round.roundType}, ${round.amountUsd}, ${round.amountInr}, ${round.announcedAt}::timestamp, ${round.leadInvestors}::text[], ${round.allInvestors}::text[], NOW())
          `;
        }
      }

      await sql`
        UPDATE "Startup"
        SET "totalFundingInr" = ${totalFundingInr.toString()}::bigint
        WHERE id = ${id}
      `;
    }

    // Update foundersData if provided
    if (data.foundersData !== undefined) {
      const foundersDataJson = data.foundersData.length > 0
        ? JSON.stringify(data.foundersData)
        : null;
      const foundersNames = data.foundersData.filter(f => f.name.trim()).map(f => f.name);
      await sql`
        UPDATE "Startup"
        SET "foundersData" = ${foundersDataJson}::jsonb,
            founders = ${foundersNames}::text[]
        WHERE id = ${id}
      `;
    }

    revalidatePath('/startups-dir');

    // Audit log
    await logAuditEvent({
      action: 'UPDATE',
      resourceType: 'STARTUP',
      resourceId: id,
      after: { name: data.name, stage: data.stage, category: data.category },
    });

    await refreshPublic(['startups', 'funding', 'india-ai', 'home']); return { success: true };
  } catch (error: any) {
    console.error('Error updating startup:', error);
    return { success: false, error: error.message || 'Failed to update startup' };
  }
}


export async function deleteStartupAction(id: string) {
  const { error: authError } = await requireActionAuth(['SUPER_ADMIN']);
  if (authError) return { success: false, error: authError };
  const { allowed, error } = await canDelete();
  if (!allowed) {
    return { success: false, error: error || 'Unauthorized' };
  }

  try {
    // Capture before state for audit
    const existing = await sql`
      SELECT id, name, slug, stage, "headquartersCity" FROM "Startup" WHERE id = ${id} LIMIT 1
    `;
    const before = existing[0] || null;

    await sql`
      UPDATE "Startup"
      SET "deletedAt" = NOW()
      WHERE id = ${id}
    `;

    // Audit log
    await logAuditEvent({
      action: 'DELETE',
      resourceType: 'STARTUP',
      resourceId: id,
      before: before ? { name: before.name, slug: before.slug, stage: before.stage, headquartersCity: before.headquartersCity } : undefined,
    });

    revalidatePath('/startups-dir');
    await refreshPublic(['startups', 'funding', 'india-ai', 'home']); return { success: true };
  } catch (error) {
    console.error('Error deleting startup:', error);
    return { success: false, error: 'Failed to delete startup' };
  }
}

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

const TIER_SLOTS: Record<string, number> = {
  PREMIUM: 1,
  STANDARD: 4,
  BASIC: 6,
};

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
    return { success: false, error: error.message || 'Failed to schedule campaign' };
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
    return { success: false, error: error.message || 'Failed to cancel campaign' };
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

export async function toggleContentReviewedAction(id: string, currentValue: boolean) {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };
  try {
    await sql`
      UPDATE "Startup"
      SET "contentReviewed" = ${!currentValue}, "updatedAt" = NOW()
      WHERE id = ${id}
    `;
    revalidatePath('/startups-dir');
    await refreshPublic(['startups', 'funding', 'india-ai', 'home']); return { success: true };
  } catch (error: any) {
    console.error('toggleContentReviewedAction error:', error);
    return { success: false, error: error.message };
  }
}

// One-time fix for null impactScore values
export async function fixNullImpactScoresAction() {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };
  try {
    const result = await sql`
      UPDATE "Startup"
      SET "impactScore" = 0
      WHERE "impactScore" IS NULL
    `;
    
    await refreshPublic(['startups', 'funding', 'india-ai', 'home']); return { success: true, message: `Fixed ${result.length} startups with null impactScore` };
  } catch (error) {
    console.error('Error fixing null impactScores:', error);
    return { success: false, error: 'Failed to fix null impactScores' };
  }
}

export async function approveStartupAction(id: string) {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };
  try {
    // Get startup details and owner email
    const startups = await sql`
      SELECT s.id, s.name, s.slug, s."ownerId", s.stage, s."employeeCount", s."foundedYear",
             fu.email AS "founderEmail", fu.name AS "founderName"
      FROM "Startup" s
      LEFT JOIN "FounderUser" fu ON fu.id = s."ownerId"
      WHERE s.id = ${id}
      LIMIT 1
    `;

    if (startups.length === 0) {
      return { success: false, error: 'Startup not found' };
    }

    // Update the startup to approved, auto-calculate impact score
    const startup = startups[0] as any;
    const fundingResult = await sql`
      SELECT COALESCE(SUM("amountUsd"), 0)::bigint AS total FROM "FundingRound" WHERE "startupId" = ${id}
    `;
    const totalFundingUsdCents = Number(fundingResult[0]?.total || 0);
    const { calculateImpactScore } = await import('@/lib/impact-score');
    const { total: impactScore } = calculateImpactScore({
      totalFundingUsdCents,
      employeeCount: startup.employeeCount ?? null,
      stage: startup.stage,
      foundedYear: startup.foundedYear ?? null,
    });

    await sql`
      UPDATE "Startup"
      SET "isApproved" = true, "approvedAt" = NOW(), "impactScore" = ${impactScore}, "updatedAt" = NOW()
      WHERE id = ${id}
    `;

    if (startup.founderEmail) {
      sendEmailFireAndForget({
        to: startup.founderEmail,
        subject: `Your startup "${startup.name}" is now live on Udyaibase`,
        html: startupApprovalHtml(startup.name, startup.founderName || 'there', startup.slug),
        type: 'approval',
      });
    }

    revalidatePath('/startups-dir');
    
    // Audit log for approval
    await logAuditEvent({
      action: 'APPROVE',
      resourceType: 'STARTUP',
      resourceId: id,
      after: { name: startup.name, slug: startup.slug, impactScore },
    });

    await refreshPublic(['startups', 'funding', 'india-ai', 'home']); return { success: true };
  } catch (error: any) {
    console.error('Error approving startup:', error);
    return { success: false, error: error.message || 'Failed to approve startup' };
  }
}


// ─── Bulk Actions ────────────────────────────────────────────────────────────

export async function bulkApproveStartupsAction(ids: string[]) {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };
  try {
    if (ids.length === 0) return { success: false, error: 'No startups selected' };
    await sql`
      UPDATE "Startup"
      SET "isApproved" = true, "approvedAt" = NOW(), "updatedAt" = NOW()
      WHERE id = ANY(${ids}::text[]) AND "isApproved" = false
    `;
    revalidatePath('/startups-dir');
    await logAuditEvent({ action: 'APPROVE', resourceType: 'STARTUP', after: { bulkAction: true, count: ids.length } });
    await refreshPublic(['startups', 'funding', 'india-ai', 'home']); return { success: true, count: ids.length };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function bulkArchiveStartupsAction(ids: string[]) {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };
  try {
    if (ids.length === 0) return { success: false, error: 'No startups selected' };
    await sql`
      UPDATE "Startup"
      SET status = 'INACTIVE'::"CompanyStatus", "updatedAt" = NOW()
      WHERE id = ANY(${ids}::text[])
    `;
    revalidatePath('/startups-dir');
    await logAuditEvent({ action: 'UPDATE', resourceType: 'STARTUP', after: { bulkAction: 'ARCHIVE', count: ids.length } });
    await refreshPublic(['startups', 'funding', 'india-ai', 'home']); return { success: true, count: ids.length };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function bulkDeleteStartupsAction(ids: string[]) {
  const { error } = await requireActionAuth(['SUPER_ADMIN']);
  if (error) return { success: false, error };
  const { allowed, error: deleteError } = await canDelete();
  if (!allowed) return { success: false, error: deleteError || 'Unauthorized' };

  try {
    if (ids.length === 0) return { success: false, error: 'No startups selected' };
    await sql`UPDATE "Startup" SET "deletedAt" = NOW() WHERE id = ANY(${ids}::text[])`;
    revalidatePath('/startups-dir');
    await logAuditEvent({ action: 'DELETE', resourceType: 'STARTUP', after: { bulkAction: true, count: ids.length } });
    await refreshPublic(['startups', 'funding', 'india-ai', 'home']); return { success: true, count: ids.length };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ─── Duplicate Detection ─────────────────────────────────────────────────────

export async function checkDuplicateStartupAction(name: string, websiteUrl: string) {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };
  try {
    // Try with trigram similarity first
    const results = await sql`
      SELECT id, name, slug, "websiteUrl"
      FROM "Startup"
      WHERE "deletedAt" IS NULL
        AND (
          LOWER("websiteUrl") = LOWER(${websiteUrl})
          OR similarity(LOWER(name), LOWER(${name})) > 0.4
        )
      LIMIT 5
    `;
    return results;
  } catch (error) {
    // Fallback: simple exact match if trigram not available
    try {
      const results = await sql`
        SELECT id, name, slug, "websiteUrl"
        FROM "Startup"
        WHERE "deletedAt" IS NULL
          AND (LOWER("websiteUrl") = LOWER(${websiteUrl}) OR LOWER(name) = LOWER(${name}))
        LIMIT 5
      `;
      return results;
    } catch {
      return [];
    }
  }
}
