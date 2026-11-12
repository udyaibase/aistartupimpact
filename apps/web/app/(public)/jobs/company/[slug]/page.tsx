import { cache } from 'react';
import { sql } from '@/lib/db';
import { jsonLd } from '@/lib/json-ld';
import { fitTitle, metaSnippet } from '@/lib/seo-text';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { Building2, MapPin, Globe, Briefcase, DollarSign, Clock } from 'lucide-react';
interface PageProps {
  params: Promise<{ slug: string }>;
}


// Cached; refreshed when the company edits its profile or a job changes (lib/revalidate.ts).
export const revalidate = 3600;

// Built on first visit, then cached.
export async function generateStaticParams() {
  return [];
}

// One load for metadata and page (React cache de-duplicates it within a request).
const getCompanyJobs = cache(async (slug: string) => {
  const employers = await sql`
    SELECT id, "companyName", slug, "logoUrl", "websiteUrl", description, industry, "companySize", location
    FROM "JobBoardEmployer"
    WHERE slug = ${slug} AND "isActive" = true
    LIMIT 1
  `;
  if (employers.length === 0) return null;
  const company = employers[0] as any;
  const jobs = await sql`
    SELECT id, slug, title, "shortDescription", category, "workType",
           "salaryMin", "salaryMax", "salaryCurrency", "showSalary",
           "isFeatured", "publishedAt"::text, city, country
    FROM "JobBoardListing"
    WHERE "employerId" = ${company.id} AND status = 'OPEN' AND "moderationHold" = false AND "deletedAt" IS NULL
      AND ("expiresAt" IS NULL OR "expiresAt" > NOW()) AND "showOnProfile" = true
    ORDER BY "isFeatured" DESC, "publishedAt" DESC
  `;
  return { company, jobs: jobs as any[] };
});

const placeOf = (j: any) => (j.workType === 'REMOTE' ? 'Remote' : j.city ? String(j.city).split(',')[0].trim() : '');

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const params = await props.params;
  const data = await getCompanyJobs(params.slug);
  if (!data) return { title: 'Company Not Found' };
  const { company, jobs } = data;
  const name = String(company.companyName).trim();
  const n = jobs.length;
  const title = fitTitle([
    `${name} Jobs ${new Date().getFullYear()}: ${n} Open AI Role${n === 1 ? '' : 's'}`,
    `${name} Jobs: ${n} Open Role${n === 1 ? '' : 's'}`,
    `Jobs at ${name}`,
  ]);
  const roles = jobs.slice(0, 3).map((j) => j.title).join(', ');
  const places = Array.from(new Set(jobs.map(placeOf).filter(Boolean))).slice(0, 3).join(', ');
  const description = metaSnippet(
    n > 0
      ? `${name} is hiring: ${roles}${n > 3 ? ` and ${n - 3} more` : ''}${places ? ` in ${places}` : ''}. ${company.description || ''}`
      : `${name} has no open roles right now. ${company.description || ''} Browse other AI jobs on Udyaibase.`,
  );
  return {
    title,
    description,
    alternates: { canonical: `/jobs/company/${params.slug}` },
    // A company page with no open roles is a dead end in search results.
    robots: n > 0 ? undefined : { index: false, follow: true },
  };
}

export default async function CompanyJobsPage(props: PageProps) {
  const params = await props.params;
  const data = await getCompanyJobs(params.slug);
  if (!data) notFound();
  const { company, jobs } = data;
  const pageUrl = `https://udyaibase.com/jobs/company/${params.slug}`;
  const places = Array.from(new Set(jobs.map(placeOf).filter(Boolean)));
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `Jobs at ${company.companyName}`,
    url: pageUrl,
    about: {
      '@type': 'Organization',
      name: company.companyName,
      ...(company.websiteUrl ? { url: company.websiteUrl } : {}),
      ...(company.logoUrl ? { logo: company.logoUrl } : {}),
      ...(company.description ? { description: company.description } : {}),
    },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: jobs.length,
      itemListElement: jobs.map((j, i) => ({ '@type': 'ListItem', position: i + 1, url: `https://udyaibase.com/jobs/${j.slug}`, name: j.title })),
    },
  };
  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://udyaibase.com' },
      { '@type': 'ListItem', position: 2, name: 'AI Jobs', item: 'https://udyaibase.com/jobs' },
      { '@type': 'ListItem', position: 3, name: company.companyName, item: pageUrl },
    ],
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(schema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumb) }} />
      {/* Company Header */}
      <div className="card p-5 sm:p-6 flex flex-col sm:flex-row items-start gap-4 mb-8">
        <div className="w-16 h-16 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center overflow-hidden shrink-0">
          {company.logoUrl ? (
            <Image src={company.logoUrl} alt={company.companyName} width={64} height={64} sizes="64px" className="w-full h-full object-cover" />
          ) : (
            <Building2 className="w-7 h-7 text-gray-400" />
          )}
        </div>
        <div className="flex-1">
          <h1 className="font-sora font-extrabold text-xl sm:text-2xl text-navy dark:text-white">
            Jobs at {company.companyName}
          </h1>
          {company.description && (
            <p className="text-sm text-gray-500 dark:text-gray-400 font-jakarta mt-1 line-clamp-2">{company.description}</p>
          )}
          <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-gray-400 font-jakarta">
            {company.industry && <span>{company.industry}</span>}
            {company.companySize && <span>• {company.companySize} employees</span>}
            {company.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{company.location}</span>}
            {company.websiteUrl && (
              <a href={company.websiteUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-brand hover:underline">
                <Globe className="w-3 h-3" /> Website
              </a>
            )}
          </div>
        </div>
      </div>

      {/* A written summary, so the page says more than a list of titles. */}
      {jobs.length > 0 && (
        <p className="mb-6 max-w-3xl font-jakarta text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
          {company.companyName} is hiring for {jobs.length} role{jobs.length === 1 ? '' : 's'} on Udyaibase
          {places.length > 0 ? <>, {places.length === 1 ? 'based in' : 'across'} {places.slice(0, 4).join(', ')}</> : null}
          {company.industry ? <>, in {company.industry}</> : null}. Open roles include {jobs.slice(0, 3).map((j) => j.title).join(', ')}
          {jobs.length > 3 ? <> and {jobs.length - 3} more</> : null}. Applications go straight to the {company.companyName} hiring team.
        </p>
      )}

      {/* Job Listings */}
      <h2 className="font-sora font-bold text-base text-navy dark:text-white mb-4">
        {jobs.length} Open Position{jobs.length !== 1 ? 's' : ''}
      </h2>

      {jobs.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-sm text-gray-500 font-jakarta">No open positions at this time.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map((job: any) => (
            <Link key={job.id} href={`/jobs/${job.slug}`} className="card p-4 sm:p-5 flex items-center justify-between hover:border-brand/30 transition-colors group">
              <div>
                <h3 className="font-sora font-bold text-sm text-navy dark:text-white group-hover:text-brand">{job.title}</h3>
                <div className="flex items-center gap-2 text-xs text-gray-400 font-jakarta mt-0.5">
                  <span>{job.category?.replace(/_/g, ' ')}</span>
                  <span>•</span>
                  <span>{job.workType}</span>
                  {job.showSalary && job.salaryMin && (
                    <>
                      <span>•</span>
                      <span>{job.salaryCurrency} {(job.salaryMin / 1000).toFixed(0)}K–{(job.salaryMax / 1000).toFixed(0)}K</span>
                    </>
                  )}
                </div>
              </div>
              <span className="text-brand text-xs font-semibold font-jakarta shrink-0">Apply →</span>
            </Link>
          ))}
        </div>
      )}

      <div className="mt-8 text-center">
        <Link href="/jobs" className="text-sm text-brand font-semibold font-jakarta hover:underline">← Browse All AI Jobs</Link>
      </div>
    </div>
  );
}
