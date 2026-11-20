import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getCandidate, myApplicationDetail } from '@/lib/jobs/candidate-account';
import { candidateView } from '@/lib/jobs/candidate-status';
import { isClaimVerified } from '@/lib/jobs/trust';
import { getSeoConfig } from '@/lib/seo-config';
import ApplicationStatusCard from '@/components/jobs/ApplicationStatusCard';
import WhatsAppChannelCard from '@/components/jobs/WhatsAppChannelCard';
import AccountApplicationActions from './AccountApplicationActions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Your application', robots: { index: false, follow: false } };

/** One application's status for the signed-in job seeker (the account version of the private status link). */
export default async function MyApplicationPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const me = await getCandidate().catch(() => null);
  if (!me) redirect(`/my-applications`);
  const app = await myApplicationDetail(me.id, id);
  if (!app || !app.Listing) notFound();

  const employer = app.Listing.Employer;
  const company = (isClaimVerified(employer) && employer.Startup?.name) || employer.companyName;
  const { closed } = candidateView(app);
  const jobHref = app.Listing.isGeneral ? `/jobs/company/${employer.slug}` : `/jobs/${app.Listing.slug}`;
  const { socialWhatsappChannel } = await getSeoConfig();
  const showChannel = !!socialWhatsappChannel && app.source !== 'WIDGET' && app.source !== 'CAREERS_PAGE';

  return (
    <div className="max-w-xl mx-auto px-4 py-6 sm:py-10 font-jakarta">
      <Link href="/my-applications" className="inline-flex items-center gap-1.5 min-h-[40px] text-sm font-semibold text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-3">
        <ArrowLeft className="w-4 h-4" aria-hidden /> My applications
      </Link>
      <h1 className="font-sora font-bold text-2xl text-gray-900 dark:text-white">{app.Listing.title}</h1>
      <p className="text-gray-700 dark:text-gray-300">{company} · applied {app.appliedAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>

      <ApplicationStatusCard app={app} />

      <AccountApplicationActions id={app.id} canWithdraw={!closed && app.status !== 'HIRED'} jobHref={jobHref} jobLabel={app.Listing.isGeneral ? 'View company' : 'View job'} />

      {showChannel && <div className="mt-6"><WhatsAppChannelCard from="track" /></div>}
    </div>
  );
}
