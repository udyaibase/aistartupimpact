import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { prisma } from '@udyaibase/database';
import { publicListingWhere } from '@/lib/jobs/public';
import { isClaimVerified } from '@/lib/jobs/trust';
import { applyConsentText } from '@/lib/jobs/consent';
import JobApplyForm, { type ApplyJob } from '@/components/jobs/apply/JobApplyForm';
import { publicQuestions } from '@/lib/jobs/composer';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const job = await prisma.jobBoardListing.findFirst({ where: { ...publicListingWhere(), slug }, select: { title: true } });
  return { title: job ? `Apply: ${job.title}` : 'Apply', robots: { index: false, follow: true } };
}

export default async function ApplyPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const listing = await prisma.jobBoardListing.findFirst({
    where: { ...publicListingWhere(), slug },
    select: {
      slug: true, title: true, skills: true, screeningQuestions: true, applicationType: true, applicationUrl: true, applicationEmail: true,
      Employer: { select: { companyName: true, startupId: true, startupClaimMethod: true, Startup: { select: { name: true } } } },
    },
  });
  if (!listing) notFound();
  if (listing.applicationType === 'EXTERNAL') {
    if (listing.applicationUrl) redirect(listing.applicationUrl);
    redirect(`/jobs/${slug}`);
  }

  const company = (isClaimVerified(listing.Employer) && listing.Employer.Startup?.name) || listing.Employer.companyName;
  const job: ApplyJob = {
    slug: listing.slug,
    title: listing.title,
    company,
    skills: listing.skills,
    screeningQuestions: publicQuestions(listing.screeningQuestions),
    consentText: applyConsentText(company),
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 sm:py-10 font-jakarta">
      <Link href={`/jobs/${slug}`} className="inline-flex items-center gap-1.5 min-h-[40px] text-sm font-semibold text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-3">
        <ArrowLeft className="w-4 h-4" aria-hidden /> Back to job
      </Link>
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-[14px] p-5 sm:p-7">
        <JobApplyForm
          job={job}
          attribution={{
            source: sp.source, widgetId: sp.w, ref: sp.ref,
            utm_source: sp.utm_source, utm_medium: sp.utm_medium, utm_campaign: sp.utm_campaign,
          }}
        />
      </div>
    </div>
  );
}
