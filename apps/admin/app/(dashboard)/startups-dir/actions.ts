'use server';

import { neon } from '@neondatabase/serverless';
import { revalidatePath } from 'next/cache';
import { logAuditEvent, canDelete } from '@/lib/audit-log';
import { requireActionAuth } from '@/lib/api-auth';
import { refreshPublic } from '@/lib/refresh-public';
import { publicError } from '@/lib/public-error';
import { decideStartupReview } from '@/lib/startup-review';

const sql = neon(process.env.DATABASE_URL!);

export async function getStartupsAction() {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };
  try {
    // Pending first; among those, domain-verified startups are reviewed first (the founder portal says so).
    const startups = await sql`
      SELECT 
        id, name, slug, "slugChangedAt", "previousSlugs", tagline, description, "logoUrl", "websiteUrl", "linkedinUrl", "twitterUrl",
        "foundedYear", "headquartersCity", stage, status, "totalFundingInr", "employeeCount",
        "isFeatured", "featuredUntil", "impactScore", "isApproved", "approvedAt",
        "isVerified", "claimStatus", "contentReviewed",
        "ownerId", category, "businessType", founders, "foundersData", "createdAt", "updatedAt"
      FROM "Startup"
      WHERE "deletedAt" IS NULL
      ORDER BY "isApproved" ASC, "isVerified" DESC, "isFeatured" DESC, "createdAt" DESC
    `;
    return startups;
  } catch (error) {
    console.error('Error fetching startups:', error);
    return [];
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
    return { success: false, error: publicError(error) };
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
  const { error, session } = await requireActionAuth();
  if (error) return { success: false, error };
  try {
    const result = await decideStartupReview(id, { action: 'approve' }, { email: session?.user?.email, role: session?.user?.role });
    if (!result.success) return result;
    revalidatePath('/startups-dir');
    await refreshPublic(['startups', 'funding', 'india-ai', 'home']);
    return { success: true };
  } catch (error: any) {
    console.error('Error approving startup:', error?.message);
    return { success: false, error: publicError(error) || 'Failed to approve startup' };
  }
}

/** Take a live startup off the site, telling the founder why. It can be approved again later. */
export async function takeDownStartupAction(id: string, reasonCode: string, note: string) {
  const { error, session } = await requireActionAuth(['SUPER_ADMIN', 'EDITOR_IN_CHIEF']);
  if (error) return { success: false, error };
  try {
    const result = await decideStartupReview(id, { action: 'take_down', reasonCode, note }, { email: session?.user?.email, role: session?.user?.role });
    if (!result.success) return result;
    revalidatePath('/startups-dir');
    await refreshPublic(['startups', 'funding', 'india-ai', 'home']);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: publicError(error) || "Couldn't take the startup down. Try again." };
  }
}


// ─── Bulk Actions ────────────────────────────────────────────────────────────

export async function bulkApproveStartupsAction(ids: string[]) {
  const { error, session } = await requireActionAuth();
  if (error) return { success: false, error };
  try {
    if (ids.length === 0) return { success: false, error: 'No startups selected' };
    // One by one through the same decision as a single approval, so every founder is told and every approval is logged.
    let count = 0;
    for (const id of ids.slice(0, 200)) {
      const result = await decideStartupReview(id, { action: 'approve' }, { email: session?.user?.email, role: session?.user?.role });
      if (result.success) count++;
    }
    revalidatePath('/startups-dir');
    await refreshPublic(['startups', 'funding', 'india-ai', 'home']); return { success: true, count };
  } catch (error: any) {
    return { success: false, error: publicError(error) };
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
    return { success: false, error: publicError(error) };
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
    return { success: false, error: publicError(error) };
  }
}

// ─── Duplicate Detection ─────────────────────────────────────────────────────
