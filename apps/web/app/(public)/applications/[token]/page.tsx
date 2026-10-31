import type { Metadata } from 'next';
import Link from 'next/link';
import { CANDIDATE_STAGE, findByStatusToken } from '@/lib/jobs/candidate-status';
import { isClaimVerified } from '@/lib/jobs/trust';
import ApplicationActions from './ApplicationActions';
import TalentPoolToggle from './TalentPoolToggle';

export const dynamic = 'force-dynamic';

// The URL is the candidate's private key: never index it, never leak it in Referer headers.
export const metadata: Metadata = {
  title: 'Your application',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

const STEPS = ['Applied', 'Under review', 'Shortlisted', 'Interview', 'Offer'];
const STEP_OF: Record<string, number> = { APPLIED: 1, REVIEWED: 1, SHORTLISTED: 2, INTERVIEW: 3, OFFER: 4, HIRED: 4 };

export default async function ApplicationStatusPage(props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;
  const app = await findByStatusToken(token);

  if (!app) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 sm:py-24 text-center font-jakarta">
        <h1 className="font-sora font-bold text-2xl text-gray-900 dark:text-white">This link is no longer valid</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">If you deleted your application, your data has been removed. Otherwise, check the latest email we sent you.</p>
        <Link href="/jobs" className="btn-brand mt-6">Browse AI jobs</Link>
      </div>
    );
  }

  const employer = app.Listing.Employer;
  const company = (isClaimVerified(employer) && employer.Startup?.name) || employer.companyName;
  const stage = app.withdrawnAt ? { label: 'Withdrawn', detail: 'You withdrew this application. The company can no longer move it forward.' } : (CANDIDATE_STAGE[app.status] ?? CANDIDATE_STAGE.APPLIED);
  const closed = !!app.withdrawnAt || app.status === 'REJECTED';
  const step = STEP_OF[app.status] ?? 1;

  return (
    <div className="max-w-xl mx-auto px-4 py-10 sm:py-16 font-jakarta">
      <p className="text-sm text-gray-600 dark:text-gray-400">Your application</p>
      <h1 className="font-sora font-bold text-2xl text-gray-900 dark:text-white mt-1">{app.Listing.title}</h1>
      <p className="text-gray-700 dark:text-gray-300">{company} · applied {app.appliedAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>

      <section aria-labelledby="stage" className="mt-6 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-[14px] p-5">
        <h2 id="stage" className="text-sm font-semibold text-gray-600 dark:text-gray-400">Status</h2>
        <p className="font-sora font-bold text-xl text-gray-900 dark:text-white mt-1">{stage.label}</p>
        <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">{stage.detail}</p>
        {!closed && (
          <ol className="mt-5 grid grid-cols-5 gap-1.5" aria-label="Progress">
            {STEPS.map((s, i) => (
              <li key={s} className="text-center">
                <span className={`block h-1.5 rounded-full ${i <= step ? 'bg-brand' : 'bg-gray-200 dark:bg-gray-700'}`} aria-hidden />
                <span className={`block mt-1.5 text-[11px] leading-tight ${i <= step ? 'text-gray-900 dark:text-white font-semibold' : 'text-gray-500'}`}>
                  {s}<span className="sr-only">{i <= step ? ' (reached)' : ''}</span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {app.fullName !== 'Deleted applicant' && <TalentPoolToggle token={token} company={company} on={!!app.talentPoolUntil && app.talentPoolUntil > new Date()} />}
      <ApplicationActions token={token} withdrawn={!!app.withdrawnAt} jobSlug={app.Listing.slug} />

      <p className="mt-8 text-xs text-gray-500 dark:text-gray-400">
        This page is private to you. Anyone with this link can see your application status, so don&apos;t share it.
      </p>
    </div>
  );
}
