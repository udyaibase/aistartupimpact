'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { Bold, Italic, Underline, Heading2, Heading3, Quote, List, ListOrdered, Link2, Unlink, RemoveFormatting, Check, X, ExternalLink } from 'lucide-react';
import { finishLinks, normalizeLinkUrl, toggleLinkUnderline, LINK_UNDERLINE_CLASS } from '@/lib/editor-html';

/**
 * Floating toolbar for the article editor. It follows whatever text is selected in the editor and shows which
 * formats are on. Links: select text, click the link button (or ⌘K), paste the address, Enter. Selecting text that is
 * already a link lets you change or remove it. Every new selection starts fresh, so it never gets stuck on an old one.
 */

type Formats = { bold: boolean; italic: boolean; underline: boolean; block: string; ul: boolean; ol: boolean; link: HTMLAnchorElement | null };
const NO_FORMATS: Formats = { bold: false, italic: false, underline: false, block: 'p', ul: false, ol: false, link: null };
const GAP = 10;

function selectionIn(editor: HTMLElement | null): Range | null {
  const sel = window.getSelection();
  if (!editor || !sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
  const range = sel.getRangeAt(0);
  return editor.contains(range.commonAncestorContainer) ? range : null;
}

function closestLink(node: Node | null, editor: HTMLElement): HTMLAnchorElement | null {
  let el: Node | null = node;
  while (el && el !== editor) {
    if (el instanceof HTMLAnchorElement) return el;
    el = el.parentNode;
  }
  return null;
}

function readFormats(editor: HTMLElement, range: Range): Formats {
  const q = (cmd: string) => { try { return document.queryCommandState(cmd); } catch { return false; } };
  let block = 'p';
  try { block = String(document.queryCommandValue('formatBlock') || 'p').toLowerCase(); } catch { /* not supported */ }
  const link = closestLink(range.startContainer, editor) ?? closestLink(range.endContainer, editor);
  return {
    // On a link, Underline means the link's own underline setting.
    bold: q('bold'), italic: q('italic'), underline: link ? link.classList.contains(LINK_UNDERLINE_CLASS) : q('underline'), block,
    ul: q('insertUnorderedList'), ol: q('insertOrderedList'), link,
  };
}

export default function SelectionToolbar({ editorRef, containerRef, onChange }: {
  editorRef: RefObject<HTMLDivElement | null>;
  containerRef: RefObject<HTMLDivElement | null>;
  onChange?: () => void;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const range = useRef<Range | null>(null);
  const linkMode = useRef(false);
  const [open, setOpen] = useState(false);
  const [editingLink, setEditingLink] = useState(false);
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [formats, setFormats] = useState<Formats>(NO_FORMATS);
  const [pos, setPos] = useState({ left: 0, top: 0, below: false });

  const place = useCallback(() => {
    const r = range.current, wrap = containerRef.current, bar = barRef.current;
    if (!r || !wrap) return;
    const rect = r.getBoundingClientRect();
    const wrapRect = wrap.getBoundingClientRect();
    const w = bar?.offsetWidth ?? 360, h = bar?.offsetHeight ?? 44;
    const center = rect.left + rect.width / 2 - wrapRect.left;
    const left = Math.min(Math.max(0, center - w / 2), Math.max(0, wrapRect.width - w));
    // Above the selection, or below it when there's no room at the top of the screen.
    const below = rect.top - h - GAP < 64;
    const top = below ? rect.bottom - wrapRect.top + GAP : rect.top - wrapRect.top - h - GAP;
    setPos({ left, top, below });
  }, [containerRef]);

  const close = useCallback(() => {
    linkMode.current = false;
    range.current = null;
    setEditingLink(false);
    setOpen(false);
    setError('');
  }, []);

  // Follow the selection. A new selection in the editor always wins, even while the link box is open.
  const refresh = useCallback(() => {
    const editor = editorRef.current;
    const r = selectionIn(editor);
    if (!r) {
      if (!linkMode.current) close();
      return;
    }
    if (linkMode.current && range.current && r.compareBoundaryPoints(Range.START_TO_START, range.current) === 0
      && r.compareBoundaryPoints(Range.END_TO_END, range.current) === 0) return;
    linkMode.current = false;
    setEditingLink(false);
    setError('');
    range.current = r.cloneRange();
    setFormats(readFormats(editor!, r));
    setOpen(true);
  }, [editorRef, close]);

  useEffect(() => {
    let frame = 0;
    const onSelection = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(refresh); };
    const onPointerDown = (e: MouseEvent) => {
      // Runs in the capture phase, before the toolbar re-renders (the link button swaps for the link box).
      const t = e.target as Node;
      if (!t.isConnected || barRef.current?.contains(t) || editorRef.current?.contains(t)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && selectionIn(editorRef.current)) {
        e.preventDefault();
        refresh();
        startLink();
      }
    };
    document.addEventListener('selectionchange', onSelection);
    document.addEventListener('mousedown', onPointerDown, true);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', place);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('selectionchange', onSelection);
      document.removeEventListener('mousedown', onPointerDown, true);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', place);
    };
    // startLink only touches refs and setters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh, close, place, editorRef]);

  useLayoutEffect(() => { if (open) place(); }, [open, editingLink, formats, place]);

  const reselect = () => {
    const r = range.current;
    if (!r) return;
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(r);
  };

  const run = (cmd: string, value?: string) => {
    editorRef.current?.focus();
    reselect();
    document.execCommand(cmd, false, value);
    onChange?.();
    refresh();
  };
  const toggleUnderline = () => {
    const link = formats.link;
    if (!link) { run('underline'); return; }
    toggleLinkUnderline(link);
    // The toggle rewrites the link's contents, so select the whole link again.
    const r = document.createRange();
    r.selectNodeContents(link);
    range.current = r;
    editorRef.current?.focus();
    reselect();
    onChange?.();
    refresh();
  };
  const toggleBlock = (tag: string) => run('formatBlock', formats.block === tag ? 'p' : tag);

  function startLink() {
    const r = range.current;
    if (!r) return;
    const existing = closestLink(r.startContainer, editorRef.current!);
    linkMode.current = true;
    setUrl(existing?.getAttribute('href') ?? '');
    setError('');
    setEditingLink(true);
  }

  const applyLink = () => {
    const href = normalizeLinkUrl(url);
    if (!url.trim()) { removeLink(); return; }
    if (!href) { setError('Enter a web address like neuralpay.in'); return; }
    const editor = editorRef.current;
    editor?.focus();
    reselect();
    const existing = range.current && editor ? closestLink(range.current.startContainer, editor) : null;
    if (existing) {
      existing.setAttribute('href', href);
    } else {
      document.execCommand('createLink', false, href);
    }
    finishLinks(editor, href);
    // Put the caret after the link so the next selection starts clean.
    const sel = window.getSelection();
    if (sel?.rangeCount) sel.collapseToEnd();
    onChange?.();
    close();
  };

  function removeLink() {
    const editor = editorRef.current;
    const link = range.current && editor ? closestLink(range.current.startContainer, editor) : null;
    editor?.focus();
    if (link) {
      const r = document.createRange();
      r.selectNodeContents(link);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(r);
    } else {
      reselect();
    }
    document.execCommand('unlink');
    onChange?.();
    close();
  }

  if (!open) return null;

  const btn = (active: boolean) =>
    `h-8 min-w-8 px-1.5 inline-flex items-center justify-center rounded-md transition-colors ${active ? 'bg-white text-gray-900' : 'text-gray-200 hover:bg-white/15 hover:text-white'}`;
  const sep = <span className="w-px h-5 bg-white/15 mx-1" aria-hidden />;
  const B = ({ on, label, onPress, children }: { on: boolean; label: string; onPress: () => void; children: React.ReactNode }) => (
    <button type="button" title={label} aria-label={label} aria-pressed={on} className={btn(on)}
      onMouseDown={(e) => { e.preventDefault(); onPress(); }}>{children}</button>
  );

  return (
    <div ref={barRef} role="toolbar" aria-label="Text formatting"
      className="absolute z-40 font-jakarta"
      style={{ left: pos.left, top: pos.top }}
      onMouseDown={(e) => { if (!(e.target instanceof HTMLInputElement)) e.preventDefault(); }}>
      {!editingLink ? (
        <div className="flex items-center gap-0.5 p-1 bg-gray-900/95 dark:bg-gray-800 backdrop-blur rounded-xl shadow-2xl ring-1 ring-black/10 dark:ring-white/20">
          <B on={formats.bold} label="Bold (⌘B)" onPress={() => run('bold')}><Bold className="w-4 h-4" /></B>
          <B on={formats.italic} label="Italic (⌘I)" onPress={() => run('italic')}><Italic className="w-4 h-4" /></B>
          <B on={formats.underline} label={formats.link ? (formats.underline ? 'Remove link underline' : 'Underline link') : 'Underline (⌘U)'} onPress={toggleUnderline}><Underline className="w-4 h-4" /></B>
          {sep}
          <B on={formats.block === 'h2'} label="Heading" onPress={() => toggleBlock('h2')}><Heading2 className="w-4 h-4" /></B>
          <B on={formats.block === 'h3'} label="Subheading" onPress={() => toggleBlock('h3')}><Heading3 className="w-4 h-4" /></B>
          <B on={formats.block === 'blockquote'} label="Quote" onPress={() => toggleBlock('blockquote')}><Quote className="w-4 h-4" /></B>
          {sep}
          <B on={formats.ul} label="Bulleted list" onPress={() => run('insertUnorderedList')}><List className="w-4 h-4" /></B>
          <B on={formats.ol} label="Numbered list" onPress={() => run('insertOrderedList')}><ListOrdered className="w-4 h-4" /></B>
          {sep}
          <B on={!!formats.link} label={formats.link ? 'Edit link (⌘K)' : 'Add link (⌘K)'} onPress={startLink}><Link2 className="w-4 h-4" /></B>
          {formats.link && <B on={false} label="Remove link" onPress={removeLink}><Unlink className="w-4 h-4" /></B>}
          <B on={false} label="Clear formatting" onPress={() => run('removeFormat')}><RemoveFormatting className="w-4 h-4" /></B>
        </div>
      ) : (
        <div className="p-1.5 bg-gray-900/95 dark:bg-gray-800 backdrop-blur rounded-xl shadow-2xl ring-1 ring-black/10 dark:ring-white/20 w-[340px] max-w-[calc(100vw-32px)]">
          <form className="flex items-center gap-1" onSubmit={(e) => { e.preventDefault(); applyLink(); }}>
            <Link2 className="w-4 h-4 text-gray-400 ml-1.5 shrink-0" aria-hidden />
            <input autoFocus onFocus={(e) => e.currentTarget.select()} type="text" inputMode="url" value={url} onChange={(e) => { setUrl(e.target.value); setError(''); }}
              onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); linkMode.current = false; setEditingLink(false); editorRef.current?.focus(); reselect(); } }}
              placeholder="Paste a link, e.g. neuralpay.in" aria-label="Link address" aria-invalid={!!error}
              className="flex-1 min-w-0 h-8 bg-transparent text-white text-sm placeholder:text-gray-500 focus:outline-none px-1" />
            {formats.link && (
              <a href={formats.link.href} target="_blank" rel="noopener noreferrer" title="Open link" className={btn(false)} onMouseDown={(e) => e.stopPropagation()}>
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
            <button type="submit" title="Apply (Enter)" aria-label="Apply link" className="h-8 px-2.5 inline-flex items-center gap-1 rounded-md bg-brand hover:bg-brand/90 text-white text-xs font-semibold">
              <Check className="w-3.5 h-3.5" /> Apply
            </button>
            <button type="button" title="Cancel (Esc)" aria-label="Cancel" className={btn(false)}
              onMouseDown={(e) => { e.preventDefault(); linkMode.current = false; setEditingLink(false); editorRef.current?.focus(); reselect(); }}>
              <X className="w-4 h-4" />
            </button>
          </form>
          {error && <p role="alert" className="px-2 pt-1 pb-0.5 text-xs text-red-300">{error}</p>}
        </div>
      )}
    </div>
  );
}
