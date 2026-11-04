"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import ContentSubmissionForm from "@/components/founder/ContentSubmissionForm";

function NewContentInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const typeParam = searchParams.get("type");
  const contentType = typeParam === "FOUNDER_STORY" ? "FOUNDER_STORY" : "STARTUP_UPDATE";
  const [startups, setStartups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/founder/content")
      .then(r => r.json())
      .then(d => setStartups(d.startups || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;
  }

  if (startups.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-16 text-center">
        <p className="text-[15px] font-semibold font-jakarta text-gray-900 dark:text-white">List your startup first</p>
        <p className="text-sm font-jakarta text-gray-600 dark:text-gray-400 mt-1">Every post is published under a startup, so list yours first. It only takes a few minutes.</p>
        <button onClick={() => router.push("/founder/startups/new")} className="mt-4 px-4 py-2 bg-brand text-white text-sm font-jakarta font-bold rounded-lg">List your startup</button>
      </div>
    );
  }

  const isStory = contentType === "FOUNDER_STORY";

  return (
    <div>
      <div>
        <button onClick={() => router.push("/founder/content")} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 font-jakarta mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to Content
        </button>

        <div className="mb-6">
          <h1 className="portal-title">
            {isStory ? "New Founder Story" : "New Startup Update"}
          </h1>
          <p className="portal-subtitle">
            {isStory ? "Share your journey — stories are reviewed by our editorial team before publishing." : "Share what's happening — updates publish instantly."}
          </p>
        </div>

        <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl p-6">
          <ContentSubmissionForm
            contentType={contentType as "STARTUP_UPDATE" | "FOUNDER_STORY"}
            startups={startups}
            onSuccess={() => router.push("/founder/content")}
            onCancel={() => router.push("/founder/content")}
          />
        </div>
      </div>
    </div>
  );
}

export default function NewContentPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>}>
      <NewContentInner />
    </Suspense>
  );
}
