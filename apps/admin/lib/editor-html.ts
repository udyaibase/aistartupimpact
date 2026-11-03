/**
 * Article editor helpers (browser only). Pasted content from Google Docs, Word or web pages carries hidden
 * formatting: fixed fonts and sizes, wrapper elements, `user-select`/`contenteditable` attributes. That breaks the
 * article's look and can make text impossible to select. Everything pasted is rebuilt from a small set of tags,
 * keeping only the meaning (headings, paragraphs, lists, quotes, bold, italic, underline, links, images).
 */

const BLOCKS = new Set(['P', 'H2', 'H3', 'H4', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'PRE', 'FIGURE', 'FIGCAPTION', 'HR', 'BR', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD']);
const INLINE: Record<string, string> = { STRONG: 'strong', B: 'strong', EM: 'em', I: 'em', U: 'u', CODE: 'code', A: 'a', IMG: 'img', SUB: 'sub', SUP: 'sup' };
const RENAME: Record<string, string> = { H1: 'h2', H5: 'h4', H6: 'h4', DIV: 'p', SECTION: 'p', ARTICLE: 'p' };
const DROP = new Set(['SCRIPT', 'STYLE', 'META', 'LINK', 'TITLE', 'NOSCRIPT', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'FORM']);

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * A link as typed by an editor → a safe absolute URL, or null when unusable.
 * "neuralpay.in/careers" → "https://neuralpay.in/careers"; javascript:/data: links are refused.
 */
export function normalizeLinkUrl(raw: string): string | null {
  const url = raw.trim();
  if (!url) return null;
  if (/^(javascript|data|vbscript):/i.test(url)) return null;
  if (/^(https?:|mailto:|tel:)/i.test(url) || url.startsWith('/') || url.startsWith('#')) return url;
  if (/^[\w-]+(\.[\w-]+)+(:\d+)?([/?#].*)?$/.test(url)) return `https://${url}`;
  return null;
}

/** Styled spans (Google Docs marks bold and italic this way) become real tags; other styling is dropped. */
function styleWrappers(el: HTMLElement, inLink: boolean): string[] {
  const s = el.style;
  const tags: string[] = [];
  const weight = s.fontWeight;
  if (el.tagName === 'SPAN' && (weight === 'bold' || Number(weight) >= 600)) tags.push('strong');
  if (el.tagName === 'SPAN' && s.fontStyle === 'italic') tags.push('em');
  if (el.tagName === 'SPAN' && !inLink && /underline/.test(s.textDecoration)) tags.push('u');
  return tags;
}

function clean(node: Node, inLink = false): string {
  if (node.nodeType === Node.TEXT_NODE) return escapeHtml((node.textContent ?? '').replace(/ /g, ' '));
  if (node.nodeType !== Node.ELEMENT_NODE) return '';
  const el = node as HTMLElement;
  const tag = el.tagName;
  if (DROP.has(tag)) return '';
  const inner = (link = inLink) => Array.from(el.childNodes).map((n) => clean(n, link)).join('');

  // Google Docs wraps everything in <b style="font-weight:normal">: not bold.
  if (tag === 'B' && (el.style.fontWeight === 'normal' || el.id.startsWith('docs-internal-guid'))) return inner();
  if (tag === 'A') {
    const href = normalizeLinkUrl(el.getAttribute('href') ?? '');
    const text = inner(true);
    return href ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${text}</a>` : text;
  }
  if (tag === 'IMG') {
    const src = el.getAttribute('src') ?? '';
    if (!/^https?:\/\//i.test(src)) return '';
    return `<img src="${escapeHtml(src)}" alt="${escapeHtml(el.getAttribute('alt') ?? '')}" />`;
  }
  if (tag === 'BR') return '<br>';
  if (tag === 'HR') return '<hr>';
  // A link's underline is a link setting (see SelectionToolbar), not text formatting.
  if (tag === 'U' && inLink) return inner();
  if (BLOCKS.has(tag) || RENAME[tag] || INLINE[tag]) {
    const name = RENAME[tag] ?? INLINE[tag] ?? tag.toLowerCase();
    const body = inner();
    if (!body.trim() && !['td', 'th'].includes(name)) return '';
    return `<${name}>${body}</${name}>`;
  }
  // span, font and anything else: keep the text; turn bold/italic styling into tags.
  const wraps = styleWrappers(el, inLink);
  return wraps.reduceRight((acc, t) => `<${t}>${acc}</${t}>`, inner());
}

/** Clipboard HTML → clean article HTML. */
export function sanitizePastedHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return Array.from(doc.body.childNodes).map((n) => clean(n)).join('').replace(/<p>\s*<\/p>/g, '');
}

/** Plain clipboard text → paragraphs (blank lines) and line breaks. */
export function textToHtml(text: string): string {
  return text.replace(/\r\n/g, '\n').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`).join('');
}

/** After the browser's createLink: open article links in a new tab, safely, and drop underline tags inside them. */
export function finishLinks(root: HTMLElement | null, href: string) {
  root?.querySelectorAll('a').forEach((a) => {
    if (a.getAttribute('href') !== href) return;
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener noreferrer');
    unwrapUnderlines(a);
  });
}

/** Links are plain by default; this class gives one link an underline (styled the same on the public site). */
export const LINK_UNDERLINE_CLASS = 'link-underline';

export function unwrapUnderlines(el: HTMLElement) {
  el.querySelectorAll('u').forEach((u) => u.replaceWith(...Array.from(u.childNodes)));
}

export function toggleLinkUnderline(a: HTMLAnchorElement): boolean {
  unwrapUnderlines(a);
  a.classList.toggle(LINK_UNDERLINE_CLASS);
  if (!a.classList.length) a.removeAttribute('class');
  return a.classList.contains(LINK_UNDERLINE_CLASS);
}
