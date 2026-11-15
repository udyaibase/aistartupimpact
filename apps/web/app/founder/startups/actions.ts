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
import { emailVerificationDomain, listingDomainKey } from '@/lib/startups/listing-domain';
import { contactEmailConfirmed, isPlausibleEmail, normalizeEmail } from '@/lib/startups/contact-email';
import { emailMatchesDomain } from '@/lib/jobs/trust';
import { markStartupVerified } from '@/lib/startups/ownership';

interface StartupSubmission {
  /** Private contact email (admin and platform emails only) and the proof the founder confirmed it. */
  contactEmail?: string;
  contactEmailProof?: string;
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
}

type ListedStartup = { id: string; name: string; slug: string; ownerId: string | null; isVerified: boolean; createdAt: Date; verificationMethod: string | null };

/** A live startup whose website is on the same company domain, if any (see listingDomainKey). */
async function findListedByDomain(key: string): Promise<ListedStartup | null> {
  const rows = await prisma.$queryRaw<(ListedStartup & { websiteUrl: string | null; verifiedDomain: string | null })[]>`
    SELECT id, name, slug, "ownerId", "isVerified", "createdAt", "websiteUrl", "verifiedDomain", "verificationMethod"
    FROM "Startup"
    WHERE "deletedAt" IS NULL
      AND ("websiteUrl" ILIKE ${'%' + key + '%'} OR "verifiedDomain" = ${key})
    ORDER BY "isVerified" DESC, "createdAt" ASC
    LIMIT 25
  `;
  return rows.find((r) => r.verifiedDomain === key || listingDomainKey(r.websiteUrl) === key) ?? null;
}

export type DomainCheck =
  | { status: 'free' }
  | { status: 'yours'; name: string; slug: string }
  | { status: 'listed'; id: string; name: string; slug: string; verified: boolean; dnsTakeover: boolean };

/** Step 1 of the add-startup flow: is a startup on this website already listed? */
export async function checkStartupDomainAction(websiteUrl: string): Promise<DomainCheck> {
  const session = await requireFounderAuth();
  const key = listingDomainKey(String(websiteUrl ?? '').slice(0, 2048));
  if (!key) return { status: 'free' };
  const found = await findListedByDomain(key);
  if (!found) return { status: 'free' };
  if (found.ownerId === session.userId) return { status: 'yours', name: found.name, slug: found.slug };
  return { status: 'listed', id: found.id, name: found.name, slug: found.slug, verified: found.isVerified, dnsTakeover: found.isVerified && found.verificationMethod === 'EMAIL' };
}

export type SubmitResult =
  | { success: true; startupId: string; slug: string; name: string; verified: boolean; workEmailHint: string | null; repeated?: boolean }
  | { success: false; error: string; duplicate?: { id: string; name: string; slug: string; verified: boolean; dnsTakeover: boolean } };

/** A repeat of the same submit (double tap, retry on a slow network) within this window returns the first result. */
const REPEAT_WINDOW_MS = 15 * 60 * 1000;

export async function submitStartupAction(data: StartupSubmission): Promise<SubmitResult> {
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

    // Contact email: required for new startups, and only once the founder has proven they receive mail there.
    const contactEmail = normalizeEmail(data.contactEmail);
    if (!isPlausibleEmail(contactEmail)) return { success: false, error: 'Add a valid contact email.' };
    if (!(await contactEmailConfirmed(session.userId, contactEmail, data.contactEmailProof))) {
      return { success: false, error: 'Confirm your contact email with the 6-digit code first.' };
    }

    const domainKey = listingDomainKey(data.websiteUrl);

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

    // Create startup using raw query
    // Try to include category and businessType if columns exist, otherwise skip them
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

    // One submit at a time per founder, so a double tap can't create two startups. The lock ends with the transaction.
    const outcome = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'startup-submit:' + session.userId}))`;

      if (domainKey) {
        const listed = await findListedByDomain(domainKey);
        if (listed) {
          // The same founder submitting the same startup again moments later: hand back the first one.
          if (listed.ownerId === session.userId && Date.now() - new Date(listed.createdAt).getTime() < REPEAT_WINDOW_MS) {
            return { kind: 'repeat', listed } as const;
          }
          return { kind: 'duplicate', listed } as const;
        }
      }

      const existingByName = await tx.$queryRaw<any[]>`
        SELECT id FROM "Startup"
        WHERE LOWER(name) = LOWER(${data.name})
          AND "ownerId" = ${session.userId}
          AND "deletedAt" IS NULL
        LIMIT 1
      `;
      if (existingByName.length > 0) return { kind: 'sameName' } as const;

      const inserted = await tx.$queryRaw<{ id: string }[]>`
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
      const id = inserted[0]?.id;
      if (id) {
        await tx.$executeRaw`UPDATE "Startup" SET "contactEmail" = ${contactEmail}, "contactEmailVerifiedAt" = NOW() WHERE id = ${id}`;
      }
      return { kind: 'created', id: id ?? null } as const;
    }, { maxWait: 10_000, timeout: 20_000 });

    if (outcome.kind === 'repeat') {
      const r = outcome.listed;
      return { success: true, startupId: r.id, slug: r.slug, name: r.name, verified: r.isVerified, workEmailHint: null, repeated: true };
    }
    if (outcome.kind === 'duplicate') {
      const d = outcome.listed;
      return {
        success: false,
        error: d.ownerId === session.userId
          ? `You've already added ${d.name}. Find it under My startups.`
          : `${d.name} is already listed on Udyaibase. Claim it instead of adding it again.`,
        duplicate: { id: d.id, name: d.name, slug: d.slug, verified: d.isVerified, dnsTakeover: d.isVerified && d.verificationMethod === 'EMAIL' },
      };
    }
    if (outcome.kind === 'sameName') {
      return { success: false, error: 'You have already submitted a startup with this name. View it in your dashboard.' };
    }
    const startupId: string | null = outcome.id;
    if (!startupId) return { success: false, error: 'Failed to submit startup' };

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
          INSERT INTO "FundingRound" (id, "startupId", "roundType", "amountUsd", "amountInr", "fxDerived", "announcedAt", "leadInvestors", "allInvestors", "createdAt")
          VALUES (gen_random_uuid(), ${startupId}, ${round.roundType}, ${round.amountUsd}, ${round.amountInr}, ${round.fxDerived === 'INR' || round.fxDerived === 'USD' ? round.fxDerived : null}, ${round.announcedAt}::timestamp, ${round.leadInvestors}::text[], ${round.allInvestors}::text[], NOW())
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

    // A contact email on the website's own domain proves control of it (same check as the work-email method).
    const companyDomain = emailVerificationDomain(data.websiteUrl);
    let verified = false;
    if (companyDomain && emailMatchesDomain(contactEmail, companyDomain)) {
      await markStartupVerified(prisma, startupId, companyDomain, session.userId, { method: 'EMAIL', email: contactEmail });
      await refreshPublicListing('startup', startupId);
      await logFounderActivity(session.userId, 'startup_claim_verified', { metadata: { startupId, method: 'email' } });
      verified = true;
    }

    // Offer the founder's own sign-in or work email first on the verify screen when it's on the domain.
    let workEmailHint: string | null = null;
    if (!verified && companyDomain) {
      const me = await prisma.founderUser.findUnique({ where: { id: session.userId }, select: { email: true, companyEmail: true } });
      workEmailHint = [me?.companyEmail, me?.email].find((e): e is string => !!e && emailMatchesDomain(e, companyDomain)) ?? null;
    }

    revalidatePath('/founder/startups');
    revalidatePath('/founder/dashboard');

    return { success: true, startupId, slug, name: data.name, verified, workEmailHint };
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

    // Private contact email: not part of the public listing, so it saves straight away, once confirmed.
    if (data.contactEmail !== undefined) {
      const contactEmail = normalizeEmail(data.contactEmail);
      const current = await prisma.startup.findUnique({ where: { id }, select: { contactEmail: true } });
      if (contactEmail && contactEmail !== normalizeEmail(current?.contactEmail)) {
        if (!isPlausibleEmail(contactEmail)) return { success: false, error: 'Add a valid contact email.' };
        if (!(await contactEmailConfirmed(session.userId, contactEmail, data.contactEmailProof))) {
          return { success: false, error: 'Confirm the new contact email with the 6-digit code first.' };
        }
        await prisma.startup.update({ where: { id }, data: { contactEmail, contactEmailVerifiedAt: new Date() } });
      }
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
