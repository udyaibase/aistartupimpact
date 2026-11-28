'use server';

import { neon } from '@neondatabase/serverless';
import { revalidatePath } from 'next/cache';
import { calculateImpactScore } from '@/lib/impact-score';
import { logAuditEvent } from '@/lib/audit-log';
import { requireActionAuth } from '@/lib/api-auth';
import { refreshPublic } from '@/lib/refresh-public';
import { checkLocation } from '@/lib/locations';
import { publicError } from '@/lib/public-error';

/** Startup descriptions are capped at 1,000 characters (matches the founder portal). */
const STARTUP_DESCRIPTION_MAX = 1000;

const sql = neon(process.env.DATABASE_URL!);

export async function getStartupFundingRoundsAction(startupId: string) {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };
  try {
    const fundingRounds = await sql`
      SELECT 
        id, "startupId", "roundType", "amountUsd", "amountInr", to_jsonb("FundingRound") ->> 'fxDerived' AS "fxDerived", "announcedAt", "leadInvestors", "allInvestors", "createdAt"
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
    /** Which amount the database recalculates at the announcement-date rate (the one not typed). */
    fxDerived?: 'INR' | 'USD' | null;
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
  // Same 1,000-character cap as the founder portal.
  if ((data.description || '').length > STARTUP_DESCRIPTION_MAX) {
    return { success: false, error: `Description must be ${STARTUP_DESCRIPTION_MAX.toLocaleString('en-IN')} characters or fewer` };
  }
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
    
    // Headquarters only from the standard city list.
    const loc = await checkLocation({ city: data.headquartersCity ?? '' });
    if (!loc.ok) return { success: false, error: loc.error };
    const finalCity = loc.city;
    
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
    if (startupId && data.fundingRounds && data.fundingRounds.length > 0) {
      for (const round of data.fundingRounds) {
        await sql`
          INSERT INTO "FundingRound" (id, "startupId", "roundType", "amountUsd", "amountInr", "fxDerived", "announcedAt", "leadInvestors", "allInvestors", "createdAt")
          VALUES (gen_random_uuid(), ${startupId}, ${round.roundType}, ${round.amountUsd}, ${round.amountInr}, ${round.fxDerived === 'INR' || round.fxDerived === 'USD' ? round.fxDerived : null}, ${round.announcedAt}::timestamp, ${round.leadInvestors}::text[], ${round.allInvestors}::text[], NOW())
        `;
      }
    }

    if (startupId) {
      await sql`
        UPDATE "Startup"
        SET "totalFundingInr" = (SELECT COALESCE(SUM("amountInr"), 0) FROM "FundingRound" WHERE "startupId" = ${startupId})
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
    return { success: false, error: publicError(error) || 'Failed to create startup' };
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
    /** Which amount the database recalculates at the announcement-date rate (the one not typed). */
    fxDerived?: 'INR' | 'USD' | null;
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
  // Same 1,000-character cap as the founder portal.
  if ((data.description || '').length > STARTUP_DESCRIPTION_MAX) {
    return { success: false, error: `Description must be ${STARTUP_DESCRIPTION_MAX.toLocaleString('en-IN')} characters or fewer` };
  }
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

    // Headquarters only from the standard city list.
    const loc = await checkLocation({ city: data.headquartersCity ?? '' });
    if (!loc.ok) return { success: false, error: loc.error };
    const finalCity = loc.city;

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
      if (data.fundingRounds.length > 0) {
        for (const round of data.fundingRounds) {
          await sql`
            INSERT INTO "FundingRound" (id, "startupId", "roundType", "amountUsd", "amountInr", "fxDerived", "announcedAt", "leadInvestors", "allInvestors", "createdAt")
            VALUES (gen_random_uuid(), ${id}, ${round.roundType}, ${round.amountUsd}, ${round.amountInr}, ${round.fxDerived === 'INR' || round.fxDerived === 'USD' ? round.fxDerived : null}, ${round.announcedAt}::timestamp, ${round.leadInvestors}::text[], ${round.allInvestors}::text[], NOW())
          `;
        }
      }

      await sql`
        UPDATE "Startup"
        SET "totalFundingInr" = (SELECT COALESCE(SUM("amountInr"), 0) FROM "FundingRound" WHERE "startupId" = ${id})
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
    return { success: false, error: publicError(error) || 'Failed to update startup' };
  }
}

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
