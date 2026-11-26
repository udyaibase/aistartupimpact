'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { Download, Trash2 } from 'lucide-react';
import DataTable, { type Column, type ServerQuery } from '@/components/ui/DataTable';
import { ask } from '@/components/Ask';
import { notify } from '@/components/Toast';
import { getSubscribersAction, deleteSubscriberAction } from './actions';

interface Subscriber {
  id: string;
  email: string;
  name?: string;
  source: string;
  isActive: boolean;
  emailVerified: boolean;
  tags: string[];
  subscribedAt: string;
}

const PAGE_SIZE = 25;
type State = 'Active' | 'Pending' | 'Unsubscribed';
const stateOf = (s: Subscriber): State => (s.isActive && s.emailVerified ? 'Active' : !s.isActive && !s.emailVerified ? 'Pending' : 'Unsubscribed');
const STATE_STYLE: Record<State, string> = {
  Active: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300',
  Pending: 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300',
  Unsubscribed: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300',
};
const csvCell = (v: string) => {
  const safe = /^[=+\-@]/.test(v) ? `'${v}` : v;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export default function SubscribersPage() {
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const lastQuery = useRef<ServerQuery | null>(null);
  const request = useRef(0);

  // The list is searched and paged on the server: it can run to many thousands of addresses.
  const load = useCallback(async (q: ServerQuery) => {
    lastQuery.current = q;
    const mine = ++request.current;
    setLoading(true);
    try {
      const res = await getSubscribersAction(q.page, q.pageSize, q.search.trim());
      if (mine !== request.current) return; // an older answer arriving late
      if (res.success) { setSubscribers(res.data as Subscriber[]); setTotal(res.total); }
      else notify(res.error || "Couldn't load subscribers. Refresh to try again.", 'error');
    } catch {
      if (mine === request.current) notify("Couldn't load subscribers. Check your connection and refresh.", 'error');
    } finally {
      if (mine === request.current) setLoading(false);
    }
  }, []);

  const remove = async (s: Subscriber) => {
    if (!(await ask({ title: 'Delete subscriber', message: `Remove ${s.email} from the newsletter list for good? This can’t be undone.`, confirmLabel: 'Delete', danger: true }))) return;
    const res = await deleteSubscriberAction(s.id);
    if (!res.success) { notify(res.error || "Couldn't delete the subscriber. Try again.", 'error'); return; }
    notify(`${s.email} deleted.`, 'success');
    if (lastQuery.current) load(lastQuery.current);
  };

  const exportCsv = () => {
    const rows = subscribers.map((s) => [s.email, s.name || '', s.source || 'direct', stateOf(s), new Date(s.subscribedAt).toISOString()].map(csvCell).join(','));
    const url = URL.createObjectURL(new Blob([['Email,Name,Source,Status,Date subscribed', ...rows].join('\n')], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `subscribers-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const columns = useMemo<Column<Subscriber>[]>(() => [
    {
      key: 'contact', header: 'Subscriber',
      cell: (s) => <><span className="font-medium text-gray-900 dark:text-white">{s.email}</span>{s.name && <span className="block text-xs text-gray-600 dark:text-gray-400">{s.name}</span>}</>,
    },
    { key: 'source', header: 'Source', cell: (s) => <span className="capitalize">{s.source || 'direct'}</span> },
    { key: 'status', header: 'Status', cell: (s) => <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATE_STYLE[stateOf(s)]}`}>{stateOf(s)}</span> },
    {
      key: 'date', header: 'Subscribed',
      cell: (s) => <span className="whitespace-nowrap">{new Date(s.subscribedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })}</span>,
    },
    {
      key: 'actions', header: 'Actions', align: 'right',
      cell: (s) => (
        <button onClick={() => remove(s)} aria-label={`Delete ${s.email}`} title="Delete" className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">
          <Trash2 className="w-4 h-4" aria-hidden />
        </button>
      ),
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps -- cells call the latest handlers
  ], []);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="portal-title">Subscribers</h1>
          <p className="portal-subtitle">Everyone on the newsletter list{total > 0 ? `: ${total.toLocaleString('en-IN')} matching` : ''}.</p>
        </div>
        <button onClick={exportCsv} disabled={subscribers.length === 0} className="btn-outline text-sm gap-2 disabled:opacity-50">
          <Download className="w-4 h-4" aria-hidden /> Export this page
        </button>
      </div>

      <DataTable
        tableId="subscribers"
        noun="subscribers"
        rows={subscribers}
        rowKey={(s) => s.id}
        columns={columns}
        loading={loading}
        pageSize={PAGE_SIZE}
        server={{ total, onQuery: load }}
        searchPlaceholder="Search email or name"
        empty={{ title: 'No subscribers yet', description: 'People who sign up for the newsletter appear here.' }}
      />
    </div>
  );
}
