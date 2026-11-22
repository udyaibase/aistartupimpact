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
  ImagePlus, Image as ImageIcon, Loader2, Check, X, AlertCircle, Eye, Lightbulb, Circle, Smartphone, Monitor, PenLine,
} from "lucide-react";
import { StoryImage } from "./storyImage";

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
/** Pictures inside one story. */
const MAX_PICTURES = 12;
const GUIDE_KEY = "story-guide-hidden";

const TIPS: { title: string; text: string }[] = [
  { title: "Open with a moment", text: "Start with a scene: the day a customer said no, the first sale, the night the server went down." },
  { title: "Be specific", text: "Numbers, places, names and dates make a story believable. “40 farmers in 3 weeks” beats “quick growth”." },
  { title: "Share what went wrong", text: "Readers learn most from the mistakes and what you changed because of them." },
  { title: "Break it into sections", text: "Use a large heading every few paragraphs so people can scan and jump around on a phone." },
  { title: "Add pictures", text: "Your team, the product, the first office. A short description under each helps everyone." },
];

/** Uploads one picture through our media upload and returns its address. */
async function uploadImage(file: File, folder: "stories" | "covers" = "stories"): Promise<string> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Use a JPEG, PNG or WebP image.");
  if (file.size > 5 * 1024 * 1024) throw new Error("The image must be under 5 MB.");
  const form = new FormData();
  form.append("file", file);
  form.append("folder", folder);
  const res = await fetch("/api/media/upload", { method: "POST", body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.url) throw new Error(data.error || "Couldn’t upload the image.");
  return data.url as string;
}

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
  const [preview, setPreview] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  /** On phones a new story starts with a one-line pointer to the guide instead of the whole guide. */
  const [guideHint, setGuideHint] = useState(false);
  const [pictureBusy, setPictureBusy] = useState(false);
  const [pictureError, setPictureError] = useState("");
  const [pictures, setPictures] = useState(0);
  const [headings, setHeadings] = useState(0);

  // Live: approved and public. In review: with our editors now. Both save only when asked.
  const status = existing?.status ?? "DRAFT";
  const live = status === "PUBLISHED" && existing?.moderationStatus === "APPROVED";
  const inReview = status === "IN_REVIEW";
  const autosaves = !live && !inReview;

  const fileRef = useRef<HTMLInputElement>(null);
  const pictureRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const subtitleRef = useRef<HTMLTextAreaElement>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] }, codeBlock: false, code: false, strike: false, link: false }),
      Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: "noopener nofollow ugc", target: "_blank" } }),
      Placeholder.configure({ placeholder: "Tell your story…" }),
      StoryImage,
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
    let imgs = 0, heads = 0;
    e.state.doc.descendants((n) => { if (n.type.name === "image") imgs++; else if (n.type.name === "heading") heads++; });
    setPictures(imgs);
    setHeadings(heads);
  }

  // The title and subtitle grow with their text, like a page.
  const grow = (el: HTMLTextAreaElement | null) => { if (el) { el.style.height = "auto"; el.style.height = `${el.scrollHeight}px`; } };
  useEffect(() => { grow(titleRef.current); }, [title]);
  useEffect(() => { grow(subtitleRef.current); }, [subtitle]);

  // The writing guide opens by itself for a new story, until the founder closes it once.
  useEffect(() => {
    if (existing) return;
    let hidden = false;
    try { hidden = localStorage.getItem(GUIDE_KEY) === "1"; } catch { /* show it */ }
    if (hidden) return;
    if (window.matchMedia("(max-width: 639px)").matches) setGuideHint(true); else setGuideOpen(true);
  }, [existing]);
  const closeGuide = () => { setGuideOpen(false); setGuideHint(false); try { localStorage.setItem(GUIDE_KEY, "1"); } catch { /* fine */ } };

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
    setUploading(true);
    try {
      setCover(await uploadImage(file, "covers"));
      changed();
    } catch (e) {
      setCoverError(e instanceof Error ? e.message : "Couldn’t upload the image.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  /* ── Pictures inside the story ──────────────────────────────────────────── */

  const addPicture = async (file: File | undefined) => {
    if (!file || !editor) return;
    setPictureError("");
    if (pictures >= MAX_PICTURES) { setPictureError(`A story can have up to ${MAX_PICTURES} pictures.`); return; }
    setPictureBusy(true);
    try {
      const src = await uploadImage(file);
      const alt = (window.prompt("Describe the picture in a few words (shown to people who can’t see it)", "") ?? "").trim().slice(0, 200);
      editor.chain().focus().insertContent([{ type: "image", attrs: { src, alt } }, { type: "paragraph" }]).run();
    } catch (e) {
      setPictureError(e instanceof Error ? e.message : "Couldn’t upload the image.");
    } finally {
      setPictureBusy(false);
      if (pictureRef.current) pictureRef.current.value = "";
    }
  };

  /* ── Sending it on ──────────────────────────────────────────────────────── */

  const problems = [
    title.trim().length < TITLE_MIN ? "Add a title." : null,
    textLength < STORY_MIN_TEXT ? `Write at least ${STORY_MIN_TEXT} characters (${textLength} so far).` : null,
    textLength > STORY_MAX_TEXT ? `Keep the story under ${STORY_MAX_TEXT.toLocaleString("en-IN")} characters.` : null,
    !startupId ? "Choose a startup." : null,
  ].filter((p): p is string => !!p);

  // Not required, but they make a story better. Shown as a checklist before sending and in the guide.
  const suggestions = [
    { done: subtitle.trim().length >= 20, label: "A subtitle that says what the story is about" },
    { done: !!cover, label: "A cover picture" },
    { done: words >= 300, label: `At least 300 words (${words.toLocaleString("en-IN")} so far)` },
    { done: headings >= 2, label: "Two or more headings, so it's easy to read on a phone" },
    { done: pictures >= 1, label: "A picture inside the story" },
  ];

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
      {/* Bar: where things stand, the formatting choices, and the way forward. Stays in view while writing, attached
          to the portal header: -mt-4 and -top-4 take up the page's top padding, at rest and while scrolling. */}
      <div className="sticky -top-4 z-dropdown -mt-4 -mx-4 md:-mx-8 lg:-mx-10 px-4 md:px-8 lg:px-10 bg-page dark:bg-page-dark border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-3 min-h-[56px]">
          <button type="button" onClick={() => router.push("/founder/content")} aria-label="Back to Content" className="inline-flex items-center justify-center gap-1.5 min-h-[40px] min-w-[40px] -ml-2 px-2 rounded-full sm:rounded-[8px] active:bg-gray-100 dark:active:bg-gray-800 text-sm font-jakarta text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white shrink-0">
            <ArrowLeft className="w-4 h-4" aria-hidden /> <span className="hidden sm:inline">Content</span><span className="sm:hidden sr-only">Back to Content</span>
          </button>
          <p role="status" aria-live="polite" className={`flex-1 min-w-0 truncate text-[13px] font-jakarta flex items-center gap-1.5 ${save === "error" ? "text-red-600 dark:text-red-400" : "text-gray-500 dark:text-gray-400"}`}>
            {save === "saving" ? <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" aria-hidden /> : save === "error" ? <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden /> : save === "saved" && savedAt ? <Check className="w-3.5 h-3.5 shrink-0 text-green-600 dark:text-green-400" aria-hidden /> : null}
            <span className="truncate">{statusText}</span>
            {save === "error" && autosaves && <button type="button" onClick={() => void saveDraft()} className="font-semibold underline shrink-0">Try again</button>}
          </p>
          <span className="hidden md:inline text-[13px] font-jakarta text-gray-500 dark:text-gray-400 shrink-0">{words.toLocaleString("en-IN")} {words === 1 ? "word" : "words"} · {readMinutes} min read</span>
          <button type="button" onClick={() => setPreview(true)} aria-label="Preview"
            className="inline-flex items-center justify-center gap-1.5 min-h-[40px] min-w-[40px] px-2 sm:px-3 rounded-full sm:rounded-[10px] sm:border sm:border-gray-200 sm:dark:border-gray-700 text-sm font-semibold font-jakarta text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 shrink-0">
            <Eye className="w-[18px] h-[18px]" aria-hidden /><span className="hidden sm:inline">Preview</span>
          </button>
          <button type="button" onClick={() => { setSubmitError(""); setConfirming(true); }} className="btn-brand shrink-0">{action}</button>
        </div>
        {editor && (
          <Toolbar editor={editor}
            onPicture={() => pictureRef.current?.click()} pictureBusy={pictureBusy}
            onGuide={() => { setGuideHint(false); setGuideOpen((o) => !o); }} guideOpen={guideOpen} />
        )}
      </div>

      <input ref={pictureRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => void addPicture(e.target.files?.[0])} />
      {pictureError && (
        <div role="alert" className="max-w-[720px] mx-auto mt-3 flex items-start gap-2 rounded-[10px] bg-red-50 dark:bg-red-900/20 px-3 py-2.5 text-sm text-red-700 dark:text-red-300 font-jakarta">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden /> <span className="flex-1">{pictureError}</span>
          <button type="button" onClick={() => setPictureError("")} aria-label="Dismiss" className="-my-1 -mr-1 w-8 h-8 flex items-center justify-center rounded-full"><X className="w-4 h-4" aria-hidden /></button>
        </div>
      )}

      <div className="max-w-[720px] mx-auto pt-6 pb-24">
        {guideOpen && <Guide onClose={closeGuide} suggestions={suggestions} />}
        {!guideOpen && guideHint && (
          <div className="mb-5 flex items-center gap-2 rounded-[12px] bg-amber-50 dark:bg-amber-900/20 pl-3 pr-1 py-1 text-sm font-jakarta text-amber-900 dark:text-amber-200">
            <Lightbulb className="w-4 h-4 shrink-0" aria-hidden />
            <button type="button" onClick={() => { setGuideHint(false); setGuideOpen(true); }} className="flex-1 min-h-[40px] text-left font-semibold">5 quick tips for a story people finish</button>
            <button type="button" onClick={closeGuide} aria-label="Hide tips" className="w-10 h-10 flex items-center justify-center rounded-full"><X className="w-4 h-4" aria-hidden /></button>
          </div>
        )}

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
          <div className="w-full sm:max-w-md max-h-[90vh] overflow-y-auto bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl border border-gray-200 dark:border-gray-800 p-5 sm:p-6 pb-[calc(env(safe-area-inset-bottom)+20px)] sm:pb-6">
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
                {suggestions.some((x) => !x.done) && (
                  <div className="mt-4 rounded-[12px] bg-gray-50 dark:bg-gray-800/60 p-3">
                    <p className="text-[13px] font-semibold text-gray-700 dark:text-gray-300 font-jakarta">Optional, but stories with these get read more</p>
                    <Checklist items={suggestions} />
                  </div>
                )}
                <p className="mt-3 text-sm font-jakarta text-gray-600 dark:text-gray-400">
                  {live ? "Your story comes off the public site until our editors approve it again."
                    : inReview ? "Our editors will see the latest version."
                    : "Our editors read every story before it goes live. You can follow its status under Content."}
                </p>
              </>
            )}
            {submitError && <p role="alert" className="mt-3 text-sm font-jakarta text-red-600 dark:text-red-400">{submitError}</p>}
            <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              {!problems.length && (
                <button type="button" onClick={() => { setConfirming(false); setPreview(true); }} disabled={submitting} className="sm:mr-auto min-h-[44px] px-3 rounded-[10px] text-sm font-semibold text-gray-700 dark:text-gray-300 inline-flex items-center justify-center gap-1.5 hover:bg-gray-100 dark:hover:bg-gray-800">
                  <Eye className="w-4 h-4" aria-hidden /> Preview first
                </button>
              )}
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

      {preview && (
        <ReaderPreview
          onClose={() => setPreview(false)}
          title={title} subtitle={subtitle} cover={cover} html={html}
          startup={writable.find((x) => x.id === startupId)?.name || startups.find((x) => x.id === startupId)?.name || ""}
          readMinutes={readMinutes}
        />
      )}
    </div>
  );
}

/* ── Guide, checklist and preview ─────────────────────────────────────────── */

function Checklist({ items }: { items: { done: boolean; label: string }[] }) {
  return (
    <ul className="mt-2 space-y-1.5">
      {items.map((x) => (
        <li key={x.label} className="flex items-start gap-2 text-[13px] font-jakarta">
          {x.done
            ? <Check className="w-4 h-4 mt-px shrink-0 text-green-600 dark:text-green-400" aria-label="Done" />
            : <Circle className="w-4 h-4 mt-px shrink-0 text-gray-300 dark:text-gray-600" aria-label="Not yet" />}
          <span className={x.done ? "text-gray-500 dark:text-gray-400" : "text-gray-700 dark:text-gray-300"}>{x.label}</span>
        </li>
      ))}
    </ul>
  );
}

/** A short guide to writing a story people finish, with how this one is doing. */
function Guide({ onClose, suggestions }: { onClose: () => void; suggestions: { done: boolean; label: string }[] }) {
  return (
    <section aria-labelledby="story-guide-title" className="mb-6 rounded-[14px] border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-[10px] bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0"><Lightbulb className="w-[18px] h-[18px]" aria-hidden /></span>
          <h2 id="story-guide-title" className="font-sora font-bold text-[15px] text-gray-900 dark:text-white">Writing a story people finish</h2>
        </div>
        <button type="button" onClick={onClose} aria-label="Close the guide" className="-mr-2 -mt-1 w-10 h-10 flex items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"><X className="w-5 h-5" aria-hidden /></button>
      </div>
      <ol className="mt-3 space-y-2.5">
        {TIPS.map((t, i) => (
          <li key={t.title} className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-gray-100 dark:bg-gray-800 text-xs font-bold text-gray-600 dark:text-gray-300 flex items-center justify-center shrink-0 mt-px">{i + 1}</span>
            <p className="text-sm leading-relaxed font-jakarta text-gray-600 dark:text-gray-400"><span className="font-semibold text-gray-900 dark:text-white">{t.title}.</span> {t.text}</p>
          </li>
        ))}
      </ol>
      <div className="mt-4 border-t border-gray-100 dark:border-gray-800 pt-3">
        <p className="text-[13px] font-semibold text-gray-700 dark:text-gray-300 font-jakarta">This story so far</p>
        <Checklist items={suggestions} />
      </div>
      <p className="mt-3 text-[13px] text-gray-500 dark:text-gray-400 font-jakarta">Our editors read every story before it goes live and may suggest changes.</p>
    </section>
  );
}

/** The story as readers will see it, on a phone or a computer. */
function ReaderPreview({ onClose, title, subtitle, cover, html, startup, readMinutes }: {
  onClose: () => void; title: string; subtitle: string; cover: string; html: string; startup: string; readMinutes: number;
}) {
  const [device, setDevice] = useState<"phone" | "computer">(() => (typeof window !== "undefined" && window.innerWidth < 640 ? "phone" : "computer"));
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);
  const initials = startup.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "S";
  const today = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  return (
    <div role="dialog" aria-modal="true" aria-label="Preview" className="fixed inset-0 z-modal flex flex-col bg-gray-100 dark:bg-black">
      <div className="flex items-center gap-2 px-3 sm:px-5 min-h-[56px] bg-white dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <button type="button" onClick={onClose} className="inline-flex items-center gap-1.5 min-h-[40px] px-2 -ml-1 rounded-full text-sm font-semibold font-jakarta text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800">
          <PenLine className="w-4 h-4" aria-hidden /> Back to writing
        </button>
        <p className="flex-1 text-center text-[13px] text-gray-500 font-jakarta truncate hidden sm:block">Preview: how readers will see your story</p>
        <div role="group" aria-label="Screen size" className="hidden sm:flex ml-auto gap-0.5 rounded-[10px] bg-gray-100 dark:bg-gray-900 p-0.5">
          {([["phone", Smartphone, "Phone"], ["computer", Monitor, "Computer"]] as const).map(([id, Icon, label]) => (
            <button key={id} type="button" aria-pressed={device === id} onClick={() => setDevice(id)}
              className={`inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-[8px] text-sm font-semibold font-jakarta ${device === id ? "bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm" : "text-gray-500"}`}>
              <Icon className="w-4 h-4" aria-hidden /> {label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className={`mx-auto bg-white dark:bg-gray-950 min-h-full transition-[max-width] ${device === "phone" ? "max-w-[390px] sm:my-6 sm:rounded-[24px] sm:border sm:border-gray-200 sm:dark:border-gray-800 sm:min-h-0 sm:shadow-xl" : "max-w-[900px]"}`}>
          <article className={`mx-auto max-w-[720px] ${device === "phone" ? "px-4 py-5" : "px-4 sm:px-8 py-8"}`}>
            <span className="inline-flex items-center gap-1 rounded-full bg-brand/10 text-brand px-2.5 py-0.5 text-xs font-semibold font-jakarta"><PenLine className="w-3 h-3" aria-hidden /> By the founder</span>
            <h1 className={`mt-3 font-sora font-extrabold tracking-tight text-gray-900 dark:text-white ${device === "phone" ? "text-[26px] leading-[1.2]" : "text-[26px] leading-[1.2] sm:text-[36px] sm:leading-[1.15]"}`}>{title.trim() || "Your title"}</h1>
            {subtitle.trim() && <p className="mt-3 text-[17px] leading-relaxed text-gray-600 dark:text-gray-400 font-jakarta">{subtitle}</p>}
            <div className="mt-5 flex items-center gap-3 border-y border-gray-100 dark:border-gray-800 py-3">
              <span className="w-11 h-11 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center font-sora font-bold text-sm text-gray-600 dark:text-gray-300" aria-hidden>{initials}</span>
              <div className="min-w-0">
                <p className="text-[15px] font-semibold text-gray-900 dark:text-white font-jakarta truncate">Your name</p>
                <p className="text-[13px] text-gray-500 font-jakarta truncate">Founder{startup ? `, ${startup}` : ""}</p>
                <p className="text-[13px] text-gray-500 font-jakarta">{today} · {readMinutes} min read</p>
              </div>
            </div>
            {cover && (
              // eslint-disable-next-line @next/next/no-img-element -- the founder's own upload, previewed as is
              <img src={cover} alt="" className="mt-5 w-full aspect-[16/9] object-cover rounded-[14px]" />
            )}
            {/* The founder's own writing from the editor; the server cleans it again when it's saved. */}
            <div className="mt-6 article-content story-body prose dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: html || "<p>Your story will appear here.</p>" }} />
          </article>
        </div>
      </div>
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
      className={`w-10 h-10 flex items-center justify-center rounded-lg shrink-0 ${active ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900" : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"}`}
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

function Toolbar({ editor, onPicture, pictureBusy, onGuide, guideOpen }: { editor: Editor; onPicture: () => void; pictureBusy: boolean; onGuide: () => void; guideOpen: boolean }) {
  return (
    <div role="toolbar" aria-label="Formatting" className="flex items-center gap-0.5 pb-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={onPicture} disabled={pictureBusy} aria-label="Add a picture"
        className="inline-flex items-center gap-1.5 h-10 px-2.5 rounded-lg shrink-0 text-sm font-semibold font-jakarta text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-60">
        {pictureBusy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <ImageIcon className="w-4 h-4" aria-hidden />}
        <span>{pictureBusy ? "Uploading…" : "Picture"}</span>
      </button>
      <span className="w-px h-5 bg-gray-200 dark:bg-gray-800 mx-1 shrink-0" aria-hidden />
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
      <button type="button" onClick={onGuide} aria-pressed={guideOpen} aria-label="Writing guide"
        className={`ml-auto inline-flex items-center gap-1.5 h-10 px-2.5 rounded-lg shrink-0 text-sm font-semibold font-jakarta ${guideOpen ? "bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300" : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"}`}>
        <Lightbulb className="w-4 h-4" aria-hidden /><span>Guide</span>
      </button>
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
