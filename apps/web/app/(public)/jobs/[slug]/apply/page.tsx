import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { prisma } from '@udyaibase/database';
import { publicListingWhere } from '@/lib/jobs/public';
import { isClaimVerified } from '@/lib/jobs/trust';
import { applyConsentText } from '@/lib/jobs/consent';
import JobApplyForm, { type AfterApply, type ApplyJob } from '@/components/jobs/apply/JobApplyForm';
import { getSeoConfig } from '@/lib/seo-config';
import { searchJobs } from '@/lib/jobs/search';
import { claimApplications, getCandidate, lastApplicationDetails, lastResume, lastResumeLabel, listMyApplications, myApplicationForListing } from '@/lib/jobs/candidate-account';
import ApplySignInHint from '@/components/jobs/apply/ApplySignInHint';
import { publicQuestions } from '@/lib/jobs/composer';
import { parseApplyFormConfig } from '@/lib/jobs/apply-form';

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
      id: true, slug: true, title: true, skills: true, screeningQuestions: true, applicationType: true, applicationUrl: true, applicationEmail: true,
      category: true, city: true, workType: true,
      Employer: { select: { companyName: true, startupId: true, startupClaimMethod: true, applyFormConfig: true, Startup: { select: { name: true } } } },
    },
  });
  if (!listing) {
    // A job that was published and has since been paused, filled or closed: send them to its page, which says so
    // and suggests other roles, instead of a bare "page not found" on a link that worked yesterday.
    const past = await prisma.jobBoardListing.findFirst({ where: { slug, deletedAt: null, status: { in: ['PAUSED', 'CLOSED'] }, publishedAt: { not: null } }, select: { id: true } });
    if (past) redirect(`/jobs/${slug}`);
    notFound();
  }
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
    form: parseApplyFormConfig(listing.Employer.applyFormConfig),
  };

  // Next steps after applying, for people who found the job on Udyaibase. Candidates a company sent here from its own
  // careers page or widget aren't shown other companies' jobs.
  // Same values the apply API reads (?source=widget|careers, ?w=<widget id>); they're saved as WIDGET / CAREERS_PAGE.
  const companySent = !!sp.w || sp.source === 'widget' || sp.source === 'careers';
  // Signed in: their details from last time. Signed out (on Udyaibase): offer an account first, guest apply still open.
  const me = await getCandidate().catch(() => null);
  if (me) await claimApplications(me).catch(() => 0); // past guest applications (verified email only), so their details are found

  // Already applied (one application per job): say so up front instead of letting them fill the form to be refused.
  const already = me ? await myApplicationForListing(me.id, listing.id).catch(() => null) : null;
  if (already) {
    const on = already.appliedAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    return (
      <div className="max-w-2xl mx-auto px-4 py-6 sm:py-10 font-jakarta">
        <Link href={`/jobs/${slug}`} className="inline-flex items-center gap-1.5 min-h-[40px] text-sm font-semibold text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-3">
          <ArrowLeft className="w-4 h-4" aria-hidden /> Back to job
        </Link>
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-[14px] p-6 sm:p-8 text-center">
          <CheckCircle2 className="w-10 h-10 mx-auto text-green-700 dark:text-green-400" aria-hidden />
          <h1 className="mt-3 font-sora font-bold text-xl text-gray-900 dark:text-white">
            {already.withdrawnAt ? 'You withdrew your application for this job' : 'You’ve already applied for this job'}
          </h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            {listing.title} at {company} · applied {on}. Each job takes one application{already.withdrawnAt ? ', so it can’t be sent again' : ''}.
          </p>
          <div className="mt-5 flex flex-col sm:flex-row gap-2 justify-center">
            <Link href={`/my-applications/${already.id}`} className="inline-flex items-center justify-center min-h-[44px] px-5 rounded-[10px] bg-[#A50F15] hover:bg-[#8E0D12] text-white text-sm font-semibold">View your application</Link>
            <Link href="/jobs" className="inline-flex items-center justify-center min-h-[44px] px-5 rounded-[10px] border border-gray-300 dark:border-gray-700 text-sm font-semibold text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-800">Browse other jobs</Link>
          </div>
        </div>
      </div>
    );
  }
  const last = me ? await lastApplicationDetails(me.id).catch(() => null) : null;
  const prefill = me ? last ?? { fullName: me.name, email: me.email } : undefined;
  const resume = me ? await lastResume(me.id).catch(() => null) : null;
  const here = `/jobs/${slug}/apply${(() => { const q = new URLSearchParams(Object.entries(sp).filter(([, v]) => typeof v === 'string') as [string, string][]).toString(); return q ? `?${q}` : ''; })()}`;

  let afterApply: AfterApply | undefined;
  if (!companySent) {
    // Same role first; topped up with the newest other open jobs so there's always something to look at.
    const [{ socialWhatsappChannel }, sameRole, newest, mine] = await Promise.all([
      getSeoConfig(),
      searchJobs({ category: listing.category }, { limit: 6 }).then((r) => r.jobs).catch(() => []),
      searchJobs({}, { limit: 12 }).then((r) => r.jobs).catch(() => []),
      me ? listMyApplications(me.id).catch(() => []) : Promise.resolve([]),
    ]);
    // Never suggest this job or ones they've already applied for.
    const seen = new Set([listing.slug, ...mine.map((a) => a.Listing?.slug).filter(Boolean) as string[]]);
    const similar = [...sameRole, ...newest].filter((j: any) => !seen.has(j.slug) && seen.add(j.slug));
    afterApply = {
      saveToAccount: !me,
      channel: !!socialWhatsappChannel,
      alert: { category: listing.category, city: listing.workType === 'REMOTE' ? null : listing.city, remote: listing.workType === 'REMOTE' },
      sameRole: similar.slice(0, 3).some((x: any) => sameRole.some((j: any) => j.slug === x.slug)),
      similar: similar.slice(0, 3).map((j: any) => ({
        slug: j.slug, title: j.title, company: j.companyName,
        place: j.workType === 'REMOTE' ? 'Remote' : j.city || j.location || '',
      })),
    };
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 sm:py-10 font-jakarta">
      <Link href={`/jobs/${slug}`} className="inline-flex items-center gap-1.5 min-h-[40px] text-sm font-semibold text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-3">
        <ArrowLeft className="w-4 h-4" aria-hidden /> Back to job
      </Link>
      {!me && !companySent && <ApplySignInHint returnTo={here} />}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-[14px] p-5 sm:p-7">
        <JobApplyForm
          job={job}
          attribution={{
            source: sp.source, widgetId: sp.w, ref: sp.ref,
            utm_source: sp.utm_source, utm_medium: sp.utm_medium, utm_campaign: sp.utm_campaign, rc: sp.rc,
          }}
          afterApply={afterApply}
          prefill={prefill}
          signedInAs={me?.email}
          prefillFromLast={!!last}
          lastResume={resume ? { label: lastResumeLabel(resume) } : undefined}
        />
      </div>
    </div>
  );
}
