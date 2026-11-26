'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { BarChart3, ExternalLink, Plus, Search, Trash2 } from 'lucide-react';
import { getEventsAction, toggleEventStatusAction, deleteEventAction, importScrapedEventsAction } from './actions';
import DataTable, { type Column, type TableFilter } from '@/components/ui/DataTable';
import EventFetcherModal from '@/components/events/EventFetcherModal';
import { ask } from '@/components/Ask';
import { notify } from '@/components/Toast';

interface EventRow {
  id: string;
  title: string;
  slug: string;
  status: string;
  category: string;
  format: string;
  startAt: string;
  endAt: string;
  registrationCount: number;
  capacity: number | null;
  coverImageUrl: string | null;
  createdAt: string;
  organizerName: string;
  organizerEmail: string;
}

const STATUS_STYLE: Record<string, string> = {
  PUBLISHED: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300',
  CANCELLED: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300',
  COMPLETED: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300',
};
const NEUTRAL = 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300';
const words = (v: string | null | undefined) => (v ? v.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) : '–');
const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://udyaibase.com').replace(/\/$/, '');

export default function AdminEventsPage() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetcherOpen, setFetcherOpen] = useState(false);

  const fetchEvents = useCallback(async () => {
    const res = await getEventsAction();
    if (res.success) setEvents((res.data || []) as EventRow[]);
    else notify(res.error || "Couldn't load events. Refresh to try again.", 'error');
    setLoading(false);
  }, []);
  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  const toggleStatus = async (e: EventRow) => {
    const next = e.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED';
    const res = await toggleEventStatusAction(e.id, next);
    if (res.success) { setEvents((prev) => prev.map((x) => (x.id === e.id ? { ...x, status: next } : x))); notify(next === 'PUBLISHED' ? `“${e.title}” is published.` : `“${e.title}” is back in draft.`, 'success'); }
    else notify(res.error || "Couldn't change the event. Try again.", 'error');
  };

  const remove = async (e: EventRow) => {
    const regs = e.registrationCount || 0;
    if (!(await ask({ title: 'Delete event', message: `Delete “${e.title}”?${regs ? ` It has ${regs} registration${regs === 1 ? '' : 's'}.` : ''} This can’t be undone.`, confirmLabel: 'Delete', danger: true }))) return;
    const res = await deleteEventAction(e.id);
    if (res.success) { setEvents((prev) => prev.filter((x) => x.id !== e.id)); notify('Event deleted.', 'success'); }
    else notify(res.error || "Couldn't delete the event. Try again.", 'error');
  };

  const handleImportEvents = async (fetchedEvents: any[]) => {
    const res = await importScrapedEventsAction(fetchedEvents);
    if (res.success && res.data) {
      setFetcherOpen(false);
      notify(`Imported ${res.data.created} event${res.data.created === 1 ? '' : 's'} as drafts${res.data.skipped > 0 ? `, ${res.data.skipped} skipped as duplicates` : ''}.`, 'success');
      fetchEvents();
    } else notify((res as { error?: string }).error || "Couldn't import the events. Try again.", 'error');
  };

  const columns = useMemo<Column<EventRow>[]>(() => [
    {
      key: 'event', header: 'Event', sortValue: (e) => e.title, searchValue: (e) => `${e.title} ${e.organizerName ?? ''} ${e.organizerEmail ?? ''}`,
      cell: (e) => (
        <div className="min-w-[180px] max-w-xs">
          <Link href={`/events/${e.id}`} className="font-semibold text-gray-900 dark:text-white hover:underline line-clamp-1">{e.title}</Link>
          <p className="text-xs text-gray-600 dark:text-gray-400 truncate">{words(e.category)} · {words(e.format)}</p>
        </div>
      ),
    },
    {
      key: 'organizer', header: 'Organizer', sortValue: (e) => e.organizerName,
      cell: (e) => <><span>{e.organizerName || '–'}</span>{e.organizerEmail && <span className="block text-xs text-gray-600 dark:text-gray-400">{e.organizerEmail}</span>}</>,
    },
    {
      key: 'date', header: 'Starts', sortValue: (e) => new Date(e.startAt),
      cell: (e) => (
        <span className="whitespace-nowrap">{new Date(e.startAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })}
          <span className="block text-xs text-gray-600 dark:text-gray-400">{new Date(e.startAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })} IST</span>
        </span>
      ),
    },
    {
      key: 'registrations', header: 'Registrations', align: 'right', sortValue: (e) => e.registrationCount || 0,
      cell: (e) => <span className="tabular-nums">{(e.registrationCount || 0).toLocaleString('en-IN')}{e.capacity ? <span className="text-xs text-gray-600 dark:text-gray-400"> of {e.capacity.toLocaleString('en-IN')}</span> : null}</span>,
    },
    {
      key: 'status', header: 'Status', sortValue: (e) => e.status,
      cell: (e) => <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${STATUS_STYLE[e.status] ?? NEUTRAL}`}>{words(e.status)}</span>,
    },
    {
      key: 'actions', header: 'Actions', align: 'right',
      cell: (e) => (
        <div className="flex items-center justify-end gap-1">
          {(e.status === 'PUBLISHED' || e.status === 'DRAFT') && (
            <button onClick={() => toggleStatus(e)} className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 whitespace-nowrap"
              aria-label={`${e.status === 'PUBLISHED' ? 'Unpublish' : 'Publish'} ${e.title}`}>{e.status === 'PUBLISHED' ? 'Unpublish' : 'Publish'}</button>
          )}
          <Link href={`/events/${e.id}`} aria-label={`Open the dashboard for ${e.title}`} title="Dashboard and edit" className="p-1.5 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"><BarChart3 className="w-4 h-4" aria-hidden /></Link>
          <a href={`${SITE}/events/${e.slug}`} target="_blank" rel="noopener noreferrer" aria-label={`View ${e.title} on the site (new tab)`} title="View on site" className="p-1.5 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"><ExternalLink className="w-4 h-4" aria-hidden /></a>
          <button onClick={() => remove(e)} aria-label={`Delete ${e.title}`} title="Delete" className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"><Trash2 className="w-4 h-4" aria-hidden /></button>
        </div>
      ),
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps -- cells call the latest handlers
  ], []);

  const filters = useMemo<TableFilter<EventRow>[]>(() => {
    const unique = (pick: (e: EventRow) => string) => [...new Set(events.map(pick).filter(Boolean))].sort().map((v) => ({ value: v, label: words(v) }));
    return [
      { key: 'status', label: 'Status', options: unique((e) => e.status), matches: (e, v) => e.status === v },
      { key: 'category', label: 'Category', options: unique((e) => e.category), matches: (e, v) => e.category === v },
      { key: 'format', label: 'Format', options: unique((e) => e.format), matches: (e, v) => e.format === v },
      { key: 'when', label: 'When', options: [{ value: 'upcoming', label: 'Upcoming' }, { value: 'past', label: 'Past' }], matches: (e, v) => (new Date(e.startAt).getTime() >= Date.now()) === (v === 'upcoming') },
    ];
  }, [events]);

  const published = events.filter((e) => e.status === 'PUBLISHED').length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="portal-title">Events</h1>
          <p className="portal-subtitle">{events.length.toLocaleString('en-IN')} events, {published.toLocaleString('en-IN')} published.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/events/subscribers" className="btn-outline text-sm gap-2"><BarChart3 className="w-4 h-4" aria-hidden /> Subscribers</Link>
          <button onClick={() => setFetcherOpen(true)} className="btn-outline text-sm gap-2"><Search className="w-4 h-4" aria-hidden /> Find events to import</button>
          <Link href="/events/create" className="btn-brand text-sm gap-2"><Plus className="w-4 h-4" aria-hidden /> Create event</Link>
        </div>
      </div>

      <DataTable
        tableId="events"
        noun="events"
        rows={events}
        rowKey={(e) => e.id}
        columns={columns}
        filters={filters}
        loading={loading}
        pageSize={20}
        searchPlaceholder="Search event or organizer"
        empty={{ title: 'No events yet', description: 'Events created by hosts, or by you with Create event, appear here.' }}
      />

      <EventFetcherModal
        isOpen={fetcherOpen}
        onClose={() => setFetcherOpen(false)}
        onImport={handleImportEvents}
      />
    </div>
  );
}
