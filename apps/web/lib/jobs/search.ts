import { VERIFIED_CLAIM_METHODS } from '@/lib/jobs/trust';
import { sql } from '@/lib/db';
import type { JOB_SEARCH_KEYS } from './search-keys';

export { JOB_SEARCH_KEYS, JOBS_PAGE_SIZE } from './search-keys';

export type JobSearchFilters = Partial<Record<(typeof JOB_SEARCH_KEYS)[number], string | null>>;

/** Experience levels for the filter, by a job's minimum years. */
export const LEVEL_RANGE = { entry: [0, 2], mid: [2, 5], senior: [5, 8], lead: [8, 99] } as const;
const LEGACY_LEVEL: Record<string, string> = { '2': 'entry', '5': 'mid', '10': 'senior', '15': 'lead' };

/** Hard cap on one page, whatever the caller asks for. */
export const MAX_JOBS_PER_PAGE = 100;

const OPEN = sql`jl.status = 'OPEN' AND jl."moderationHold" = false AND jl."deletedAt" IS NULL
  AND (jl."expiresAt" IS NULL OR jl."expiresAt" > NOW()) AND jl."showOnJobsPage" = true`;

/** Open jobs for /jobs and its search API: one page of results plus the total that match. */
export async function searchJobs(filters: JobSearchFilters, { limit = 15, offset = 0 }: { limit?: number; offset?: number } = {}) {
  const pageSize = Math.min(Math.max(1, Math.floor(limit) || 15), MAX_JOBS_PER_PAGE);
  const skip = Math.max(0, Math.floor(offset) || 0);
  const { category, workType, experience, country, city, company, visa, sort, q, location, employmentType, datePosted, salaryDisclosed } = filters;

  const filterCategory = category && category !== 'all' ? category : null;
  const filterWorkType = workType && workType !== 'all' ? workType : null;
  const filterCountry = country || null;
  const filterCity = city || null;
  const filterCompany = company || null;
  const filterVisa = visa === 'true';
  // Experience: one or more levels by the job's minimum years (entry <2, mid 2–4, senior 5–7, lead 8+).
  // Older links used a number (2, 5, 10, 15); those map to the matching level.
  const levels = new Set((experience ?? '').split(',').map((v) => LEGACY_LEVEL[v.trim()] ?? v.trim()).filter((v) => v in LEVEL_RANGE));
  const anyLevel = levels.size > 0;
  const searchQuery = q?.trim() ? `%${q.trim().slice(0, 120)}%` : null;
  const locationQuery = location?.trim() ? `%${location.trim().slice(0, 120)}%` : null;
  const filterEmploymentType = employmentType && employmentType !== 'all' ? employmentType : null;
  const parsedDays = datePosted && datePosted !== 'all' ? parseInt(datePosted, 10) : NaN;
  const filterDateDays = Number.isFinite(parsedDays) ? parsedDays : null;
  const filterSalaryDisclosed = salaryDisclosed === 'true';

  const where = sql`
    ${OPEN}
    AND (${filterCategory}::text IS NULL OR jl.category::text = ${filterCategory})
    AND (${filterWorkType}::text IS NULL OR jl."workType"::text = ${filterWorkType})
    AND (${filterCountry}::text IS NULL OR jl.country = ${filterCountry})
    AND (${filterCity}::text IS NULL OR jl.city = ${filterCity})
    AND (${filterCompany}::text IS NULL OR e.slug = ${filterCompany})
    AND (${!filterVisa} OR jl."visaSponsorship" = true)
    AND (${!anyLevel}
      OR (${levels.has('entry')} AND jl."experienceMin" < 2)
      OR (${levels.has('mid')} AND jl."experienceMin" >= 2 AND jl."experienceMin" < 5)
      OR (${levels.has('senior')} AND jl."experienceMin" >= 5 AND jl."experienceMin" < 8)
      OR (${levels.has('lead')} AND jl."experienceMin" >= 8))
    AND (${searchQuery}::text IS NULL OR jl.title ILIKE ${searchQuery} OR e."companyName" ILIKE ${searchQuery} OR jl."shortDescription" ILIKE ${searchQuery} OR EXISTS (SELECT 1 FROM unnest(jl.skills) s WHERE s ILIKE ${searchQuery}))
    AND (${locationQuery}::text IS NULL OR jl.city ILIKE ${locationQuery} OR jl.country ILIKE ${locationQuery} OR jl.location ILIKE ${locationQuery} OR (${locationQuery} ILIKE '%remote%' AND jl."workType" = 'REMOTE'))
    AND (${filterEmploymentType}::text IS NULL OR jl."employmentType"::text = ${filterEmploymentType})
    AND (${filterDateDays}::int IS NULL OR jl."publishedAt" >= NOW() - (${filterDateDays} || ' days')::interval)
    AND (${!filterSalaryDisclosed} OR (jl."showSalary" = true AND (jl."salaryMin" IS NOT NULL OR jl."salaryMax" IS NOT NULL)))
  `;

  const [jobs, countResult] = await Promise.all([
    sql`
      WITH ranked AS (
        SELECT jl.id, jl.slug, jl.title, jl."shortDescription", jl.category,
               jl."workType", jl.location, jl.city, jl.country,
               -- A salary the employer chose not to show never leaves the database: not in the page data, not in the sort.
               CASE WHEN jl."showSalary" THEN jl."salaryMin" END AS "salaryMin",
               CASE WHEN jl."showSalary" THEN jl."salaryMax" END AS "salaryMax",
               jl."salaryCurrency", jl."showSalary",
               jl."experienceMin", jl."experienceMax", jl.skills,
               jl."isFeatured", jl."listingTier", jl."visaSponsorship",
               jl."publishedAt"::text, jl."viewsCount", jl."employmentType", jl.positions,
               jl."applicationType", jl."applicationUrl",
               e."companyName", e.slug AS "companySlug", e."logoUrl",
               -- The verified tick: the same rule as showsVerifiedTick (lib/jobs/trust.ts), with its list of proven claim methods.
               (e."isVerified" OR (e."startupId" IS NOT NULL AND e."startupClaimMethod"::text = ANY(${[...VERIFIED_CLAIM_METHODS]}::text[]))) AS "companyVerified",
               -- Passed our company check but not founder-verified: "Email verified", never the tick.
               (e."companyReview" = 'APPROVED') AS "companyChecked",
               ROW_NUMBER() OVER (
                 PARTITION BY jl."employerId"
                 ORDER BY jl."isFeatured" DESC,
                   ${sort === 'salary' ? sql`(CASE WHEN jl."showSalary" THEN jl."salaryMax" END) DESC NULLS LAST` : sort === 'views' ? sql`jl."viewsCount" DESC` : sql`jl."publishedAt" DESC NULLS LAST`}
               ) AS company_rank
        FROM "JobBoardListing" jl
        JOIN "JobBoardEmployer" e ON e.id = jl."employerId"
        WHERE ${where}
      )
      SELECT id, slug, title, "shortDescription", category,
             "workType", location, city, country,
             "salaryMin", "salaryMax", "salaryCurrency", "showSalary",
             "experienceMin", "experienceMax", skills,
             "isFeatured", "listingTier", "visaSponsorship",
             "publishedAt", "employmentType", positions,
             "applicationType", "applicationUrl",
             "companyName", "companySlug", "logoUrl", "companyVerified", "companyChecked"
      FROM ranked
      ORDER BY ${sort === 'salary'
        // "Highest salary" and "Most viewed" are what they say: a plain sort. (Spreading companies out, below, once
        // put a ₹12L job above a ₹38L one under "Highest salary".)
        ? sql`"salaryMax" DESC NULLS LAST, "publishedAt" DESC NULLS LAST`
        : sort === 'views'
          ? sql`"viewsCount" DESC, "publishedAt" DESC NULLS LAST`
          // The default order: featured first, then each company's newest job before anyone's second, so one
          // company with many roles doesn't fill the first page.
          : sql`"isFeatured" DESC, company_rank, "publishedAt" DESC NULLS LAST`},
        id
      LIMIT ${pageSize} OFFSET ${skip}
    `,
    sql`
      SELECT COUNT(*)::int AS total
      FROM "JobBoardListing" jl
      JOIN "JobBoardEmployer" e ON e.id = jl."employerId"
      WHERE ${where}
    `,
  ]);

  return { jobs: jobs as any[], total: Number((countResult[0] as any)?.total || 0) };
}

/** Open jobs per work mode, for the filter counts (independent of the other filters). */
export async function getJobWorkTypeCounts(): Promise<{ workType: string; count: number }[]> {
  const rows = await sql`
    SELECT jl."workType", COUNT(*)::int as count
    FROM "JobBoardListing" jl
    WHERE ${OPEN}
    GROUP BY jl."workType"
  `;
  return rows as any[];
}

/** Open jobs per role, for the filter counts (independent of the other filters). */
export async function getJobCategoryCounts(): Promise<{ category: string; count: number }[]> {
  const rows = await sql`
    SELECT jl.category::text AS category, COUNT(*)::int AS count
    FROM "JobBoardListing" jl
    WHERE ${OPEN}
    GROUP BY jl.category
  `;
  return rows as any[];
}
