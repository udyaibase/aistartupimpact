import type { Metadata } from 'next';
import { prisma } from '@udyaibase/database';
import { speakerLinkOpen, verifySpeakerPortalToken } from '@/lib/events/after-event';
import SpeakerPortalForm from './SpeakerPortalForm';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Your speaker page', robots: { index: false, follow: false } };

export default async function SpeakerPortalPage(props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;
  const raw = decodeURIComponent(token);
  const id = verifySpeakerPortalToken(raw);
  const sp = id ? await prisma.eventSpeaker.findUnique({
    where: { id },
    select: { name: true, title: true, company: true, headshotUrl: true, bio: true, talkTitle: true, slidesUrl: true, event: { select: { title: true, slug: true, startAt: true, endAt: true, deletedAt: true } } },
  }) : null;
  if (sp && !sp.event.deletedAt && !speakerLinkOpen(sp.event)) {
    return <div className="max-w-md mx-auto px-4 py-16"><div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6"><h1 className="text-lg font-semibold text-gray-900 dark:text-white">This link has expired</h1><p className="mt-2 text-sm text-gray-600 dark:text-gray-400">Speaker links stop working 30 days after the event. Ask the host if something on your profile needs changing.</p></div></div>;
  }
  if (!sp || sp.event.deletedAt) {
    return <div className="max-w-md mx-auto px-4 py-16"><div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6"><h1 className="text-lg font-semibold text-gray-900 dark:text-white">This link isn’t valid</h1><p className="mt-2 text-sm text-gray-600 dark:text-gray-400">Use the link in your acceptance email, or ask the host to resend it.</p></div></div>;
  }
  return (
    <div className="max-w-xl mx-auto px-4 py-10 sm:py-14">
      <p className="text-sm text-gray-500">Speaker at</p>
      <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-white">{sp.event.title}</h1>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{new Date(sp.event.startAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })} · <a href={`/events/${sp.event.slug}`} className="underline">Event page</a></p>
      <SpeakerPortalForm token={raw} initial={{ name: sp.name, title: sp.title ?? '', company: sp.company ?? '', headshotUrl: sp.headshotUrl, linkedinUrl: sp.bio ?? '', talkTitle: sp.talkTitle ?? '', slidesUrl: sp.slidesUrl ?? '' }} />
    </div>
  );
}
