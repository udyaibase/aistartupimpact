"use client";

import { useState, useEffect } from "react";
import {
  FileText, CheckCircle, XCircle, Clock, AlertCircle, Loader2,
  ChevronDown, Eye, MessageSquare,
} from "lucide-react";

type Tab = "IN_REVIEW" | "APPROVED" | "REJECTED";

const TAB_CONFIG: { key: Tab; label: string; icon: any }[] = [
  { key: "IN_REVIEW", label: "Pending Review", icon: Clock },
  { key: "APPROVED", label: "Approved", icon: CheckCircle },
  { key: "REJECTED", label: "Rejected", icon: XCircle },
];

export default function ContentReviewPage() {
  const [tab, setTab] = useState<Tab>("IN_REVIEW");
  const [articles, setArticles] = useState<any[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionNote, setActionNote] = useState("");
  const [acting, setActing] = useState<string | null>(null);

  const fetchData = async (status: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/content-review?status=${status}`);
      const d = await res.json();
      setArticles(d.articles || []);
      const c: Record<string, number> = {};
      (d.counts || []).forEach((r: any) => { c[r.moderationStatus] = r._count; });
      setCounts(c);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { fetchData(tab); }, [tab]);

  const handleAction = async (id: string, action: string) => {
    setActing(id);
    try {
      await fetch(`/api/admin/content-review/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note: actionNote }),
      });
      setActionNote("");
      setExpandedId(null);
      fetchData(tab);
    } catch {}
    setActing(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="portal-title">Content Review</h1>
        <p className="portal-subtitle">Review founder-submitted stories and updates</p>
      </div>

      <div className="flex gap-2">
        {TAB_CONFIG.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.key ? "bg-brand text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"}`}>
            <t.icon className="w-4 h-4" />
            {t.label}
            {t.key === "IN_REVIEW" && counts.PENDING_REVIEW ? (
              <span className="ml-1 bg-white/20 text-white text-xs px-1.5 py-0.5 rounded-full">{counts.PENDING_REVIEW}</span>
            ) : null}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : articles.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
          <FileText className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-sm text-gray-500 dark:text-gray-400">No content in this queue</p>
        </div>
      ) : (
        <div className="space-y-3">
          {articles.map(a => (
            <div key={a.id} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 cursor-pointer" onClick={() => setExpandedId(expandedId === a.id ? null : a.id)}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${a.type === "FOUNDER_STORY" ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"}`}>
                      {a.type === "FOUNDER_STORY" ? "Story" : "Update"}
                    </span>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate">{a.title}</h3>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-400">
                    {a.Startup && <span>{a.Startup.name}</span>}
                    {a.SubmittedByFounder && <span>by {a.SubmittedByFounder.name || a.SubmittedByFounder.email}</span>}
                    <span>{new Date(a.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
                <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${expandedId === a.id ? "rotate-180" : ""}`} />
              </div>

              {expandedId === a.id && (
                <div className="px-5 pb-5 border-t border-gray-100 dark:border-gray-800 pt-4">
                  {a.contentText && (
                    <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg max-h-60 overflow-y-auto">
                      <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{a.contentText}</p>
                    </div>
                  )}
                  {a.excerpt && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-3"><strong>Excerpt:</strong> {a.excerpt}</p>
                  )}

                  {tab === "IN_REVIEW" && (
                    <div className="space-y-3">
                      <textarea value={actionNote} onChange={e => setActionNote(e.target.value)} placeholder="Optional note to the founder..." rows={2} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand/20" />
                      <div className="flex gap-2">
                        <button onClick={() => handleAction(a.id, "approve")} disabled={acting === a.id} className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 flex items-center gap-1.5">
                          {acting === a.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />} Approve & Publish
                        </button>
                        <button onClick={() => handleAction(a.id, "request_revision")} disabled={acting === a.id} className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-lg disabled:opacity-50 flex items-center gap-1.5">
                          <MessageSquare className="w-3.5 h-3.5" /> Request Revision
                        </button>
                        <button onClick={() => handleAction(a.id, "reject")} disabled={acting === a.id} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 flex items-center gap-1.5">
                          <XCircle className="w-3.5 h-3.5" /> Reject
                        </button>
                      </div>
                    </div>
                  )}

                  {a.moderationNote && tab !== "IN_REVIEW" && (
                    <p className="text-xs text-gray-500 mt-2"><strong>Note:</strong> {a.moderationNote}</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
