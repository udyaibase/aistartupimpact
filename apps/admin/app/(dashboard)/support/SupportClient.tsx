"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { LifeBuoy, Search, Loader2, MessageSquare, Clock, ChevronRight, AlertCircle, CheckCircle2, Timer, CircleDot } from "lucide-react";

interface Ticket {
  id: string;
  ticketNumber: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  portal: string;
  submitterName: string;
  submitterEmail: string;
  submitterType: string;
  assignedTo: string | null;
  createdAt: string;
  updatedAt: string;
  replyDueAt: string | null;
  firstReplyAt: string | null;
  planAtOpen: string | null;
  _count: { messages: number };
}

/** The first-reply promise: replied, or due / overdue (wall-clock hours; the promise itself counts working hours). */
function replyDue(t: Ticket): { text: string; cls: string } {
  if (t.firstReplyAt) return { text: 'Replied', cls: 'text-gray-400' };
  if (!t.replyDueAt || ['RESOLVED', 'CLOSED'].includes(t.status)) return { text: '—', cls: 'text-gray-400' };
  const h = (new Date(t.replyDueAt).getTime() - Date.now()) / 36e5;
  const span = Math.abs(h) < 1 ? `${Math.max(1, Math.round(Math.abs(h) * 60))} min` : Math.abs(h) < 48 ? `${Math.round(Math.abs(h))} h` : `${Math.round(Math.abs(h) / 24)} days`;
  return h < 0 ? { text: `Overdue ${span}`, cls: 'text-red-600 font-semibold' } : { text: `In ${span}`, cls: h < 2 ? 'text-amber-600 font-semibold' : 'text-gray-600' };
}

interface Stats {
  open: number;
  inProgress: number;
  awaiting: number;
  resolved: number;
  closed: number;
  total: number;
}

const STATUS_TABS = ["ALL", "OPEN", "IN_PROGRESS", "AWAITING_USER", "RESOLVED", "CLOSED"];
const STATUS_LABELS: Record<string, string> = { ALL: "All", OPEN: "Open", IN_PROGRESS: "In Progress", AWAITING_USER: "Awaiting User", RESOLVED: "Resolved", CLOSED: "Closed" };
const STATUS_COLORS: Record<string, string> = {
  OPEN: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  IN_PROGRESS: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  AWAITING_USER: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  RESOLVED: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  CLOSED: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
};
const PRIORITY_COLORS: Record<string, string> = { LOW: "text-gray-500", MEDIUM: "text-blue-600", HIGH: "text-orange-500", URGENT: "text-red-600 font-bold" };
const PORTAL_LABELS: Record<string, string> = { FOUNDER: "Founder", ORGANIZER: "Organizer", EMPLOYER: "Employer", PUBLIC: "Public" };
const PORTAL_COLORS: Record<string, string> = { FOUNDER: "bg-purple-100 text-purple-700", ORGANIZER: "bg-teal-100 text-teal-700", EMPLOYER: "bg-indigo-100 text-indigo-700", PUBLIC: "bg-gray-100 text-gray-700" };

export default function SupportClient() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const fetchStats = async () => {
    try {
      const res = await fetch("/api/admin/support-tickets/stats");
      const data = await res.json();
      if (data.success) setStats(data.stats);
    } catch {}
  };

  const fetchTickets = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "50" });
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (search) params.set("search", search);
      const res = await fetch(`/api/admin/support-tickets?${params}`);
      const data = await res.json();
      if (data.success) {
        setTickets(data.tickets);
        setTotalPages(data.totalPages);
        setTotalCount(data.totalCount);
      }
    } catch {}
    finally { setLoading(false); }
  };

  useEffect(() => { fetchStats(); }, []);
  useEffect(() => { fetchTickets(); }, [statusFilter, page, search]);

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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <LifeBuoy className="w-6 h-6 text-brand" /> Support Tickets
        </h1>
        <p className="text-sm text-gray-500 mt-1">Manage user support requests across all portals</p>
      </div>

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: "Open", value: stats.open, icon: CircleDot, color: "text-blue-600" },
            { label: "In Progress", value: stats.inProgress, icon: Timer, color: "text-yellow-600" },
            { label: "Awaiting User", value: stats.awaiting, icon: AlertCircle, color: "text-orange-600" },
            { label: "Resolved", value: stats.resolved, icon: CheckCircle2, color: "text-green-600" },
            { label: "Total", value: stats.total, icon: MessageSquare, color: "text-gray-600" },
          ].map((s) => (
            <div key={s.label} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-500 font-medium">{s.label}</span>
                <s.icon className={`w-4 h-4 ${s.color}`} />
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{s.value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex gap-1 overflow-x-auto">
          {STATUS_TABS.map((s) => (
            <button key={s} onClick={() => { setStatusFilter(s); setPage(1); }} className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${statusFilter === s ? "bg-brand text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"}`}>
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search tickets..."
            className="pl-9 pr-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white w-60"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
      ) : tickets.length === 0 ? (
        <div className="text-center py-12">
          <LifeBuoy className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">No support tickets found</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Ticket</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Subject</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Submitter</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Portal</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Priority</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Reply due</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Created</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Msgs</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {tickets.map((t) => (
                  <tr key={t.id} className="hover:bg-gray-50 dark:hover:bg-gray-950 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-gray-400">{t.ticketNumber}</td>
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white max-w-[200px] truncate">{t.subject}</td>
                    <td className="px-4 py-3">
                      <p className="text-gray-900 dark:text-white text-xs">{t.submitterName}</p>
                      <p className="text-gray-400 text-[11px]">{t.submitterEmail}</p>
                    </td>
                    <td className="px-4 py-3"><span className={`px-2 py-0.5 text-[10px] font-semibold rounded-full ${PORTAL_COLORS[t.portal]}`}>{PORTAL_LABELS[t.portal]}</span></td>
                    <td className={`px-4 py-3 text-xs font-medium ${PRIORITY_COLORS[t.priority]}`}>{t.priority}</td>
                    <td className="px-4 py-3"><span className={`px-2 py-0.5 text-[10px] font-semibold rounded-full ${STATUS_COLORS[t.status]}`}>{STATUS_LABELS[t.status]}</span></td>
                    <td className={`px-4 py-3 text-xs whitespace-nowrap ${replyDue(t).cls}`}>{replyDue(t).text}{t.planAtOpen ? <span className="block text-[10px] text-gray-400 font-normal">{t.planAtOpen}</span> : null}</td>
                    <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{timeAgo(t.createdAt)}</td>
                    <td className="px-4 py-3 text-xs text-gray-400">{t._count.messages}</td>
                    <td className="px-4 py-3">
                      <Link href={`/support/${t.id}`} className="text-brand hover:underline text-xs font-medium flex items-center gap-1">
                        View <ChevronRight className="w-3 h-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-500">{totalCount} ticket{totalCount !== 1 ? "s" : ""}</p>
          <div className="flex gap-1">
            {Array.from({ length: Math.min(totalPages, 10) }, (_, i) => (
              <button key={i} onClick={() => setPage(i + 1)} className={`px-2.5 py-1 text-xs rounded-md ${page === i + 1 ? "bg-brand text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200"}`}>
                {i + 1}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
