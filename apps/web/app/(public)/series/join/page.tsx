import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@udyaibase/database';
import { seriesJoinTarget, verifySeriesJoinToken } from '@/lib/events/after-event';
import JoinButton from './JoinButton';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Follow series', robots: { index: false, follow: false } };

/** Hide most of the address: the page proves who the link was for without showing it in full. */
function maskEmail(email: string): string {
  const [user, domain] = email.split('@');
  if (!domain) return email;
  return `${user.slice(0, 2)}${'•'.repeat(Math.max(1, Math.min(6, user.length - 2)))}@${domain}`;
}

/** From a follow-up email: confirm before following (a visit alone changes nothing, so link scanners can't follow). */
export default async function JoinSeriesPage(props: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await props.searchParams;
  const regId = verifySeriesJoinToken(t);
  const target = regId ? await seriesJoinTarget(regId) : null;
  const series = target?.series ?? null;
  const email = target?.email ?? '';
  const already = series && email
    ? !!(await prisma.eventSeriesFollower.findFirst({ where: { seriesId: series.id, email, confirmedAt: { not: null }, unsubscribedAt: null }, select: { id: true } }))
    : false;

  return (
    <div className="max-w-md mx-auto px-4 py-16 font-jakarta">
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 sm:p-8">
        {!series || !email ? (
          <>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white">This link isn’t valid</h1>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">It may be old, or the event is no longer part of a series. You can follow a series from its page.</p>
          </>
        ) : (
          <>
            <p className="text-sm font-semibold text-gray-500">Event series</p>
            <h1 className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">Follow {series.name}?</h1>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">We’ll email <strong className="font-semibold text-gray-800 dark:text-gray-200">{maskEmail(email)}</strong> once when each new {series.name} event opens. Nothing else, and you can stop any time.</p>
            <JoinButton token={t!} alreadyFollowing={already} name={series.name} />
            <p className="mt-5 text-sm"><Link href={`/series/${series.slug}`} className="font-semibold text-gray-900 dark:text-white underline underline-offset-2">See all {series.name} events</Link></p>
          </>
        )}
      </div>
    </div>
  );
}
