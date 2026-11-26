"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle, Clock, Loader2, Shield, Trash2 } from "lucide-react";
import DataTable, { type BulkAction, type Column, type TableFilter } from "@/components/ui/DataTable";
import { ConfirmModal } from "@/components/ConfirmModal";
import { notify } from "@/components/Toast";

interface Milestone {
  id: string;
  title: string;
  type: string;
  amount: number | string | null;
  currency: string | null;
  date: string;
  verificationStatus: "FOUNDER_REPORTED" | "PLATFORM_VERIFIED";
  startup: { name: string } | null;
  founder: { name: string | null; email?: string | null } | null;
}

const TYPE_LABEL = (t: string) => t.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
type Action = "verify" | "unverify" | "delete";

export default function AdminMilestonesPage() {
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Milestone | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/milestones?verification=all");
      if (!res.ok) throw new Error();
      const d = await res.json();
      setMilestones(d.milestones || []);
    } catch {
      notify("Couldn't load milestones. Check your connection and refresh.", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  /** One request per milestone; returns how many succeeded. */
  const send = async (ids: string[], action: Action): Promise<number> => {
    const results = await Promise.all(ids.map((id) =>
      fetch(`/api/admin/milestones/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) })
        .then((r) => r.ok).catch(() => false),
    ));
    return results.filter(Boolean).length;
  };

  const DONE: Record<Action, string> = { verify: "verified", unverify: "marked unverified", delete: "deleted" };
  const act = async (rows: Milestone[], action: Action) => {
    const ok = await send(rows.map((r) => r.id), action);
    const failed = rows.length - ok;
    if (ok > 0) notify(`${ok} milestone${ok === 1 ? "" : "s"} ${DONE[action]}.`, "success");
    if (failed > 0) notify(`${failed} milestone${failed === 1 ? "" : "s"} couldn't be ${DONE[action]}. Try again.`, "error");
    await fetchData();
  };
  const actOne = async (m: Milestone, action: Action) => { setActing(m.id); await act([m], action); setActing(null); };

  const columns = useMemo<Column<Milestone>[]>(() => [
    {
      key: "title", header: "Milestone",
      sortValue: (m) => m.title, searchValue: (m) => `${m.title} ${TYPE_LABEL(m.type)}`,
      cell: (m) => (
        <div>
          <p className="font-medium text-gray-900 dark:text-white">{m.title}</p>
          <p className="text-xs text-gray-600 dark:text-gray-400">{TYPE_LABEL(m.type)}{m.amount ? ` · ${m.currency ?? ""} ${Number(m.amount).toLocaleString("en-IN")}` : ""}</p>
        </div>
      ),
    },
    { key: "startup", header: "Startup", sortValue: (m) => m.startup?.name, searchValue: (m) => m.startup?.name ?? "", cell: (m) => m.startup?.name || "–" },
    { key: "founder", header: "Founder", sortValue: (m) => m.founder?.name || m.founder?.email, searchValue: (m) => `${m.founder?.name ?? ""} ${m.founder?.email ?? ""}`, cell: (m) => m.founder?.name || m.founder?.email || "–" },
    { key: "date", header: "Date", sortValue: (m) => new Date(m.date), cell: (m) => new Date(m.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) },
    {
      key: "status", header: "Status", sortValue: (m) => m.verificationStatus,
      cell: (m) => m.verificationStatus === "PLATFORM_VERIFIED"
        ? <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 dark:text-green-400"><CheckCircle className="w-3.5 h-3.5" aria-hidden /> Verified</span>
        : <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400"><Clock className="w-3.5 h-3.5" aria-hidden /> Unverified</span>,
    },
    {
      key: "actions", header: "Actions", align: "right",
      cell: (m) => (
        <div className="flex items-center justify-end gap-1">
          {m.verificationStatus === "FOUNDER_REPORTED" ? (
            <button onClick={() => actOne(m, "verify")} disabled={acting === m.id} className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-lg disabled:opacity-50 inline-flex items-center gap-1">
              {acting === m.id ? <Loader2 className="w-3 h-3 animate-spin" aria-hidden /> : <Shield className="w-3 h-3" aria-hidden />} Verify
            </button>
          ) : (
            <button onClick={() => actOne(m, "unverify")} disabled={acting === m.id} className="px-3 py-1.5 bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 text-xs font-medium rounded-lg disabled:opacity-50 hover:bg-gray-200 dark:hover:bg-gray-700">
              Unverify
            </button>
          )}
          <button onClick={() => setDeleting(m)} disabled={acting === m.id} aria-label={`Delete milestone: ${m.title}`} className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg disabled:opacity-50">
            <Trash2 className="w-3.5 h-3.5" aria-hidden />
          </button>
        </div>
      ),
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the cells call the latest handlers; only `acting` changes how they look
  ], [acting]);

  const filters = useMemo<TableFilter<Milestone>[]>(() => [
    { key: "status", label: "Status", options: [{ value: "FOUNDER_REPORTED", label: "Unverified" }, { value: "PLATFORM_VERIFIED", label: "Verified" }], matches: (m, v) => m.verificationStatus === v },
    { key: "type", label: "Type", options: [...new Set(milestones.map((m) => m.type))].sort().map((t) => ({ value: t, label: TYPE_LABEL(t) })), matches: (m, v) => m.type === v },
  ], [milestones]);

  const bulkActions: BulkAction<Milestone>[] = [
    { label: "Verify", run: (rows) => act(rows.filter((r) => r.verificationStatus === "FOUNDER_REPORTED"), "verify"), available: (rows) => rows.some((r) => r.verificationStatus === "FOUNDER_REPORTED") },
    { label: "Unverify", run: (rows) => act(rows.filter((r) => r.verificationStatus === "PLATFORM_VERIFIED"), "unverify"), available: (rows) => rows.some((r) => r.verificationStatus === "PLATFORM_VERIFIED") },
    { label: "Delete", danger: true, run: (rows) => act(rows, "delete"), confirm: (n) => `Delete ${n} milestone${n === 1 ? "" : "s"}? They are removed from the startup's public page. This can't be undone.` },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="portal-title">Milestones</h1>
        <p className="portal-subtitle">Verify and manage the milestones founders report for their startups.</p>
      </div>

      <DataTable
        tableId="milestones"
        noun="milestones"
        rows={milestones}
        rowKey={(m) => m.id}
        columns={columns}
        filters={filters}
        bulkActions={bulkActions}
        loading={loading}
        searchPlaceholder="Search milestone, startup or founder"
        empty={{ title: "No milestones yet", description: "Milestones founders add to their startups will appear here to verify." }}
      />

      <ConfirmModal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={async () => { const m = deleting; setDeleting(null); if (m) await actOne(m, "delete"); }}
        title="Delete milestone"
        message={deleting ? `Delete “${deleting.title}”? It is removed from the startup's public page. This can't be undone.` : ""}
      />
    </div>
  );
}
