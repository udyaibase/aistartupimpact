'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import {
  ArrowLeft, Save, ChevronDown, ChevronUp, Image as ImageIcon, Hash, Clock, Globe,
  Settings2, X, CheckCircle, Upload, AlertCircle, Lock,
  Heading1, Heading2, Quote, List, ListOrdered, Code, Minus, Type, Eye,
  Plus, ImagePlus, Lightbulb, Trash2,
} from 'lucide-react';
import { sanitizePastedHtml, textToHtml } from '@/lib/editor-html';
import SelectionToolbar from '@/components/SelectionToolbar';
import { useEditorMentions } from '@/components/useEditorMentions';
import MediaPicker from '@/components/MediaPicker';
import SEOScorePanel from '@/components/SEOScorePanel';
import ImageAltTextManager from '@/components/ImageAltTextManager';
import { uploadMediaAction, saveArticleAction, getArticleByIdAction, getCategoriesAction, type ArticlePayload } from './actions';

/**
 * The article editor, for new articles and existing ones. Drafts autosave every 30 seconds; live and scheduled
 * articles only save when you press Save/Update. Writers submit for review; editors publish or schedule.
 */

const PUBLISHER_ROLES = ['SUPER_ADMIN', 'EDITOR_IN_CHIEF'];
const TYPES = ['NEWS', 'STORY', 'OPINION', 'GUIDE', 'COMPARISON', 'REPORT', 'SPONSORED'];
const AUTOSAVE_MS = 30_000;
const LIVE = ['PUBLISHED', 'SCHEDULED'];

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120);
const escAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
/** ISO time ↔ the browser's local time in a datetime-local input (the editor's own time zone, e.g. IST). */
const toLocalInput = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

function Toggle({ value, onChange, disabled }: { value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={value} disabled={disabled} onClick={() => onChange(!value)}
      className={`w-10 h-6 rounded-full relative transition-colors disabled:opacity-40 ${value ? 'bg-brand' : 'bg-gray-200 dark:bg-gray-700'}`}>
      <span className={`w-4 h-4 bg-white rounded-full absolute top-1 shadow-sm transition-all ${value ? 'left-5' : 'left-1'}`} />
    </button>
  );
}

const editorClasses = `min-h-[500px] focus:outline-none font-jakarta text-[18px] text-charcoal dark:text-gray-200 leading-[1.8] selection:bg-brand/20
  [&:empty]:before:content-[attr(data-placeholder)] [&:empty]:before:text-gray-200 dark:[&:empty]:before:text-gray-700 [&:empty]:before:pointer-events-none
  [&_h2]:font-sora [&_h2]:font-bold [&_h2]:text-[28px] [&_h2]:text-navy dark:[&_h2]:text-white [&_h2]:mt-10 [&_h2]:mb-4 [&_h2]:leading-tight
  [&_h3]:font-sora [&_h3]:font-bold [&_h3]:text-[22px] [&_h3]:text-navy dark:[&_h3]:text-white [&_h3]:mt-8 [&_h3]:mb-3 [&_h3]:leading-tight
  [&_blockquote]:border-l-4 [&_blockquote]:border-brand [&_blockquote]:pl-5 [&_blockquote]:py-2 [&_blockquote]:my-6 [&_blockquote]:italic [&_blockquote]:text-gray-500 dark:[&_blockquote]:text-gray-400 [&_blockquote]:text-xl
  [&_a]:text-brand [&_a]:no-underline hover:[&_a]:underline [&_a.link-underline]:underline [&_a]:decoration-brand/40 [&_a]:underline-offset-2 [&_a_u]:no-underline
  [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:my-4 [&_ul]:space-y-1
  [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:my-4 [&_ol]:space-y-1
  [&_pre]:bg-gray-100 dark:[&_pre]:bg-gray-800 [&_pre]:p-4 [&_pre]:rounded-xl [&_pre]:text-sm [&_pre]:font-mono [&_pre]:text-brand [&_pre]:my-4 [&_pre]:overflow-x-auto
  [&_code]:bg-gray-100 dark:[&_code]:bg-gray-800 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-sm [&_code]:font-mono [&_code]:text-brand
  [&_hr]:my-8 [&_hr]:border-gray-200 dark:[&_hr]:border-gray-700
  [&_figure]:my-6 [&_figcaption]:text-center [&_figcaption]:text-sm [&_figcaption]:text-gray-400 [&_figcaption]:mt-2
  [&_img]:rounded-xl [&_img]:w-full [&_p]:mb-4 [&_b]:font-bold [&_strong]:font-bold [&_i]:italic [&_em]:italic
  [&_.mention]:bg-brand/10 [&_.mention]:text-brand [&_.mention]:font-semibold [&_.mention]:no-underline [&_.mention]:px-1 [&_.mention]:py-0.5 [&_.mention]:rounded [&_.mention]:text-[16px] [&_.mention]:cursor-default`;

const sideLabel = 'text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta';
const seoInput = 'w-full px-4 py-3 bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 focus:border-brand focus:ring-1 focus:ring-brand rounded-xl text-sm font-jakarta text-navy dark:text-white outline-none transition-all';
const seoLabel = 'text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-2 flex items-center justify-between font-jakarta';

export default function ArticleEditor({ articleId }: { articleId?: string }) {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role;

  const [id, setId] = useState<string | null>(articleId ?? null);
  const [loading, setLoading] = useState(!!articleId);
  const [loadError, setLoadError] = useState('');
  const [canEdit, setCanEdit] = useState(true);
  const [serverCanPublish, setServerCanPublish] = useState<boolean | null>(null);
  const canPublish = serverCanPublish ?? (!!role && PUBLISHER_ROLES.includes(role));

  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activePanel, setActivePanel] = useState<string>('status');
  const editorRef = useRef<HTMLDivElement>(null);
  const editorWrapRef = useRef<HTMLDivElement>(null);
  const [categories, setCategories] = useState<Array<{ id: string; name: string; slug: string }>>([]);

  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [plusBtnPos, setPlusBtnPos] = useState<number | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  // Settings
  const [status, setStatus] = useState('DRAFT');
  const [savedStatus, setSavedStatus] = useState('DRAFT');
  const [scheduleDate, setScheduleDate] = useState('');
  const [category, setCategory] = useState('');
  const [tags, setTags] = useState('');
  const [articleType, setArticleType] = useState('NEWS');
  const [seoTitle, setSeoTitle] = useState('');
  const [metaDesc, setMetaDesc] = useState('');
  const [focusKeyword, setFocusKeyword] = useState('');
  const [canonicalUrl, setCanonicalUrl] = useState('');
  const [ogImage, setOgImage] = useState('');
  const [noIndex, setNoIndex] = useState(false);
  const [seoPanelOpen, setSeoPanelOpen] = useState(true);
  const [picker, setPicker] = useState<null | 'og' | 'inline'>(null);
  const inlineRange = useRef<Range | null>(null);
  const [keyTakeaways, setKeyTakeaways] = useState<string[]>([]);
  const [newTakeaway, setNewTakeaway] = useState('');
  const [featured, setFeatured] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [sponsored, setSponsored] = useState(false);
  const [slug, setSlug] = useState('');
  const slugEdited = useRef(!!articleId);
  const [coverImage, setCoverImage] = useState<string | null>(null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [thumbnailImage, setThumbnailImage] = useState<string | null>(null);
  const [uploadingThumbnail, setUploadingThumbnail] = useState(false);
  const thumbnailInputRef = useRef<HTMLInputElement>(null);

  // Save state
  const [lastSaved, setLastSaved] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [saveMsg, setSaveMsg] = useState<{ text: string; error?: boolean } | null>(null);
  // Unsaved = the fields differ from what was last saved, or the body was edited since.
  const savedKey = useRef<string | null>(null);
  const bodyVersion = useRef(0);
  const [bodyDirty, setBodyDirty] = useState(false);

  // Body snapshot for word count, SEO checks and preview: refreshed shortly after typing stops, not per keystroke.
  const [bodyHtml, setBodyHtml] = useState('');
  const [wordCount, setWordCount] = useState(0);
  const readTime = Math.max(1, Math.ceil(wordCount / 200));
  const snapTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const snapshot = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    setBodyHtml(el.innerHTML);
    const words = (el.innerText || '').trim();
    setWordCount(words ? words.split(/\s+/).length : 0);
  }, []);
  const onBodyChange = useCallback(() => {
    bodyVersion.current++;
    setBodyDirty(true);
    clearTimeout(snapTimer.current);
    snapTimer.current = setTimeout(snapshot, 500);
  }, [snapshot]);

  const fieldsKey = (f: Record<string, unknown>) => JSON.stringify(f);
  const fields = {
    title, subtitle, status, scheduleDate, category, tags, articleType, seoTitle, metaDesc, focusKeyword,
    canonicalUrl, ogImage, noIndex, keyTakeaways, featured, pinned, sponsored, slug, coverImage, thumbnailImage,
  };
  const currentKey = fieldsKey(fields);
  useEffect(() => { if (!loading && savedKey.current === null) savedKey.current = currentKey; }, [loading, currentKey]);
  const dirty = savedKey.current !== null && (bodyDirty || currentKey !== savedKey.current);
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;

  useEffect(() => {
    if (!slugEdited.current) setSlug(slugify(title));
  }, [title]);

  useEffect(() => {
    getCategoriesAction().then((res) => { if (res.success && res.data) setCategories(res.data); });
  }, []);

  useEffect(() => {
    if (!articleId) return;
    getArticleByIdAction(articleId).then((res) => {
      if (!res.success || !res.data) { setLoadError(res.error || 'Article not found'); setLoading(false); return; }
      const a = res.data;
      setTitle(a.title || '');
      setSubtitle(a.excerpt || '');
      setStatus(a.status || 'DRAFT');
      setSavedStatus(a.status || 'DRAFT');
      setArticleType(a.type || 'NEWS');
      setCategory(a.categoryName || '');
      setTags(a.tags || '');
      setScheduleDate(toLocalInput(a.scheduledAt));
      setSeoTitle(a.seoTitle || '');
      setMetaDesc(a.seoDescription || '');
      setSlug(a.slug || '');
      setFocusKeyword(a.focusKeyword || '');
      setCanonicalUrl(a.canonicalUrl || '');
      setOgImage(a.ogImage || '');
      setNoIndex(!!a.noIndex);
      setFeatured(!!a.isFeatured);
      setPinned(!!a.isPinned);
      setSponsored(!!a.isSponsored);
      setCoverImage(a.coverImage || null);
      setThumbnailImage(a.thumbnailImage || null);
      setKeyTakeaways(Array.isArray(a.keyTakeaways) ? a.keyTakeaways : []);
      setCanEdit(!!a.canEdit);
      setServerCanPublish(!!a.canPublish);
      if (editorRef.current) editorRef.current.innerHTML = a.html || '';
      snapshot();
      setLoading(false);
    });
  }, [articleId, snapshot]);

  const uploadImage = async (e: React.ChangeEvent<HTMLInputElement>, set: (url: string) => void, busy: (b: boolean) => void) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    busy(true);
    const formData = new FormData();
    formData.append('file', file);
    const json = await uploadMediaAction(formData).catch(() => null);
    busy(false);
    if (json?.success && json.data?.url) set(json.data.url);
    else alert(json?.error || 'Failed to upload the image.');
  };

  const handleUpdateImageAlt = (src: string, alt: string) => {
    editorRef.current?.querySelectorAll('img').forEach((img) => { if (img.getAttribute('src') === src) img.setAttribute('alt', alt); });
    onBodyChange();
  };

  const trackCursorLine = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || !sel.anchorNode || !editorRef.current?.contains(sel.anchorNode)) {
      setPlusBtnPos(null);
      setShowPlusMenu(false);
      return;
    }
    let node: Node | null = sel.anchorNode;
    if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
    const el = node as HTMLElement;
    if (!el || !editorWrapRef.current) { setPlusBtnPos(null); return; }
    if ((el.textContent || '').trim() === '') {
      setPlusBtnPos(el.getBoundingClientRect().top - editorWrapRef.current.getBoundingClientRect().top);
    } else {
      setPlusBtnPos(null);
      setShowPlusMenu(false);
    }
  }, []);

  const { checkForMention, popup: mentionPopup } = useEditorMentions(editorRef, editorWrapRef, onBodyChange);

  const format = (cmd: string, value?: string) => {
    document.execCommand(cmd, false, value);
    editorRef.current?.focus();
    onBodyChange();
  };

  // Paste: rebuild clipboard content from clean tags, so Docs/Word/web formatting never breaks the article.
  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const html = e.clipboardData.getData('text/html');
    const clean = html ? sanitizePastedHtml(html) : textToHtml(e.clipboardData.getData('text/plain'));
    if (clean) document.execCommand('insertHTML', false, clean);
    onBodyChange();
  };

  const insertImage = (url: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    const sel = window.getSelection();
    if (inlineRange.current && sel) { sel.removeAllRanges(); sel.addRange(inlineRange.current); }
    document.execCommand('insertHTML', false, `<figure><img src="${escAttr(url)}" alt=""><figcaption>Add a caption…</figcaption></figure><p><br></p>`);
    inlineRange.current = null;
    onBodyChange();
  };

  /** intent: 'publish' (editors: publish or schedule), 'submit' (writers: send for review), or a plain save. */
  const doSave = async (intent?: 'publish' | 'submit', opts: { autosave?: boolean } = {}) => {
    if (savingRef.current || !canEdit) return;
    if (!title.trim()) { if (!opts.autosave) setSaveMsg({ text: 'Add a title first', error: true }); return; }
    const scheduled = status === 'SCHEDULED' || (intent === 'publish' && !!scheduleDate && new Date(scheduleDate) > new Date());
    const targetStatus = intent === 'publish' ? (scheduled ? 'SCHEDULED' : 'PUBLISHED') : intent === 'submit' ? 'IN_REVIEW' : status;

    savingRef.current = true;
    setSaving(true);
    const versionAtSave = bodyVersion.current;
    const fieldsAtSave = { ...fields };
    const payload: ArticlePayload = {
      title, subtitle, content: editorRef.current?.innerHTML || '', category, tags, type: articleType, status: targetStatus,
      slug, seoTitle, seoDescription: metaDesc, focusKeyword, canonicalUrl, ogImage, noIndex, coverImage, thumbnailImage,
      scheduledAt: fromLocalInput(scheduleDate), isFeatured: featured, isPinned: pinned, isSponsored: sponsored,
      keyTakeaways: keyTakeaways.filter((t) => t.trim()), autosave: opts.autosave,
    };
    const json = await saveArticleAction(payload, id).catch(() => null);
    savingRef.current = false;
    setSaving(false);

    if (!json?.success) {
      if (!opts.autosave) {
        setSaveMsg({ text: json?.error || 'Couldn’t save. Check your connection.', error: true });
        setTimeout(() => setSaveMsg(null), 6000);
      }
      return;
    }
    const saved = json.data;
    // What's saved now: the fields as sent, with the status and slug the server settled on.
    savedKey.current = fieldsKey({ ...fieldsAtSave, status: saved.status, slug: saved.slug });
    if (bodyVersion.current === versionAtSave) setBodyDirty(false);
    if (!id) {
      setId(saved.id);
      // Keep the address in sync so a refresh reopens this article instead of a blank one.
      window.history.replaceState(null, '', `/articles/${saved.id}`);
    }
    setStatus(saved.status);
    setSavedStatus(saved.status);
    setSlug(saved.slug);
    slugEdited.current = true;
    setLastSaved(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }));
    if (!opts.autosave) {
      const text = json.notice || (saved.status === 'PUBLISHED' ? 'Published' : saved.status === 'SCHEDULED' ? 'Scheduled' : saved.status === 'IN_REVIEW' ? 'Submitted for review' : 'Saved');
      setSaveMsg({ text });
      setTimeout(() => setSaveMsg(null), 3000);
      if (saved.status === 'PUBLISHED') setShowPreview(false);
    }
  };

  // Autosave drafts (never live or scheduled articles: those change only when you press Update).
  const doSaveRef = useRef(doSave);
  doSaveRef.current = doSave;
  useEffect(() => {
    const t = setInterval(() => {
      if (dirtyRef.current && !LIVE.includes(savedStatus) && !LIVE.includes(status)) doSaveRef.current(undefined, { autosave: true });
    }, AUTOSAVE_MS);
    return () => clearInterval(t);
  }, [savedStatus, status]);

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  // ⌘S / Ctrl+S saves.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); doSaveRef.current(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const isLive = savedStatus === 'PUBLISHED';
  const willSchedule = status === 'SCHEDULED' || (!!scheduleDate && new Date(scheduleDate) > new Date());
  const primaryLabel = !canPublish ? 'Submit for review' : isLive ? 'Update' : willSchedule ? 'Schedule' : 'Publish';
  const primaryIntent: 'publish' | 'submit' | undefined = !canPublish ? 'submit' : isLive ? undefined : 'publish';
  const statusOptions = canPublish
    ? [['DRAFT', 'Draft'], ['IN_REVIEW', 'In review'], ['SCHEDULED', 'Scheduled'], ['PUBLISHED', 'Published'], ['ARCHIVED', 'Archived']]
    : [['DRAFT', 'Draft'], ['IN_REVIEW', 'In review']];

  const settingsPanels = [
    { id: 'status', label: 'Status & Schedule', icon: Clock },
    { id: 'category', label: 'Category & Tags', icon: Hash },
    { id: 'cover', label: 'Cover Image', icon: ImageIcon },
    ...(articleType === 'OPINION' ? [{ id: 'takeaways', label: 'Key Takeaways', icon: Lightbulb }] : []),
    { id: 'options', label: 'Article Options', icon: Settings2 },
  ];

  const plusMenuItems = [
    { icon: Heading1, label: 'Heading', desc: 'Large section heading', action: () => format('formatBlock', 'h2') },
    { icon: Heading2, label: 'Subheading', desc: 'Smaller section heading', action: () => format('formatBlock', 'h3') },
    { icon: Type, label: 'Body Text', desc: 'Normal paragraph', action: () => format('formatBlock', 'p') },
    { icon: Quote, label: 'Blockquote', desc: 'Highlighted quote', action: () => format('formatBlock', 'blockquote') },
    { icon: List, label: 'Bullet List', desc: 'Unordered list', action: () => format('insertUnorderedList') },
    { icon: ListOrdered, label: 'Numbered List', desc: 'Ordered list', action: () => format('insertOrderedList') },
    { icon: Code, label: 'Code Block', desc: 'Monospace snippet', action: () => format('formatBlock', 'pre') },
    { icon: Minus, label: 'Divider', desc: 'Horizontal line', action: () => format('insertHorizontalRule') },
    {
      icon: ImagePlus, label: 'Image', desc: 'From the media library', action: () => {
        const sel = window.getSelection();
        inlineRange.current = sel && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
        setPicker('inline');
      },
    },
  ];

  const statusLine = saving ? (
    <><Save className="w-3 h-3 animate-spin" /> Saving…</>
  ) : saveMsg ? (
    saveMsg.error
      ? <><AlertCircle className="w-3 h-3 text-red-500" /> <span className="text-red-500">{saveMsg.text}</span></>
      : <><CheckCircle className="w-3 h-3 text-green-500" /> <span className="text-green-600">{saveMsg.text}</span></>
  ) : dirty ? (
    <span className="text-amber-600">Unsaved changes</span>
  ) : (
    <span>{lastSaved ? `Saved ${lastSaved}` : id ? statusOptions.find(([v]) => v === savedStatus)?.[1] ?? savedStatus : 'New article'}</span>
  );

  if (loadError) {
    return (
      <div className="py-24 text-center font-jakarta">
        <p className="text-gray-500">{loadError}</p>
        <Link href="/articles" className="mt-3 inline-block text-brand font-semibold hover:underline">Back to articles</Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] -m-6">
      {/* Top Bar */}
      <div className="h-12 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between px-5 shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/articles" className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors" aria-label="Back to articles">
            <ArrowLeft className="w-4 h-4 text-gray-400" />
          </Link>
          <div className="flex items-center gap-2 text-xs font-jakarta text-gray-400" role="status">{statusLine}</div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { snapshot(); setShowPreview(true); }} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-jakarta text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
            <Eye className="w-4 h-4" /> Preview
          </button>
          <button onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="Settings" className={`p-2 rounded-lg transition-colors ${sidebarOpen ? 'bg-gray-100 dark:bg-gray-800 text-navy dark:text-white' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}>
            <Settings2 className="w-4 h-4" />
          </button>
          {canEdit && (<>
            {!isLive && (
              <button onClick={() => doSave()} disabled={saving || loading} title="Save (⌘S)" className="px-3 py-1.5 text-sm font-jakarta text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-40">Save</button>
            )}
            <button onClick={() => doSave(primaryIntent)} disabled={!title.trim() || saving || loading} className="px-4 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white text-sm font-semibold rounded-full transition-colors">{primaryLabel}</button>
          </>)}
        </div>
      </div>

      {!canEdit && (
        <div className="px-5 py-2 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 text-sm font-jakarta flex items-center gap-2">
          <Lock className="w-4 h-4" /> This article is live or scheduled, or belongs to someone else. You can read it; an editor can change it.
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Editor Canvas */}
        <div className={`${sidebarOpen ? 'w-[65%]' : 'flex-1'} overflow-y-auto bg-white dark:bg-gray-950 transition-all`}>
          <div className={`max-w-[720px] mx-auto py-12 px-6 ${loading ? 'opacity-40 pointer-events-none' : ''} ${!canEdit ? 'pointer-events-none' : ''}`}>
            <input type="file" ref={fileInputRef} onChange={(e) => uploadImage(e, setCoverImage, setUploadingCover)} accept="image/jpeg,image/png,image/webp,image/gif,image/avif" className="hidden" />

            {coverImage ? (
              <div className="mb-8 relative group rounded-xl overflow-hidden aspect-video bg-gray-100 dark:bg-gray-800">
                <img src={coverImage} alt="Cover" className="w-full h-full object-cover" />
                <button onClick={() => setCoverImage(null)} aria-label="Remove cover image" className="absolute top-3 right-3 p-1.5 bg-black/50 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"><X className="w-4 h-4" /></button>
              </div>
            ) : (
              <button onClick={() => fileInputRef.current?.click()} disabled={uploadingCover} className={`w-full mb-8 py-8 border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-xl text-center transition-colors group ${uploadingCover ? 'opacity-50 cursor-not-allowed' : 'hover:border-brand/40 cursor-pointer'}`}>
                {uploadingCover ? (
                  <span className="text-sm text-gray-400">Uploading...</span>
                ) : (
                  <>
                    <Upload className="w-5 h-5 text-gray-300 dark:text-gray-600 mx-auto group-hover:text-brand/50 transition-colors" />
                    <p className="text-xs text-gray-300 dark:text-gray-600 font-jakarta mt-1.5 group-hover:text-brand/50">Add a cover image</p>
                  </>
                )}
              </button>
            )}

            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" maxLength={300} className="w-full font-sora font-extrabold text-[42px] text-navy dark:text-white placeholder:text-gray-200 dark:placeholder:text-gray-700 bg-transparent focus:outline-none leading-[1.15] tracking-tight" />
            <input type="text" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="Tell your story…" maxLength={500} className="w-full font-jakarta text-xl text-gray-400 dark:text-gray-500 placeholder:text-gray-200 dark:placeholder:text-gray-700 bg-transparent focus:outline-none mt-4 leading-relaxed" />

            <div className="my-8 h-px bg-gray-100 dark:bg-gray-800" />

            {/* Rich Editor */}
            <div ref={editorWrapRef} className="relative">
              {plusBtnPos !== null && (
                <div className="absolute left-[-44px] transition-all" style={{ top: `${plusBtnPos}px` }}>
                  <button onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setShowPlusMenu(!showPlusMenu); }} aria-label="Insert block"
                    className={`w-8 h-8 flex items-center justify-center rounded-full border transition-all ${showPlusMenu ? 'bg-brand border-brand text-white rotate-45' : 'border-gray-300 dark:border-gray-600 text-gray-400 dark:text-gray-500 hover:border-brand hover:text-brand'}`}>
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              )}

              {showPlusMenu && plusBtnPos !== null && (
                <div className="absolute left-0 z-30 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl w-64 py-2" style={{ top: `${plusBtnPos + 36}px` }}>
                  <p className="px-3 pb-1 text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide font-jakarta">Insert Block</p>
                  {plusMenuItems.map(({ icon: Icon, label, desc, action }) => (
                    <button key={label} onMouseDown={(e) => { e.preventDefault(); action(); setShowPlusMenu(false); }} className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                      <div className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center shrink-0">
                        <Icon className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-semibold text-navy dark:text-white font-jakarta">{label}</p>
                        <p className="text-[11px] text-gray-400 dark:text-gray-500 font-jakarta">{desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {canEdit && <SelectionToolbar editorRef={editorRef} containerRef={editorWrapRef} onChange={onBodyChange} />}

              <div ref={editorRef} contentEditable={canEdit && !loading} suppressContentEditableWarning
                onPaste={handlePaste}
                onInput={() => { onBodyChange(); trackCursorLine(); checkForMention(); }}
                onKeyUp={() => { trackCursorLine(); checkForMention(); }}
                onClick={trackCursorLine}
                onKeyDown={(e) => {
                  if (e.key === 'Tab') { e.preventDefault(); format('insertText', '    '); }
                  if (e.key === '/') {
                    const sel = window.getSelection();
                    const t = sel?.anchorNode?.textContent || '';
                    if (t.trim() === '' || t.trim() === '/') { e.preventDefault(); setShowPlusMenu(true); }
                  }
                  if (e.key === 'Escape') setShowPlusMenu(false);
                }}
                data-placeholder="Write your story… Press / to insert blocks, @ to tag a startup or tool"
                className={editorClasses}
              />

              {mentionPopup}
            </div>

            <div className="mt-12 pt-6 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between text-sm text-gray-400 dark:text-gray-500 font-jakarta">
              <div className="flex items-center gap-4">
                <span>{wordCount.toLocaleString()} words</span>
                <span>·</span>
                <span>{readTime} min read</span>
              </div>
              {!LIVE.includes(savedStatus) && <span className="text-xs">Drafts save automatically</span>}
            </div>

            {/* SEO */}
            <div className="mt-12 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden shadow-sm">
              <button onClick={() => setSeoPanelOpen(!seoPanelOpen)} className="w-full flex items-center justify-between p-5 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                <div className="flex items-center gap-3">
                  <Globe className="w-5 h-5 text-brand" />
                  <div>
                    <h3 className="font-sora font-bold text-navy dark:text-white text-left text-[15px]">Search Engine Optimization</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 font-jakarta text-left mt-0.5">Title, meta description, social image and canonical link</p>
                  </div>
                </div>
                {seoPanelOpen ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
              </button>

              {seoPanelOpen && (
                <div className="p-6 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className={seoLabel}>SEO Title<span className={`normal-case font-medium ${seoTitle.length > 60 ? 'text-red-500' : 'text-gray-400'}`}>{seoTitle.length}/60</span></label>
                      <input type="text" className={seoInput} placeholder="Defaults to the article title" maxLength={120} value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} />
                      <p className="text-[11px] text-gray-400 mt-1.5 font-jakarta">The title shown in Google results.</p>
                    </div>
                    <div>
                      <label className={seoLabel}>Canonical URL</label>
                      <input type="url" className={seoInput} placeholder="https://..." value={canonicalUrl} onChange={(e) => setCanonicalUrl(e.target.value)} />
                      <p className="text-[11px] text-gray-400 mt-1.5 font-jakarta">Only if this was first published elsewhere.</p>
                    </div>
                  </div>
                  <div>
                    <label className={seoLabel}>Meta Description<span className={`normal-case font-medium ${metaDesc.length > 160 ? 'text-red-500' : 'text-gray-400'}`}>{metaDesc.length}/160</span></label>
                    <textarea className={`${seoInput} resize-none`} rows={3} maxLength={320} placeholder="Defaults to the subtitle" value={metaDesc} onChange={(e) => setMetaDesc(e.target.value)} />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                    <div>
                      <label className={`${seoLabel} block`}>Social Preview (OG Image)</label>
                      {ogImage ? (
                        <div className="relative group rounded-xl overflow-hidden aspect-video bg-gray-100 dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-800">
                          <img src={ogImage} className="w-full h-full object-cover" alt="Social preview" />
                          <button onClick={() => setOgImage('')} aria-label="Remove social image" className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-red-600 text-white rounded-lg transition-colors"><X className="w-4 h-4" /></button>
                        </div>
                      ) : (
                        <button onClick={() => setPicker('og')} className="w-full py-8 border-2 border-dashed border-gray-300 dark:border-gray-700 hover:border-brand dark:hover:border-brand/60 rounded-xl text-center group transition-colors">
                          <ImageIcon className="w-6 h-6 text-gray-300 dark:text-gray-600 mx-auto group-hover:text-brand/60 mb-2 transition-colors" />
                          <span className="text-sm font-medium text-gray-500 font-jakarta group-hover:text-brand transition-colors">Select from Media Library</span>
                        </button>
                      )}
                      <p className="text-[11px] text-gray-400 mt-2 font-jakarta">Shown when shared on X, LinkedIn, WhatsApp. Defaults to the cover image (1200×630 recommended).</p>
                    </div>
                    <div className="space-y-6">
                      <div>
                        <label className={`${seoLabel} block`}>Focus Keyword</label>
                        <input type="text" className={seoInput} placeholder="e.g. AI startup tools in India" maxLength={100} value={focusKeyword} onChange={(e) => setFocusKeyword(e.target.value)} />
                      </div>
                      <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
                        <div>
                          <span className="block text-sm font-bold text-navy dark:text-white font-jakarta">No Index</span>
                          <span className="block text-xs text-gray-500 font-jakarta mt-0.5">Hide this article from search engines</span>
                        </div>
                        <Toggle value={noIndex} onChange={setNoIndex} />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-8">
              <SEOScorePanel title={title} seoTitle={seoTitle} metaDescription={metaDesc} focusKeyword={focusKeyword} content={bodyHtml} slug={slug} />
            </div>
            <div className="mt-8">
              <ImageAltTextManager content={bodyHtml} focusKeyword={focusKeyword} onUpdateImage={handleUpdateImageAlt} />
            </div>

            <MediaPicker
              isOpen={picker !== null}
              onClose={() => setPicker(null)}
              title={picker === 'inline' ? 'Insert an image' : 'Select social image'}
              onSelect={(url: string) => { if (picker === 'inline') insertImage(url); else setOgImage(url); setPicker(null); }}
            />
          </div>
        </div>

        {/* Settings Sidebar */}
        {sidebarOpen && (
          <div className={`w-[340px] border-l border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 overflow-y-auto ${!canEdit ? 'pointer-events-none opacity-70' : ''}`}>
            <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
              <h3 className="font-sora font-bold text-sm text-navy dark:text-white">Settings</h3>
              <button onClick={() => setSidebarOpen(false)} aria-label="Close settings" className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors pointer-events-auto"><X className="w-4 h-4 text-gray-400" /></button>
            </div>
            <div className="divide-y divide-gray-200 dark:divide-gray-800">
              {settingsPanels.map((panel) => (
                <div key={panel.id}>
                  <button onClick={() => setActivePanel(activePanel === panel.id ? '' : panel.id)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                    <div className="flex items-center gap-2"><panel.icon className="w-4 h-4 text-gray-400" /><span className="font-jakarta font-medium text-sm text-navy dark:text-white">{panel.label}</span></div>
                    <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${activePanel === panel.id ? 'rotate-180' : ''}`} />
                  </button>
                  {activePanel === panel.id && (
                    <div className="px-4 pb-4 space-y-3">
                      {panel.id === 'status' && (<>
                        <div>
                          <label className={sideLabel}>Status</label>
                          <select className="input-field text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
                            {statusOptions.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                          </select>
                          {!canPublish && <p className="text-[11px] text-gray-400 mt-1.5 font-jakarta">An editor publishes your article after review.</p>}
                        </div>
                        {canPublish && (
                          <div>
                            <label className={sideLabel}>Publish at</label>
                            <input type="datetime-local" className="input-field text-sm" value={scheduleDate} min={toLocalInput(new Date().toISOString())}
                              onChange={(e) => { setScheduleDate(e.target.value); if (e.target.value && !isLive) setStatus('SCHEDULED'); }} />
                            <p className="text-[11px] text-gray-400 mt-1.5 font-jakarta">Your local time. It goes live within 10 minutes of this time.</p>
                            {scheduleDate && !isLive && (
                              <button type="button" onClick={() => { setScheduleDate(''); if (status === 'SCHEDULED') setStatus('DRAFT'); }} className="text-xs text-red-500 hover:underline mt-1">Clear schedule</button>
                            )}
                          </div>
                        )}
                      </>)}
                      {panel.id === 'category' && (<>
                        <div><label className={sideLabel}>Category</label><select className="input-field text-sm" value={category} onChange={(e) => setCategory(e.target.value)}><option value="">Select…</option>{categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}</select></div>
                        <div><label className={sideLabel}>Tags</label><input type="text" className="input-field text-sm" placeholder="AI, LLM, India…" value={tags} onChange={(e) => setTags(e.target.value)} />{tags && <div className="flex flex-wrap gap-1 mt-2">{tags.split(',').filter(t => t.trim()).map(t => <span key={t} className="px-2 py-0.5 bg-brand/10 text-brand text-[10px] font-semibold rounded-full">{t.trim()}</span>)}</div>}</div>
                        <div><label className={sideLabel}>Type</label><select className="input-field text-sm" value={articleType} onChange={(e) => setArticleType(e.target.value)}>{TYPES.map(t => <option key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}</option>)}</select></div>
                      </>)}
                      {panel.id === 'cover' && (
                        <div className="space-y-4">
                          <input type="file" ref={thumbnailInputRef} onChange={(e) => uploadImage(e, setThumbnailImage, setUploadingThumbnail)} accept="image/jpeg,image/png,image/webp,image/gif,image/avif" className="hidden" />
                          {([
                            ['Cover Image', '(hero, 16:9)', coverImage, setCoverImage, uploadingCover, fileInputRef, 'h-24', '16:9'],
                            ['Thumbnail', '(card preview, 4:3)', thumbnailImage, setThumbnailImage, uploadingThumbnail, thumbnailInputRef, 'h-20', '4:3'],
                          ] as const).map(([label, hint, value, set, busy, ref, h, ratio]) => (
                            <div key={label}>
                              <p className={sideLabel}>{label} <span className="normal-case font-normal text-gray-400">{hint}</span></p>
                              <div onClick={() => ref.current?.click()} className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer ${value ? 'border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/10' : 'border-gray-300 dark:border-gray-600 hover:border-brand'}`}>
                                {value ? (
                                  <>
                                    <img src={value} alt={label} className={`w-full ${h} object-cover rounded-lg mb-2`} />
                                    <button onClick={(e) => { e.stopPropagation(); set(null); }} className="text-xs text-red-500 hover:underline">Remove</button>
                                  </>
                                ) : (
                                  <>
                                    <Upload className="w-6 h-6 text-gray-300 dark:text-gray-600 mx-auto mb-1" />
                                    <p className="text-sm text-gray-400 font-jakarta">{busy ? 'Uploading...' : 'Click to upload'}</p>
                                    <p className="text-xs text-gray-300 dark:text-gray-600 font-jakarta mt-0.5">{ratio} · JPG, PNG, WebP · up to 10 MB</p>
                                  </>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {panel.id === 'takeaways' && (
                        <div className="space-y-3">
                          <p className="text-xs text-gray-400 font-jakarta">Key points readers should take away from this opinion.</p>
                          {keyTakeaways.map((t, i) => (
                            <div key={i} className="flex items-start gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-2.5 shrink-0" />
                              <span className="flex-1 text-sm text-navy dark:text-white font-jakarta">{t}</span>
                              <button onClick={() => setKeyTakeaways(keyTakeaways.filter((_, j) => j !== i))} aria-label="Remove takeaway" className="p-1 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors shrink-0">
                                <Trash2 className="w-3.5 h-3.5 text-gray-400 hover:text-red-500" />
                              </button>
                            </div>
                          ))}
                          {keyTakeaways.length < 10 && (
                            <div className="flex items-center gap-2">
                              <input type="text" className="input-field text-sm flex-1" placeholder="Add a takeaway…" maxLength={300} value={newTakeaway}
                                onChange={(e) => setNewTakeaway(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter' && newTakeaway.trim()) { e.preventDefault(); setKeyTakeaways([...keyTakeaways, newTakeaway.trim()]); setNewTakeaway(''); } }} />
                              <button onClick={() => { if (newTakeaway.trim()) { setKeyTakeaways([...keyTakeaways, newTakeaway.trim()]); setNewTakeaway(''); } }} disabled={!newTakeaway.trim()} aria-label="Add takeaway"
                                className="p-2 bg-brand text-white rounded-lg disabled:opacity-40 hover:bg-brand/90 transition-colors shrink-0">
                                <Plus className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                      {panel.id === 'options' && (<>
                        {canPublish ? (<>
                          <div className="flex items-center justify-between py-2"><span className="text-sm text-gray-600 dark:text-gray-400 font-jakarta">Featured Article</span><Toggle value={featured} onChange={setFeatured} /></div>
                          <div className="flex items-center justify-between py-2"><span className="text-sm text-gray-600 dark:text-gray-400 font-jakarta">Pinned to Top</span><Toggle value={pinned} onChange={setPinned} /></div>
                          <div className="flex items-center justify-between py-2"><span className="text-sm text-gray-600 dark:text-gray-400 font-jakarta">Sponsored Content</span><Toggle value={sponsored} onChange={setSponsored} /></div>
                        </>) : (
                          <p className="text-[11px] text-gray-400 font-jakarta">Featured, pinned and sponsored are set by an editor.</p>
                        )}
                        <div>
                          <label className={sideLabel}>URL Slug</label>
                          <input type="text" className="input-field text-sm" placeholder="article-url-slug" value={slug}
                            onChange={(e) => { slugEdited.current = true; setSlug(slugify(e.target.value)); }} />
                          {isLive && <p className="text-[11px] text-amber-600 mt-1.5 font-jakarta">Changing the slug of a live article breaks links already shared.</p>}
                        </div>
                      </>)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Preview */}
      {showPreview && (
        <div className="fixed inset-0 z-50 bg-white dark:bg-gray-950 overflow-y-auto">
          <div className="sticky top-0 z-10 bg-white/80 dark:bg-gray-950/80 backdrop-blur-md border-b border-gray-100 dark:border-gray-800">
            <div className="max-w-[720px] mx-auto flex items-center justify-between py-3 px-6">
              <span className="text-sm text-gray-500 font-jakarta">Preview</span>
              <div className="flex items-center gap-3">
                {canEdit && <button onClick={() => doSave(primaryIntent)} disabled={!title.trim() || saving} className="px-4 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white text-sm font-semibold rounded-full transition-colors">{primaryLabel}</button>}
                <button onClick={() => setShowPreview(false)} aria-label="Close preview" className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"><X className="w-5 h-5 text-gray-400" /></button>
              </div>
            </div>
          </div>
          <div className="max-w-[720px] mx-auto py-12 px-6">
            {coverImage && (
              <div className="w-full overflow-hidden rounded-xl mb-8 aspect-video bg-gray-100 dark:bg-gray-800">
                <img src={coverImage} alt="Cover" className="w-full h-full object-cover" />
              </div>
            )}
            <h1 className="font-sora font-extrabold text-[42px] text-navy dark:text-white leading-[1.15] tracking-tight">{title || 'Untitled'}</h1>
            {subtitle && <p className="font-jakarta text-xl text-gray-400 dark:text-gray-500 mt-4 leading-relaxed">{subtitle}</p>}
            <div className="flex items-center gap-3 mt-6 text-sm text-gray-400 font-jakarta">
              {category && <span className="px-2.5 py-0.5 bg-brand/10 text-brand rounded-full text-xs font-semibold">{category}</span>}
              <span>{wordCount.toLocaleString()} words</span>
              <span>·</span>
              <span>{readTime} min read</span>
            </div>
            <div className="my-8 h-px bg-gray-100 dark:bg-gray-800" />
            {/* The editor's own content (pasted HTML is already cleaned on the way in). */}
            <div className={editorClasses} dangerouslySetInnerHTML={{ __html: bodyHtml || '<p style="color:#ccc;font-style:italic">No content yet…</p>' }} />
          </div>
        </div>
      )}
    </div>
  );
}
