import { jsonLd } from "@/lib/json-ld";
import { sql } from '@/lib/db';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { MapPin, DollarSign, Clock, Building2, ExternalLink, Briefcase, Users, CheckCircle2, ChevronRight } from 'lucide-react';
import JobActions from '@/components/jobs/JobActions';
import JobDescription from '@/components/jobs/JobDescription';
import TrackView from '@/components/TrackView';
import SubscribeForm from '@/components/SubscribeForm';
import ReportJobButton from '@/components/jobs/ReportJobButton';
import { isClaimVerified } from '@/lib/jobs/trust';
import { jobPostingSalary } from '@/lib/jobs/public';

function listingIsOpen(job: { status?: string; expiresAt?: string | null; moderationHold?: boolean }): boolean {
  if (job.status && job.status !== 'OPEN') return false;
  if (job.moderationHold) return false;
  return !job.expiresAt || new Date(job.expiresAt + 'Z').getTime() > Date.now();
}

function formatSalaryRange(min: number, max: number | null, currency: string | null): string {
  if ((currency || 'INR') === 'INR') {
    const l = (n: number) => (n / 100000).toLocaleString('en-IN', { maximumFractionDigits: 1 });
    return max && max !== min ? `₹${l(min)}–${l(max)} L` : `₹${l(min)} L`;
  }
  const sym = currency === 'USD' ? '$' : `${currency} `;
  const k = (n: number) => `${Math.round(n / 1000)}K`;
  return max && max !== min ? `${sym}${k(min)}–${k(max)}` : `${sym}${k(min)}`;
}
interface PageProps {
  params: Promise<{ slug: string }>;
}

// Cached; refreshed when the employer publishes, edits, pauses or closes the job (lib/revalidate.ts).
// Views are counted in the browser by <TrackView> (/api/track), never during render.
export const revalidate = 3600;

// Pages are built on first visit and then cached (no list at build time); refreshed when content changes.
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const params = await props.params;
  const jobs = await sql`
    SELECT jl.title, jl."shortDescription", jl.status, jl."moderationHold", jl."expiresAt"::text AS "expiresAt", e."companyName"
    FROM "JobBoardListing" jl
    JOIN "JobBoardEmployer" e ON e.id = jl."employerId"
    WHERE jl.slug = ${params.slug} AND jl."deletedAt" IS NULL
    LIMIT 1
  `;
  if (jobs.length === 0 || (jobs[0] as any).status === 'DRAFT') return { title: 'Job Not Found' };
  const job = jobs[0] as any;
  return {
    ...(listingIsOpen(job) ? {} : { robots: { index: false, follow: true } }),
    title: `${job.title} at ${job.companyName} — AI Jobs`,
    description: job.shortDescription || `${job.title} position at ${job.companyName}. Apply now on Udyaibase.`,
    alternates: { canonical: `/jobs/${params.slug}` },
  };
}

export default async function JobDetailPage(props: PageProps) {
  const params = await props.params;
  const jobs = await sql`
    SELECT jl.*, e."companyName", e.slug AS "companySlug", e."logoUrl",
           e."websiteUrl", e.description AS "companyDescription",
           e."companySize", e.industry, e."linkedinUrl", e."startupId", e."isVerified", e."startupClaimMethod"
    FROM "JobBoardListing" jl
    JOIN "JobBoardEmployer" e ON e.id = jl."employerId"
    WHERE jl.slug = ${params.slug} AND jl."deletedAt" IS NULL
    LIMIT 1
  `;

  if (jobs.length === 0) notFound();
  const job = jobs[0] as any;
  // Drafts were never public; they must not leak through a guessed slug.
  if (job.status === 'DRAFT') notFound();
  const isOpen = listingIsOpen(job);
  // Only domain-verified (or admin-managed) companies get the Verified label and Google job markup.
  const companyVerified = job.isVerified || isClaimVerified(job);

  // Get other jobs from same employer
  let otherJobs: any[] = [];
  let relatedJobs: any[] = [];
  try {
    const [otherRows, relatedRows] = await Promise.all([
      sql`
        SELECT id, slug, title, "workType", category
        FROM "JobBoardListing"
        WHERE "employerId" = ${job.employerId} AND id != ${job.id}
          AND status = 'OPEN' AND "moderationHold" = false AND "deletedAt" IS NULL
          AND ("expiresAt" IS NULL OR "expiresAt" > NOW())
        ORDER BY "publishedAt" DESC
        LIMIT 5
      `,
      sql`
        SELECT jl.id, jl.slug, jl.title, jl."workType", jl.category,
               jl.city, jl.country, jl."salaryMin", jl."salaryMax",
               jl."salaryCurrency", jl."showSalary", jl."publishedAt"::text,
               e."companyName", e."logoUrl"
        FROM "JobBoardListing" jl
        JOIN "JobBoardEmployer" e ON e.id = jl."employerId"
        WHERE jl.id != ${job.id}
          AND jl."employerId" != ${job.employerId}
          AND jl.status = 'OPEN' AND jl."moderationHold" = false AND jl."deletedAt" IS NULL
          AND (jl."expiresAt" IS NULL OR jl."expiresAt" > NOW()) AND jl."showOnJobsPage" = true
          AND jl.category = ${job.category}
        ORDER BY jl."isFeatured" DESC, jl."publishedAt" DESC NULLS LAST
        LIMIT 6
      `,
    ]);
    otherJobs = otherRows as any[];
    relatedJobs = relatedRows as any[];
  } catch {}

  const applyUrl = job.applicationType === 'EXTERNAL'
    ? (job.applicationUrl || `mailto:${job.applicationEmail}`)
    : `/jobs/${job.slug}/apply`;

  const jobUrl = `https://udyaibase.com/jobs/${job.slug}`;
  const jobSchema: Record<string, any> = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    "title": job.title,
    "description": job.description || job.shortDescription || '',
    "url": jobUrl,
    "hiringOrganization": {
      "@type": "Organization",
      "name": job.companyName,
      ...(job.logoUrl ? { "logo": job.logoUrl } : {}),
      ...(job.websiteUrl ? { "sameAs": job.websiteUrl } : {}),
    },
  };

  if (job.publishedAt) {
    jobSchema.datePosted = new Date(job.publishedAt + 'Z').toISOString().split('T')[0];
  }
  if (job.expiresAt) {
    jobSchema.validThrough = new Date(job.expiresAt + 'Z').toISOString();
  }

  if (job.workType === 'REMOTE') {
    jobSchema.jobLocationType = "TELECOMMUTE";
  } else if (job.city || job.country) {
    jobSchema.jobLocation = {
      "@type": "Place",
      "address": {
        "@type": "PostalAddress",
        ...(job.city ? { "addressLocality": job.city } : {}),
        ...(job.country ? { "addressCountry": job.country } : {}),
      },
    };
  }

  if (job.showSalary) {
    const salary = jobPostingSalary(job);
    if (salary) jobSchema.baseSalary = salary;
  }

  if (job.skills?.length > 0) {
    jobSchema.skills = job.skills.join(', ');
  }
  if (job.category) {
    jobSchema.occupationalCategory = job.category.replace(/_/g, ' ');
  }
  if (job.experienceMin != null) {
    jobSchema.experienceRequirements = `${job.experienceMin}-${job.experienceMax || '10+'} years`;
  }
  if (job.industry) {
    jobSchema.industry = job.industry;
  }

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://udyaibase.com' },
      { '@type': 'ListItem', position: 2, name: 'AI Jobs', item: 'https://udyaibase.com/jobs' },
      { '@type': 'ListItem', position: 3, name: job.title, item: jobUrl },
    ],
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      <TrackView entityType="job" entityId={job.id} />
      {isOpen && companyVerified && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLd(jobSchema) }}
        />
      )}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbJsonLd) }}
      />

      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs sm:text-sm font-jakarta text-gray-400 dark:text-gray-500 mb-6">
        <Link href="/" className="hover:text-brand transition-colors">Home</Link>
        <ChevronRight className="w-3 h-3" />
        <Link href="/jobs" className="hover:text-brand transition-colors">AI Jobs</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-gray-600 dark:text-gray-300 truncate max-w-[200px] sm:max-w-xs">{job.title}</span>
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Header */}
          <div className="card p-5 sm:p-6">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center overflow-hidden shrink-0">
                {job.logoUrl ? (
                  <Image src={job.logoUrl} alt={job.companyName} width={56} height={56} sizes="56px" className="w-full h-full object-cover" />
                ) : (
                  <Building2 className="w-6 h-6 text-gray-400" />
                )}
              </div>
              <div className="flex-1">
                <h1 className="font-sora font-extrabold text-xl sm:text-2xl text-navy dark:text-white">
                  {job.title}
                </h1>
                <div className="flex items-center gap-2 mt-1">
                  <Link href={`/jobs/company/${job.companySlug}`} className="text-sm text-brand font-semibold font-jakarta hover:underline">
                    {job.companyName}
                  </Link>
                  {companyVerified ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-blue-500" aria-label="Verified company" />
                  ) : (
                    <span className="text-[11px] font-jakarta font-medium text-gray-500 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">Unverified company</span>
                  )}
                </div>
              </div>
            </div>

            {/* Key info strip */}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
              {job.showSalary && job.salaryMin && (
                <div>
                  <p className="font-sora font-bold text-lg sm:text-xl text-navy dark:text-white">
                    {formatSalaryRange(job.salaryMin, job.salaryMax, job.salaryCurrency)}
                  </p>
                  <p className="text-[10px] text-gray-400 font-jakarta uppercase tracking-wider">per year</p>
                </div>
              )}
              <div>
                <p className="font-sora font-bold text-sm text-navy dark:text-white">
                  {job.publishedAt ? getTimeAgo(job.publishedAt) : 'Recently'}
                </p>
                <p className="text-[10px] text-gray-400 font-jakarta uppercase tracking-wider">posted</p>
              </div>
              {job.experienceMin != null && (
                <div>
                  <p className="font-sora font-bold text-sm text-navy dark:text-white">
                    {job.experienceMin}–{job.experienceMax || '10+'} years
                  </p>
                  <p className="text-[10px] text-gray-400 font-jakarta uppercase tracking-wider">experience</p>
                </div>
              )}
              {job.employmentType && (
                <div>
                  <p className="font-sora font-bold text-sm text-navy dark:text-white capitalize">
                    {job.employmentType.replace(/_/g, ' ').toLowerCase()}
                  </p>
                  <p className="text-[10px] text-gray-400 font-jakarta uppercase tracking-wider">type</p>
                </div>
              )}
            </div>

            {/* Meta badges */}
            <div className="flex flex-wrap gap-2 mt-3">
              <span className="inline-flex items-center gap-1 text-xs font-jakarta bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 px-2.5 py-1 rounded-full">
                <MapPin className="w-3 h-3" />
                {job.workType === 'REMOTE' ? 'Remote' : `${job.city || ''} ${job.country || ''}`.trim() || job.workType}
              </span>
              <span className="text-xs font-jakarta bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 px-2.5 py-1 rounded-full">
                {job.category?.replace(/_/g, ' ')}
              </span>
              {job.visaSponsorship && (
                <span className="text-xs font-jakarta bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 px-2.5 py-1 rounded-full">
                  Visa Sponsorship
                </span>
              )}
              {job.isFeatured && (
                <span className="text-xs font-bold font-jakarta bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full">
                  Featured
                </span>
              )}
            </div>

          </div>

          {/* Description */}
          <div className="card p-5 sm:p-6">
            <h2 className="font-sora font-bold text-base text-navy dark:text-white mb-4">About the Role</h2>
            {job.hiringManagerName && (
              <p className="text-sm text-gray-600 dark:text-gray-400 font-jakarta -mt-2 mb-4">Reports to <span className="font-semibold text-gray-900 dark:text-white">{job.hiringManagerName}</span></p>
            )}
            <JobDescription content={job.description || ''} />
          </div>

          {/* Skills */}
          {job.skills?.length > 0 && (
            <div className="card p-5 sm:p-6">
              <h2 className="font-sora font-bold text-base text-navy dark:text-white mb-3">Required Skills</h2>
              <div className="flex flex-wrap gap-2">
                {job.skills.map((skill: string) => (
                  <span key={skill} className="text-xs font-jakarta bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 px-3 py-1.5 rounded-full">
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Bottom Apply + Save + Share */}
          {!isOpen ? (
            <div role="status" className="card p-5 sm:p-6 border-amber-200 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-900/40">
              <p className="font-sora font-bold text-base text-navy dark:text-white">This role is closed</p>
              <p className="text-sm text-gray-600 dark:text-gray-300 font-jakarta mt-1">
                {job.companyName} is no longer accepting applications for this job.{relatedJobs.length > 0 ? ' Similar open roles are listed below.' : ''}
              </p>
              <Link href="/jobs" className="inline-flex items-center gap-1 mt-3 min-h-[44px] text-sm font-semibold text-brand hover:underline">Browse open AI jobs <ChevronRight className="w-4 h-4" /></Link>
            </div>
          ) : (
          <JobActions
            applyUrl={applyUrl}
            isExternal={job.applicationType === 'EXTERNAL'}
            jobTitle={job.title}
            jobUrl={jobUrl}
            companyName={job.companyName}
            jobSlug={job.slug}
            jobId={job.id}
          />
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Company Card */}
          <div className="card p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-14 h-14 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center overflow-hidden shrink-0">
                {job.logoUrl ? (
                  <Image src={job.logoUrl} alt={job.companyName} width={56} height={56} sizes="56px" className="w-full h-full object-cover" />
                ) : (
                  <Building2 className="w-6 h-6 text-gray-400" />
                )}
              </div>
              <div className="min-w-0">
                <h3 className="font-sora font-bold text-base text-navy dark:text-white truncate">{job.companyName}</h3>
                {companyVerified && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-blue-600 dark:text-blue-400 font-jakarta font-semibold mt-0.5">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Verified Company
                  </span>
                )}
              </div>
            </div>

            {job.companyDescription && (
              <p className="text-xs text-gray-500 dark:text-gray-400 font-jakarta leading-relaxed mb-4">
                {job.companyDescription.slice(0, 160)}{job.companyDescription.length > 160 ? '...' : ''}
              </p>
            )}

            {(job.industry || job.companySize) && (
              <div className="grid grid-cols-2 gap-3 mb-4">
                {job.industry && (
                  <div className="bg-gray-50 dark:bg-gray-800/60 rounded-xl px-3 py-2.5">
                    <p className="text-[10px] text-gray-400 font-jakarta uppercase tracking-wider mb-0.5">Industry</p>
                    <p className="text-xs font-semibold font-jakarta text-navy dark:text-white">{job.industry}</p>
                  </div>
                )}
                {job.companySize && (
                  <div className="bg-gray-50 dark:bg-gray-800/60 rounded-xl px-3 py-2.5">
                    <p className="text-[10px] text-gray-400 font-jakarta uppercase tracking-wider mb-0.5">Team Size</p>
                    <p className="text-xs font-semibold font-jakarta text-navy dark:text-white">{job.companySize}</p>
                  </div>
                )}
              </div>
            )}

            <p className="text-[11px] text-gray-400 dark:text-gray-500 font-jakarta mb-2">Know more about {job.companyName}</p>

            {job.startupId ? (
              <Link
                href={`/startups/${job.companySlug}`}
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-xs font-bold font-jakarta text-white bg-brand hover:bg-brand/90 transition-colors"
              >
                View Company Profile <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            ) : job.websiteUrl ? (
              <a
                href={job.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-xs font-bold font-jakarta text-white bg-brand hover:bg-brand/90 transition-colors"
              >
                Visit Company Website <ExternalLink className="w-3.5 h-3.5" />
              </a>
            ) : null}
          </div>

          {/* Other Jobs at Company */}
          {otherJobs.length > 0 && (
            <div className="card p-5 border-brand/20 bg-gradient-to-b from-brand-50/50 to-white dark:from-brand-900/10 dark:to-gray-900">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-6 h-6 rounded-md bg-brand/10 flex items-center justify-center">
                  <Briefcase className="w-3.5 h-3.5 text-brand" />
                </div>
                <h3 className="font-sora font-bold text-sm text-navy dark:text-white">
                  More at {job.companyName}
                </h3>
                <span className="ml-auto text-[10px] font-bold font-jakarta bg-brand/10 text-brand px-2 py-0.5 rounded-full">
                  {otherJobs.length} open
                </span>
              </div>
              <div className="space-y-2">
                {otherJobs.map((other: any) => (
                  <Link
                    key={other.id}
                    href={`/jobs/${other.slug}`}
                    className="flex items-center gap-3 p-2.5 rounded-xl bg-white dark:bg-gray-800/60 border border-gray-100 dark:border-gray-700/50 hover:border-brand/40 hover:shadow-sm transition-all group"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold font-jakarta text-navy dark:text-white group-hover:text-brand transition-colors truncate">
                        {other.title}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] font-jakarta text-gray-400 dark:text-gray-500">
                          {other.workType?.replace(/_/g, ' ')}
                        </span>
                        <span className="text-[10px] font-jakarta text-gray-300 dark:text-gray-600">•</span>
                        <span className="text-[10px] font-jakarta text-gray-400 dark:text-gray-500">
                          {other.category?.replace(/_/g, ' ')}
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600 group-hover:text-brand transition-colors shrink-0" />
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Job Stats */}
          <div className="card p-5">
            <h3 className="font-sora font-bold text-sm text-navy dark:text-white mb-3">Job Info</h3>
            <div className="space-y-2 text-xs text-gray-500 font-jakarta">
              <p><strong>Category:</strong> {job.category?.replace(/_/g, ' ')}</p>
              {job.department && <p><strong>Department:</strong> {job.department}</p>}
              <p><strong>Posted:</strong> {job.publishedAt ? new Date(job.publishedAt + 'Z').toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' }) : 'Recently'}</p>
              <p><strong>Views:</strong> {job.viewsCount}</p>
              <p><strong>Applications:</strong> {job.applicationsCount}</p>
            </div>
            <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
              <p className="text-[11px] text-gray-500 font-jakarta mb-1">Udyaibase never asks candidates to pay. If this job does, let us know.</p>
              <ReportJobButton slug={job.slug} title={job.title} />
            </div>
          </div>

          {/* Newsletter */}
          <div className="card p-5">
            <h3 className="font-sora font-bold text-sm text-navy dark:text-white mb-1">Get AI Job Alerts</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 font-jakarta mb-3">
              Weekly AI jobs, startup news, and industry insights — straight to your inbox.
            </p>
            <SubscribeForm source="sidebar" buttonText="Subscribe" />
          </div>
        </div>
      </div>

      {/* Related AI Jobs */}
      {relatedJobs.length > 0 && (
        <div className="mt-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-sora font-bold text-lg text-navy dark:text-white">
              Related AI Jobs
            </h2>
            <Link href={`/jobs?category=${job.category}`} className="text-xs text-brand font-semibold font-jakarta hover:underline">
              View all {job.category?.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c: string) => c.toUpperCase())} jobs →
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {relatedJobs.map((rj: any) => (
              <Link
                key={rj.id}
                href={`/jobs/${rj.slug}`}
                className="card p-4 hover:border-brand/30 transition-colors group"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center shrink-0 overflow-hidden">
                    {rj.logoUrl ? (
                      <Image src={rj.logoUrl} alt={rj.companyName} width={40} height={40} sizes="40px" className="w-full h-full object-cover" />
                    ) : (
                      <Building2 className="w-4 h-4 text-gray-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-sora font-semibold text-sm text-navy dark:text-white group-hover:text-brand transition-colors truncate">
                      {rj.title}
                    </h3>
                    <p className="text-xs text-gray-500 font-jakarta mt-0.5">{rj.companyName}</p>
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      <span className="inline-flex items-center gap-1 text-[10px] font-jakarta text-gray-400">
                        <MapPin className="w-2.5 h-2.5" />
                        {rj.workType === 'REMOTE' ? 'Remote' : rj.city || rj.country || rj.workType}
                      </span>
                      {rj.showSalary && rj.salaryMin && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-jakarta text-gray-400">
                          <DollarSign className="w-2.5 h-2.5" />
                          {rj.salaryCurrency} {(rj.salaryMin / 1000).toFixed(0)}K–{(rj.salaryMax / 1000).toFixed(0)}K
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function getTimeAgo(dateStr: string): string {
  const date = new Date(dateStr + 'Z');
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffHours < 1) return 'Just now';
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return '1 day ago';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) !== 1 ? 's' : ''} ago`;
  return `${Math.floor(diffDays / 30)} month${Math.floor(diffDays / 30) !== 1 ? 's' : ''} ago`;
}
