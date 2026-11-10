import { sql } from '@/lib/db';
import type { JOB_SEARCH_KEYS } from './search-keys';

export { JOB_SEARCH_KEYS, JOBS_PAGE_SIZE } from './search-keys';

export type JobSearchFilters = Partial<Record<(typeof JOB_SEARCH_KEYS)[number], string | null>>;

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
  const parsedExp = experience ? parseInt(experience, 10) : NaN;
  const filterExp = Number.isFinite(parsedExp) ? parsedExp : null;
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
    AND (${filterExp}::int IS NULL OR jl."experienceMin" IS NULL OR jl."experienceMin" <= ${filterExp})
    AND (${searchQuery}::text IS NULL OR jl.title ILIKE ${searchQuery} OR e."companyName" ILIKE ${searchQuery} OR jl."shortDescription" ILIKE ${searchQuery} OR EXISTS (SELECT 1 FROM unnest(jl.skills) s WHERE s ILIKE ${searchQuery}))
    AND (${locationQuery}::text IS NULL OR jl.city ILIKE ${locationQuery} OR jl.country ILIKE ${locationQuery} OR jl.location ILIKE ${locationQuery} OR (${locationQuery} ILIKE '%remote%' AND jl."workType" = 'REMOTE'))
    AND (${filterEmploymentType}::text IS NULL OR jl."employmentType"::text = ${filterEmploymentType})
    AND (${filterDateDays}::int IS NULL OR jl."publishedAt" >= NOW() - (${filterDateDays} || ' days')::interval)
    AND (${!filterSalaryDisclosed} OR jl."showSalary" = true)
  `;

  const [jobs, countResult] = await Promise.all([
    sql`
      WITH ranked AS (
        SELECT jl.id, jl.slug, jl.title, jl."shortDescription", jl.category,
               jl."workType", jl.location, jl.city, jl.country,
               jl."salaryMin", jl."salaryMax", jl."salaryCurrency", jl."showSalary",
               jl."experienceMin", jl."experienceMax", jl.skills,
               jl."isFeatured", jl."listingTier", jl."visaSponsorship",
               jl."publishedAt"::text, jl."viewsCount", jl."employmentType",
               e."companyName", e.slug AS "companySlug", e."logoUrl",
               ROW_NUMBER() OVER (
                 PARTITION BY jl."employerId"
                 ORDER BY jl."isFeatured" DESC,
                   ${sort === 'salary' ? sql`jl."salaryMax" DESC NULLS LAST` : sort === 'views' ? sql`jl."viewsCount" DESC` : sql`jl."publishedAt" DESC NULLS LAST`}
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
             "publishedAt", "viewsCount", "employmentType",
             "companyName", "companySlug", "logoUrl"
      FROM ranked
      ORDER BY "isFeatured" DESC, company_rank,
        ${sort === 'salary' ? sql`"salaryMax" DESC NULLS LAST` : sort === 'views' ? sql`"viewsCount" DESC` : sql`"publishedAt" DESC NULLS LAST`},
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
