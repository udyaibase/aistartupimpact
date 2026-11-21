"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Loader2, Save, Send, Image as ImageIcon, X, Clock } from "lucide-react";

interface Startup {
  id: string;
  name: string;
  slug: string;
  role: string;
}

interface ContentSubmissionFormProps {
  contentType: "STARTUP_UPDATE" | "FOUNDER_STORY";
  startups: Startup[];
  existingData?: any;
  onSuccess: (article: any) => void;
  onCancel?: () => void;
}

export default function ContentSubmissionForm({
  contentType, startups, existingData, onSuccess, onCancel,
}: ContentSubmissionFormProps) {
  const [title, setTitle] = useState(existingData?.title || "");
  const [body, setBody] = useState(existingData?.contentText || "");
  const [excerpt, setExcerpt] = useState(existingData?.excerpt || "");
  const [coverImage, setCoverImage] = useState(existingData?.coverImage || "");
  const [startupId, setStartupId] = useState(existingData?.startupId || startups[0]?.id || "");
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState<"success" | "error">("success");
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  // Where the latest copy is: only in this browser (kept every few seconds while typing), or saved to the account.
  const [savedWhere, setSavedWhere] = useState<"browser" | "account" | null>(null);
  const [restored, setRestored] = useState(false);
  /** What the account holds, to tell "saved" from "changed since". */
  const [accountCopy, setAccountCopy] = useState<string | null>(existingData ? JSON.stringify([existingData.title || "", existingData.contentText || "", existingData.excerpt || "", existingData.coverImage || ""]) : null);
  const [articleId, setArticleId] = useState(existingData?.id || null);
  const autoSaveTimer = useRef<NodeJS.Timeout | null>(null);
  const isStory = contentType === "FOUNDER_STORY";
  const draftKey = `draft-${contentType}-${startupId}`;
  const forgetBrowserCopy = () => { try { localStorage.removeItem(draftKey); } catch {} };
  // An approved story that is live: any change goes back to our editors before it shows again.
  const liveStory = isStory && existingData?.status === "PUBLISHED" && existingData?.moderationStatus === "APPROVED";

  const showMsg = (text: string, type: "success" | "error") => {
    setMsg(text);
    setMsgType(type);
    setTimeout(() => setMsg(""), 4000);
  };

  const saveDraft = useCallback(async (auto = false) => {
    if (!title.trim()) return;
    if (auto) {
      // The browser copy is only for a new post that isn't in the account yet. Once it is, a copy here would come
      // back later inside a different new post.
      if (articleId || existingData) return;
      try {
        localStorage.setItem(draftKey, JSON.stringify({ title, body, excerpt, coverImage, savedAt: new Date().toISOString() }));
        setLastSaved(new Date());
        setSavedWhere("browser");
      } catch {}
      return;
    }

    setSaving(true);
    try {
      if (articleId) {
        const res = await fetch(`/api/founder/content/${articleId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, content: body, excerpt, coverImage, isAutoSave: false }),
        });
        const d = await res.json();
        if (d.success) { showMsg("Draft saved to your account", "success"); setLastSaved(new Date()); setSavedWhere("account"); setAccountCopy(JSON.stringify([title, body, excerpt, coverImage])); forgetBrowserCopy(); }
        else showMsg(d.error || "Failed to save", "error");
      } else {
        const res = await fetch("/api/founder/content", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, content: body, excerpt, type: contentType, startupId, coverImage, isDraft: true }),
        });
        const d = await res.json();
        if (d.success) { setArticleId(d.article.id); showMsg("Draft saved to your account", "success"); setLastSaved(new Date()); setSavedWhere("account"); setAccountCopy(JSON.stringify([title, body, excerpt, coverImage])); forgetBrowserCopy(); }
        else showMsg(d.error || "Failed to save", "error");
      }
    } catch { showMsg("Failed to save", "error"); }
    setSaving(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- forgetBrowserCopy only reads draftKey, which is listed
  }, [title, body, excerpt, coverImage, contentType, startupId, articleId, draftKey, existingData]);

  useEffect(() => {
    if (!existingData && startupId) {
      try {
        const saved = localStorage.getItem(draftKey);
        if (saved) {
          const draft = JSON.parse(saved);
          if (draft.title) setTitle(draft.title);
          if (draft.body) setBody(draft.body);
          if (draft.excerpt) setExcerpt(draft.excerpt);
          if (draft.coverImage) setCoverImage(draft.coverImage);
          setLastSaved(new Date(draft.savedAt));
          setSavedWhere("browser");
          if (draft.title || draft.body) setRestored(true);
        }
      } catch {}
    }
  }, [draftKey, startupId, existingData]);

  useEffect(() => {
    if (autoSaveTimer.current) clearInterval(autoSaveTimer.current);
    autoSaveTimer.current = setInterval(() => { if (title.trim()) saveDraft(true); }, 10000);
    return () => { if (autoSaveTimer.current) clearInterval(autoSaveTimer.current); };
  }, [saveDraft, title]);

  const handleSubmit = async () => {
    if (!title.trim()) return showMsg("Title is required", "error");
    if (isStory && body.length < 100) return showMsg("Story must be at least 100 characters", "error");
    if (!startupId) return showMsg("Select a startup", "error");

    if (liveStory && !window.confirm("Send these changes for review? Your story comes off the public site until our editors approve it again.")) return;

    setSubmitting(true);
    try {
      if (articleId) {
        const res = await fetch(`/api/founder/content/${articleId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, content: body, excerpt, coverImage, submitForReview: isStory, publish: !isStory }),
        });
        const d = await res.json();
        if (d.success) {
          forgetBrowserCopy();
          onSuccess(d.article);
        } else showMsg(d.error || "Failed", "error");
      } else {
        const res = await fetch("/api/founder/content", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, content: body, excerpt, type: contentType, startupId, coverImage, isDraft: false }),
        });
        const d = await res.json();
        if (d.success) {
          forgetBrowserCopy();
          onSuccess(d.article);
        } else showMsg(d.error || "Failed", "error");
      }
    } catch { showMsg("Something went wrong", "error"); }
    setSubmitting(false);
  };

  const wordCount = body.split(/\s+/).filter(Boolean).length;

  return (
    <div className="space-y-5">
      {msg && (
        <p className={`text-xs font-jakarta px-3 py-2 rounded-lg ${msgType === "success" ? "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400"}`}>{msg}</p>
      )}

      {restored && (
        <div role="note" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 px-4 py-3">
          <p className="text-sm text-blue-800 dark:text-blue-300 font-jakarta">We brought back what you were writing in this browser.</p>
          <button type="button" onClick={() => { forgetBrowserCopy(); setTitle(""); setBody(""); setExcerpt(""); setCoverImage(""); setLastSaved(null); setSavedWhere(null); setRestored(false); }} className="text-sm font-semibold text-blue-800 dark:text-blue-300 underline">Start fresh</button>
        </div>
      )}

      {liveStory && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4" role="note">
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-300 font-jakarta">This story is live</p>
          <p className="text-sm text-amber-800 dark:text-amber-300 font-jakarta mt-0.5">Changes are reviewed by our editors before they show. While that happens, the story comes off the public site.</p>
        </div>
      )}

      {existingData?.moderationNote && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
          <p className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase mb-1 font-jakarta">Admin Feedback</p>
          <p className="text-sm text-amber-800 dark:text-amber-300 font-jakarta">{existingData.moderationNote}</p>
        </div>
      )}

      {startups.length > 1 && (
        <div>
          <label htmlFor="content-startup" className="block text-xs font-bold text-gray-400 uppercase mb-1.5 font-jakarta">Startup</label>
          <select id="content-startup" value={startupId} onChange={e => setStartupId(e.target.value)} className="w-full px-3.5 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm font-jakarta text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand/20">
            {startups.filter(s => s.role !== "VIEWER").map(s => (
              <option key={s.id} value={s.id}>{s.name} ({s.role})</option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label htmlFor="content-title" className="block text-xs font-bold text-gray-400 uppercase mb-1.5 font-jakarta">Title *</label>
        <input id="content-title" type="text" value={title} onChange={e => setTitle(e.target.value)} maxLength={200} placeholder={isStory ? "Your story title..." : "What's new with your startup?"} className="w-full px-3.5 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-jakarta text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand/20" />
        <p className="text-xs text-gray-400 mt-1 font-jakarta text-right">{title.length}/200</p>
      </div>

      {isStory && (
        <div>
          <label htmlFor="content-excerpt" className="block text-xs font-bold text-gray-400 uppercase mb-1.5 font-jakarta">Excerpt</label>
          <textarea id="content-excerpt" value={excerpt} onChange={e => setExcerpt(e.target.value)} maxLength={500} rows={2} placeholder="A short summary for previews..." className="w-full px-3.5 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-jakarta text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand/20 resize-y" />
          <p className="text-xs text-gray-400 mt-1 font-jakarta text-right">{excerpt.length}/500</p>
        </div>
      )}

      <div>
        <label htmlFor="content-field" className="block text-xs font-bold text-gray-400 uppercase mb-1.5 font-jakarta">
          {isStory ? "Story" : "Update"} *
        </label>
        <textarea id="content-field" value={body} onChange={e => setBody(e.target.value)} maxLength={isStory ? 50000 : 5000} rows={isStory ? 16 : 6} placeholder={isStory ? "Tell your story..." : "Share your update..."} className="w-full px-3.5 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-jakarta text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand/20 resize-y leading-relaxed" />
        <div className="flex justify-between mt-1">
          <p className="text-xs text-gray-400 font-jakarta">{wordCount} words</p>
          <p className="text-xs text-gray-400 font-jakarta">{body.length}/{isStory ? "50,000" : "5,000"}</p>
        </div>
      </div>

      <div>
        <label htmlFor="content-cover-image-url" className="block text-xs font-bold text-gray-400 uppercase mb-1.5 font-jakarta">Cover Image URL</label>
        <div className="flex gap-2">
          <input id="content-cover-image-url" type="url" value={coverImage} onChange={e => setCoverImage(e.target.value)} placeholder="https://..." className="flex-1 px-3.5 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-jakarta text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand/20" />
          {coverImage && <button onClick={() => setCoverImage("")} className="p-2.5 text-gray-400 hover:text-red-500"><X className="w-4 h-4" /></button>}
        </div>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-3">
          {(lastSaved || accountCopy) && (
            <span className="text-xs text-gray-500 dark:text-gray-400 font-jakarta flex items-center gap-1">
              <Clock className="w-3 h-3" aria-hidden />
              {accountCopy !== null
                ? (accountCopy === JSON.stringify([title, body, excerpt, coverImage]) ? "Saved to your account" : "Changes not saved yet")
                : "Not saved to your account yet. A copy is kept in this browser."}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onCancel && (
            <button onClick={onCancel} className="px-4 py-2.5 text-sm font-jakarta font-medium text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">Cancel</button>
          )}
          {!liveStory && <button onClick={() => saveDraft(false)} disabled={saving || !title.trim()} className="px-4 py-2.5 border border-gray-200 dark:border-gray-700 text-sm font-jakarta font-bold text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 flex items-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save Draft
          </button>}
          <button onClick={handleSubmit} disabled={submitting || !title.trim()} className="px-4 py-2.5 bg-brand hover:bg-brand-600 text-white text-sm font-jakarta font-bold rounded-lg disabled:opacity-40 flex items-center gap-2">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {liveStory ? "Submit changes for review" : isStory ? "Submit for Review" : "Publish Update"}
          </button>
        </div>
      </div>
    </div>
  );
}
