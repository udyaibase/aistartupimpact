'use server';

import { requireFounderAuth } from '@/lib/founder-auth';
import { sendAdminReviewAlert, sendSubmissionReceivedEmail } from '@/lib/founder-email';
import { prisma, readListingFields, saveListingEdit } from '@udyaibase/database';
import { revalidatePath } from 'next/cache';
import { validateInput } from '@/lib/validation';
import { startupSubmissionSchema } from '@/lib/founder/listing-validation';
import { listingFieldLabel } from '@udyaibase/utils';
import { listingAccess } from '@/lib/founder/listing-access';
import { refreshPublicListing } from '@/lib/founder/refresh-listing';
import { logFounderActivity } from '@/lib/founder/activity';
import { founderAtStartupLimit, STARTUP_LIMIT_MESSAGE } from '@/lib/founder/limits';
import { checkLocation } from '@/lib/locations';

interface StartupSubmission {
  name: string;
  tagline: string;
  description: string;
  websiteUrl: string;
  linkedinUrl?: string;
  twitterUrl?: string;
  foundedYear: number;
  headquartersCity?: string;
  stage: string;
  employeeCount?: number;
  founders: string[];
  logoUrl?: string;
  category?: string;
  businessType?: string;
  status?: string;
  totalFundingInr?: number;
  faqs?: Array<{
    question: string;
    answer: string;
    order: number;
  }>;
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
}

export async function submitStartupAction(data: StartupSubmission) {
  try {
    const session = await requireFounderAuth();
    if (await founderAtStartupLimit(session.userId)) return { success: false, error: STARTUP_LIMIT_MESSAGE };
    const checked = validateInput(startupSubmissionSchema, data);
    if (!checked.success) return { success: false, error: checked.error };
    data = checked.data as unknown as StartupSubmission;
    // Headquarters only from the standard city list.
    if (data.headquartersCity) {
      const loc = await checkLocation({ city: data.headquartersCity });
      if (!loc.ok) return { success: false, error: loc.error };
      data = { ...data, headquartersCity: loc.city ?? undefined };
    }

    // Generate clean SEO-friendly slug (no random hash)
    const { slugify } = await import('@/lib/slug-utils');
    const baseSlug = slugify(data.name);
    let slug = baseSlug;
    let counter = 1;
    while (true) {
      const taken = await prisma.$queryRaw<any[]>`
        SELECT id FROM "Startup" WHERE slug = ${slug} LIMIT 1
      `;
      if (taken.length === 0) break;
      counter++;
      slug = `${baseSlug}-${counter}`;
    }

    // Check if startup with same name already exists for this founder
    const existingByName = await prisma.$queryRaw<any[]>`
      SELECT id
      FROM "Startup"
      WHERE LOWER(name) = LOWER(${data.name})
        AND "ownerId" = ${session.userId}
        AND "deletedAt" IS NULL
      LIMIT 1
    `;

    if (existingByName.length > 0) {
      return {
        success: false,
        error: 'You have already submitted a startup with this name. View it in your dashboard.',
      };
    }

    // Create startup using raw query
    // Try to include category and businessType if columns exist, otherwise skip them
    let startupId: string | null = null;
    const foundersDataJson = data.foundersData && data.foundersData.length > 0
      ? JSON.stringify(data.foundersData)
      : null;
    const socialLinksJson = data.socialLinks && data.socialLinks.length > 0
      ? JSON.stringify(data.socialLinks)
      : null;

    // Resolve cityId from headquartersCity name
    let cityId: string | null = null;
    if (data.headquartersCity) {
      const cityMatch = await prisma.$queryRaw<any[]>`
        SELECT id FROM "City"
        WHERE LOWER(name) = LOWER(${data.headquartersCity})
          OR ${data.headquartersCity.toLowerCase()} = ANY(aliases)
        LIMIT 1
      `;
      cityId = cityMatch.length > 0 ? cityMatch[0].id : null;
    }

    try {
      const result = await prisma.$queryRaw<any[]>`
        INSERT INTO "Startup" (
          id, name, slug, tagline, description, "websiteUrl", "linkedinUrl", "twitterUrl",
          "foundedYear", "headquartersCity", "cityId", stage, "employeeCount", founders, "foundersData", "socialLinks", "logoUrl",
          "totalFundingInr", category, "businessType", status, "ownerId", "claimStatus", "submittedBy", "createdAt", "updatedAt"
        ) VALUES (
          gen_random_uuid(),
          ${data.name},
          ${slug},
          ${data.tagline},
          ${data.description},
          ${data.websiteUrl},
          ${data.linkedinUrl || null},
          ${data.twitterUrl || null},
          ${data.foundedYear},
          ${data.headquartersCity || null},
          ${cityId},
          ${data.stage}::"StartupStage",
          ${data.employeeCount || null},
          ${data.founders}::text[],
          ${foundersDataJson}::jsonb,
          ${socialLinksJson}::jsonb,
          ${data.logoUrl || null},
          ${data.totalFundingInr || 0},
          ${data.category || null},
          ${data.businessType || null},
          ${data.status || 'ACTIVE'}::"CompanyStatus",
          ${session.userId},
          'PENDING'::"ClaimStatus",
          'FOUNDER',
          NOW(),
          NOW()
        )
        RETURNING id
      `;
      startupId = result[0]?.id;
    } catch (error: any) {
      // If category or businessType column doesn't exist, insert without them
      if (error.message?.includes('category') || error.message?.includes('businessType') || error.message?.includes('column')) {
        console.log('[submitStartup] Category or businessType column not found, inserting without them');
        const result = await prisma.$queryRaw<any[]>`
          INSERT INTO "Startup" (
            id, name, slug, tagline, description, "websiteUrl", "linkedinUrl", "twitterUrl",
            "foundedYear", "headquartersCity", stage, "employeeCount", founders, "socialLinks", "logoUrl",
            "totalFundingInr", status, "ownerId", "claimStatus", "submittedBy", "createdAt", "updatedAt"
          ) VALUES (
            gen_random_uuid(),
            ${data.name},
            ${slug},
            ${data.tagline},
            ${data.description},
            ${data.websiteUrl},
            ${data.linkedinUrl || null},
            ${data.twitterUrl || null},
            ${data.foundedYear},
            ${data.headquartersCity || null},
            ${data.stage}::"StartupStage",
            ${data.employeeCount || null},
            ${data.founders}::text[],
            ${socialLinksJson}::jsonb,
            ${data.logoUrl || null},
            ${data.totalFundingInr || 0},
            ${data.status || 'ACTIVE'}::"CompanyStatus",
            ${session.userId},
            'PENDING'::"ClaimStatus",
            'FOUNDER',
            NOW(),
            NOW()
          )
          RETURNING id
        `;
        startupId = result[0]?.id;
      } else {
        throw error;
      }
    }

    // Insert FAQs if provided
    if (startupId && data.faqs && data.faqs.length > 0) {
      for (const faq of data.faqs) {
        await prisma.$executeRaw`
          INSERT INTO "StartupFAQ" (id, "startupId", question, answer, "order", "createdAt", "updatedAt")
          VALUES (gen_random_uuid(), ${startupId}, ${faq.question}, ${faq.answer}, ${faq.order}, NOW(), NOW())
        `;
      }
    }

    // Insert Funding Rounds if provided
    if (startupId && data.fundingRounds && data.fundingRounds.length > 0) {
      for (const round of data.fundingRounds) {
        await prisma.$executeRaw`
          INSERT INTO "FundingRound" (id, "startupId", "roundType", "amountUsd", "amountInr", "announcedAt", "leadInvestors", "allInvestors", "createdAt")
          VALUES (gen_random_uuid(), ${startupId}, ${round.roundType}, ${round.amountUsd}, ${round.amountInr}, ${round.announcedAt}::timestamp, ${round.leadInvestors}::text[], ${round.allInvestors}::text[], NOW())
        `;
      }
    }

    // Auto-calculate and store impact score
    if (startupId) {
      const totalFundingUsdCents = (data.fundingRounds || []).reduce((sum, r) => sum + (r.amountUsd || 0), 0);
      const { calculateImpactScore } = await import('@/lib/impact-score');
      const { total: impactScore } = calculateImpactScore({
        totalFundingUsdCents,
        employeeCount: data.employeeCount ?? null,
        stage: data.stage,
        foundedYear: data.foundedYear ?? null,
      });
      await prisma.$executeRaw`UPDATE "Startup" SET "impactScore" = ${impactScore} WHERE id = ${startupId}`;
    }

    // Confirm to the founder and alert the review team (fire-and-forget)
    const founderInfo = await prisma.$queryRaw<any[]>`
      SELECT email, name FROM "FounderUser" WHERE id = ${session.userId} LIMIT 1
    `;
    if (founderInfo.length > 0) {
      sendSubmissionReceivedEmail(founderInfo[0].email, founderInfo[0].name, 'startup', data.name)
        .catch(err => console.error('Submission email error:', err));
      sendAdminReviewAlert({ entityType: 'startup', entityName: data.name, founderEmail: founderInfo[0].email, reason: 'new' });
    }

    await logFounderActivity(session.userId, 'startup_submitted', { metadata: { name: data.name } });
    revalidatePath('/founder/startups');
    revalidatePath('/founder/dashboard');

    return { success: true };
  } catch (error: any) {
    console.error('Startup submission error:', error);
    return {
      success: false,
      error: error.message || 'Failed to submit startup',
    };
  }
}

export async function updateStartupAction(id: string, data: StartupSubmission) {
  try {
    const session = await requireFounderAuth();
    const checked = validateInput(startupSubmissionSchema, data);
    if (!checked.success) return { success: false, error: checked.error };
    data = checked.data as unknown as StartupSubmission;
    // Headquarters only from the standard city list.
    if (data.headquartersCity) {
      const loc = await checkLocation({ city: data.headquartersCity });
      if (!loc.ok) return { success: false, error: loc.error };
      data = { ...data, headquartersCity: loc.city ?? undefined };
    }

    // Owner, or a teammate who can edit. Viewers and strangers can't, whatever the screen shows.
    const access = await listingAccess(session, 'startup', id);
    if (!access?.canEdit) {
      return { success: false, error: 'Startup not found or you do not have permission to edit it' };
    }

    const result = await saveListingEdit('startup', id, {
      name: data.name,
      tagline: data.tagline,
      description: data.description,
      websiteUrl: data.websiteUrl,
      linkedinUrl: data.linkedinUrl ?? null,
      twitterUrl: data.twitterUrl ?? null,
      foundedYear: data.foundedYear,
      headquartersCity: data.headquartersCity ?? null,
      stage: data.stage,
      employeeCount: data.employeeCount ?? null,
      logoUrl: data.logoUrl ?? null,
      totalFundingInr: data.totalFundingInr ?? 0,
      category: data.category ?? null,
      businessType: data.businessType ?? null,
      status: data.status || 'ACTIVE',
      socialLinks: data.socialLinks ?? [],
      faqs: data.faqs ?? [],
      fundingRounds: data.fundingRounds ?? [],
      foundersData: data.foundersData ?? [],
    }, { type: 'FOUNDER', id: session.userId, label: session.name });
    if (!result) return { success: false, error: 'Startup not found or you do not have permission to edit it' };

    // The impact score follows what's live.
    if (result.published.some((f) => ['fundingRounds', 'employeeCount', 'stage', 'foundedYear'].includes(f))) {
      const live = await readListingFields('startup', id);
      if (live) {
        const { calculateImpactScore } = await import('@/lib/impact-score');
        const { total: impactScore } = calculateImpactScore({
          totalFundingUsdCents: ((live.fundingRounds as { amountUsd: number | null }[]) ?? []).reduce((sum, r) => sum + (r.amountUsd || 0), 0),
          employeeCount: (live.employeeCount as number | null) ?? null,
          stage: live.stage as string,
          foundedYear: (live.foundedYear as number | null) ?? null,
        });
        await prisma.$executeRaw`UPDATE "Startup" SET "impactScore" = ${impactScore} WHERE id = ${id}`;
      }
    }

    // On the owner's log whoever did it, and on the teammate's too.
    const by: Record<string, string> = access.role === 'OWNER' ? {} : { by: session.name };
    if (result.published.length) {
      await refreshPublicListing('startup', id);
      await logFounderActivity(access.ownerId, 'startup_updated', { metadata: { name: data.name, ...by } });
      if (access.role !== 'OWNER') await logFounderActivity(session.userId, 'startup_updated', { metadata: { name: data.name } });
    }
    if (result.pending.length) {
      const fields = result.pending.map(listingFieldLabel).join(', ');
      await logFounderActivity(access.ownerId, 'edit_submitted', { metadata: { fields, ...by } });
      if (access.role !== 'OWNER') await logFounderActivity(session.userId, 'edit_submitted', { metadata: { fields } });
      sendAdminReviewAlert({ entityType: 'startup', entityName: access.name, founderEmail: session.email, reason: 'edited' });
    }
    if (result.resubmitted) sendAdminReviewAlert({ entityType: 'startup', entityName: data.name, founderEmail: session.email, reason: 'resubmitted' });

    revalidatePath('/founder/startups');
    revalidatePath('/founder/dashboard');

    return { success: true, published: result.published.map(listingFieldLabel), pending: result.pending.map(listingFieldLabel), resubmitted: result.resubmitted };
  } catch (error: any) {
    console.error('Startup update error:', error);
    return {
      success: false,
      error: error.message || 'Failed to update startup',
    };
  }
}

// ─── Startup Categories & Types (fetched from canonical tables) ─────────────

export async function getStartupCategoriesAction() {
  try {
    const rows = await prisma.$queryRaw<any[]>`
      SELECT name FROM "StartupBusinessCategory"
      WHERE "isActive" = true
      ORDER BY "sortOrder" ASC, name ASC
    `;
    return rows.map((r: any) => r.name);
  } catch (error) {
    console.error('getStartupCategoriesAction error:', error);
    return [];
  }
}

export async function getStartupTypesAction() {
  try {
    const rows = await prisma.$queryRaw<any[]>`
      SELECT name FROM "StartupBusinessType"
      WHERE "isActive" = true
      ORDER BY "sortOrder" ASC, name ASC
    `;
    return rows.map((r: any) => r.name);
  } catch (error) {
    console.error('getStartupTypesAction error:', error);
    return [];
  }
}
