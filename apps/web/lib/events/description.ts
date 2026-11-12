/**
 * Event descriptions arrive in three shapes: a plain string, { html } / { text } from the editor, or a rich-text
 * document ({ type: 'doc', content: [...] }) from imported events (Devfolio, Unstop, Meetup…). The page only handled
 * the first two, so imported events showed no "About" text — for visitors and for Google.
 */

type Mark = { type: string; attrs?: { href?: string } };
type DocNode = { type?: string; text?: string; marks?: Mark[]; content?: DocNode[]; attrs?: { level?: number } };

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Only web and mail links survive; anything else (javascript:, data:) is dropped. */
function safeHref(href: unknown): string | null {
  if (typeof href !== 'string') return null;
  return /^(https?:\/\/|mailto:)/i.test(href.trim()) ? href.trim() : null;
}

function inline(node: DocNode): string {
  if (node.type === 'hardBreak') return '<br>';
  if (node.type !== 'text') return (node.content ?? []).map(inline).join('');
  let out = esc(node.text ?? '').replace(/\n/g, '<br>');
  for (const m of node.marks ?? []) {
    if (m.type === 'bold' || m.type === 'strong') out = `<strong>${out}</strong>`;
    else if (m.type === 'italic' || m.type === 'em') out = `<em>${out}</em>`;
    else if (m.type === 'code') out = `<code>${out}</code>`;
    else if (m.type === 'link') {
      const href = safeHref(m.attrs?.href);
      if (href) out = `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer nofollow">${out}</a>`;
    }
  }
  return out;
}

function block(node: DocNode): string {
  const kids = (node.content ?? []);
  switch (node.type) {
    case 'paragraph': {
      const inner = kids.map(inline).join('');
      return inner ? `<p>${inner}</p>` : '';
    }
    case 'heading': {
      const level = Math.min(Math.max(Number(node.attrs?.level) || 3, 3), 4); // never compete with the page's h1/h2
      return `<h${level}>${kids.map(inline).join('')}</h${level}>`;
    }
    case 'bulletList': return `<ul>${kids.map(block).join('')}</ul>`;
    case 'orderedList': return `<ol>${kids.map(block).join('')}</ol>`;
    case 'listItem': return `<li>${kids.map(block).join('')}</li>`;
    case 'blockquote': return `<blockquote>${kids.map(block).join('')}</blockquote>`;
    case 'horizontalRule': return '<hr>';
    case 'text': case 'hardBreak': return inline(node);
    default: return kids.map(block).join('');
  }
}

function plain(node: DocNode): string {
  if (node.type === 'text') return node.text ?? '';
  if (node.type === 'hardBreak') return '\n';
  const inner = (node.content ?? []).map(plain).join('');
  return ['paragraph', 'heading', 'listItem', 'blockquote'].includes(node.type ?? '') ? `${inner}\n` : inner;
}

const isDoc = (d: unknown): d is DocNode =>
  !!d && typeof d === 'object' && (d as DocNode).type === 'doc' && Array.isArray((d as DocNode).content);

/** Safe HTML for any description shape, or null when there is only plain text (or nothing). */
export function descriptionHtml(description: unknown): string | null {
  if (isDoc(description)) return description.content!.map(block).join('') || null;
  if (description && typeof description === 'object' && typeof (description as { html?: unknown }).html === 'string') {
    return (description as { html: string }).html;
  }
  return null;
}

/** Plain text for any description shape. */
export function descriptionText(description: unknown): string {
  if (typeof description === 'string') return description;
  if (isDoc(description)) return plain(description).replace(/\n{3,}/g, '\n\n').trim();
  if (description && typeof description === 'object') {
    const d = description as { text?: unknown; html?: unknown };
    if (typeof d.text === 'string') return d.text;
    if (typeof d.html === 'string') return d.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  return '';
}

export { metaSnippet } from '@/lib/seo-text';
