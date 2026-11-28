'use server';

import { checkLocation } from '@/lib/locations';
import { neon } from '@neondatabase/serverless';
import { revalidatePath } from 'next/cache';
import { logAuditEvent } from '@/lib/audit-log';
import { invalidateToolCache } from '@/lib/cache-invalidate';
import { requireActionAuth } from '@/lib/api-auth';
import { refreshPublic } from '@/lib/refresh-public';
import { publicError } from '@/lib/public-error';
import { toolRequiredError, toolEditError } from '@udyaibase/utils/tool-required';

const sql = neon(process.env.DATABASE_URL!);

export async function createToolAction(data: {
  name: string;
  slug: string;
  tagline: string;
  description: string;
  websiteUrl: string;
  logoUrl?: string;
  affiliateUrl?: string;
  demoVideoUrl?: string;
  categoryId: string;
  pricingModel: string;
  pricingUrl?: string;
  startingPrice?: number | null;
  freeTrialDays?: number | null;
  hasApi?: boolean;
  hasMobileApp?: boolean;
  launchYear?: number;
  founderNames?: string[];
  headquartersCountry?: string;
  headquartersCity?: string;
  avgRating: number;
  listingTier?: string;
  status?: string;
  screenshotUrls?: string[];
  faqs?: Array<{ question: string; answer: string; order: number }>;
  features?: string[];
  useCases?: string[];
  twitterUrl?: string;
  linkedinUrl?: string;
  socialLinks?: Array<{ platform: string; url: string }>;
}) {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };
  // The same required details as the founder portal: logo, description, LinkedIn, features, use cases, year, country.
  const incomplete = toolRequiredError(data);
  if (incomplete) return { success: false, error: incomplete };
  // Headquarters city and country only from the standard lists.
  if (data.headquartersCity || data.headquartersCountry) {
    const loc = await checkLocation({ city: data.headquartersCity ?? '', country: data.headquartersCountry ?? '' });
    if (!loc.ok) return { success: false, error: loc.error };
    data = { ...data, headquartersCity: loc.city ?? undefined, headquartersCountry: loc.country ?? undefined };
  }
  if (data.tagline) data.tagline = data.tagline.trim().slice(0, 100);
  try {
    // Check for duplicate name or slug
    const existingTool = await sql`
      SELECT id FROM "AiTool"
      WHERE (LOWER(name) = LOWER(${data.name}) OR slug = ${data.slug}) AND "deletedAt" IS NULL
      LIMIT 1
    `;
    if (existingTool.length > 0) {
      return { success: false, error: 'A tool with this name or slug already exists' };
    }

    const socialLinksJson = data.socialLinks && data.socialLinks.length > 0
      ? JSON.stringify(data.socialLinks)
      : null;

    const result = await sql`
      INSERT INTO "AiTool" (
        id, name, slug, tagline, description, "websiteUrl", "logoUrl", "affiliateUrl",
        "demoVideoUrl", "categoryId", "pricingModel", "pricingUrl", "startingPrice",
        "freeTrialDays", "hasApi", "hasMobileApp", "launchYear", "founderNames",
        "headquartersCountry", "headquartersCity", "avgRating", "listingTier", status, "screenshotUrls",
        "twitterUrl", "linkedinUrl", "socialLinks",
        "aiSuggestedEdits",
        "createdAt", "updatedAt"
      ) VALUES (
        gen_random_uuid(),
        ${data.name}, ${data.slug}, ${data.tagline}, ${data.description},
        ${data.websiteUrl}, ${data.logoUrl || null}, ${data.affiliateUrl || null},
        ${data.demoVideoUrl || null}, ${data.categoryId}, ${data.pricingModel}::"PricingModel",
        ${data.pricingUrl || null}, ${data.startingPrice ? Math.round(data.startingPrice * 100) : null},
        ${data.freeTrialDays || null}, ${data.hasApi ?? false}, ${data.hasMobileApp ?? false},
        ${data.launchYear},
        ${data.founderNames || []}, ${data.headquartersCountry || null}, ${data.headquartersCity || null},
        ${data.avgRating}, ${data.listingTier || 'FREE'}::"ListingTier",
        ${data.status || 'APPROVED'}::"ToolApprovalStatus",
        ${data.screenshotUrls || []},
        ${data.twitterUrl || null}, ${data.linkedinUrl || null}, ${socialLinksJson}::jsonb,
        ARRAY[]::text[],
        NOW(), NOW()
      )
      RETURNING id
    `;

    const toolId = result[0].id;

    // Insert features as ToolUseCase entries (zero-padded index prefix for ordering)
    if (data.features && data.features.length > 0) {
      let idx = 0;
      for (const text of data.features) {
        if (text.trim()) {
          const orderedId = `${String(idx).padStart(4, '0')}_${crypto.randomUUID()}`;
          await sql`INSERT INTO "ToolUseCase" (id, "toolId", text, type) VALUES (${orderedId}, ${toolId}, ${text.trim()}, 'feature')`;
          idx++;
        }
      }
    }

    // Insert use cases as ToolUseCase entries
    if (data.useCases && data.useCases.length > 0) {
      let idx = 0;
      for (const text of data.useCases) {
        if (text.trim()) {
          const orderedId = `${String(idx).padStart(4, '0')}_${crypto.randomUUID()}`;
          await sql`INSERT INTO "ToolUseCase" (id, "toolId", text, type) VALUES (${orderedId}, ${toolId}, ${text.trim()}, 'use_case')`;
          idx++;
        }
      }
    }

    // Insert FAQs if provided
    if (data.faqs && data.faqs.length > 0) {
      for (const faq of data.faqs) {
        await sql`
          INSERT INTO "ToolFAQ" (id, "toolId", question, answer, "order", "createdAt", "updatedAt")
          VALUES (gen_random_uuid()::text, ${toolId}, ${faq.question}, ${faq.answer}, ${faq.order}, NOW(), NOW())
        `;
      }
    }
    
    revalidatePath('/tools-dir');
    invalidateToolCache();

    // Audit log
    await logAuditEvent({
      action: 'CREATE',
      resourceType: 'AI_TOOL',
      resourceId: toolId,
      after: { name: data.name, slug: data.slug, pricingModel: data.pricingModel, status: data.status },
    });

    await refreshPublic(['tools', 'home']); return { success: true, toolId };
  } catch (error: any) {
    console.error('createToolAction error:', error);
    return { success: false, error: publicError(error) || 'Failed to create tool' };
  }
}

export async function updateToolAction(id: string, data: {
  name: string;
  tagline: string;
  description: string;
  websiteUrl: string;
  logoUrl?: string;
  affiliateUrl?: string;
  categoryId: string;
  pricingModel: string;
  pricingUrl?: string;
  startingPrice?: number | null;
  freeTrialDays?: number | null;
  demoVideoUrl?: string;
  hasApi?: boolean;
  hasMobileApp?: boolean;
  launchYear?: number;
  founderNames?: string[];
  headquartersCountry?: string;
  headquartersCity?: string;
  avgRating: number;
  listingTier: string;
  status: string;
  screenshotUrls?: string[];
  screenshotMeta?: Record<string, any>;
  faqs?: Array<{ id?: string; question: string; answer: string; order: number }>;
  twitterUrl?: string;
  linkedinUrl?: string;
  socialLinks?: Array<{ platform: string; url: string }>;
  features?: string[];
  useCases?: string[];
}) {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };
  // Tools listed before these details became required can still be edited; a detail a tool already has can't be removed.
  const [stored] = await sql`
    SELECT "logoUrl", description, "linkedinUrl", "launchYear", "headquartersCountry",
      ARRAY(SELECT text FROM "ToolUseCase" WHERE "toolId" = t.id AND type = 'feature') AS features,
      ARRAY(SELECT text FROM "ToolUseCase" WHERE "toolId" = t.id AND type = 'use_case') AS "useCases"
    FROM "AiTool" t WHERE t.id = ${id} LIMIT 1`;
  if (!stored) return { success: false, error: 'This tool no longer exists.' };
  const incomplete = toolEditError(data, stored);
  if (incomplete) return { success: false, error: incomplete };
  // Headquarters city and country only from the standard lists.
  if (data.headquartersCity || data.headquartersCountry) {
    const loc = await checkLocation({ city: data.headquartersCity ?? '', country: data.headquartersCountry ?? '' });
    if (!loc.ok) return { success: false, error: loc.error };
    data = { ...data, headquartersCity: loc.city ?? undefined, headquartersCountry: loc.country ?? undefined };
  }
  if (data.tagline) data.tagline = data.tagline.trim().slice(0, 100);
  try {
    const socialLinksJson = data.socialLinks && data.socialLinks.length > 0
      ? JSON.stringify(data.socialLinks)
      : null;

    await sql`
      UPDATE "AiTool"
      SET
        name = ${data.name},
        tagline = ${data.tagline},
        description = ${data.description},
        "websiteUrl" = ${data.websiteUrl},
        "logoUrl" = ${data.logoUrl || null},
        "affiliateUrl" = ${data.affiliateUrl || null},
        "categoryId" = ${data.categoryId},
        "pricingModel" = ${data.pricingModel}::"PricingModel",
        "pricingUrl" = ${data.pricingUrl || null},
        "startingPrice" = ${data.startingPrice ? Math.round(data.startingPrice * 100) : null},
        "freeTrialDays" = ${data.freeTrialDays || null},
        "demoVideoUrl" = ${data.demoVideoUrl || null},
        "hasApi" = ${data.hasApi ?? false},
        "hasMobileApp" = ${data.hasMobileApp ?? false},
        "launchYear" = ${data.launchYear || stored.launchYear || new Date().getFullYear()},
        "founderNames" = ${data.founderNames || []},
        "headquartersCountry" = ${data.headquartersCountry || null},
        "headquartersCity" = ${data.headquartersCity || null},
        "avgRating" = ${data.avgRating},
        "listingTier" = ${data.listingTier}::"ListingTier",
        status = ${data.status}::"ToolApprovalStatus",
        "screenshotUrls" = ${data.screenshotUrls || []},
        "screenshotMeta" = ${data.screenshotMeta ? JSON.stringify(data.screenshotMeta) : null}::jsonb,
        "twitterUrl" = ${data.twitterUrl || null},
        "linkedinUrl" = ${data.linkedinUrl || null},
        "socialLinks" = ${socialLinksJson}::jsonb,
        "updatedAt" = NOW()
      WHERE id = ${id}
    `;
    
    // Update FAQs if provided
    if (data.faqs !== undefined) {
      // Delete existing FAQs
      await sql`DELETE FROM "ToolFAQ" WHERE "toolId" = ${id}`;
      
      // Insert new FAQs
      if (data.faqs.length > 0) {
        for (const faq of data.faqs) {
          await sql`
            INSERT INTO "ToolFAQ" (id, "toolId", question, answer, "order", "createdAt", "updatedAt")
            VALUES (gen_random_uuid()::text, ${id}, ${faq.question}, ${faq.answer}, ${faq.order}, NOW(), NOW())
          `;
        }
      }
    }
    
    // Update features/useCases (stored in ToolUseCase table with type column)
    if (data.features !== undefined || data.useCases !== undefined) {
      await sql`DELETE FROM "ToolUseCase" WHERE "toolId" = ${id}`;
      const featureItems = (data.features || []).filter(t => t.trim());
      for (let i = 0; i < featureItems.length; i++) {
        const orderedId = `${String(i).padStart(4, '0')}_${crypto.randomUUID()}`;
        await sql`INSERT INTO "ToolUseCase" (id, "toolId", text, type) VALUES (${orderedId}, ${id}, ${featureItems[i].trim()}, 'feature')`;
      }
      const useCaseItems = (data.useCases || []).filter(t => t.trim());
      for (let i = 0; i < useCaseItems.length; i++) {
        const orderedId = `${String(i).padStart(4, '0')}_${crypto.randomUUID()}`;
        await sql`INSERT INTO "ToolUseCase" (id, "toolId", text, type) VALUES (${orderedId}, ${id}, ${useCaseItems[i].trim()}, 'use_case')`;
      }
    }

    revalidatePath('/tools-dir');
    invalidateToolCache();

    // Audit log
    await logAuditEvent({
      action: 'UPDATE',
      resourceType: 'AI_TOOL',
      resourceId: id,
      after: { name: data.name, pricingModel: data.pricingModel, status: data.status },
    });

    await refreshPublic(['tools', 'home']); return { success: true };
  } catch (error: any) {
    console.error('updateToolAction error:', error);
    return { success: false, error: publicError(error) || 'Failed to update tool' };
  }
}

export async function getToolUseCasesAction(toolId: string) {
  const { error } = await requireActionAuth();
  if (error) return { features: [], useCases: [] };
  try {
    const rows = await sql`SELECT id, text, type FROM "ToolUseCase" WHERE "toolId" = ${toolId} ORDER BY id`;
    const features = (rows as any[]).filter(r => r.type === 'feature').map(r => ({ id: r.id, text: r.text }));
    const useCases = (rows as any[]).filter(r => r.type !== 'feature').map(r => ({ id: r.id, text: r.text }));
    return { features, useCases };
  } catch {
    return { features: [], useCases: [] };
  }
}

export async function checkDuplicateToolAction(name: string, websiteUrl: string) {
  const { error: authError } = await requireActionAuth();
  if (authError) return [];
  try {
    const results = await sql`
      SELECT id, name, slug, "websiteUrl"
      FROM "AiTool"
      WHERE "deletedAt" IS NULL
        AND (
          LOWER("websiteUrl") = LOWER(${websiteUrl})
          OR similarity(LOWER(name), LOWER(${name})) > 0.4
        )
      LIMIT 5
    `;
    return results;
  } catch (error) {
    // Fallback: simple exact match if trigram extension not available
    try {
      const results = await sql`
        SELECT id, name, slug, "websiteUrl"
        FROM "AiTool"
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
