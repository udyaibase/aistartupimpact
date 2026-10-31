'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  CalendarDays, Search, Eye, Users, Trash2, ExternalLink,
  CheckCircle, XCircle, Loader2, Plus, Pencil, BarChart3,
} from 'lucide-react';
import { getEventsAction, toggleEventStatusAction, deleteEventAction, importScrapedEventsAction } from './actions';
import { Pagination } from '@/components/Pagination';
import EventFetcherModal from '@/components/events/EventFetcherModal';

const PAGE_SIZE = 20;

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

const STATUS_COLORS: Record<string, string> = {
  PUBLISHED: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
  DRAFT: 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400',
  CANCELLED: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',
  COMPLETED: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
};

export default function AdminEventsPage() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'published' | 'draft'>('all');
  const [search, setSearch] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleteTyped, setDeleteTyped] = useState('');
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [fetcherOpen, setFetcherOpen] = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; skipped: number } | null>(null);

  useEffect(() => {
    fetchEvents();
  }, []);

  const fetchEvents = async () => {
    setLoading(true);
    const res = await getEventsAction();
    if (res.success) {
      setEvents((res.data || []) as EventRow[]);
    } else {
      setError(res.error || 'Failed to load');
    }
    setLoading(false);
  };

  const toggleStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED';
    const res = await toggleEventStatusAction(id, newStatus);
    if (res.success) {
      setEvents(prev => prev.map(e => e.id === id ? { ...e, status: newStatus } : e));
    }
  };

  const handleDelete = async (id: string) => {
    const res = await deleteEventAction(id);
    if (res.success) {
      setEvents(prev => prev.filter(e => e.id !== id));
    } else if (res.error) {
      setPermissionError(res.error);
    }
    setDeleteConfirm(null);
    setDeleteTyped('');
  };

  const handleImportEvents = async (fetchedEvents: any[]) => {
    const res = await importScrapedEventsAction(fetchedEvents);
    if (res.success && res.data) {
      setImportResult({ created: res.data.created, skipped: res.data.skipped });
      setFetcherOpen(false);
      fetchEvents();
      setTimeout(() => setImportResult(null), 5000);
    }
  };

  const filtered = events
    .filter(e => {
      if (filter === 'published') return e.status === 'PUBLISHED';
      if (filter === 'draft') return e.status === 'DRAFT';
      return true;
    })
    .filter(e =>
      e.title.toLowerCase().includes(search.toLowerCase()) ||
      (e.organizerName || '').toLowerCase().includes(search.toLowerCase())
    );

  useMemo(() => { setPage(1); }, [filter, search]);

  const totalFiltered = filtered.length;
  const totalPages = Math.ceil(totalFiltered / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const publishedCount = events.filter(e => e.status === 'PUBLISHED').length;
  const draftCount = events.filter(e => e.status === 'DRAFT').length;

  const filterTabs = [
    { label: 'All', value: 'all' as const, count: events.length },
    { label: 'Published', value: 'published' as const, count: publishedCount },
    { label: 'Draft', value: 'draft' as const, count: draftCount },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-sora font-extrabold text-2xl text-navy dark:text-white flex items-center gap-2">
            <CalendarDays className="w-6 h-6 text-brand" /> Events
          </h1>
          <p className="text-gray-400 dark:text-gray-500 text-sm font-jakarta mt-1">
            {events.length} total events &bull; {publishedCount} published
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/events/subscribers"
            className="inline-flex items-center gap-2 px-4 py-2.5 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 text-sm font-semibold rounded-xl hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
          >
            <BarChart3 className="w-4 h-4" /> Subscribers
          </Link>
          <button
            onClick={() => setFetcherOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 border border-brand text-brand bg-white dark:bg-gray-900 text-sm font-semibold rounded-xl hover:bg-brand/5 transition-colors"
          >
            <Search className="w-4 h-4" /> Auto-Fetch
          </button>
          <Link
            href="/events/create"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-brand hover:bg-brand/90 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            <Plus className="w-4 h-4" /> Create Event
          </Link>
        </div>
      </div>

      {/* Import Result Banner */}
      {importResult && (
        <div className="px-4 py-3 bg-green-50 dark:bg-green-900/20 text-sm text-green-700 dark:text-green-400 font-jakarta border border-green-200 dark:border-green-800 rounded-xl flex items-center gap-2">
          <CheckCircle className="w-4 h-4" />
          Imported {importResult.created} event{importResult.created !== 1 ? 's' : ''} as drafts
          {importResult.skipped > 0 && ` (${importResult.skipped} skipped as duplicates)`}
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
        {filterTabs.map(tab => (
          <button
            key={tab.value}
            onClick={() => setFilter(tab.value)}
            className={`px-4 py-2 rounded-md text-sm font-jakarta font-medium whitespace-nowrap transition-all ${
              tab.value === filter
                ? 'bg-white dark:bg-gray-700 text-navy dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-navy dark:hover:text-white'
            }`}
          >
            {tab.label}
            <span className="ml-1.5 text-xs text-gray-400 dark:text-gray-500">{tab.count}</span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search by event title or organizer..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input-field pl-10"
        />
      </div>

      {/* Error */}
      {error && (
        <div className="px-6 py-3 bg-red-50 dark:bg-red-900/20 text-sm text-red-600 dark:text-red-400 font-jakarta border border-red-100 dark:border-red-800 rounded-xl">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800/50 text-left">
              <th className="px-6 py-3 font-jakarta font-semibold text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Event</th>
              <th className="px-6 py-3 font-jakarta font-semibold text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide hidden md:table-cell">Organizer</th>
              <th className="px-6 py-3 font-jakarta font-semibold text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide hidden lg:table-cell">Date</th>
              <th className="px-6 py-3 font-jakarta font-semibold text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide hidden sm:table-cell">Regs</th>
              <th className="px-6 py-3 font-jakarta font-semibold text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Status</th>
              <th className="px-6 py-3 w-24"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-6 py-12 text-center"><Loader2 className="w-6 h-6 animate-spin text-brand mx-auto" /></td></tr>
            ) : paginated.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center">
                  <CalendarDays className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                  <p className="text-sm text-gray-400 font-jakarta">No events {filter !== 'all' ? `(${filter})` : ''} found</p>
                </td>
              </tr>
            ) : paginated.map((event) => (
              <tr key={event.id} className="border-t border-gray-50 dark:border-gray-800 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                <td className="px-6 py-4">
                  <div>
                    <h4 className="font-sora font-semibold text-sm text-navy dark:text-white line-clamp-1">{event.title}</h4>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded font-jakarta bg-gray-100 dark:bg-gray-800 text-gray-500">
                        {event.category.replace(/_/g, ' ')}
                      </span>
                      <span className="text-xs text-gray-400 font-jakarta">{event.format.replace(/_/g, ' ')}</span>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 hidden md:table-cell">
                  <p className="text-sm text-gray-600 dark:text-gray-400 font-jakarta">{event.organizerName || '—'}</p>
                  <p className="text-[10px] text-gray-400">{event.organizerEmail || ''}</p>
                </td>
                <td className="px-6 py-4 hidden lg:table-cell">
                  <p className="text-xs text-gray-600 dark:text-gray-400 font-jakarta">
                    {new Date(event.startAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                  <p className="text-[10px] text-gray-400">
                    {new Date(event.startAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </td>
                <td className="px-6 py-4 hidden sm:table-cell">
                  <span className="text-sm text-gray-600 dark:text-gray-400 font-jakarta font-medium flex items-center gap-1">
                    <Users className="w-3 h-3" />{event.registrationCount || 0}
                    {event.capacity ? <span className="text-[10px] text-gray-400">/{event.capacity}</span> : null}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <button
                    onClick={() => toggleStatus(event.id, event.status)}
                    disabled={event.status === 'CANCELLED' || event.status === 'COMPLETED'}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold cursor-pointer transition-colors ${
                      STATUS_COLORS[event.status] || STATUS_COLORS.DRAFT
                    } ${event.status === 'CANCELLED' || event.status === 'COMPLETED' ? 'cursor-default' : 'hover:opacity-80'}`}
                    title={
                      event.status === 'PUBLISHED' ? 'Click to unpublish (draft)'
                        : event.status === 'DRAFT' ? 'Click to publish'
                        : event.status
                    }
                  >
                    {event.status === 'PUBLISHED' ? <><CheckCircle className="w-3 h-3" /> Published</> :
                     event.status === 'DRAFT' ? <><XCircle className="w-3 h-3" /> Draft</> :
                     event.status.replace(/_/g, ' ')}
                  </button>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-1">
                    <Link href={`/events/${event.id}`}
                      className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800" title="Dashboard">
                      <BarChart3 className="w-3.5 h-3.5 text-gray-400" />
                    </Link>
                    <Link href={`/events/${event.id}`}
                      className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800" title="Edit">
                      <Pencil className="w-3.5 h-3.5 text-gray-400" />
                    </Link>
                    <a href={`https://udyaibase.com/events/${event.slug}`} target="_blank" rel="noopener noreferrer"
                      className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800" title="View on site">
                      <ExternalLink className="w-3.5 h-3.5 text-gray-400" />
                    </a>
                    <button onClick={() => setDeleteConfirm(event.id)}
                      className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20">
                      <Trash2 className="w-3.5 h-3.5 text-gray-400 hover:text-red-500" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pagination
          page={page}
          totalPages={totalPages}
          total={totalFiltered}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
        />
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-sm shadow-2xl border border-gray-200 dark:border-gray-800 p-6 text-center">
            <Trash2 className="w-10 h-10 text-red-500 mx-auto mb-3" />
            <h3 className="font-sora font-bold text-lg text-navy dark:text-white">Delete Event?</h3>
            <p className="text-sm text-gray-500 font-jakarta mt-2">This action is permanent and cannot be undone.</p>
            <p className="text-xs text-gray-400 font-jakarta mt-3">Type <span className="font-bold text-red-500">DELETE</span> to confirm:</p>
            <input
              type="text"
              value={deleteTyped}
              onChange={(e) => setDeleteTyped(e.target.value)}
              placeholder="Type DELETE"
              className="w-full mt-2 px-4 py-2 text-center text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500 focus:border-transparent font-mono tracking-widest"
              autoFocus
            />
            <div className="flex gap-3 mt-4">
              <button onClick={() => { setDeleteConfirm(null); setDeleteTyped(''); }}
                className="flex-1 px-4 py-2.5 text-sm font-medium border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300">
                Cancel
              </button>
              <button onClick={() => handleDelete(deleteConfirm)} disabled={deleteTyped !== 'DELETE'}
                className="flex-1 px-4 py-2.5 text-sm font-medium bg-red-500 hover:bg-red-600 text-white rounded-xl disabled:opacity-40 disabled:cursor-not-allowed transition-opacity">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Event Fetcher Modal */}
      <EventFetcherModal
        isOpen={fetcherOpen}
        onClose={() => setFetcherOpen(false)}
        onImport={handleImportEvents}
      />

      {/* Permission Denied Modal */}
      {permissionError && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-sm shadow-2xl border border-gray-200 dark:border-gray-800 p-6 text-center">
            <div className="w-14 h-14 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
            </div>
            <h3 className="font-sora font-bold text-lg text-navy dark:text-white">Permission Denied</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 font-jakarta mt-2 leading-relaxed">{permissionError}</p>
            <button onClick={() => setPermissionError(null)}
              className="mt-5 w-full px-4 py-2.5 text-sm font-medium bg-gray-900 dark:bg-white hover:bg-gray-800 dark:hover:bg-gray-100 text-white dark:text-gray-900 rounded-xl transition-colors">
              Understood
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
