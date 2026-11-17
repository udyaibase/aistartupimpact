import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@udyaibase/database';
import { cfpIsOpen, cfpSettings } from '@/lib/events/cfp';
import SpeakForm from './SpeakForm';

export const dynamic = 'force-dynamic';

export async function generateMetadata(props: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await props.params;
  const e = await prisma.event.findUnique({ where: { slug }, select: { title: true } });
  return { title: e ? `Speak at ${e.title}` : 'Call for speakers', robots: { index: true, follow: true } };
}

export default async function SpeakPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const event = await prisma.event.findUnique({
    where: { slug },
    select: { slug: true, title: true, endAt: true, status: true, deletedAt: true, cfpSettings: true, agendaTracks: true, organizer: { select: { name: true, company: true } } },
  });
  if (!event || event.deletedAt) notFound();
  const settings = cfpSettings(event.cfpSettings);
  const open = cfpIsOpen(settings, event);
  return (
    <div className="max-w-2xl mx-auto px-4 py-10 sm:py-14">
      <Link href={`/events/${event.slug}`} className="text-sm text-gray-500 hover:underline">← {event.title}</Link>
      <h1 className="mt-2 text-2xl sm:text-3xl font-semibold tracking-tight text-gray-900 dark:text-white">Speak at {event.title}</h1>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
        Hosted by {event.organizer.company || event.organizer.name}
        {settings.closesAt && open ? ` · proposals close ${new Date(settings.closesAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}` : ''}
      </p>
      {settings.intro && <p className="mt-4 text-sm leading-relaxed text-gray-700 dark:text-gray-300 whitespace-pre-line">{settings.intro}</p>}
      {open ? (
        <SpeakForm slug={event.slug} formats={settings.formats} tracks={event.agendaTracks} />
      ) : (
        <p className="mt-6 p-4 rounded-xl border border-gray-200 dark:border-gray-800 text-sm text-gray-700 dark:text-gray-300">The call for speakers is closed.</p>
      )}
    </div>
  );
}
