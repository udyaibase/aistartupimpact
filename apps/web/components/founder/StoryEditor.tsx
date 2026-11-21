"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import {
  ArrowLeft, Bold, Italic, Heading2, Heading3, Quote, List, ListOrdered, Link as LinkIcon, Minus,
  ImagePlus, Loader2, Check, X, AlertCircle,
} from "lucide-react";

/**
 * The founder story editor: a writing page, not a form. A big title, an optional subtitle, and the story itself, with
 * a few formatting choices (headings, bold, italics, quotes, lists, links) that appear when text is selected and stay
 * in reach in the bar on top.
 *
 * A draft saves itself to the founder's account while they write, and the bar always says where things stand. A story
 * that is already live, or already with our editors, saves only when asked: the first would leave the site for review
 * and the second is being read.
 */

const TITLE_MIN = 3;
const TITLE_MAX = 200;
const SUBTITLE_MAX = 500;
const STORY_MIN_TEXT = 100;
const STORY_MAX_TEXT = 50_000;
/** Wait this long after the last keystroke, and at least this long between saves (the server allows 240 an hour). */
const AUTOSAVE_IDLE_MS = 4_000;
const AUTOSAVE_GAP_MS = 20_000;

interface Startup { id: string; name: string; role: string }
interface ExistingStory {
  id: string; title: string; content: unknown; contentText?: string | null; excerpt?: string | null; coverImage?: string | null;
  startupId?: string | null; status: string; moderationStatus?: string | null; moderationNote?: string | null;
}
type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

/** Older stories were typed into a plain box: show them as paragraphs. Formatted ones open as they are. */
function initialHtml(story?: ExistingStory): string {
  if (!story) return "";
  const raw = typeof story.content === "string" && story.content ? story.content : story.contentText || "";
  if (/<[a-z!/][^>]*>/i.test(raw)) return raw;
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return raw.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean).map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
}

function ago(at: Date, now: number): string {
  const s = Math.max(0, Math.round((now - at.getTime()) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min ago` : `at ${at.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}`;
}

export default function StoryEditor({ startups, existing }: { startups: Startup[]; existing?: ExistingStory }) {
  const router = useRouter();
  const writable = useMemo(() => startups.filter((s) => s.role !== "VIEWER"), [startups]);

  const [articleId, setArticleId] = useState<string | null>(existing?.id ?? null);
  const [startupId, setStartupId] = useState(existing?.startupId || writable[0]?.id || "");
  const [title, setTitle] = useState(existing?.title ?? "");
  const [subtitle, setSubtitle] = useState(existing?.excerpt ?? "");
  const [cover, setCover] = useState(existing?.coverImage ?? "");
  const [html, setHtml] = useState(() => initialHtml(existing));
  const [textLength, setTextLength] = useState(0);
  const [words, setWords] = useState(0);

  const [save, setSave] = useState<SaveState>(existing ? "saved" : "idle");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saveError, setSaveError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [uploading, setUploading] = useState(false);
  const [coverError, setCoverError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  // Live: approved and public. In review: with our editors now. Both save only when asked.
  const status = existing?.status ?? "DRAFT";
  const live = status === "PUBLISHED" && existing?.moderationStatus === "APPROVED";
  const inReview = status === "IN_REVIEW";
  const autosaves = !live && !inReview;

  const fileRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const subtitleRef = useRef<HTMLTextAreaElement>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] }, codeBlock: false, code: false, strike: false, link: false }),
      Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: "noopener nofollow ugc", target: "_blank" } }),
      Placeholder.configure({ placeholder: "Tell your story…" }),
    ],
    content: html,
    editorProps: {
      attributes: {
        "aria-label": "Your story",
        class: "prose prose-lg dark:prose-invert max-w-none min-h-[40vh] focus:outline-none font-jakarta prose-headings:font-sora prose-a:text-brand",
      },
    },
    onCreate: ({ editor: e }) => count(e),
    onUpdate: ({ editor: e }) => { setHtml(e.getHTML()); count(e); setSave("dirty"); },
  });

  function count(e: Editor) {
    const text = e.state.doc.textContent;
    setTextLength(text.length);
    setWords(text.trim() ? text.trim().split(/\s+/).length : 0);
  }

  // The title and subtitle grow with their text, like a page.
  const grow = (el: HTMLTextAreaElement | null) => { if (el) { el.style.height = "auto"; el.style.height = `${el.scrollHeight}px`; } };
  useEffect(() => { grow(titleRef.current); }, [title]);
  useEffect(() => { grow(subtitleRef.current); }, [subtitle]);

  // "Saved 2 min ago" keeps counting.
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, []);

  /* ── Saving ─────────────────────────────────────────────────────────────── */

  const latest = useRef({ articleId, startupId, title, subtitle, cover, html });
  latest.current = { articleId, startupId, title, subtitle, cover, html };
  const busy = useRef(false);
  const lastSaveStart = useRef(0);

  /** Saves the draft to the account. Returns the story's id, or null when it couldn't be saved. */
  const saveDraft = useCallback(async (): Promise<string | null> => {
    const v = latest.current;
    if (v.title.trim().length < TITLE_MIN || !v.startupId) return v.articleId;
    if (busy.current) return v.articleId;
    busy.current = true;
    lastSaveStart.current = Date.now();
    setSave("saving");
    try {
      const fields = { title: v.title.trim(), content: v.html, excerpt: v.subtitle.trim(), coverImage: v.cover };
      const res = v.articleId
        ? await fetch(`/api/founder/content/${v.articleId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...fields, isAutoSave: true }) })
        : await fetch("/api/founder/content", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...fields, type: "FOUNDER_STORY", startupId: v.startupId, isDraft: true }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || "Couldn’t save. Check your connection.");
      const id: string = v.articleId ?? data.article.id;
      if (!v.articleId) {
        setArticleId(id);
        // A reload now reopens this draft instead of starting a second one. The page and "type" stay as they are,
        // so the editor isn't swapped out mid-sentence; the new-story page sends "draft" on to the edit page.
        window.history.replaceState(null, "", `/founder/content/new?type=FOUNDER_STORY&draft=${encodeURIComponent(id)}`);
      }
      setSavedAt(new Date());
      setNow(Date.now());
      setSaveError("");
      // Typed more while this was saving? Still not saved.
      const after = latest.current;
      setSave(after.title === v.title && after.subtitle === v.subtitle && after.cover === v.cover && after.html === v.html ? "saved" : "dirty");
      return id;
    } catch (e) {
      setSave("error");
      setSaveError(e instanceof Error ? e.message : "Couldn’t save.");
      return null;
    } finally {
      busy.current = false;
    }
  }, []);

  // Autosave: a few seconds after the writing pauses, and not more often than the gap.
  useEffect(() => {
    if (!autosaves || save !== "dirty") return;
    const wait = Math.max(AUTOSAVE_IDLE_MS, AUTOSAVE_GAP_MS - (Date.now() - lastSaveStart.current));
    const t = setTimeout(() => { void saveDraft(); }, lastSaveStart.current === 0 ? AUTOSAVE_IDLE_MS : wait);
    return () => clearTimeout(t);
  }, [autosaves, save, title, subtitle, cover, html, saveDraft]);

  // Leaving with unsaved writing: ask first.
  useEffect(() => {
    if (save !== "dirty" && save !== "error") return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [save]);

  const changed = () => setSave("dirty");

  /* ── Cover image ────────────────────────────────────────────────────────── */

  const uploadCover = async (file: File | undefined) => {
    if (!file) return;
    setCoverError("");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { setCoverError("Use a JPEG, PNG or WebP image."); return; }
    if (file.size > 5 * 1024 * 1024) { setCoverError("The image must be under 5 MB."); return; }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/media/upload", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) throw new Error(data.error || "Couldn’t upload the image.");
      setCover(data.url);
      changed();
    } catch (e) {
      setCoverError(e instanceof Error ? e.message : "Couldn’t upload the image.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  /* ── Sending it on ──────────────────────────────────────────────────────── */

  const problems = [
    title.trim().length < TITLE_MIN ? "Add a title." : null,
    textLength < STORY_MIN_TEXT ? `Write at least ${STORY_MIN_TEXT} characters (${textLength} so far).` : null,
    textLength > STORY_MAX_TEXT ? `Keep the story under ${STORY_MAX_TEXT.toLocaleString("en-IN")} characters.` : null,
    !startupId ? "Choose a startup." : null,
  ].filter((p): p is string => !!p);

  const action = live ? "Submit changes for review" : inReview ? "Save changes" : existing?.moderationStatus === "REJECTED" || existing?.moderationStatus === "REVISION_REQUESTED" ? "Resubmit for review" : "Submit for review";

  const send = async () => {
    setSubmitError("");
    setSubmitting(true);
    try {
      const v = latest.current;
      const fields = { title: v.title.trim(), content: v.html, excerpt: v.subtitle.trim(), coverImage: v.cover };
      const res = v.articleId
        ? await fetch(`/api/founder/content/${v.articleId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...fields, submitForReview: !inReview && !live }) })
        : await fetch("/api/founder/content", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...fields, type: "FOUNDER_STORY", startupId: v.startupId, isDraft: false }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || "Couldn’t send your story. Please try again.");
      setSave("saved");
      router.push("/founder/content");
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Couldn’t send your story.");
      setSubmitting(false);
    }
  };

  /* ── What the bar says ──────────────────────────────────────────────────── */

  const statusText =
    save === "saving" ? "Saving…"
    : save === "error" ? saveError
    : save === "dirty" && !autosaves ? "Unsaved changes"
    : save === "dirty" && title.trim().length < TITLE_MIN ? "Add a title and your draft will save itself"
    : save === "dirty" ? "Saving soon…"
    : savedAt ? `Saved to your account ${ago(savedAt, now)}`
    : existing ? (live ? "Live on Udyaibase" : inReview ? "With our editors" : "Draft")
    : "Your draft saves itself as you write";

  const readMinutes = Math.max(1, Math.ceil(words / 200));

  return (
    <div className="story-editor">
      {/* Bar: where things stand, the formatting choices, and the way forward. Stays in view while writing. */}
      <div className="sticky top-0 z-dropdown -mx-4 md:-mx-8 lg:-mx-10 px-4 md:px-8 lg:px-10 bg-page dark:bg-page-dark border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-3 min-h-[56px]">
          <button type="button" onClick={() => router.push("/founder/content")} className="inline-flex items-center gap-1.5 min-h-[40px] text-sm font-jakarta text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white shrink-0">
            <ArrowLeft className="w-4 h-4" aria-hidden /> <span className="hidden sm:inline">Content</span><span className="sm:hidden sr-only">Back to Content</span>
          </button>
          <p role="status" aria-live="polite" className={`flex-1 min-w-0 truncate text-[13px] font-jakarta flex items-center gap-1.5 ${save === "error" ? "text-red-600 dark:text-red-400" : "text-gray-500 dark:text-gray-400"}`}>
            {save === "saving" ? <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" aria-hidden /> : save === "error" ? <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden /> : save === "saved" && savedAt ? <Check className="w-3.5 h-3.5 shrink-0 text-green-600 dark:text-green-400" aria-hidden /> : null}
            <span className="truncate">{statusText}</span>
            {save === "error" && autosaves && <button type="button" onClick={() => void saveDraft()} className="font-semibold underline shrink-0">Try again</button>}
          </p>
          <span className="hidden md:inline text-[13px] font-jakarta text-gray-500 dark:text-gray-400 shrink-0">{words.toLocaleString("en-IN")} {words === 1 ? "word" : "words"} · {readMinutes} min read</span>
          <button type="button" onClick={() => { setSubmitError(""); setConfirming(true); }} className="btn-brand shrink-0">{action}</button>
        </div>
        {editor && <Toolbar editor={editor} />}
      </div>

      <div className="max-w-[720px] mx-auto pt-6 pb-24">
        {live && (
          <div role="note" className="mb-6 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300 font-jakarta">This story is live</p>
            <p className="text-sm text-amber-800 dark:text-amber-300 font-jakarta mt-0.5">Changes are reviewed by our editors before they show. While that happens, the story comes off the public site.</p>
          </div>
        )}
        {inReview && (
          <div role="note" className="mb-6 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 p-4">
            <p className="text-sm font-semibold text-blue-800 dark:text-blue-300 font-jakarta">Our editors are reviewing this story</p>
            <p className="text-sm text-blue-800 dark:text-blue-300 font-jakarta mt-0.5">You can still make changes. Save them when you’re done so the editors see the latest version.</p>
          </div>
        )}
        {existing?.moderationNote && !live && (
          <div role="note" className="mb-6 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4">
            <p className="text-xs font-bold uppercase text-amber-700 dark:text-amber-400 font-jakarta">Note from our editors</p>
            <p className="text-sm text-amber-800 dark:text-amber-300 font-jakarta mt-1">{existing.moderationNote}</p>
          </div>
        )}

        {writable.length > 1 && !articleId && (
          <label className="flex items-center gap-2 mb-5 text-sm font-jakarta text-gray-600 dark:text-gray-400">
            Writing for
            <select value={startupId} onChange={(e) => setStartupId(e.target.value)} className="px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white">
              {writable.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        )}

        {/* Cover: optional. A photo of the team or the product works best. */}
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => void uploadCover(e.target.files?.[0])} />
        {cover ? (
          <figure className="mb-6">
            {/* eslint-disable-next-line @next/next/no-img-element -- a preview of the founder's own upload, any size */}
            <img src={cover} alt="Cover for this story" className="w-full max-h-[420px] object-cover rounded-xl border border-gray-200 dark:border-gray-800" />
            <figcaption className="mt-2 flex gap-3 text-[13px] font-jakarta">
              <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="font-semibold text-gray-700 dark:text-gray-300 underline">{uploading ? "Uploading…" : "Change cover"}</button>
              <button type="button" onClick={() => { setCover(""); changed(); }} className="text-gray-500 dark:text-gray-400 underline">Remove</button>
            </figcaption>
          </figure>
        ) : (
          <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="mb-5 inline-flex items-center gap-2 min-h-[40px] text-sm font-jakarta text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <ImagePlus className="w-4 h-4" aria-hidden />}
            {uploading ? "Uploading…" : "Add a cover image"}
          </button>
        )}
        {coverError && <p role="alert" className="-mt-3 mb-5 text-[13px] font-jakarta text-red-600 dark:text-red-400">{coverError}</p>}

        <textarea
          ref={titleRef} rows={1} value={title} maxLength={TITLE_MAX} aria-label="Title" placeholder="Title"
          onChange={(e) => { setTitle(e.target.value.replace(/\n/g, " ")); changed(); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); subtitleRef.current?.focus(); } }}
          className="story-plain w-full resize-none overflow-hidden bg-transparent border-0 p-0 focus:outline-none focus:ring-0 font-sora font-extrabold text-[30px] leading-[1.2] sm:text-[40px] text-gray-900 dark:text-white placeholder:text-gray-300 dark:placeholder:text-gray-700"
        />
        <textarea
          ref={subtitleRef} rows={1} value={subtitle} maxLength={SUBTITLE_MAX} aria-label="Subtitle (optional)" placeholder="Add a subtitle (optional)"
          onChange={(e) => { setSubtitle(e.target.value.replace(/\n/g, " ")); changed(); }}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            // Move into the story at once (the editor's own focus command waits a frame, and fast typing would land here).
            editor?.view.dom.focus();
            editor?.commands.focus("start");
          }}
          className="story-plain w-full resize-none overflow-hidden bg-transparent border-0 p-0 mt-3 focus:outline-none focus:ring-0 font-jakarta text-lg sm:text-xl leading-snug text-gray-500 dark:text-gray-400 placeholder:text-gray-300 dark:placeholder:text-gray-700"
        />

        <div className="mt-8">
          {editor && (
            <BubbleMenu editor={editor} options={{ placement: "top" }} shouldShow={({ state }) => !state.selection.empty}>
              <SelectionMenu editor={editor} />
            </BubbleMenu>
          )}
          <EditorContent editor={editor} />
        </div>
      </div>

      {confirming && (
        <div className="fixed inset-0 z-modal flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="story-send-title"
          onKeyDown={(e) => { if (e.key === "Escape" && !submitting) setConfirming(false); }}>
          <div className="w-full sm:max-w-md bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
            <h2 id="story-send-title" className="text-lg font-sora font-bold text-gray-900 dark:text-white">
              {problems.length ? "Not ready yet" : live ? "Send these changes for review?" : inReview ? "Save your changes?" : "Send your story for review?"}
            </h2>
            {problems.length ? (
              <ul className="mt-3 space-y-1.5 text-sm font-jakarta text-gray-700 dark:text-gray-300 list-disc list-inside">
                {problems.map((p) => <li key={p}>{p}</li>)}
              </ul>
            ) : (
              <>
                <p className="mt-3 text-[15px] font-semibold font-jakarta text-gray-900 dark:text-white">{title.trim()}</p>
                <p className="text-[13px] font-jakarta text-gray-500 dark:text-gray-400 mt-0.5">{words.toLocaleString("en-IN")} words · {readMinutes} min read{cover ? " · with a cover image" : ""}</p>
                <p className="mt-3 text-sm font-jakarta text-gray-600 dark:text-gray-400">
                  {live ? "Your story comes off the public site until our editors approve it again."
                    : inReview ? "Our editors will see the latest version."
                    : "Our editors read every story before it goes live. You can follow its status under Content."}
                </p>
              </>
            )}
            {submitError && <p role="alert" className="mt-3 text-sm font-jakarta text-red-600 dark:text-red-400">{submitError}</p>}
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" autoFocus onClick={() => setConfirming(false)} disabled={submitting} className="min-h-[44px] px-4 rounded-[10px] border border-gray-300 dark:border-gray-700 text-sm font-semibold text-gray-800 dark:text-gray-200">
                {problems.length ? "Keep writing" : "Not yet"}
              </button>
              {!problems.length && (
                <button type="button" onClick={() => void send()} disabled={submitting} className="btn-brand min-h-[44px] gap-2">
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} {action}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Formatting ───────────────────────────────────────────────────────────── */

function Tool({ label, active, onClick, children }: { label: string; active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button" title={label} aria-label={label} aria-pressed={active}
      onMouseDown={(e) => e.preventDefault()} // keep the selection in the story
      onClick={onClick}
      className={`w-9 h-9 flex items-center justify-center rounded-lg shrink-0 ${active ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900" : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"}`}
    >
      {children}
    </button>
  );
}

/** Adds, changes or removes a link on the selected text. Only full web addresses are kept. */
function setLink(editor: Editor) {
  const current = editor.getAttributes("link").href as string | undefined;
  const answer = window.prompt("Link address (leave empty to remove the link)", current ?? "https://");
  if (answer === null) return;
  const url = answer.trim();
  if (!url || url === "https://") { editor.chain().focus().extendMarkRange("link").unsetLink().run(); return; }
  const full = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  editor.chain().focus().extendMarkRange("link").setLink({ href: full }).run();
}

function Toolbar({ editor }: { editor: Editor }) {
  return (
    <div role="toolbar" aria-label="Formatting" className="flex items-center gap-0.5 pb-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <Tool label="Large heading" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 className="w-4 h-4" aria-hidden /></Tool>
      <Tool label="Small heading" active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}><Heading3 className="w-4 h-4" aria-hidden /></Tool>
      <span className="w-px h-5 bg-gray-200 dark:bg-gray-800 mx-1 shrink-0" aria-hidden />
      <Tool label="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}><Bold className="w-4 h-4" aria-hidden /></Tool>
      <Tool label="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic className="w-4 h-4" aria-hidden /></Tool>
      <Tool label="Link" active={editor.isActive("link")} onClick={() => setLink(editor)}><LinkIcon className="w-4 h-4" aria-hidden /></Tool>
      <span className="w-px h-5 bg-gray-200 dark:bg-gray-800 mx-1 shrink-0" aria-hidden />
      <Tool label="Quote" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}><Quote className="w-4 h-4" aria-hidden /></Tool>
      <Tool label="Bullet list" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}><List className="w-4 h-4" aria-hidden /></Tool>
      <Tool label="Numbered list" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered className="w-4 h-4" aria-hidden /></Tool>
      <Tool label="Divider line" onClick={() => editor.chain().focus().setHorizontalRule().run()}><Minus className="w-4 h-4" aria-hidden /></Tool>
    </div>
  );
}

/** The few choices that appear right above selected text. */
function SelectionMenu({ editor }: { editor: Editor }) {
  const cls = (on: boolean) => `w-9 h-9 flex items-center justify-center rounded-md ${on ? "bg-white/20 text-white" : "text-gray-200 hover:bg-white/10"}`;
  const hold = (e: React.MouseEvent) => e.preventDefault();
  return (
    <div role="toolbar" aria-label="Format selected text" className="flex items-center gap-0.5 rounded-xl bg-gray-900 dark:bg-gray-700 px-1.5 py-1 shadow-xl">
      <button type="button" aria-label="Bold" onMouseDown={hold} onClick={() => editor.chain().focus().toggleBold().run()} className={cls(editor.isActive("bold"))}><Bold className="w-4 h-4" aria-hidden /></button>
      <button type="button" aria-label="Italic" onMouseDown={hold} onClick={() => editor.chain().focus().toggleItalic().run()} className={cls(editor.isActive("italic"))}><Italic className="w-4 h-4" aria-hidden /></button>
      <button type="button" aria-label="Link" onMouseDown={hold} onClick={() => setLink(editor)} className={cls(editor.isActive("link"))}><LinkIcon className="w-4 h-4" aria-hidden /></button>
      <span className="w-px h-5 bg-white/20 mx-1" aria-hidden />
      <button type="button" aria-label="Large heading" onMouseDown={hold} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={cls(editor.isActive("heading", { level: 2 }))}><Heading2 className="w-4 h-4" aria-hidden /></button>
      <button type="button" aria-label="Small heading" onMouseDown={hold} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} className={cls(editor.isActive("heading", { level: 3 }))}><Heading3 className="w-4 h-4" aria-hidden /></button>
      <button type="button" aria-label="Quote" onMouseDown={hold} onClick={() => editor.chain().focus().toggleBlockquote().run()} className={cls(editor.isActive("blockquote"))}><Quote className="w-4 h-4" aria-hidden /></button>
      {editor.isActive("link") && <button type="button" aria-label="Remove link" onMouseDown={hold} onClick={() => editor.chain().focus().extendMarkRange("link").unsetLink().run()} className={cls(false)}><X className="w-4 h-4" aria-hidden /></button>}
    </div>
  );
}
