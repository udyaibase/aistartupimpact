"use client";

import { useState } from "react";
import { Flag, Check, X, Eye, ExternalLink } from "lucide-react";

interface Props {
  reports: any[];
  stats: { pending: number; reviewing: number; resolved: number; total: number };
}

type StatusFilter = "" | "PENDING" | "REVIEWING" | "RESOLVED" | "DISMISSED";

export default function ReportsClient({ reports: initialReports, stats }: Props) {
  const [reports, setReports] = useState(initialReports);
  const [filter, setFilter] = useState<StatusFilter>("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const filtered = filter ? reports.filter(r => r.status === filter) : reports;

  const updateStatus = async (id: string, status: string) => {
    await fetch(`/api/admin/reports/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    setReports(prev => prev.map(r => r.id === id ? { ...r, status } : r));
  };

  const jobAction = async (r: any, action: "close" | "release") => {
    let adminNotes: string | undefined;
    if (action === "close") {
      if (!confirm(`Close "${r.entityName}"? It disappears from every public page and the employer is emailed.`)) return;
      adminNotes = prompt("Reason to share with the employer (optional)")?.trim() || undefined;
    }
    const res = await fetch(`/api/admin/reports/${r.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobAction: action, adminNotes }) });
    if (!res.ok) { alert("Couldn't update the job."); return; }
    const status = action === "close" ? "RESOLVED" : "DISMISSED";
    setReports(prev => prev.map(x => x.entityType === "JOB" && x.entityId === r.entityId && (x.status === "PENDING" || x.status === "REVIEWING")
      ? { ...x, status, job: x.job ? { ...x.job, hold: false, status: action === "close" ? "CLOSED" : x.job.status } : x.job } : x));
  };

  const TYPES: Record<string, string> = {
    scam: "Fake job / scam", asks_money: "Asks for money", misleading: "Misleading details", filled: "Already filled", discriminatory: "Discriminatory",
    incorrect_info: "Incorrect Info", duplicate: "Duplicate", trademark: "Trademark",
    copyright: "Copyright", broken_links: "Broken Links", spam: "Spam", other: "Other",
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Content Reports</h1>
        <div className="flex gap-2 text-xs font-jakarta">
          <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full font-semibold">{stats.pending} pending</span>
          <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full font-semibold">{stats.reviewing} reviewing</span>
          <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full font-semibold">{stats.resolved} resolved</span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-1">
        {(["","PENDING","REVIEWING","RESOLVED","DISMISSED"] as StatusFilter[]).map(s => (
          <button key={s} onClick={() => setFilter(s)} className={`px-3 py-1.5 text-xs font-medium rounded-lg ${filter === s ? "bg-brand text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200"}`}>
            {s || "All"} {s === "" ? `(${reports.length})` : `(${reports.filter(r => r.status === s).length})`}
          </button>
        ))}
      </div>

      {/* Reports */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="text-center py-12 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl">
            <Flag className="w-8 h-8 text-gray-300 mx-auto mb-2"/><p className="text-sm text-gray-400 font-jakarta">No reports</p>
          </div>
        ) : filtered.map(r => (
          <div key={r.id} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
            <div className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/30" onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
              <div className="flex items-center gap-3">
                <Flag className="w-4 h-4 text-red-400 shrink-0"/>
                <div>
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200 font-jakarta">{r.entityName}</p>
                  <p className="text-[10px] text-gray-400 font-jakarta">{r.entityType.toLowerCase()}{r.job ? ` · ${r.job.company}` : ""} · {TYPES[r.reportType] || r.reportType} · {new Date(r.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {r.job?.hold && <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-full bg-red-100 text-red-700">Hidden · on hold</span>}
                <StatusBadge status={r.status}/>
                <Eye className="w-3.5 h-3.5 text-gray-400"/>
              </div>
            </div>
            {expanded === r.id && (
              <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-800 pt-3 space-y-3">
                <p className="text-sm text-gray-600 dark:text-gray-300 font-jakarta">{r.description}</p>
                {r.reporterEmail && <p className="text-[10px] text-gray-400 font-jakarta">Reporter: {r.reporterEmail}</p>}
                {r.job?.publishedBy && <p className="text-[10px] text-gray-400 font-jakarta">Published by: {r.job.publishedBy}</p>}
                <div className="flex items-center gap-2">
                  <a href={`${typeof window !== "undefined" ? window.location.origin.replace(":3001", ":3000") : "http://localhost:3000"}/${r.entityType === "STARTUP" ? "startups" : r.entityType === "TOOL" ? "tools" : r.entityType === "JOB" ? "jobs" : "events"}/${r.entitySlug}`} target="_blank" className="text-xs text-brand font-jakarta hover:underline flex items-center gap-1"><ExternalLink className="w-3 h-3"/> View</a>
                  {r.status === "PENDING" && <button onClick={() => updateStatus(r.id, "REVIEWING")} className="px-2.5 py-1 text-[10px] bg-blue-100 text-blue-700 rounded font-semibold">Mark Reviewing</button>}
                  {r.entityType === "JOB" && (r.status === "PENDING" || r.status === "REVIEWING") && <>
                    {r.job?.status !== "CLOSED" && <button onClick={() => jobAction(r, "close")} className="px-2.5 py-1 text-[10px] bg-red-100 text-red-700 rounded font-semibold">Close job</button>}
                    <button onClick={() => jobAction(r, "release")} className="px-2.5 py-1 text-[10px] bg-gray-100 text-gray-700 rounded font-semibold">{r.job?.hold ? "Looks fine · release" : "Looks fine · dismiss all"}</button>
                  </>}
                  {r.entityType !== "JOB" && (r.status === "PENDING" || r.status === "REVIEWING") && <>
                    <button onClick={() => updateStatus(r.id, "RESOLVED")} className="px-2.5 py-1 text-[10px] bg-green-100 text-green-700 rounded font-semibold">Resolve</button>
                    <button onClick={() => updateStatus(r.id, "DISMISSED")} className="px-2.5 py-1 text-[10px] bg-gray-100 text-gray-600 rounded font-semibold">Dismiss</button>
                  </>}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const s: Record<string, string> = { PENDING: "bg-yellow-100 text-yellow-700", REVIEWING: "bg-blue-100 text-blue-700", RESOLVED: "bg-green-100 text-green-700", DISMISSED: "bg-gray-100 text-gray-500" };
  return <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full ${s[status] || s.PENDING}`}>{status}</span>;
}
