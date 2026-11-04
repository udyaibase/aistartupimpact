import Link from 'next/link';
import { CalendarDays, ExternalLink, MapPin, Plus, Users, Video } from 'lucide-react';
import { prisma } from '@udyaibase/database';
import { requireFounderAuth } from '@/lib/founder-auth';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Events' };

const CARD = 'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-[14px]';
const STATUS: Record<string, { label: string; tone: string }> = {
  DRAFT: { label: 'Draft', tone: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
  PENDING_REVIEW: { label: 'In review', tone: 'bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300' },
  PUBLISHED: { label: 'Live', tone: 'bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-300' },
  POSTPONED: { label: 'Postponed', tone: 'bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300' },
  CANCELLED: { label: 'Cancelled', tone: 'bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-300' },
  COMPLETED: { label: 'Finished', tone: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
  ARCHIVED: { label: 'Archived', tone: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
};
const when = (d: Date) => d.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });

/**
 * Events are created and managed in the host portal; this page shows the founder's at a glance and links there.
 * Lists events they host (same email as their host account, any status) and public, published events that others
 * tagged with one of their startups (no private numbers for those).
 */
export default async function FounderEventsPage() {
  const session = await requireFounderAuth();
  const email = session.email.toLowerCase();
  const startups = await prisma.startup.findMany({ where: { ownerId: session.userId, deletedAt: null }, select: { id: true, name: true } });
  const startupName = new Map(startups.map((s) => [s.id, s.name]));

  const rows = await prisma.event.findMany({
    where: {
      deletedAt: null,
      OR: [
        { organizer: { email } },
        { startupId: { in: startups.map((s) => s.id) }, status: { in: ['PUBLISHED', 'COMPLETED'] }, visibility: 'PUBLIC' },
      ],
    },
    orderBy: { startAt: 'desc' },
    take: 100,
    select: {
      id: true, slug: true, title: true, status: true, format: true, startAt: true, endAt: true, venueName: true,
      registrationCount: true, startupId: true, organizer: { select: { email: true } },
    },
  });

  const now = Date.now();
  const events = rows.map((e) => ({ ...e, mine: e.organizer.email.toLowerCase() === email }));
  const upcoming = events.filter((e) => e.endAt.getTime() >= now && !['CANCELLED', 'ARCHIVED', 'COMPLETED'].includes(e.status)).reverse();
  const past = events.filter((e) => !upcoming.includes(e));

  const row = (e: (typeof events)[number]) => {
    const s = STATUS[e.status] ?? { label: e.status, tone: STATUS.DRAFT.tone };
    const online = e.format === 'VIRTUAL';
    const tagged = e.startupId ? startupName.get(e.startupId) : null;
    return (
      <li key={e.id} className="px-4 sm:px-5 py-3.5 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[15px] font-semibold text-gray-900 dark:text-white">{e.title}</span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${s.tone}`}>{s.label}</span>
          </div>
          <p className="text-[13px] text-gray-600 dark:text-gray-400 mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
            <span>{when(e.startAt)}</span>
            <span className="inline-flex items-center gap-1">
              {online ? <Video className="w-3.5 h-3.5" aria-hidden /> : <MapPin className="w-3.5 h-3.5" aria-hidden />}
              {online ? 'Online' : e.venueName || 'In person'}
            </span>
            {e.mine && <span className="inline-flex items-center gap-1"><Users className="w-3.5 h-3.5" aria-hidden />{e.registrationCount.toLocaleString('en-IN')} registered</span>}
            {tagged && <span>{tagged}</span>}
            {!e.mine && <span>Hosted by someone else</span>}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {['PUBLISHED', 'COMPLETED'].includes(e.status) && (
            <a href={`/events/${e.slug}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:text-brand">
              View <ExternalLink className="w-3.5 h-3.5" aria-hidden />
            </a>
          )}
          {e.mine && <Link href={`/organizer/events/${e.id}`} className="text-sm font-semibold text-brand hover:underline">Manage</Link>}
        </div>
      </li>
    );
  };

  const section = (id: string, title: string, items: typeof events) => (
    <section aria-labelledby={id} className={CARD}>
      <h2 id={id} className="portal-section-title px-4 sm:px-5 pt-4 pb-3">{title}</h2>
      <ul className="divide-y divide-gray-100 dark:divide-gray-800 border-t border-gray-100 dark:border-gray-800">
        {items.map(row)}
      </ul>
    </section>
  );

  return (
    <div className="space-y-6 font-jakarta">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="portal-title">Events</h1>
          <p className="portal-subtitle">Host demo days, launches and meetups. Events are created and managed in the events workspace.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 shrink-0">
          <Link href="/organizer" className="inline-flex items-center justify-center min-h-[44px] sm:min-h-0 px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 text-sm font-semibold text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800">
            Open events workspace
          </Link>
          <Link href="/organizer/events/create" className="btn-brand gap-2"><Plus className="w-4 h-4" aria-hidden /> Create an event</Link>
        </div>
      </div>

      {events.length === 0 ? (
        <div className={`${CARD} px-4 py-10 text-center`}>
          <span className="w-12 h-12 rounded-[12px] bg-gray-100 dark:bg-gray-800 text-gray-500 flex items-center justify-center mx-auto mb-3" aria-hidden><CalendarDays className="w-6 h-6" /></span>
          <p className="text-[15px] font-semibold text-gray-900 dark:text-white">No events yet</p>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 max-w-md mx-auto">
            Create your first event in the events workspace. Use the same email as this account and tag your startup, and it will appear here and on your startup profile.
          </p>
          <Link href="/organizer/events/create" className="btn-brand gap-2 mt-4"><Plus className="w-4 h-4" aria-hidden /> Create an event</Link>
        </div>
      ) : (
        <>
          {upcoming.length > 0 && section('upcoming-title', 'Upcoming', upcoming)}
          {past.length > 0 && section('past-title', 'Past', past)}
        </>
      )}
    </div>
  );
}
