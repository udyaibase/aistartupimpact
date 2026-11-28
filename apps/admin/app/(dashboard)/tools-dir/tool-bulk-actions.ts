'use server';

import { decideToolReview } from '@/lib/tool-review';
import { neon } from '@neondatabase/serverless';
import { revalidatePath } from 'next/cache';
import { logAuditEvent, canDelete } from '@/lib/audit-log';
import { invalidateToolCache } from '@/lib/cache-invalidate';
import { requireActionAuth } from '@/lib/api-auth';
import { refreshPublic } from '@/lib/refresh-public';
import { publicError } from '@/lib/public-error';

const sql = neon(process.env.DATABASE_URL!);

export async function bulkApproveToolsAction(ids: string[]) {
  const { error, session } = await requireActionAuth();
  if (error) return { success: false, error };
  try {
    if (ids.length === 0) return { success: false, error: 'No tools selected' };
    // One by one through the same decision as a single approval, so every founder is told and every approval is logged.
    let count = 0;
    for (const id of ids.slice(0, 200)) {
      const result = await decideToolReview(id, { action: 'approve' }, { email: session?.user?.email, role: session?.user?.role });
      if (result.success) count++;
    }
    revalidatePath('/tools-dir');
    await refreshPublic(['tools', 'home']); return { success: true, count };
  } catch (error: any) {
    return { success: false, error: publicError(error) };
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
    return { success: false, error: publicError(error) };
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
    return { success: false, error: publicError(error) };
  }
}

// ─── Sprint 4.2: Duplicate Detection ────────────────────────────────────────

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
    return { success: false, error: publicError(error) };
  }
}
