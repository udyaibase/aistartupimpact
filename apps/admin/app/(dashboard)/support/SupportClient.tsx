"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, CircleDot, MessageSquare, Search, Timer, X } from "lucide-react";
import DataTable, { type Column, type TableFilter } from "@/components/ui/DataTable";
import { notify } from "@/components/Toast";

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

interface Stats { open: number; inProgress: number; awaiting: number; resolved: number; closed: number; total: number }

/** How many tickets the screen loads at once (the newest). Older ones are reached through "Search all tickets". */
const LOAD_LIMIT = 500;

const awaitingFirstReply = (t: Ticket) => !t.firstReplyAt && !!t.replyDueAt && !["RESOLVED", "CLOSED"].includes(t.status);

/** The first-reply promise: replied, or due / overdue (wall-clock hours; the promise itself counts working hours). */
function replyDue(t: Ticket): { text: string; cls: string } {
  if (t.firstReplyAt) return { text: "Replied", cls: "text-gray-600 dark:text-gray-400" };
  if (!awaitingFirstReply(t)) return { text: "–", cls: "text-gray-600 dark:text-gray-400" };
  const h = (new Date(t.replyDueAt!).getTime() - Date.now()) / 36e5;
  const span = Math.abs(h) < 1 ? `${Math.max(1, Math.round(Math.abs(h) * 60))} min` : Math.abs(h) < 48 ? `${Math.round(Math.abs(h))} h` : `${Math.round(Math.abs(h) / 24)} days`;
  return h < 0
    ? { text: `Overdue ${span}`, cls: "text-red-700 dark:text-red-400 font-semibold" }
    : { text: `In ${span}`, cls: h < 2 ? "text-amber-700 dark:text-amber-400 font-semibold" : "text-gray-700 dark:text-gray-300" };
}

const STATUS_LABELS: Record<string, string> = { OPEN: "Open", IN_PROGRESS: "In progress", AWAITING_USER: "Waiting for user", RESOLVED: "Resolved", CLOSED: "Closed" };
const STATUS_COLORS: Record<string, string> = {
  OPEN: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  IN_PROGRESS: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  AWAITING_USER: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  RESOLVED: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  CLOSED: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};
const PRIORITY_LABELS: Record<string, string> = { LOW: "Low", MEDIUM: "Medium", HIGH: "High", URGENT: "Urgent" };
const PRIORITY_RANK: Record<string, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, URGENT: 3 };
const PRIORITY_COLORS: Record<string, string> = {
  LOW: "text-gray-600 dark:text-gray-400", MEDIUM: "text-blue-700 dark:text-blue-400",
  HIGH: "text-orange-700 dark:text-orange-400", URGENT: "text-red-700 dark:text-red-400 font-semibold",
};
const PORTAL_LABELS: Record<string, string> = { FOUNDER: "Founder", ORGANIZER: "Organizer", EMPLOYER: "Employer", PUBLIC: "Website" };
const optionsOf = (labels: Record<string, string>) => Object.entries(labels).map(([value, label]) => ({ value, label }));

function timeAgo(date: string) {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 60000));
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export default function SupportClient() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  /** Set when the list on screen is the result of a search across every ticket, not the newest ones. */
  const [searchedFor, setSearchedFor] = useState("");
  const [allSearch, setAllSearch] = useState("");

  const load = useCallback(async (search: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: "1", limit: String(LOAD_LIMIT) });
      if (search) params.set("search", search);
      const res = await fetch(`/api/admin/support-tickets?${params}`);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error();
      setTickets(data.tickets);
      setTotalCount(data.totalCount);
      setSearchedFor(search);
    } catch {
      notify("Couldn't load support tickets. Check your connection and refresh.", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load("");
    fetch("/api/admin/support-tickets/stats").then((r) => r.json()).then((d) => { if (d.success) setStats(d.stats); }).catch(() => {});
  }, [load]);

  const columns = useMemo<Column<Ticket>[]>(() => [
    {
      key: "subject", header: "Ticket", sortValue: (t) => t.subject, searchValue: (t) => `${t.subject} ${t.ticketNumber} ${t.category}`,
      cell: (t) => (
        <div className="min-w-0 max-w-xs">
          <Link href={`/support/${t.id}`} className="font-medium text-gray-900 dark:text-white hover:text-brand hover:underline block truncate">{t.subject}</Link>
          <p className="text-xs text-gray-600 dark:text-gray-400 font-mono">{t.ticketNumber}</p>
        </div>
      ),
    },
    {
      key: "submitter", header: "From", sortValue: (t) => t.submitterName, searchValue: (t) => `${t.submitterName} ${t.submitterEmail}`,
      cell: (t) => (
        <div className="min-w-0">
          <p className="text-gray-900 dark:text-white truncate">{t.submitterName}</p>
          <p className="text-xs text-gray-600 dark:text-gray-400 truncate">{t.submitterEmail}</p>
        </div>
      ),
    },
    { key: "portal", header: "Portal", sortValue: (t) => t.portal, cell: (t) => PORTAL_LABELS[t.portal] ?? t.portal },
    {
      key: "priority", header: "Priority", sortValue: (t) => PRIORITY_RANK[t.priority] ?? 0,
      cell: (t) => <span className={`text-xs font-medium ${PRIORITY_COLORS[t.priority] ?? ""}`}>{PRIORITY_LABELS[t.priority] ?? t.priority}</span>,
    },
    {
      key: "status", header: "Status", sortValue: (t) => t.status,
      cell: (t) => <span className={`px-2 py-0.5 text-xs font-semibold rounded-full whitespace-nowrap ${STATUS_COLORS[t.status] ?? STATUS_COLORS.CLOSED}`}>{STATUS_LABELS[t.status] ?? t.status}</span>,
    },
    {
      key: "replyDue", header: "First reply", sortValue: (t) => (awaitingFirstReply(t) ? new Date(t.replyDueAt!) : null),
      cell: (t) => {
        const due = replyDue(t);
        return (
          <div className="whitespace-nowrap">
            <span className={`text-xs ${due.cls}`}>{due.text}</span>
            {t.planAtOpen ? <span className="block text-xs text-gray-600 dark:text-gray-400">{t.planAtOpen}</span> : null}
          </div>
        );
      },
    },
    { key: "created", header: "Opened", sortValue: (t) => new Date(t.createdAt), cell: (t) => <span className="text-xs whitespace-nowrap" title={new Date(t.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}>{timeAgo(t.createdAt)}</span> },
    { key: "messages", header: "Messages", align: "right", sortValue: (t) => t._count.messages, cell: (t) => t._count.messages },
  ], []);

  const filters = useMemo<TableFilter<Ticket>[]>(() => [
    { key: "status", label: "Status", options: optionsOf(STATUS_LABELS), matches: (t, v) => t.status === v },
    { key: "priority", label: "Priority", options: optionsOf(PRIORITY_LABELS), matches: (t, v) => t.priority === v },
    { key: "portal", label: "Portal", options: optionsOf(PORTAL_LABELS), matches: (t, v) => t.portal === v },
    {
      key: "reply", label: "First reply",
      options: [{ value: "overdue", label: "Overdue" }, { value: "waiting", label: "Not yet replied" }, { value: "replied", label: "Replied" }],
      matches: (t, v) => v === "replied" ? !!t.firstReplyAt : awaitingFirstReply(t) && (v === "waiting" || new Date(t.replyDueAt!).getTime() < Date.now()),
    },
  ], []);

  const cards = stats ? [
    { label: "Open", value: stats.open, icon: CircleDot, color: "text-blue-600" },
    { label: "In progress", value: stats.inProgress, icon: Timer, color: "text-yellow-600" },
    { label: "Waiting for user", value: stats.awaiting, icon: AlertCircle, color: "text-orange-600" },
    { label: "Resolved", value: stats.resolved, icon: CheckCircle2, color: "text-green-600" },
    { label: "Total", value: stats.total, icon: MessageSquare, color: "text-gray-500" },
  ] : [];
  const more = totalCount > tickets.length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="portal-title">Support tickets</h1>
        <p className="portal-subtitle">Requests from founders, employers, organizers and website visitors.</p>
      </div>

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {cards.map((s) => (
            <div key={s.label} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-600 dark:text-gray-400 font-medium">{s.label}</span>
                <s.icon className={`w-4 h-4 ${s.color}`} aria-hidden />
              </div>
              <p className="text-2xl font-semibold text-gray-900 dark:text-white">{s.value.toLocaleString("en-IN")}</p>
            </div>
          ))}
        </div>
      )}

      {(more || searchedFor) && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 py-3">
          <p className="text-sm text-gray-700 dark:text-gray-300 flex-1 min-w-[14rem]">
            {searchedFor
              ? `Showing ${tickets.length.toLocaleString("en-IN")}${more ? ` of ${totalCount.toLocaleString("en-IN")}` : ""} tickets matching “${searchedFor}” across all tickets.`
              : `Showing the newest ${tickets.length.toLocaleString("en-IN")} of ${totalCount.toLocaleString("en-IN")} tickets. To find an older one, search all tickets.`}
          </p>
          {searchedFor ? (
            <button onClick={() => { setAllSearch(""); load(""); }} className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline">
              <X className="w-3.5 h-3.5" aria-hidden /> Back to newest
            </button>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); if (allSearch.trim()) load(allSearch.trim()); }} className="flex items-center gap-2">
              <label htmlFor="all-ticket-search" className="sr-only">Search all tickets</label>
              <input id="all-ticket-search" value={allSearch} onChange={(e) => setAllSearch(e.target.value)} placeholder="Subject, number, name or email"
                className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white w-60" />
              <button type="submit" className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700">
                <Search className="w-3.5 h-3.5" aria-hidden /> Search all
              </button>
            </form>
          )}
        </div>
      )}

      <DataTable
        tableId="support-tickets"
        noun="tickets"
        rows={tickets}
        rowKey={(t) => t.id}
        columns={columns}
        filters={filters}
        loading={loading}
        pageSize={25}
        searchPlaceholder="Search subject, ticket number, name or email"
        empty={searchedFor
          ? { title: "No tickets match that search", description: "Try a ticket number or the sender's email." }
          : { title: "No support tickets yet", description: "Requests sent from the portals and the website appear here." }}
      />
    </div>
  );
}
