import type { Metadata } from 'next';
import { prisma } from '@udyaibase/database';
import { verifyHostOptOutToken } from '@/lib/events/after-event';
import StopEmailsButton from './StopEmailsButton';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Stop emails', robots: { index: false, follow: false } };

/** Confirm before stopping (a visit alone changes nothing, so link scanners can't unsubscribe people). */
export default async function StopEmailsPage(props: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await props.searchParams;
  const id = verifyHostOptOutToken(t);
  const reg = id ? await prisma.eventRegistration.findUnique({
    where: { id },
    select: { hostEmailsOptOutAt: true, event: { select: { title: true, organizer: { select: { name: true, company: true } } } } },
  }) : null;

  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 sm:p-8">
        {!reg ? (
          <>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white">This link isn’t valid</h1>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">Use the link at the bottom of the email you received.</p>
          </>
        ) : (
          <>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Stop emails from {reg.event.organizer.company || reg.event.organizer.name}?</h1>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              You won’t get any more follow-up or feedback emails about <strong>{reg.event.title}</strong>. Your registration and any certificate stay as they are.
            </p>
            <StopEmailsButton token={t!} alreadyStopped={!!reg.hostEmailsOptOutAt} />
          </>
        )}
      </div>
    </div>
  );
}
