import type { Metadata } from 'next';
import { prisma } from '@udyaibase/database';
import { verifySeriesFollowToken } from '@/lib/events/after-event';
import UnfollowButton from './UnfollowButton';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Stop series emails', robots: { index: false, follow: false } };

/** Confirm before stopping (a visit alone changes nothing, so link scanners can't unsubscribe people). */
export default async function UnfollowPage(props: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await props.searchParams;
  const id = verifySeriesFollowToken(t, 'stop');
  const f = id ? await prisma.eventSeriesFollower.findUnique({ where: { id }, select: { unsubscribedAt: true, series: { select: { name: true } } } }) : null;
  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 sm:p-8">
        {!f ? (
          <>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white">This link isn’t valid</h1>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">Use the link at the bottom of the email you received.</p>
          </>
        ) : (
          <>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Stop emails about {f.series.name}?</h1>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">You won’t be told when new {f.series.name} events open. You can follow again any time from the series page.</p>
            <UnfollowButton token={t!} alreadyStopped={!!f.unsubscribedAt} name={f.series.name} />
          </>
        )}
      </div>
    </div>
  );
}
