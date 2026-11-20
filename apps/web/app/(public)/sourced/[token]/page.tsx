import Link from 'next/link';
import { sourcedByToken } from '@/lib/employer/sourcing';
import { employerContext } from '@/lib/employer/applications';
import SourcedActions from '@/components/jobs/candidate/SourcedActions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'A hiring team contacted you', robots: { index: false, follow: false } };

/** Someone a hiring team found and emailed: say you're interested, or have your details removed. */
export default async function SourcedPage(props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;
  const a = await sourcedByToken(token);
  if (!a) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 sm:py-24 text-center font-jakarta">
        <h1 className="font-sora font-bold text-2xl text-gray-900 dark:text-white">This link no longer works</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">If you asked us to remove your details, they’re gone.</p>
        <Link href="/jobs" className="btn-brand mt-6">Browse AI jobs</Link>
      </div>
    );
  }
  const ctx = await employerContext(a.Listing.employerId);
  return (
    <div className="max-w-lg mx-auto px-4 py-12 sm:py-20 font-jakarta">
      <h1 className="font-sora font-bold text-2xl text-gray-900 dark:text-white">{ctx.company} would like to talk with you</h1>
      <p className="mt-2 text-gray-700 dark:text-gray-300">
        About the <Link href={`/jobs/${a.Listing.slug}`} className="font-semibold underline">{a.Listing.title}</Link> role. You haven’t applied; the team added your details and reached out first.
      </p>
      <SourcedActions token={token} interested={a.sourcedState === 'INTERESTED'} company={ctx.company} />
      <p className="mt-8 text-xs text-gray-500">Only {ctx.company}’s hiring team sees your details. If you don’t respond, they’re deleted automatically within 6 months.</p>
    </div>
  );
}
