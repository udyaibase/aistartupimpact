'use client';

import { useCallback, useRef, useState, type RefObject } from 'react';
import MentionPopup from './MentionPopup';

/**
 * @-tags in the article editor: type "@" and a name to tag a startup or AI tool from the directory. The tag is a link
 * to its public page (/startups/<slug> or /tools/<slug>). Used by the new and edit article pages.
 */

type Mention = { type: string; id: string; name: string; slug: string };

// "@" at the start or after a space (so emails don't trigger it), then up to 40 characters of name.
const MENTION_RE = /(^|\s)@([^@\n]{0,40})$/;

export const mentionHref = (m: Pick<Mention, 'type' | 'slug'>) =>
  m.type === 'tool' ? `/tools/${encodeURIComponent(m.slug)}` : `/startups/${encodeURIComponent(m.slug)}`;

export function useEditorMentions(editorRef: RefObject<HTMLDivElement | null>, wrapRef: RefObject<HTMLDivElement | null>, onChange?: () => void) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [pos, setPos] = useState({ x: 0, y: 0 });
  // The text node being typed in, where its "@" is, and where the cursor was.
  const anchor = useRef<{ node: Text; at: number; end: number } | null>(null);

  const close = useCallback(() => { setOpen(false); setQuery(''); anchor.current = null; }, []);

  const checkForMention = useCallback(() => {
    const editor = editorRef.current, wrap = wrapRef.current;
    const sel = window.getSelection();
    if (!editor || !wrap || !sel?.anchorNode || !sel.isCollapsed || !editor.contains(sel.anchorNode)) return;
    const node = sel.anchorNode;
    if (node.nodeType !== Node.TEXT_NODE || node.parentElement?.closest('a')) { setOpen(false); return; }
    const before = (node.textContent ?? '').slice(0, sel.anchorOffset);
    const m = before.match(MENTION_RE);
    if (!m) { setOpen(false); return; }
    const at = m.index! + m[1].length;
    const r = document.createRange();
    r.setStart(node, at);
    r.setEnd(node, at + 1);
    const rect = r.getBoundingClientRect();
    const wrapRect = wrap.getBoundingClientRect();
    anchor.current = { node: node as Text, at, end: sel.anchorOffset };
    setQuery(m[2].trim());
    setPos({ x: rect.left - wrapRect.left, y: rect.bottom - wrapRect.top });
    setOpen(true);
  }, [editorRef, wrapRef]);

  const select = useCallback((m: Mention) => {
    const editor = editorRef.current, a = anchor.current;
    if (!editor || !a || !a.node.isConnected) { close(); return; }
    // Replace "@query" with the tag, built as DOM nodes so names and the text around them are never parsed as HTML.
    const typed = a.node.splitText(a.at);
    const rest = typed.splitText(Math.min(a.end - a.at, typed.length));
    typed.remove();
    const link = document.createElement('a');
    link.href = mentionHref(m);
    link.className = 'mention';
    link.dataset.mentionType = m.type;
    link.dataset.mentionId = m.id;
    link.contentEditable = 'false';
    link.textContent = m.name;
    const space = document.createTextNode(' ');
    rest.parentNode!.insertBefore(link, rest);
    rest.parentNode!.insertBefore(space, rest);
    if (rest.textContent?.startsWith(' ')) space.remove();
    editor.focus();
    const caret = document.createRange();
    caret.setStartAfter(space.isConnected ? space : link);
    caret.collapse(true);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(caret);
    close();
    onChange?.();
  }, [editorRef, close, onChange]);

  const popup = open ? <MentionPopup query={query} position={pos} onSelect={select} onClose={close} /> : null;
  return { checkForMention, popup };
}
