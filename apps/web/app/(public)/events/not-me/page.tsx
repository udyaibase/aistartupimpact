import type { Metadata } from 'next';
import { prisma } from '@udyaibase/database';
import { verifyNotMeToken } from '@/lib/events/after-event';
import { NOT_ME_BLOCK_DAYS, NOT_ME_REASON } from '@/lib/events/registration-trust';
import NotMeButton from './NotMeButton';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'I didn’t register', robots: { index: false, follow: false } };

/** Confirm before cancelling (a visit alone changes nothing, so link scanners can't cancel people's tickets). */
export default async function NotMePage(props: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await props.searchParams;
  const id = verifyNotMeToken(t);
  const reg = id ? await prisma.eventRegistration.findUnique({
    where: { id },
    select: { status: true, waitlistReason: true, deletedAt: true, event: { select: { title: true } } },
  }) : null;

  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 sm:p-8">
        {!reg || reg.deletedAt ? (
          <>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white">This link isn’t valid</h1>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">Use the link at the bottom of the email you received.</p>
          </>
        ) : (
          <>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Didn’t register for this event?</h1>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Someone registered your email address for <strong>{reg.event.title}</strong>. If that wasn’t you, we’ll cancel it and stop anyone registering this address for events for {NOT_ME_BLOCK_DAYS} days.
            </p>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">If you did register and only want to skip the event, you don’t need to do anything here.</p>
            <NotMeButton token={t!} alreadyDone={reg.status === 'CANCELLED' && reg.waitlistReason === NOT_ME_REASON} />
          </>
        )}
      </div>
    </div>
  );
}
