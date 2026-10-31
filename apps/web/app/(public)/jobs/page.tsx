import { jsonLd } from "@/lib/json-ld";
import { sql } from '@/lib/db';
import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { Briefcase, MapPin, Building2, ChevronRight, ExternalLink, Bookmark, Search, Bell } from 'lucide-react';
import JobFilters, { SortDropdown } from '@/components/jobs/JobFilters';
import SubscribeForm from '@/components/SubscribeForm';
import JobListClient from './JobListClient';
import JobSearchBar from '@/components/jobs/JobSearchBar';

export const metadata: Metadata = {
  title: 'AI Jobs in India — Find Your Next Role in Artificial Intelligence',
  description: 'Browse 60+ AI jobs — ML Engineer, LLM Engineer, AI Product Manager, Data Scientist, and more. Remote, hybrid, and on-site roles at top AI companies.',
  alternates: { canonical: '/jobs' },
};
interface PageProps {
  searchParams: Promise<{
    category?: string;
    workType?: string;
    experience?: string;
    country?: string;
    city?: string;
    company?: string;
    visa?: string;
    sort?: string;
    q?: string;
    location?: string;
    employmentType?: string;
    datePosted?: string;
    salaryDisclosed?: string;
  }>;
}

export default async function JobsPage(props: PageProps) {
  const searchParams = await props.searchParams;
  const { category, workType, experience, country, city, company, visa, sort, q, location: locationFilter, employmentType, datePosted, salaryDisclosed } = searchParams;

  let jobs: any[] = [];
  let total = 0;
  let workTypeCounts: { workType: string; count: number }[] = [];

  const filterCategory = category && category !== 'all' ? category : null;
  const filterWorkType = workType && workType !== 'all' ? workType : null;
  const filterCountry = country || null;
  const filterCity = city || null;
  const filterCompany = company || null;
  const filterVisa = visa === 'true';
  const filterExp = experience ? parseInt(experience) : null;
  const searchQuery = q?.trim() ? `%${q.trim()}%` : null;
  const locationQuery = locationFilter?.trim() ? `%${locationFilter.trim()}%` : null;
  const filterEmploymentType = employmentType && employmentType !== 'all' ? employmentType : null;
  const filterDateDays = datePosted && datePosted !== 'all' ? parseInt(datePosted) : null;
  const filterSalaryDisclosed = salaryDisclosed === 'true';

  try {
    const [jobRows, countResult, wtCounts] = await Promise.all([
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
          WHERE jl.status = 'OPEN' AND jl."moderationHold" = false
            AND jl."deletedAt" IS NULL
            AND (jl."expiresAt" IS NULL OR jl."expiresAt" > NOW()) AND jl."showOnJobsPage" = true
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
          ${sort === 'salary' ? sql`"salaryMax" DESC NULLS LAST` : sort === 'views' ? sql`"viewsCount" DESC` : sql`"publishedAt" DESC NULLS LAST`}
      `,
      sql`
        SELECT COUNT(*)::int AS total
        FROM "JobBoardListing" jl
        JOIN "JobBoardEmployer" e ON e.id = jl."employerId"
        WHERE jl.status = 'OPEN' AND jl."moderationHold" = false AND jl."deletedAt" IS NULL
          AND (jl."expiresAt" IS NULL OR jl."expiresAt" > NOW()) AND jl."showOnJobsPage" = true
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
      `,
      sql`
        SELECT jl."workType", COUNT(*)::int as count
        FROM "JobBoardListing" jl
        WHERE jl.status = 'OPEN' AND jl."moderationHold" = false AND jl."deletedAt" IS NULL
          AND (jl."expiresAt" IS NULL OR jl."expiresAt" > NOW()) AND jl."showOnJobsPage" = true
        GROUP BY jl."workType"
      `,
    ]);

    jobs = jobRows as any[];
    total = (countResult[0] as any)?.total || 0;
    workTypeCounts = wtCounts as any[];
  } catch (err) {
    console.error('[Jobs Page] Error:', err);
  }

  const totalAll = workTypeCounts.reduce((s, w) => s + w.count, 0);

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://udyaibase.com' },
      { '@type': 'ListItem', position: 2, name: 'AI Jobs', item: 'https://udyaibase.com/jobs' },
    ],
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbJsonLd) }} />

      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs font-jakarta text-gray-400 dark:text-gray-500 mb-4">
        <Link href="/" className="hover:text-brand transition-colors">Home</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-gray-600 dark:text-gray-300">AI Jobs</span>
      </nav>

      {/* Hero */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="font-sora font-extrabold text-2xl sm:text-3xl text-navy dark:text-white">
            AI Jobs in India
          </h1>
          <p className="text-gray-500 dark:text-gray-400 font-jakarta text-sm mt-1">
            {totalAll > 0 ? `${totalAll}+` : ''} open roles at AI startups, scale-ups and global AI companies. Updated daily.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <a
            href="#job-alert"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm font-semibold font-jakarta text-gray-700 dark:text-gray-300 hover:border-gray-400 transition-colors"
          >
            <Bell className="w-4 h-4" />
            Create job alert
          </a>
          <Link href="/employer/signup" className="text-sm font-semibold font-jakarta text-gray-600 dark:text-gray-400 hover:text-brand transition-colors underline underline-offset-2">
            Hiring? Post a job
          </Link>
          <Link href="/hire/pricing" className="text-sm font-semibold font-jakarta text-gray-600 dark:text-gray-400 hover:text-brand transition-colors underline underline-offset-2">
            Pricing
          </Link>
        </div>
      </div>

      {/* Search bar */}
      <JobSearchBar initialQuery={q} initialLocation={locationFilter} />

      {/* Main layout: sidebar + jobs */}
      <div className="flex flex-col lg:flex-row gap-4 lg:gap-8 mt-6">
        {/* Filters (desktop sidebar + mobile bar/sheet) */}
        <JobFilters
          currentCategory={category}
          currentWorkType={workType}
          currentExperience={experience}
          currentVisa={visa}
          currentSort={sort}
          currentSalaryDisclosed={salaryDisclosed}
          currentDatePosted={datePosted}
          total={total}
          workTypeCounts={workTypeCounts}
        />

        {/* Job listings */}
        <div className="flex-1 min-w-0">

          {/* Count + sort — desktop */}
          <div className="hidden lg:flex items-center justify-between mb-4">
            <p className="font-sora font-bold text-sm text-navy dark:text-white">
              {total > 0 ? `${total}+` : '0'} <span className="font-normal text-gray-500 dark:text-gray-400 font-jakarta">{total === 1 ? 'job' : 'jobs'}</span>
            </p>
            <SortDropdown currentSort={sort} />
          </div>

          {/* Job cards with client-side show more */}
          {jobs.length === 0 ? (
            <div className="card p-10 text-center">
              <Briefcase className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
              <h2 className="font-sora font-bold text-lg text-navy dark:text-white mb-2">No jobs found</h2>
              <p className="text-sm text-gray-500 font-jakarta mb-4">
                Try adjusting your filters or search query.
              </p>
            </div>
          ) : (
            <JobListClient jobs={jobs} total={total} />
          )}

          {/* Job Alert CTA */}
          <div id="job-alert" className="mt-10 rounded-xl bg-gray-900 dark:bg-gray-800 px-6 py-4 sm:px-8 sm:py-5 scroll-mt-24">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="shrink-0">
                <h2 className="font-sora font-bold text-base text-white">
                  Never miss an AI role
                </h2>
                <p className="text-sm text-gray-400 font-jakarta mt-0.5">
                  Get new AI jobs matching your search in your inbox, once a day.
                </p>
              </div>
              <div className="sm:flex-1 sm:max-w-md">
                <SubscribeForm source="jobs-alert" buttonText="Subscribe" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

