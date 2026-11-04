'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { HelpCircle, Plus, X, Loader2, MessageSquare, Clock, AlertTriangle, CheckCircle2, ChevronRight } from 'lucide-react';

interface Ticket {
  id: string;
  ticketNumber: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  _count: { messages: number };
}

interface SupportTicketListProps {
  apiBasePath: string;
  portalPath: string;
}

const STATUS_TABS = ['ALL', 'OPEN', 'IN_PROGRESS', 'AWAITING_USER', 'RESOLVED', 'CLOSED'];
const STATUS_LABELS: Record<string, string> = { ALL: 'All', OPEN: 'Open', IN_PROGRESS: 'In Progress', AWAITING_USER: 'Awaiting Reply', RESOLVED: 'Resolved', CLOSED: 'Closed' };
const STATUS_COLORS: Record<string, string> = {
  OPEN: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  AWAITING_USER: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  RESOLVED: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  CLOSED: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
};
const PRIORITY_COLORS: Record<string, string> = {
  LOW: 'text-gray-500',
  MEDIUM: 'text-blue-500',
  HIGH: 'text-orange-500',
  URGENT: 'text-red-500',
};
const CATEGORIES = ['ACCOUNT', 'BILLING', 'BUG_REPORT', 'FEATURE_REQUEST', 'LISTING', 'EVENT', 'JOB_BOARD', 'OTHER'];
const CATEGORY_LABELS: Record<string, string> = { ACCOUNT: 'Account', BILLING: 'Billing', BUG_REPORT: 'Bug Report', FEATURE_REQUEST: 'Feature Request', LISTING: 'Listing', EVENT: 'Event', JOB_BOARD: 'Job Board', OTHER: 'Other' };

export default function SupportTicketList({ apiBasePath, portalPath }: SupportTicketListProps) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [showNew, setShowNew] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ subject: '', description: '', category: 'OTHER', priority: 'MEDIUM' });

  const fetchTickets = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      const res = await fetch(`${apiBasePath}?${params}`);
      const data = await res.json();
      if (data.success) {
        setTickets(data.tickets);
        setTotalPages(data.totalPages);
        setTotalCount(data.totalCount);
      }
    } catch { setError('Failed to load tickets'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchTickets(); }, [statusFilter, page]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.subject.trim() || !form.description.trim()) { setError('Subject and description are required'); return; }
    setCreating(true); setError('');
    try {
      const res = await fetch(apiBasePath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok || !data.success) { setError(data.error || 'Failed to create ticket'); return; }
      setShowNew(false);
      setForm({ subject: '', description: '', category: 'OTHER', priority: 'MEDIUM' });
      setStatusFilter('ALL');
      setPage(1);
      fetchTickets();
    } catch { setError('Failed to create ticket'); }
    finally { setCreating(false); }
  };

  const timeAgo = (date: string) => {
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Support</h1>
          <p className="text-sm text-gray-500 mt-0.5">Get help or report an issue</p>
        </div>
        <button onClick={() => setShowNew(true)} className="flex items-center gap-2 px-4 py-2 bg-brand text-white text-sm font-semibold rounded-lg hover:opacity-90 transition-opacity">
          <Plus className="w-4 h-4" /> New Ticket
        </button>
      </div>

      {error && (
        <div className="p-3 text-sm bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800 rounded-lg flex items-center justify-between">
          {error}
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-600" aria-label="Dismiss error"><X className="w-4 h-4" /></button>
        </div>
      )}

      <div className="flex gap-1 overflow-x-auto border-b border-gray-200 dark:border-gray-800">
        {STATUS_TABS.map((s) => (
          <button key={s} onClick={() => { setStatusFilter(s); setPage(1); }} className={`px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors relative ${statusFilter === s ? 'text-brand' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}>
            {STATUS_LABELS[s]}
            {statusFilter === s && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand rounded-t" />}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
      ) : tickets.length === 0 ? (
        <div className="text-center py-12">
          <HelpCircle className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-[15px] font-semibold text-gray-900 dark:text-white">No tickets here</p>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Stuck on something? Tell us what’s going on and we’ll get back to you.</p>
          <button onClick={() => setShowNew(true)} className="text-sm text-brand font-medium mt-2 hover:underline">Raise a ticket</button>
        </div>
      ) : (
        <div className="space-y-2">
          {tickets.map((t) => (
            <Link key={t.id} href={`${portalPath}/support/${t.id}`} className="block p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl hover:border-gray-300 dark:hover:border-gray-700 transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono text-gray-400">{t.ticketNumber}</span>
                    <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${STATUS_COLORS[t.status]}`}>{STATUS_LABELS[t.status] || t.status}</span>
                    <span className={`text-xs font-medium ${PRIORITY_COLORS[t.priority]}`}>{t.priority}</span>
                  </div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{t.subject}</p>
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-400">
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{timeAgo(t.createdAt)}</span>
                    <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" />{t._count.messages} replies</span>
                    <span>{CATEGORY_LABELS[t.category] || t.category}</span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400 shrink-0 mt-1" />
              </div>
            </Link>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-gray-500">{totalCount} ticket{totalCount !== 1 ? 's' : ''}</p>
          <div className="flex gap-1">
            {Array.from({ length: totalPages }, (_, i) => (
              <button key={i} onClick={() => setPage(i + 1)} className={`px-2.5 py-1 text-xs rounded-md ${page === i + 1 ? 'bg-brand text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>
                {i + 1}
              </button>
            ))}
          </div>
        </div>
      )}

      {showNew && (
        <div className="fixed inset-0 z-modal flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="relative bg-white dark:bg-gray-900 rounded-2xl p-6 max-w-lg w-full shadow-2xl border border-gray-200 dark:border-gray-800">
            <button onClick={() => setShowNew(false)} className="absolute top-3 right-3 p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800" aria-label="Close">
              <X className="w-5 h-5" />
            </button>
            <div className="mb-5">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">New Support Ticket</h2>
              <p className="text-sm text-gray-500 mt-0.5">Describe your issue and we'll get back to you</p>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Subject</label>
                <input type="text" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Brief summary of your issue" className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand/20 focus:border-brand" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Category</label>
                  <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white">
                    {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Priority</label>
                  <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white">
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="URGENT">Urgent</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Description</label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Provide details about your issue..." rows={5} className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none focus:ring-2 focus:ring-brand/20 focus:border-brand" required />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="submit" disabled={creating} className="flex-1 py-2.5 bg-brand text-white text-sm font-semibold rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity">
                  {creating ? 'Submitting...' : 'Submit Ticket'}
                </button>
                <button type="button" onClick={() => setShowNew(false)} className="px-4 py-2.5 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
