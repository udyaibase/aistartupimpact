import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { findByStatusToken } from '@/lib/jobs/candidate-status';
import ApplicationStatusCard from '@/components/jobs/ApplicationStatusCard';
import { isClaimVerified } from '@/lib/jobs/trust';
import ApplicationActions from './ApplicationActions';
import TalentPoolToggle from './TalentPoolToggle';
import WhatsAppChannelCard from '@/components/jobs/WhatsAppChannelCard';
import { getSeoConfig } from '@/lib/seo-config';

export const dynamic = 'force-dynamic';

// The URL is the candidate's private key: never index it, never leak it in Referer headers.
export const metadata: Metadata = {
  title: 'Your application',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

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

  // A sourced person who hasn't said they're interested has their own page (interested / remove my details).
  if (app.sourcedState === 'ADDED' || app.sourcedState === 'CONTACTED') redirect(`/sourced/${token}`);

  const employer = app.Listing.Employer;
  const company = (isClaimVerified(employer) && employer.Startup?.name) || employer.companyName;
  // The jobs channel, for people who came through Udyaibase (not those a company sent from its own careers page or widget).
  const { socialWhatsappChannel } = await getSeoConfig();
  const showChannel = !!socialWhatsappChannel && app.source !== 'WIDGET' && app.source !== 'CAREERS_PAGE';

  return (
    <div className="max-w-xl mx-auto px-4 py-10 sm:py-16 font-jakarta">
      <p className="text-sm text-gray-600 dark:text-gray-400">Your application</p>
      <h1 className="font-sora font-bold text-2xl text-gray-900 dark:text-white mt-1">{app.Listing.title}</h1>
      <p className="text-gray-700 dark:text-gray-300">{company} · applied {app.appliedAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>

      <ApplicationStatusCard app={app} />

      {app.fullName !== 'Deleted applicant' && <TalentPoolToggle token={token} company={company} on={!!app.talentPoolUntil && app.talentPoolUntil > new Date()} />}
      <ApplicationActions token={token} withdrawn={!!app.withdrawnAt || app.status === 'REJECTED' || app.status === 'HIRED'} jobHref={app.Listing.isGeneral ? `/jobs/company/${app.Listing.Employer.slug}` : `/jobs/${app.Listing.slug}`} jobLabel={app.Listing.isGeneral ? 'View company' : 'View job'} />

      {showChannel && <div className="mt-6"><WhatsAppChannelCard from="track" /></div>}

      <p className="mt-8 text-xs text-gray-500 dark:text-gray-400">
        This page is private to you. Anyone with this link can see your application status, so don&apos;t share it.
      </p>
    </div>
  );
}
