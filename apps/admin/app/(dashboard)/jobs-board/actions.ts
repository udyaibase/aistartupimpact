'use server';

import { neon } from '@neondatabase/serverless';
import { requireActionAuth } from '@/lib/api-auth';
import { canDelete, logAuditEvent } from '@/lib/audit-log';
import { revalidatePath } from 'next/cache';
import { refreshPublic } from '@/lib/refresh-public';

const sql = neon(process.env.DATABASE_URL!);

export async function getJobsAction() {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };

  try {
    const jobs = await sql`
      SELECT jl.id, jl.slug, jl.title, jl.category, jl."workType", jl."listingTier",
             (jl.status = 'OPEN') AS "isActive", jl.status::text AS status, jl."moderationHold",
             (jl."expiresAt" IS NOT NULL AND jl."expiresAt" <= NOW()) AS expired, jl."expiresAt"::text AS "expiresAt",
             jl."isFeatured", jl."applicationsCount", jl."viewsCount",
             jl."publishedAt"::text, jl."createdAt"::text,
             e."companyName"
      FROM "JobBoardListing" jl
      JOIN "JobBoardEmployer" e ON e.id = jl."employerId"
      WHERE jl."deletedAt" IS NULL
      ORDER BY jl."createdAt" DESC
      LIMIT 1000
    `;
    return { success: true, data: jobs };
  } catch (error: any) {
    console.error('[Admin Jobs Board]', error);
    return { success: false, error: 'Failed to load jobs' };
  }
}

export async function toggleJobActiveAction(id: string, isActive: boolean) {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };

  try {
    await sql`UPDATE "JobBoardListing" SET "status" = (CASE WHEN ${isActive} THEN 'OPEN' ELSE 'PAUSED' END)::"JobBoardListingStatus", "closedAt" = NULL, "closeReason" = NULL, "isActive" = ${isActive}, "updatedAt" = NOW() WHERE id = ${id}`;
    await refreshPublic(['jobs', 'home']); return { success: true };
  } catch (error: any) {
    console.error('[Admin Jobs Board Toggle]', error);
    return { success: false, error: 'Failed to update' };
  }
}

export async function deleteJobAction(id: string) {
  const { error } = await requireActionAuth(['SUPER_ADMIN']);
  if (error) return { success: false, error };

  try {
    await sql`UPDATE "JobBoardListing" SET "deletedAt" = NOW(), "isActive" = false, "status" = 'CLOSED', "closedAt" = NOW(), "closeReason" = 'MANUAL' WHERE id = ${id}`;
    await refreshPublic(['jobs', 'home']); return { success: true };
  } catch (error: any) {
    console.error('[Admin Jobs Board Delete]', error);
    return { success: false, error: 'Failed to delete' };
  }
}

// ─── Bulk actions ─────────────────────────────────────────────────────────────

export type BulkJobOp = 'open' | 'pause' | 'close' | 'renew' | 'feature' | 'unfeature' | 'delete';
const BULK_OPS: BulkJobOp[] = ['open', 'pause', 'close', 'renew', 'feature', 'unfeature', 'delete'];
const MAX_BULK = 500;

/**
 * One operation on many listings. Same status rules as the website (lib/jobs/listing-status.ts): OPEN ⇔ isActive,
 * a job under moderation review stays hidden, and the first publish date is never moved. Opening or renewing an
 * expired job gives it 30 more days, so it doesn't end up "open" but invisible. Delete is Super Admin only.
 */
export async function bulkJobAction(ids: string[], op: BulkJobOp) {
  if (!BULK_OPS.includes(op)) return { success: false as const, error: 'Unknown action.' };
  const { error } = await requireActionAuth(op === 'delete' ? ['SUPER_ADMIN'] : undefined);
  if (error) return { success: false as const, error };
  if (op === 'delete') {
    const { allowed, error: deleteError } = await canDelete();
    if (!allowed) return { success: false as const, error: deleteError || 'Only Super Admins can delete job listings.' };
  }
  const list = [...new Set((Array.isArray(ids) ? ids : []).filter((x) => typeof x === 'string' && x.length <= 64))];
  if (!list.length) return { success: false as const, error: 'Select at least one job.' };
  if (list.length > MAX_BULK) return { success: false as const, error: `Select up to ${MAX_BULK} jobs at a time.` };

  try {
    let rows: { id: string }[] = [];
    switch (op) {
      case 'open':
        rows = await sql`
          UPDATE "JobBoardListing" SET status = 'OPEN', "isActive" = NOT "moderationHold", "closedAt" = NULL, "closeReason" = NULL,
            "publishedAt" = COALESCE("publishedAt", NOW()),
            "expiresAt" = CASE WHEN "expiresAt" IS NOT NULL AND "expiresAt" <= NOW() THEN NOW() + INTERVAL '30 days' ELSE "expiresAt" END,
            "updatedAt" = NOW()
          WHERE id = ANY(${list}::text[]) AND "deletedAt" IS NULL RETURNING id` as { id: string }[];
        break;
      case 'pause':
        rows = await sql`
          UPDATE "JobBoardListing" SET status = 'PAUSED', "isActive" = false, "closedAt" = NULL, "closeReason" = NULL, "updatedAt" = NOW()
          WHERE id = ANY(${list}::text[]) AND "deletedAt" IS NULL AND status <> 'PAUSED' RETURNING id` as { id: string }[];
        break;
      case 'close':
        rows = await sql`
          UPDATE "JobBoardListing" SET status = 'CLOSED', "isActive" = false, "closedAt" = NOW(), "closeReason" = 'MANUAL', "updatedAt" = NOW()
          WHERE id = ANY(${list}::text[]) AND "deletedAt" IS NULL AND status <> 'CLOSED' RETURNING id` as { id: string }[];
        break;
      case 'renew':
        // +30 days from today or from the current closing date, whichever is later; jobs closed only because they
        // expired go live again.
        rows = await sql`
          UPDATE "JobBoardListing" SET
            "expiresAt" = GREATEST(NOW(), COALESCE("expiresAt", NOW())) + INTERVAL '30 days',
            status = CASE WHEN status = 'CLOSED' AND "closeReason" = 'EXPIRED' THEN 'OPEN'::"JobBoardListingStatus" ELSE status END,
            "isActive" = CASE WHEN status = 'OPEN' OR (status = 'CLOSED' AND "closeReason" = 'EXPIRED') THEN NOT "moderationHold" ELSE false END,
            "closedAt" = CASE WHEN status = 'CLOSED' AND "closeReason" = 'EXPIRED' THEN NULL ELSE "closedAt" END,
            "closeReason" = CASE WHEN status = 'CLOSED' AND "closeReason" = 'EXPIRED' THEN NULL ELSE "closeReason" END,
            "updatedAt" = NOW()
          WHERE id = ANY(${list}::text[]) AND "deletedAt" IS NULL RETURNING id` as { id: string }[];
        break;
      case 'feature':
        rows = await sql`
          UPDATE "JobBoardListing" SET "isFeatured" = true,
            "featuredUntil" = COALESCE(GREATEST("expiresAt", NOW() + INTERVAL '1 day'), NOW() + INTERVAL '30 days'), "updatedAt" = NOW()
          WHERE id = ANY(${list}::text[]) AND "deletedAt" IS NULL RETURNING id` as { id: string }[];
        break;
      case 'unfeature':
        rows = await sql`
          UPDATE "JobBoardListing" SET "isFeatured" = false, "featuredUntil" = NULL, "updatedAt" = NOW()
          WHERE id = ANY(${list}::text[]) AND "deletedAt" IS NULL AND "isFeatured" = true RETURNING id` as { id: string }[];
        break;
      case 'delete':
        rows = await sql`
          UPDATE "JobBoardListing" SET "deletedAt" = NOW(), "isActive" = false, status = 'CLOSED', "closedAt" = NOW(), "closeReason" = 'MANUAL', "updatedAt" = NOW()
          WHERE id = ANY(${list}::text[]) AND "deletedAt" IS NULL RETURNING id` as { id: string }[];
        break;
    }
    await logAuditEvent({
      action: op === 'delete' ? 'DELETE' : 'UPDATE', resourceType: 'JOB_LISTING', resourceName: `Bulk ${op}`,
      after: { bulkAction: op, requested: list.length, changed: rows.length, ids: rows.map((r) => r.id).slice(0, 100) },
    });
    revalidatePath('/jobs-board');
    if (rows.length) await refreshPublic(['jobs', 'home']);
    return { success: true as const, changed: rows.length, skipped: list.length - rows.length };
  } catch (err: any) {
    console.error('[Admin Jobs Board Bulk]', op, err?.message);
    return { success: false as const, error: 'Couldn’t apply that to the selected jobs. Try again.' };
  }
}

// ─── Job CRUD Actions ─────────────────────────────────────────────────────────

export async function getJobByIdAction(id: string) {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };

  try {
    const rows = await sql`
      SELECT jl.*, e."companyName", e."startupId",
             s.name AS "startupName", s.slug AS "startupSlug", s."logoUrl" AS "startupLogoUrl",
             s."websiteUrl" AS "startupWebsiteUrl"
      FROM "JobBoardListing" jl
      JOIN "JobBoardEmployer" e ON e.id = jl."employerId"
      LEFT JOIN "Startup" s ON s.id = e."startupId"
      WHERE jl.id = ${id} AND jl."deletedAt" IS NULL
      LIMIT 1
    `;
    if (rows.length === 0) return { success: false, error: 'Job not found' };
    return { success: true, job: rows[0] };
  } catch (err: any) {
    console.error('[getJobByIdAction]', err);
    return { success: false, error: err.message };
  }
}

export async function getStartupByIdForSelectAction(id: string) {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };
  try {
    const rows = await sql`
      SELECT id, name, slug, "logoUrl", "websiteUrl", "headquartersCity"
      FROM "Startup" WHERE id = ${id} AND "deletedAt" IS NULL LIMIT 1
    `;
    if (rows.length === 0) return { success: false, error: 'Not found' };
    return { success: true, startup: rows[0] };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function getStartupsForSelectAction(search: string) {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };

  try {
    if (!search || search.length < 2) return { success: true, startups: [] };
    const startups = await sql`
      SELECT id, name, slug, "logoUrl", "websiteUrl", "headquartersCity"
      FROM "Startup"
      WHERE "deletedAt" IS NULL AND "isApproved" = true
        AND LOWER(name) LIKE ${'%' + search.toLowerCase() + '%'}
      ORDER BY name ASC
      LIMIT 20
    `;
    return { success: true, startups };
  } catch (err: any) {
    console.error('[getStartupsForSelectAction]', err);
    return { success: false, error: err.message };
  }
}

async function getOrCreateEmployerForStartup(startupId: string): Promise<string> {
  const existing = await sql`
    SELECT id FROM "JobBoardEmployer"
    WHERE "startupId" = ${startupId} AND "deletedAt" IS NULL
    LIMIT 1
  `;
  if (existing.length > 0) return existing[0].id;

  const startups = await sql`
    SELECT id, name, slug, "logoUrl", "websiteUrl", "headquartersCity"
    FROM "Startup" WHERE id = ${startupId} LIMIT 1
  `;
  if (startups.length === 0) throw new Error('Startup not found');

  const s = startups[0] as any;
  const placeholderEmail = `jobs+${s.slug}@udyaibase.com`;

  const result = await sql`
    INSERT INTO "JobBoardEmployer" (
      id, "companyName", slug, email, "passwordHash", "logoUrl", "websiteUrl",
      location, "startupId", "startupClaimMethod", "startupClaimVerifiedAt", "maxActiveJobs", "isVerified", "emailVerified",
      "onboardingCompleted", "onboardingStep", "createdAt", "updatedAt"
    ) VALUES (
      gen_random_uuid()::text, ${s.name}, ${s.slug}, ${placeholderEmail}, '',
      ${s.logoUrl || null}, ${s.websiteUrl || null}, ${s.headquartersCity || null},
      ${startupId}, 'ADMIN'::"JobBoardClaimMethod", NOW(), 999, true, true, true, 3, NOW(), NOW()
    )
    ON CONFLICT (slug) DO UPDATE SET "updatedAt" = NOW()
    RETURNING id
  `;
  return result[0].id;
}

function generateJobSlug(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
  return `${base}-${Date.now().toString(36)}`;
}

export interface JobFormData {
  title: string;
  description: string;
  shortDescription?: string;
  category: string;
  department?: string;
  workType: string;
  employmentType?: string;
  location?: string;
  city?: string;
  country?: string;
  visaSponsorship?: boolean;
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string;
  salaryPeriod?: string;
  showSalary?: boolean;
  experienceMin?: number | null;
  experienceMax?: number | null;
  skills?: string[];
  applicationType?: string;
  applicationUrl?: string;
  applicationEmail?: string;
  listingTier?: string;
  isFeatured?: boolean;
  isActive?: boolean;
  startupId: string;
}

export async function checkDuplicateJobAction(title: string, startupId: string) {
  const { error } = await requireActionAuth();
  if (error) return { isDuplicate: false };

  if (!title?.trim() || !startupId?.trim()) return { isDuplicate: false };

  try {
    const normalizedTitle = title.trim().toLowerCase();
    const existing = await sql`
      SELECT id, title, (status = 'OPEN') AS "isActive", "createdAt"::text
      FROM "JobBoardListing"
      WHERE "startupId" = ${startupId}
        AND "deletedAt" IS NULL
        AND LOWER(TRIM(title)) = ${normalizedTitle}
      LIMIT 1
    `;
    if (existing.length > 0) {
      return { isDuplicate: true, existingJob: existing[0] };
    }
    return { isDuplicate: false };
  } catch {
    return { isDuplicate: false };
  }
}

export async function createJobAction(data: JobFormData) {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };

  try {
    if (!data.title?.trim()) return { success: false, error: 'Title is required' };
    if (!data.description?.trim()) return { success: false, error: 'Description is required' };
    if (!data.startupId) return { success: false, error: 'Startup is required' };

    const employerId = await getOrCreateEmployerForStartup(data.startupId);
    const slug = generateJobSlug(data.title);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    const result = await sql`
      INSERT INTO "JobBoardListing" (
        id, slug, title, description, "shortDescription",
        category, department, "workType", "employmentType", location, city, country,
        "visaSponsorship", "salaryMin", "salaryMax", "salaryCurrency", "salaryPeriod", "showSalary",
        "experienceMin", "experienceMax", skills,
        "applicationType", "applicationUrl", "applicationEmail",
        "listingTier", "isFeatured", "isActive", "status",
        "employerId", "startupId", "expiresAt", "publishedAt",
        "createdAt", "updatedAt"
      ) VALUES (
        gen_random_uuid()::text, ${slug}, ${data.title.trim()}, ${data.description.trim()},
        ${data.shortDescription?.trim() || null},
        ${data.category || 'OTHER'}::"JobBoardCategory",
        ${data.department || null},
        ${data.workType || 'REMOTE'}::"JobBoardWorkType",
        ${data.employmentType || 'FULL_TIME'}::"JobBoardEmploymentType",
        ${data.location || null}, ${data.city || null}, ${data.country || null},
        ${data.visaSponsorship ?? false},
        ${data.salaryMin || null}, ${data.salaryMax || null},
        ${data.salaryCurrency || 'INR'}, ${data.salaryPeriod || 'yearly'},
        ${data.showSalary ?? true},
        ${data.experienceMin || null}, ${data.experienceMax || null},
        ${data.skills || []},
        ${data.applicationType || 'EXTERNAL'}::"JobBoardApplyType",
        ${data.applicationUrl || null}, ${data.applicationEmail || null},
        ${data.listingTier || 'FREE'}::"JobBoardTier",
        ${data.isFeatured ?? false}, ${data.isActive ?? false},
        (CASE WHEN ${data.isActive ?? false} THEN 'OPEN' ELSE 'DRAFT' END)::"JobBoardListingStatus",
        ${employerId}, ${data.startupId},
        ${expiresAt.toISOString()}::timestamp,
        ${data.isActive ? new Date().toISOString() : null}::timestamp,
        NOW(), NOW()
      )
      RETURNING id, slug
    `;

    revalidatePath('/jobs-board');

    await logAuditEvent({
      action: 'CREATE',
      resourceType: 'AI_TOOL',
      resourceId: result[0].id,
      after: { type: 'JOB_LISTING', title: data.title, startupId: data.startupId },
    });

    await refreshPublic(['jobs', 'home']); return { success: true, id: result[0].id, slug: result[0].slug };
  } catch (err: any) {
    console.error('[createJobAction]', err);
    return { success: false, error: err.message || 'Failed to create job' };
  }
}

export async function updateJobAction(id: string, data: Partial<JobFormData>) {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };

  try {
    if (data.startupId) {
      await getOrCreateEmployerForStartup(data.startupId);
    }

    await sql`
      UPDATE "JobBoardListing"
      SET
        title = COALESCE(${data.title || null}, title),
        description = COALESCE(${data.description || null}, description),
        "shortDescription" = ${data.shortDescription ?? null},
        category = COALESCE(${data.category || null}, category)::"JobBoardCategory",
        department = ${data.department || null},
        "workType" = COALESCE(${data.workType || null}, "workType")::"JobBoardWorkType",
        "employmentType" = COALESCE(${data.employmentType || null}, "employmentType")::"JobBoardEmploymentType",
        location = ${data.location || null},
        city = ${data.city || null},
        country = ${data.country || null},
        "visaSponsorship" = ${data.visaSponsorship ?? false},
        "salaryMin" = ${data.salaryMin || null},
        "salaryMax" = ${data.salaryMax || null},
        "salaryCurrency" = ${data.salaryCurrency || 'INR'},
        "salaryPeriod" = ${data.salaryPeriod || 'yearly'},
        "showSalary" = ${data.showSalary ?? true},
        "experienceMin" = ${data.experienceMin || null},
        "experienceMax" = ${data.experienceMax || null},
        skills = ${data.skills || []},
        "applicationType" = COALESCE(${data.applicationType || null}, "applicationType")::"JobBoardApplyType",
        "applicationUrl" = ${data.applicationUrl || null},
        "applicationEmail" = ${data.applicationEmail || null},
        "listingTier" = COALESCE(${data.listingTier || null}, "listingTier")::"JobBoardTier",
        "isFeatured" = ${data.isFeatured ?? false},
        "isActive" = ${data.isActive ?? false},
        "status" = (CASE WHEN ${data.isActive ?? false} THEN 'OPEN' WHEN "status" = 'OPEN' THEN 'PAUSED' ELSE "status" END)::"JobBoardListingStatus",
        "publishedAt" = COALESCE("publishedAt", CASE WHEN ${data.isActive ?? false} THEN NOW() END),
        "updatedAt" = NOW()
      WHERE id = ${id}
    `;

    revalidatePath('/jobs-board');

    await logAuditEvent({
      action: 'UPDATE',
      resourceType: 'AI_TOOL',
      resourceId: id,
      after: { type: 'JOB_LISTING', title: data.title },
    });

    await refreshPublic(['jobs', 'home']); return { success: true };
  } catch (err: any) {
    console.error('[updateJobAction]', err);
    return { success: false, error: err.message || 'Failed to update job' };
  }
}

export async function getStartupJobsAction(startupId: string) {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };

  try {
    const jobs = await sql`
      SELECT jl.id, jl.slug, jl.title, jl.category, jl."workType",
             (jl.status = 'OPEN') AS "isActive", jl."isFeatured", jl."applicationsCount",
             jl."viewsCount", jl."createdAt"::text, jl."listingTier",
             e."companyName"
      FROM "JobBoardListing" jl
      JOIN "JobBoardEmployer" e ON e.id = jl."employerId"
      WHERE jl."startupId" = ${startupId} AND jl."deletedAt" IS NULL
      ORDER BY jl."createdAt" DESC
    `;
    return { success: true, jobs };
  } catch (err: any) {
    console.error('[getStartupJobsAction]', err);
    return { success: false, error: err.message };
  }
}
