import type { Metadata } from 'next';
import Link from 'next/link';
import { candidateView } from '@/lib/jobs/candidate-status';
import { isClaimVerified } from '@/lib/jobs/trust';
import { claimApplications, getCandidate, listMyApplications } from '@/lib/jobs/candidate-account';
import CandidateSignIn from '@/components/jobs/CandidateSignIn';
import MyApplicationsList from './MyApplicationsList';
import VerifyEmailToLink from './VerifyEmailToLink';
import WhatsAppChannelCard from '@/components/jobs/WhatsAppChannelCard';
import { getSeoConfig } from '@/lib/seo-config';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'My applications', robots: { index: false, follow: false } };

/** A job seeker's applications, behind their sign-in. Past guest applications appear once their email is verified. */
export default async function MyApplicationsPage() {
  const me = await getCandidate();
  if (!me) {
    return (
      <div className="max-w-lg mx-auto px-4 py-10 sm:py-16 font-jakarta">
        <h1 className="font-sora font-extrabold text-2xl text-gray-900 dark:text-white">My applications</h1>
        <p className="mt-1 text-gray-600 dark:text-gray-400">Sign in with the email you applied with to see every application in one place.</p>
        <div className="mt-6"><CandidateSignIn returnTo="/my-applications" /></div>
      </div>
    );
  }

  await claimApplications(me);
  const [apps, { socialWhatsappChannel }] = await Promise.all([listMyApplications(me.id), getSeoConfig()]);
  const rows = apps.map((a) => {
    const employer = a.Listing.Employer;
    const { stage } = candidateView(a);
    return {
      id: a.id,
      title: a.Listing.isGeneral ? 'General application' : a.Listing.title,
      company: (isClaimVerified(employer) && employer.Startup?.name) || employer.companyName,
      appliedAt: a.appliedAt.toISOString(),
      stage: stage.label,
      detail: stage.detail,
    };
  });

  return (
    <div className="max-w-2xl mx-auto px-4 py-10 sm:py-16 font-jakarta">
      <h1 className="font-sora font-extrabold text-2xl text-gray-900 dark:text-white">My applications</h1>
      <p className="mt-1 text-gray-600 dark:text-gray-400">Signed in as {me.email}</p>
      {!me.emailVerified && <div className="mt-6"><VerifyEmailToLink email={me.email} /></div>}
      {rows.length === 0 ? (
        <div className="mt-6 rounded-[14px] border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 text-center">
          <p className="font-semibold text-gray-900 dark:text-white">No applications yet</p>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Jobs you apply for while signed in show up here.</p>
          <Link href="/jobs" className="btn-brand mt-4">Browse AI jobs</Link>
        </div>
      ) : (
        <MyApplicationsList rows={rows} />
      )}
      {socialWhatsappChannel && <div className="mt-6"><WhatsAppChannelCard from="track" /></div>}
    </div>
  );
}
