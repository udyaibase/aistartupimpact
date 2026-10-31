'use server';

import { neon } from '@neondatabase/serverless';
import { revalidatePath } from 'next/cache';
import { logAuditEvent, canDelete } from '@/lib/audit-log';
import { invalidateToolCache, invalidateTaxonomyCache } from '@/lib/cache-invalidate';
import { toolApprovalHtml } from '@udyaibase/utils';
import { sendEmailFireAndForget } from '@/lib/email-send';
import { requireActionAuth } from '@/lib/api-auth';
import { refreshPublic } from '@/lib/refresh-public';

const sql = neon(process.env.DATABASE_URL!);

export async function getToolsAction() {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };
  try {
    const tools = await sql`
      SELECT
        t.id, t.name, t.slug, t."slugChangedAt", t."previousSlugs", t.tagline, t.description, t."websiteUrl", t."logoUrl",
        t."pricingModel", t."avgRating", t."listingTier", t.status, t."claimStatus", t."contentReviewed",
        t."founderNames", t."headquartersCountry", t."hasApi", t."hasMobileApp",
        t."pricingUrl", t."startingPrice", t."freeTrialDays", t."demoVideoUrl", t."ownerId",
        t."launchYear", t."screenshotUrls", t."screenshotMeta", t."affiliateUrl",
        t."twitterUrl", t."linkedinUrl", t."socialLinks",
        t."createdAt", t."updatedAt",
        c.name AS "categoryName", c.id AS "categoryId",
        u.name AS "ownerName", u.email AS "ownerEmail"
      FROM "AiTool" t
      LEFT JOIN "ToolCategory" c ON c.id = t."categoryId"
      LEFT JOIN "User" u ON u.id = t."ownerId"
      WHERE t."deletedAt" IS NULL
      ORDER BY
        CASE WHEN t.status = 'PENDING' THEN 0 ELSE 1 END ASC,
        CASE WHEN t."listingTier" = 'FEATURED' THEN 1
             WHEN t."listingTier" = 'PRIORITY' THEN 2
             ELSE 3 END ASC,
        t."createdAt" DESC
    `;
    return tools;
  } catch (error) {
    console.error('getToolsAction error:', error);
    return [];
  }
}

export async function approveToolAction(id: string) {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };
  try {
    // Get tool details and owner email
    const tools = await sql`
      SELECT t.id, t.name, t.slug, t."ownerId",
             fu.email AS "founderEmail", fu.name AS "founderName"
      FROM "AiTool" t
      LEFT JOIN "FounderUser" fu ON fu.id = t."ownerId"
      WHERE t.id = ${id}
      LIMIT 1
    `;

    if (tools.length === 0) {
      return { success: false, error: 'Tool not found' };
    }

    const tool = tools[0] as any;

    await sql`
      UPDATE "AiTool"
      SET
        status = 'APPROVED'::"ToolApprovalStatus",
        "claimStatus" = 'CLAIMED',
        "approvedAt" = NOW(),
        "updatedAt" = NOW()
      WHERE id = ${id}
    `;

    if (tool.founderEmail) {
      sendEmailFireAndForget({
        to: tool.founderEmail,
        subject: `Your tool "${tool.name}" is now live on Udyaibase`,
        html: toolApprovalHtml(tool.name, tool.founderName || 'there', tool.slug),
        type: 'approval',
      });
    }

    revalidatePath('/tools-dir');
    invalidateToolCache();

    // Audit log
    await logAuditEvent({
      action: 'APPROVE',
      resourceType: 'AI_TOOL',
      resourceId: id,
      after: { name: tool.name, slug: tool.slug },
    });

    await refreshPublic(['tools', 'home']); return { success: true };
  } catch (error: any) {
    console.error('approveToolAction error:', error);
    return { success: false, error: error.message };
  }
}

export async function rejectToolAction(id: string, reason?: string) {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };
  try {
    await sql`
      UPDATE "AiTool"
      SET
        status = 'ARCHIVED'::"ToolApprovalStatus",
        "claimStatus" = 'REJECTED',
        "updatedAt" = NOW()
      WHERE id = ${id}
    `;
    revalidatePath('/tools-dir');
    invalidateToolCache();
    await refreshPublic(['tools', 'home']); return { success: true };
  } catch (error: any) {
    console.error('rejectToolAction error:', error);
    return { success: false, error: error.message };
  }
}

export async function getCategoriesAction() {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };
  try {
    const cats = await sql`
      SELECT c.id, c.name, c.slug, c."parentId",
             p.name AS "parentName", p.slug AS "parentSlug", p.icon AS "parentIcon"
      FROM "ToolCategory" c
      LEFT JOIN "ToolCategory" p ON p.id = c."parentId"
      WHERE c.level = 1 AND c."isActive" = true
      ORDER BY p."sortOrder" ASC, c."sortOrder" ASC, c.name ASC
    `;
    return cats;
  } catch (error) {
    console.error('getCategoriesAction error:', error);
    return [];
  }
}

export async function getCategoryTreeAction() {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };
  try {
    const parents = await sql`
      SELECT id, name, slug, icon, description, "toolCount", "sortOrder"
      FROM "ToolCategory"
      WHERE level = 0 AND "isActive" = true
      ORDER BY "sortOrder" ASC
    `;
    const subcategories = await sql`
      SELECT id, name, slug, description, "parentId", "toolCount", "sortOrder"
      FROM "ToolCategory"
      WHERE level = 1 AND "isActive" = true
      ORDER BY "sortOrder" ASC, name ASC
    `;

    const subsByParent: Record<string, any[]> = {};
    for (const sub of subcategories) {
      const pid = (sub as any).parentId;
      if (!subsByParent[pid]) subsByParent[pid] = [];
      subsByParent[pid].push(sub);
    }

    return parents.map((p: any) => ({
      ...p,
      subcategories: subsByParent[p.id] || [],
    }));
  } catch (error) {
    console.error('getCategoryTreeAction error:', error);
    return [];
  }
}

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
        "headquartersCountry", "avgRating", "listingTier", status, "screenshotUrls",
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
        ${data.launchYear || new Date().getFullYear()},
        ${data.founderNames || []}, ${data.headquartersCountry || null},
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
    return { success: false, error: error.message || 'Failed to create tool' };
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
        "launchYear" = ${data.launchYear || new Date().getFullYear()},
        "founderNames" = ${data.founderNames || []},
        "headquartersCountry" = ${data.headquartersCountry || null},
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
    return { success: false, error: error.message || 'Failed to update tool' };
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

export async function deleteToolAction(id: string) {
  const { error: authError } = await requireActionAuth(['SUPER_ADMIN']);
  if (authError) return { success: false, error: authError };
  const { allowed, error } = await canDelete();
  if (!allowed) {
    return { success: false, error: error || 'Unauthorized' };
  }

  try {
    // Capture before state for audit
    const existing = await sql`SELECT id, name, slug FROM "AiTool" WHERE id = ${id} LIMIT 1`;
    const before = existing[0] || null;

    await sql`UPDATE "AiTool" SET "deletedAt" = NOW() WHERE id = ${id}`;
    revalidatePath('/tools-dir');
    invalidateToolCache();

    // Audit log
    await logAuditEvent({
      action: 'DELETE',
      resourceType: 'AI_TOOL',
      resourceId: id,
      before: before ? { name: before.name, slug: before.slug } : undefined,
    });

    await refreshPublic(['tools', 'home']); return { success: true };
  } catch (error: any) {
    console.error('deleteToolAction error:', error);
    return { success: false, error: error.message || 'Failed to delete tool' };
  }
}

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
    return { success: false, error: error.message || 'Failed to update tier' };
  }
}

export async function getToolFAQsAction(toolId: string) {
  const { error } = await requireActionAuth();
  if (error) return [];
  try {
    const faqs = await sql`
      SELECT id, question, answer, "order"
      FROM "ToolFAQ"
      WHERE "toolId" = ${toolId}
      ORDER BY "order" ASC
    `;
    return faqs.map((faq: any) => ({
      id: faq.id,
      question: faq.question,
      answer: faq.answer,
      order: faq.order,
    }));
  } catch (error) {
    console.error('getToolFAQsAction error:', error);
    return [];
  }
}

export async function getToolProsConsAction(toolId: string) {
  const { error } = await requireActionAuth();
  if (error) return { pros: [], cons: [] };
  try {
    const [pros, cons] = await Promise.all([
      sql`SELECT id, text FROM "ToolPro" WHERE "toolId" = ${toolId} ORDER BY id ASC`,
      sql`SELECT id, text FROM "ToolCon" WHERE "toolId" = ${toolId} ORDER BY id ASC`,
    ]);
    return {
      pros: pros.map((p: any) => ({ id: p.id, text: p.text })),
      cons: cons.map((c: any) => ({ id: c.id, text: c.text })),
    };
  } catch (error) {
    console.error('getToolProsConsAction error:', error);
    return { pros: [], cons: [] };
  }
}

export async function updateToolProsConsAction(toolId: string, data: { pros: string[]; cons: string[] }) {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };
  try {
    // Delete existing
    await sql`DELETE FROM "ToolPro" WHERE "toolId" = ${toolId}`;
    await sql`DELETE FROM "ToolCon" WHERE "toolId" = ${toolId}`;

    // Insert new pros
    for (const text of data.pros) {
      if (text.trim()) {
        await sql`INSERT INTO "ToolPro" (id, "toolId", text) VALUES (gen_random_uuid()::text, ${toolId}, ${text.trim()})`;
      }
    }

    // Insert new cons
    for (const text of data.cons) {
      if (text.trim()) {
        await sql`INSERT INTO "ToolCon" (id, "toolId", text) VALUES (gen_random_uuid()::text, ${toolId}, ${text.trim()})`;
      }
    }

    revalidatePath('/tools-dir');
    invalidateToolCache();
    await refreshPublic(['tools', 'home']); return { success: true };
  } catch (error: any) {
    console.error('updateToolProsConsAction error:', error);
    return { success: false, error: error.message };
  }
}

// ─── Tool Featured Campaign System ─────────────────────────────────────────

const TOOL_TIER_SLOTS: Record<string, number> = {
  FEATURED: 1,
  PRIORITY: 4,
  FREE: 6,
};

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
    return { success: false, error: error.message || 'Failed to schedule campaign' };
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
    return { success: false, error: error.message || 'Failed to cancel campaign' };
  }
}


// ─── Startup Linking ────────────────────────────────────────────────────────

export async function searchStartupsForLinkAction(query: string) {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };
  try {
    if (!query || query.length < 2) return [];
    const results = await sql`
      SELECT id, name, slug, "logoUrl", stage, "headquartersCity"
      FROM "Startup"
      WHERE "deletedAt" IS NULL
        AND (LOWER(name) LIKE ${'%' + query.toLowerCase() + '%'} OR LOWER(slug) LIKE ${'%' + query.toLowerCase() + '%'})
      ORDER BY name ASC
      LIMIT 10
    `;
    return results;
  } catch (error) {
    console.error('searchStartupsForLinkAction error:', error);
    return [];
  }
}

export async function linkToolToStartupAction(toolId: string, startupId: string | null) {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };
  try {
    await sql`
      UPDATE "AiTool" SET "startupId" = ${startupId}, "updatedAt" = NOW()
      WHERE id = ${toolId}
    `;
    revalidatePath('/tools-dir');
    invalidateToolCache();
    await refreshPublic(['tools', 'home']); return { success: true };
  } catch (error: any) {
    console.error('linkToolToStartupAction error:', error);
    return { success: false, error: error.message };
  }
}

export async function getLinkedStartupAction(toolId: string) {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };
  try {
    const rows = await sql`
      SELECT s.id, s.name, s.slug, s."logoUrl", s.stage, s."headquartersCity", s."totalFundingInr", s."employeeCount", s."foundedYear"
      FROM "AiTool" t
      JOIN "Startup" s ON s.id = t."startupId"
      WHERE t.id = ${toolId} AND s."deletedAt" IS NULL
      LIMIT 1
    `;
    return rows.length > 0 ? rows[0] : null;
  } catch (error) {
    console.error('getLinkedStartupAction error:', error);
    return null;
  }
}


export async function verifyToolManuallyAction(id: string) {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };
  try {
    await sql`
      UPDATE "AiTool"
      SET "isUrlVerified" = true, "claimStatus" = 'VERIFIED'::"ClaimStatus", "updatedAt" = NOW()
      WHERE id = ${id}
    `;
    revalidatePath('/tools-dir');
    invalidateToolCache();

    await logAuditEvent({
      action: 'APPROVE',
      resourceType: 'AI_TOOL',
      resourceId: id,
      after: { action: 'MANUAL_VERIFICATION' },
    });

    await refreshPublic(['tools', 'home']); return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function unverifyToolAction(id: string) {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };
  try {
    await sql`
      UPDATE "AiTool"
      SET "isUrlVerified" = false, "claimStatus" = 'CLAIMED'::"ClaimStatus", "updatedAt" = NOW()
      WHERE id = ${id}
    `;
    revalidatePath('/tools-dir');
    invalidateToolCache();
    await refreshPublic(['tools', 'home']); return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}


// ─── Tool Alternatives ───────────────────────────────────────────────────────

export async function getToolAlternativesAction(toolId: string) {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };
  try {
    const rows = await sql`
      SELECT a.id, a."alternativeId", a.source,
             t.name, t.slug, t."logoUrl", t.tagline, t."avgRating", t."pricingModel"
      FROM "ToolAlternative" a
      JOIN "AiTool" t ON t.id = a."alternativeId"
      WHERE a."toolId" = ${toolId} AND t."deletedAt" IS NULL
      ORDER BY a."createdAt" DESC
    `;
    return rows;
  } catch (error) {
    console.error('getToolAlternativesAction error:', error);
    return [];
  }
}

export async function addToolAlternativeAction(toolId: string, alternativeId: string) {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };
  try {
    if (toolId === alternativeId) return { success: false, error: 'A tool cannot be its own alternative' };

    // Check if already linked
    const existing = await sql`SELECT id FROM "ToolAlternative" WHERE "toolId" = ${toolId} AND "alternativeId" = ${alternativeId} LIMIT 1`;
    if (existing.length > 0) return { success: false, error: 'Already linked as alternative' };

    // Insert bidirectional: A→B and B→A
    await sql`INSERT INTO "ToolAlternative" (id, "toolId", "alternativeId", source) VALUES (gen_random_uuid(), ${toolId}, ${alternativeId}, 'admin') ON CONFLICT DO NOTHING`;
    await sql`INSERT INTO "ToolAlternative" (id, "toolId", "alternativeId", source) VALUES (gen_random_uuid(), ${alternativeId}, ${toolId}, 'admin') ON CONFLICT DO NOTHING`;

    revalidatePath('/tools-dir');
    invalidateToolCache();
    await refreshPublic(['tools', 'home']); return { success: true };
  } catch (error: any) {
    console.error('addToolAlternativeAction error:', error);
    return { success: false, error: error.message };
  }
}

export async function removeToolAlternativeAction(toolId: string, alternativeId: string) {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };
  try {
    // Remove both directions
    await sql`DELETE FROM "ToolAlternative" WHERE ("toolId" = ${toolId} AND "alternativeId" = ${alternativeId}) OR ("toolId" = ${alternativeId} AND "alternativeId" = ${toolId})`;
    revalidatePath('/tools-dir');
    invalidateToolCache();
    await refreshPublic(['tools', 'home']); return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function searchToolsForAlternativeAction(query: string, excludeToolId: string) {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };
  try {
    if (!query || query.length < 2) return [];
    const results = await sql`
      SELECT id, name, slug, "logoUrl", "pricingModel", "avgRating"
      FROM "AiTool"
      WHERE "deletedAt" IS NULL AND status = 'APPROVED'
        AND id != ${excludeToolId}
        AND (LOWER(name) LIKE ${'%' + query.toLowerCase() + '%'} OR LOWER(slug) LIKE ${'%' + query.toLowerCase() + '%'})
      ORDER BY name ASC
      LIMIT 10
    `;
    return results;
  } catch (error) {
    console.error('searchToolsForAlternativeAction error:', error);
    return [];
  }
}


// ─── Sprint 4: Bulk Actions ─────────────────────────────────────────────────

export async function bulkApproveToolsAction(ids: string[]) {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };
  try {
    if (ids.length === 0) return { success: false, error: 'No tools selected' };
    await sql`
      UPDATE "AiTool"
      SET status = 'APPROVED'::"ToolApprovalStatus", "claimStatus" = 'CLAIMED', "approvedAt" = NOW(), "updatedAt" = NOW()
      WHERE id = ANY(${ids}::text[]) AND status = 'PENDING'
    `;
    revalidatePath('/tools-dir');
    invalidateToolCache();
    await logAuditEvent({ action: 'APPROVE', resourceType: 'AI_TOOL', after: { bulkAction: true, count: ids.length } });
    await refreshPublic(['tools', 'home']); return { success: true, count: ids.length };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function bulkArchiveToolsAction(ids: string[]) {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };
  try {
    if (ids.length === 0) return { success: false, error: 'No tools selected' };
    await sql`
      UPDATE "AiTool"
      SET status = 'ARCHIVED'::"ToolApprovalStatus", "updatedAt" = NOW()
      WHERE id = ANY(${ids}::text[])
    `;
    revalidatePath('/tools-dir');
    invalidateToolCache();
    await logAuditEvent({ action: 'UPDATE', resourceType: 'AI_TOOL', after: { bulkAction: 'ARCHIVE', count: ids.length } });
    await refreshPublic(['tools', 'home']); return { success: true, count: ids.length };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function bulkDeleteToolsAction(ids: string[]) {
  const { error } = await requireActionAuth(['SUPER_ADMIN']);
  if (error) return { success: false, error };
  const { allowed, error: deleteError } = await canDelete();
  if (!allowed) return { success: false, error: error || 'Unauthorized' };

  try {
    if (ids.length === 0) return { success: false, error: 'No tools selected' };
    await sql`UPDATE "AiTool" SET "deletedAt" = NOW() WHERE id = ANY(${ids}::text[])`;
    revalidatePath('/tools-dir');
    invalidateToolCache();
    await logAuditEvent({ action: 'DELETE', resourceType: 'AI_TOOL', after: { bulkAction: true, count: ids.length } });
    await refreshPublic(['tools', 'home']); return { success: true, count: ids.length };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ─── Sprint 4.2: Duplicate Detection ────────────────────────────────────────

export async function checkDuplicateToolAction(name: string, websiteUrl: string) {
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

export async function toggleToolContentReviewedAction(id: string, currentValue: boolean) {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };
  try {
    await sql`
      UPDATE "AiTool"
      SET "contentReviewed" = ${!currentValue}, "updatedAt" = NOW()
      WHERE id = ${id}
    `;
    revalidatePath('/tools-dir');
    await refreshPublic(['tools', 'home']); return { success: true };
  } catch (error: any) {
    console.error('toggleToolContentReviewedAction error:', error);
    return { success: false, error: error.message };
  }
}


// ─── Screenshot Operations ─────────────────────────────────────────────────

export async function getToolsForBulkScreenshotsAction(filter: 'no_screenshots' | 'under_max' | 'all' = 'no_screenshots') {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };
  try {
    let query;
    if (filter === 'all') {
      query = sql`
        SELECT t.id, t.name, t.slug, t."websiteUrl", t."screenshotUrls", t."screenshotMeta",
               t."logoUrl", t.status
        FROM "AiTool" t
        WHERE t."deletedAt" IS NULL
          AND t.status = 'APPROVED'
          AND t."websiteUrl" IS NOT NULL
          AND t."websiteUrl" != ''
        ORDER BY
          CASE WHEN array_length(t."screenshotUrls", 1) IS NULL OR array_length(t."screenshotUrls", 1) = 0 THEN 0 ELSE 1 END ASC,
          t.name ASC
      `;
    } else if (filter === 'under_max') {
      query = sql`
        SELECT t.id, t.name, t.slug, t."websiteUrl", t."screenshotUrls", t."screenshotMeta",
               t."logoUrl", t.status
        FROM "AiTool" t
        WHERE t."deletedAt" IS NULL
          AND t.status = 'APPROVED'
          AND t."websiteUrl" IS NOT NULL
          AND t."websiteUrl" != ''
          AND (array_length(t."screenshotUrls", 1) IS NULL OR array_length(t."screenshotUrls", 1) < 5)
        ORDER BY
          CASE WHEN array_length(t."screenshotUrls", 1) IS NULL OR array_length(t."screenshotUrls", 1) = 0 THEN 0 ELSE 1 END ASC,
          t.name ASC
      `;
    } else {
      query = sql`
        SELECT t.id, t.name, t.slug, t."websiteUrl", t."screenshotUrls", t."screenshotMeta",
               t."logoUrl", t.status
        FROM "AiTool" t
        WHERE t."deletedAt" IS NULL
          AND t.status = 'APPROVED'
          AND t."websiteUrl" IS NOT NULL
          AND t."websiteUrl" != ''
          AND (array_length(t."screenshotUrls", 1) IS NULL OR array_length(t."screenshotUrls", 1) = 0)
        ORDER BY t.name ASC
      `;
    }
    const tools = await query;
    return { success: true, tools };
  } catch (error: any) {
    console.error('getToolsForBulkScreenshotsAction error:', error);
    return { success: false, error: error.message };
  }
}
