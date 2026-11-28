'use server';

import { decideToolReview } from '@/lib/tool-review';
import { neon } from '@neondatabase/serverless';
import { revalidatePath } from 'next/cache';
import { logAuditEvent, canDelete } from '@/lib/audit-log';
import { invalidateToolCache } from '@/lib/cache-invalidate';
import { toolApprovalHtml } from '@udyaibase/utils';
import { sendEmailFireAndForget } from '@/lib/email-send';
import { requireActionAuth } from '@/lib/api-auth';
import { refreshPublic } from '@/lib/refresh-public';
import { rejectTool } from '@/lib/tool-rejection';
import { notifyFounder } from '@/lib/founder-notify';
import { publicError } from '@/lib/public-error';

const sql = neon(process.env.DATABASE_URL!);

export async function getToolsAction() {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };
  try {
    const tools = await sql`
      SELECT
        t.id, t.name, t.slug, t."slugChangedAt", t."previousSlugs", t.tagline, t.description, t."websiteUrl", t."logoUrl",
        t."pricingModel", t."avgRating", t."listingTier", t.status, t."claimStatus", t."contentReviewed",
        t."founderNames", t."headquartersCountry", t."headquartersCity", t."hasApi", t."hasMobileApp",
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
  const { error, session } = await requireActionAuth();
  if (error) return { success: false, error };
  try {
    const result = await decideToolReview(id, { action: 'approve' }, { email: session?.user?.email, role: session?.user?.role });
    if (!result.success) return result;
    revalidatePath('/tools-dir');
    await refreshPublic(['tools', 'home']); return { success: true };
  } catch (error: any) {
    console.error('approveToolAction error:', error?.message);
    return { success: false, error: publicError(error) };
  }
}

export async function rejectToolAction(id: string, reason: string) {
  const { error, session } = await requireActionAuth();
  if (error) return { success: false, error };
  if (!reason?.trim()) return { success: false, error: 'Add a reason for the founder.' };
  try {
    const res = await rejectTool(id, reason.trim(), session?.user?.email, session?.user?.role);
    if (res.error) return { success: false, error: res.error };
    revalidatePath('/tools-dir');
    await refreshPublic(['tools', 'home']); return { success: true };
  } catch (error: any) {
    return { success: false, error: publicError(error) };
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
    return { success: false, error: publicError(error) || 'Failed to delete tool' };
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
    return { success: false, error: publicError(error) };
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
    return { success: false, error: publicError(error) };
  }
}


// ─── Tool Alternatives ───────────────────────────────────────────────────────

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
    return { success: false, error: publicError(error) };
  }
}


// ─── Screenshot Operations ─────────────────────────────────────────────────
