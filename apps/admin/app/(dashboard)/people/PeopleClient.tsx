"use client";

import { useState, useCallback, useMemo, useRef } from "react";
import { Download, X, Shield, Rocket, CalendarDays } from "lucide-react";
import DataTable, { type Column, type ServerQuery, type TableFilter } from "@/components/ui/DataTable";
import { notify } from "@/components/Toast";
import { ConfirmModal } from '@/components/ConfirmModal';

interface Person {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  createdAt: string;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  lastWorkspace: string;
  founderId?: string;
  founderCompany?: string;
  founderStatus?: string;
  organizerId?: string;
  organizerCompany?: string;
  organizerStatus?: string;
  startupCount?: number;
  toolCount?: number;
  eventCount?: number;
  totalRegistrations?: number;
}

/** Sent to the server as `filter`; the list is searched and paged there. */
const GROUPS = [
  { value: "founders", label: "Founders" },
  { value: "organizers", label: "Organizers" },
  { value: "community", label: "Community" },
  { value: "web_users", label: "Website users" },
  { value: "2fa", label: "Two-factor on" },
  { value: "suspended", label: "Suspended" },
];
const PAGE_SIZE = 50;

export default function PeopleClient() {
  const [people, setPeople] = useState<Person[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Person | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const lastQuery = useRef<ServerQuery | null>(null);
  const request = useRef(0);

  const load = useCallback(async (q: ServerQuery) => {
    lastQuery.current = q;
    const mine = ++request.current;
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(q.page), limit: String(q.pageSize), filter: q.filters.group || "all" });
      if (q.search.trim()) params.set("search", q.search.trim());
      const res = await fetch(`/api/admin/people?${params}`);
      const data = await res.json();
      if (mine !== request.current) return; // an older answer arriving late
      if (!res.ok || !data.success) throw new Error();
      setPeople(data.people);
      setTotal(data.total);
    } catch {
      if (mine === request.current) notify("Couldn't load people. Check your connection and refresh.", "error");
    } finally {
      if (mine === request.current) setLoading(false);
    }
  }, []);
  const fetchPeople = () => { if (lastQuery.current) load(lastQuery.current); };

  const fetchDetail = async (person: Person) => {
    setSelected(person);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/admin/people/${person.id}`);
      const data = await res.json();
      if (data.success) setDetail(data);
    } catch {}
    setDetailLoading(false);
  };

  const handleAction = async (action: string) => {
    if (!selected) return;
    setPendingAction(action);
  };

  const executeAction = async () => {
    if (!selected || !pendingAction) return;
    try {
      await fetch(`/api/admin/people/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: pendingAction }),
      });
      fetchPeople();
      setSelected(null);
      setDetail(null);
    } catch {}
    setPendingAction(null);
  };

  const columns = useMemo<Column<Person>[]>(() => [
    {
      key: "name", header: "Name",
      cell: (p) => (
        <button type="button" onClick={() => fetchDetail(p)} className="flex items-center gap-2.5 text-left group" aria-label={`Open ${p.name || p.email}`}>
          <span className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center overflow-hidden shrink-0">
            {p.avatar
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={p.avatar} alt="" className="w-full h-full object-cover" />
              : <span className="text-xs font-semibold text-gray-600 dark:text-gray-300" aria-hidden>{(p.name || "?").charAt(0)}</span>}
          </span>
          <span className="font-medium text-gray-900 dark:text-white group-hover:underline truncate max-w-[180px]">{p.name || "–"}</span>
        </button>
      ),
    },
    { key: "email", header: "Email", cell: (p) => <span className="truncate block max-w-[240px]">{p.email}</span> },
    {
      key: "workspaces", header: "Workspaces",
      cell: (p) => {
        const list = [p.founderId && "Founder", p.organizerId && "Organizer", (p as any).userSource === "web_user" && "Website"].filter(Boolean);
        return list.length ? list.join(", ") : "–";
      },
    },
    {
      key: "activity", header: "Activity",
      cell: (p) => {
        const parts = [p.startupCount ? `${p.startupCount} startup${p.startupCount > 1 ? "s" : ""}` : "", p.eventCount ? `${p.eventCount} event${p.eventCount > 1 ? "s" : ""}` : ""].filter(Boolean);
        return <span className="text-xs">{parts.join(", ") || "–"}</span>;
      },
    },
    {
      key: "joined", header: "Joined",
      cell: (p) => <span className="text-xs whitespace-nowrap">{p.createdAt ? new Date(p.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : "–"}</span>,
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps -- cells call the latest handlers
  ], []);
  const filters = useMemo<TableFilter<Person>[]>(() => [{ key: "group", label: "Group", options: GROUPS, matches: () => true }], []);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="portal-title">People</h1>
          <p className="portal-subtitle">Everyone with an account, across the portals and the website. Select a name for details.</p>
        </div>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a
          href="/api/admin/people/export"
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          <Download className="w-4 h-4" /> Export CSV
        </a>
      </div>

      <DataTable
        tableId="people"
        noun="people"
        rows={people}
        rowKey={(p) => p.id}
        columns={columns}
        filters={filters}
        loading={loading}
        pageSize={PAGE_SIZE}
        server={{ total, onQuery: load }}
        searchPlaceholder="Search name or email"
        empty={{ title: "No people yet", description: "Everyone with an account on any portal or the website appears here." }}
      />

      {/* Action Confirm Modal */}
      <ConfirmModal
        open={!!pendingAction}
        onClose={() => setPendingAction(null)}
        onConfirm={executeAction}
        title={`${(pendingAction || '').replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())} Account`}
        message={`Are you sure you want to ${(pendingAction || '').replace('_', ' ')} this account?`}
        confirmLabel={(pendingAction || '').replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
        variant="warning"
      />

      {/* Detail Slide-out */}
      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => { setSelected(null); setDetail(null); }} />
          <div className="relative w-full max-w-md bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800 overflow-y-auto shadow-xl">
            <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 px-5 py-4 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900 dark:text-white">{selected.name}</h2>
              <button onClick={() => { setSelected(null); setDetail(null); }} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>

            {detailLoading ? (
              <div className="p-8 text-center text-gray-400">Loading...</div>
            ) : detail ? (
              <div className="p-5 space-y-6">
                {/* Identity */}
                <section>
                  <h3 className="text-xs font-semibold text-gray-400 uppercase mb-3">Identity</h3>
                  <div className="space-y-2 text-sm">
                    <Row label="Email" value={detail.person.email} />
                    <Row label="Verified" value={detail.person.emailVerified ? "Yes" : "No"} />
                    <Row label="2FA" value={detail.person.twoFactorEnabled ? (detail.person.twoFactorInherited ? "Yes (inherited)" : "Yes") : "No"} />
                    <Row label="Auth" value={detail.person.googleId ? "Email + Google" : "Email/Password"} />
                    <Row label="Last workspace" value={detail.person.lastWorkspace || "Community"} />
                    <Row label="Joined" value={detail.person.createdAt ? new Date(detail.person.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "—"} />
                  </div>
                </section>

                {/* Founder Workspace */}
                {detail.person.founderId && (
                  <section>
                    <h3 className="text-xs font-semibold text-gray-400 uppercase mb-3 flex items-center gap-1.5">
                      <Rocket className="w-3.5 h-3.5 text-purple-500" /> Founder Workspace
                    </h3>
                    <div className="space-y-2 text-sm">
                      <Row label="Status" value={detail.person.founderStatus} />
                      <Row label="Company" value={detail.person.founderCompany || "—"} />
                      <Row label="Startups" value={String(detail.startups?.length || 0)} />
                    </div>
                    {detail.startups?.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {detail.startups.map((s: any) => (
                          <li key={s.id} className="text-xs text-gray-600 dark:text-gray-400 flex items-center gap-1.5">
                            <span className={`w-1.5 h-1.5 rounded-full ${s.isVerified ? "bg-green-500" : "bg-gray-300"}`} />
                            {s.name}
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                )}

                {/* Organizer Workspace */}
                {detail.person.organizerId && (
                  <section>
                    <h3 className="text-xs font-semibold text-gray-400 uppercase mb-3 flex items-center gap-1.5">
                      <CalendarDays className="w-3.5 h-3.5 text-blue-500" /> Organizer Workspace
                    </h3>
                    <div className="space-y-2 text-sm">
                      <Row label="Status" value={detail.person.organizerStatus} />
                      <Row label="Events" value={String(detail.events?.length || 0)} />
                    </div>
                    {detail.events?.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {detail.events.map((e: any) => (
                          <li key={e.id} className="text-xs text-gray-600 dark:text-gray-400">
                            {e.title} — {e.registrationCount} regs
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                )}

                {/* Actions */}
                <section className="border-t border-gray-100 dark:border-gray-800 pt-4">
                  <h3 className="text-xs font-semibold text-gray-400 uppercase mb-3">Actions</h3>
                  <div className="flex flex-wrap gap-2">
                    {detail.person.founderStatus === "SUSPENDED" || detail.person.organizerStatus === "SUSPENDED" ? (
                      <button onClick={() => handleAction("unsuspend")} className="px-3 py-1.5 text-xs font-medium bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-colors">
                        Unsuspend
                      </button>
                    ) : (
                      <button onClick={() => handleAction("suspend")} className="px-3 py-1.5 text-xs font-medium bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition-colors">
                        Suspend
                      </button>
                    )}
                    {detail.person.founderId && (
                      <button onClick={() => handleAction("unlink_founder")} className="px-3 py-1.5 text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                        Unlink Founder
                      </button>
                    )}
                    {detail.person.organizerId && (
                      <button onClick={() => handleAction("unlink_organizer")} className="px-3 py-1.5 text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                        Unlink Organizer
                      </button>
                    )}
                  </div>
                </section>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-500 dark:text-gray-400">{label}</span>
      <span className="font-medium text-gray-900 dark:text-white">{value}</span>
    </div>
  );
}
