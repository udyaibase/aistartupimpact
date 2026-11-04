"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, History, Activity, ChevronDown } from "lucide-react";
import ContentSubmissionForm from "@/components/founder/ContentSubmissionForm";

const ACTION_LABELS: Record<string, string> = {
  CREATED: "Created", EDITED: "Edited", SUBMITTED_FOR_REVIEW: "Submitted for review",
  RESUBMITTED: "Resubmitted", APPROVED: "Approved", REJECTED: "Rejected",
  REVISION_REQUESTED: "Revision requested", PUBLISHED: "Published", DELETED: "Deleted",
};

export default function EditContentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [article, setArticle] = useState<any>(null);
  const [startups, setStartups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [showActivity, setShowActivity] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`/api/founder/content/${id}`).then(r => r.json()),
      fetch("/api/founder/content").then(r => r.json()),
    ])
      .then(([artData, listData]) => {
        if (artData.success) setArticle(artData.article);
        else setError(artData.error || "Not found");
        setStartups(listData.startups || []);
      })
      .catch(() => setError("Failed to load"))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;
  }

  if (error || !article) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-16 text-center">
        <p className="text-sm font-jakarta text-red-500">{error || "Content not found"}</p>
        <button onClick={() => router.push("/founder/content")} className="mt-3 px-4 py-2 bg-brand text-white text-sm font-jakarta font-bold rounded-lg">Back to Content</button>
      </div>
    );
  }

  const isStory = article.type === "FOUNDER_STORY";
  const versions = article.ArticleVersion || [];
  const activities = article.ContentActivityLog || [];

  return (
    <div>
      <div>
        <button onClick={() => router.push("/founder/content")} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 font-jakarta mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to Content
        </button>

        <div className="mb-6">
          <h1 className="text-2xl font-sora font-bold text-gray-900 dark:text-white">
            Edit {isStory ? "Story" : "Update"}
          </h1>
          {article.moderationStatus === "REJECTED" && (
            <p className="text-sm text-amber-600 dark:text-amber-400 font-jakarta mt-1">This content was returned for revision. Make changes and resubmit.</p>
          )}
        </div>

        <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl p-6">
          <ContentSubmissionForm
            contentType={article.type}
            startups={startups}
            existingData={article}
            onSuccess={() => router.push("/founder/content")}
            onCancel={() => router.push("/founder/content")}
          />
        </div>

        {/* Version History */}
        {versions.length > 0 && (
          <div className="mt-4 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl overflow-hidden">
            <button onClick={() => setShowHistory(!showHistory)} className="w-full flex items-center justify-between px-5 py-3.5 text-left">
              <span className="text-sm font-jakarta font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <History className="w-4 h-4 text-gray-400" /> Version History ({versions.length})
              </span>
              <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showHistory ? "rotate-180" : ""}`} />
            </button>
            {showHistory && (
              <div className="px-5 pb-4 space-y-2 border-t border-gray-100 dark:border-gray-800 pt-3">
                {versions.map((v: any, i: number) => (
                  <div key={v.id} className="flex items-center justify-between py-2 px-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <div>
                      <p className="text-xs font-jakarta font-medium text-gray-700 dark:text-gray-300">v{v.versionNumber || versions.length - i}</p>
                      <p className="text-xs text-gray-400 font-jakarta">{v.title}</p>
                      {v.changeNote && <p className="text-xs text-gray-500 font-jakarta mt-0.5">{v.changeNote}</p>}
                    </div>
                    <span className="text-xs text-gray-400 font-jakarta">{new Date(v.createdAt).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Activity Log */}
        {activities.length > 0 && (
          <div className="mt-4 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl overflow-hidden">
            <button onClick={() => setShowActivity(!showActivity)} className="w-full flex items-center justify-between px-5 py-3.5 text-left">
              <span className="text-sm font-jakarta font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <Activity className="w-4 h-4 text-gray-400" /> Activity Log ({activities.length})
              </span>
              <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showActivity ? "rotate-180" : ""}`} />
            </button>
            {showActivity && (
              <div className="px-5 pb-4 space-y-1.5 border-t border-gray-100 dark:border-gray-800 pt-3">
                {activities.map((a: any) => (
                  <div key={a.id} className="flex items-center gap-3 py-1.5 text-xs font-jakarta">
                    <span className="text-gray-400 shrink-0 w-20">{new Date(a.createdAt).toLocaleDateString()}</span>
                    <span className={`font-medium ${a.action === "APPROVED" ? "text-green-600 dark:text-green-400" : a.action === "REJECTED" ? "text-red-600 dark:text-red-400" : "text-gray-600 dark:text-gray-300"}`}>
                      {ACTION_LABELS[a.action] || a.action}
                    </span>
                    {a.actor && <span className="text-gray-400">by {a.actor.name || "System"}</span>}
                    <span className="text-gray-400 uppercase text-[10px]">{a.actorType}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
