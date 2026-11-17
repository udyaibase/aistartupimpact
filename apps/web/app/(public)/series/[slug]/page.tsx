import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { CalendarDays, MapPin } from 'lucide-react';
import { prisma } from '@udyaibase/database';
import { utcToZoned } from '@/lib/events/zoned-time';
import FollowSeries from './FollowSeries';

export const revalidate = 300;

const getSeries = cache(async (slug: string) => {
  const s = await prisma.eventSeries.findUnique({
    where: { slug },
    select: { id: true, slug: true, name: true, description: true, coverImageUrl: true, organizer: { select: { name: true, company: true } } },
  });
  if (!s) return null;
  const now = new Date();
  const base = { seriesId: s.id, deletedAt: null, status: 'PUBLISHED' as const, visibility: 'PUBLIC' as const };
  const select = { id: true, slug: true, title: true, startAt: true, timezone: true, format: true, venueName: true, coverImageUrl: true, registrationCount: true };
  const [upcoming, past] = await Promise.all([
    prisma.event.findMany({ where: { ...base, endAt: { gte: now } }, orderBy: { startAt: 'asc' }, take: 12, select }),
    prisma.event.findMany({ where: { ...base, endAt: { lt: now } }, orderBy: { startAt: 'desc' }, take: 24, select }),
  ]);
  return { ...s, upcoming, past };
});

export async function generateMetadata(props: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await props.params;
  const s = await getSeries(slug);
  if (!s) return { title: 'Series not found' };
  const host = s.organizer.company || s.organizer.name;
  return {
    title: `${s.name} event series`,
    description: (s.description || `Every ${s.name} event by ${host}, upcoming and past.`).slice(0, 160),
    alternates: { canonical: `/series/${s.slug}` },
    robots: s.upcoming.length + s.past.length ? undefined : { index: false, follow: true },
  };
}

type Row = { id: string; slug: string; title: string; startAt: Date; timezone: string; format: string; venueName: string | null; coverImageUrl: string | null };

function when(e: Row) {
  const { date, time } = utcToZoned(e.startAt, e.timezone);
  const d = new Date(`${date}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  return time ? `${d}, ${time}` : d;
}

function EventRow({ e, muted }: { e: Row; muted?: boolean }) {
  return (
    <li>
      <Link href={`/events/${e.slug}`} className="flex gap-4 p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors">
        <div className="w-24 h-16 sm:w-32 sm:h-20 shrink-0 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {e.coverImageUrl && <img src={e.coverImageUrl} alt="" loading="lazy" className={`w-full h-full object-cover ${muted ? 'opacity-80' : ''}`} />}
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-gray-900 dark:text-white line-clamp-2">{e.title}</p>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 flex items-center gap-1.5"><CalendarDays className="w-3.5 h-3.5" aria-hidden /> {when(e)}</p>
          <p className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" aria-hidden /> {e.format === 'VIRTUAL' ? 'Online' : e.venueName || 'Venue to be announced'}</p>
        </div>
      </Link>
    </li>
  );
}

export default async function SeriesPage(props: { params: Promise<{ slug: string }>; searchParams: Promise<{ following?: string }> }) {
  const [{ slug }, { following }] = await Promise.all([props.params, props.searchParams]);
  const s = await getSeries(slug);
  if (!s) notFound();
  const host = s.organizer.company || s.organizer.name;

  return (
    <div className="max-w-3xl mx-auto px-4 py-10 font-jakarta">
      {following === '1' && (
        <p role="status" className="mb-6 p-3 rounded-xl border border-green-200 dark:border-green-900/40 bg-green-50 dark:bg-green-900/20 text-sm text-green-800 dark:text-green-300">
          You’re following {s.name}. We’ll email you when the next event opens.
        </p>
      )}
      {s.coverImageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={s.coverImageUrl} alt="" className="w-full aspect-[3/1] object-cover rounded-2xl mb-6" />
      )}
      <p className="text-sm font-semibold text-gray-500">Event series by {host}</p>
      <h1 className="mt-1 font-sora font-bold text-2xl sm:text-3xl text-navy dark:text-white">{s.name}</h1>
      {s.description && <p className="mt-3 text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-line">{s.description}</p>}
      <p className="mt-3 text-sm text-gray-500">{s.upcoming.length + s.past.length} {s.upcoming.length + s.past.length === 1 ? 'event' : 'events'} so far</p>

      <div className="mt-6 p-4 sm:p-5 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <FollowSeries slug={s.slug} name={s.name} />
      </div>

      <section className="mt-10" aria-labelledby="upcoming">
        <h2 id="upcoming" className="font-sora font-bold text-lg text-navy dark:text-white mb-2">Upcoming</h2>
        {s.upcoming.length ? <ul className="-mx-3">{s.upcoming.map((e) => <EventRow key={e.id} e={e} />)}</ul>
          : <p className="text-sm text-gray-600 dark:text-gray-400">Nothing scheduled right now. Follow to hear when the next one opens.</p>}
      </section>

      {s.past.length > 0 && (
        <section className="mt-10" aria-labelledby="past">
          <h2 id="past" className="font-sora font-bold text-lg text-navy dark:text-white mb-2">Past events</h2>
          <ul className="-mx-3">{s.past.map((e) => <EventRow key={e.id} e={e} muted />)}</ul>
        </section>
      )}
    </div>
  );
}
