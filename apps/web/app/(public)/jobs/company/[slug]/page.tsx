import { cache } from 'react';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { jsonLd } from '@/lib/json-ld';
import { fitTitle, metaSnippet } from '@/lib/seo-text';
import { getCareersCompany } from '@/lib/jobs/careers';
import { canHideBrandingFor, careersPageData, getCareersPageJobs } from '@/lib/jobs/careers-page';
import CareersPage from '@/components/careers/CareersPage';

interface PageProps {
  params: Promise<{ slug: string }>;
}

// Cached; refreshed when the company edits its careers page or a job changes (lib/revalidate.ts).
export const revalidate = 3600;

// Built on first visit, then cached.
export async function generateStaticParams() {
  return [];
}

/** The company's careers page: its chosen template, with its open roles inside. One load for metadata and page. */
const load = cache(async (slug: string) => {
  const company = await getCareersCompany({ slug });
  if (!company) return null;
  const [jobs, canHide] = await Promise.all([getCareersPageJobs(company.employerId), canHideBrandingFor(company.employerId)]);
  return { company, jobs, canHide };
});

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const { slug } = await props.params;
  const data = await load(slug);
  if (!data) return { title: 'Company Not Found' };
  const { company, jobs } = data;
  const name = company.name.trim();
  const n = jobs.length;
  const title = fitTitle([
    `Careers at ${name}: ${n} Open Role${n === 1 ? '' : 's'} (${new Date().getFullYear()})`,
    `${name} Jobs: ${n} Open Role${n === 1 ? '' : 's'}`,
    `Careers at ${name}`,
  ]);
  const roles = jobs.slice(0, 3).map((j) => j.title).join(', ');
  const description = metaSnippet(
    n > 0
      ? `${name} is hiring: ${roles}${n > 3 ? ` and ${n - 3} more` : ''}. ${company.headline || company.description || ''}`
      : `${company.headline || `Careers at ${name}`}. ${company.description || ''} Get notified when ${name} opens a role.`,
  );
  // With no roles and nothing written about the company, the page is a dead end in search results.
  const hasStory = !!(company.headline || company.description) || company.content.sections.some((s) => s.enabled && s.type !== 'intro' && s.type !== 'perks');
  return {
    title,
    description,
    alternates: { canonical: `/jobs/company/${slug}` },
    robots: n > 0 || hasStory ? undefined : { index: false, follow: true },
  };
}

export default async function CompanyCareersPage(props: PageProps) {
  const { slug } = await props.params;
  const data = await load(slug);
  if (!data) notFound();
  const { company, jobs, canHide } = data;
  const pageUrl = `https://udyaibase.com/jobs/company/${slug}`;
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `Careers at ${company.name}`,
    url: pageUrl,
    about: {
      '@type': 'Organization',
      name: company.name,
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
      { '@type': 'ListItem', position: 3, name: company.name, item: pageUrl },
    ],
  };

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(schema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumb) }} />
      <CareersPage data={careersPageData(company, jobs, canHide)} />
      <div className="mt-14 text-center">
        <Link href="/jobs" className="text-sm text-brand font-semibold font-jakarta hover:underline">← Browse all AI jobs</Link>
      </div>
    </div>
  );
}
