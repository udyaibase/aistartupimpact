import { jsonLd } from "@/lib/json-ld";
import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight, Bell } from 'lucide-react';
import SubscribeForm from '@/components/SubscribeForm';
import JobsBrowser from './JobsBrowser';
import { searchJobs, getJobWorkTypeCounts, JOBS_PAGE_SIZE } from '@/lib/jobs/search';

export const metadata: Metadata = {
  title: 'AI Jobs in India — Find Your Next Role in Artificial Intelligence',
  description: 'AI jobs at Indian AI startups — ML Engineer, LLM Engineer, AI Product Manager, Data Scientist and more. Remote, hybrid and on-site roles, updated daily.',
  alternates: { canonical: '/jobs' },
};

// Employer and admin edits refresh this page on demand (lib/revalidate.ts); the timer is a fallback.
export const revalidate = 300;

// Rendered without the URL's filters so the page can be cached; JobsBrowser applies them after load.
export default async function JobsPage() {
  let jobs: any[] = [];
  let total = 0;
  let workTypeCounts: { workType: string; count: number }[] = [];

  try {
    const [page, counts] = await Promise.all([
      searchJobs({}, { limit: JOBS_PAGE_SIZE }),
      getJobWorkTypeCounts(),
    ]);
    jobs = page.jobs;
    total = page.total;
    workTypeCounts = counts;
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
      {jobs.length > 0 && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd({
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          name: 'AI Jobs in India',
          url: 'https://udyaibase.com/jobs',
          numberOfItems: jobs.length,
          itemListElement: jobs.map((j: any, i: number) => ({
            '@type': 'ListItem', position: i + 1, url: `https://udyaibase.com/jobs/${j.slug}`, name: j.companyName ? `${j.title} at ${j.companyName}` : j.title,
          })),
        }) }} />
      )}

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

      <JobsBrowser initialJobs={jobs} initialTotal={total} workTypeCounts={workTypeCounts}>
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
      </JobsBrowser>
    </div>
  );
}
