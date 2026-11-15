/**
 * Job descriptions are stored as simple markup (## headings, - bullets, 1. numbered, **bold**, *italic*), which the
 * job page, Google Jobs data, matching and the AI tools all read. The editor is WYSIWYG, so these two functions
 * translate between that markup and the editor: markup -> HTML when loading, editor JSON -> markup when saving.
 */

type Mark = { type: string };
type Node = { type: string; text?: string; marks?: Mark[]; attrs?: Record<string, unknown>; content?: Node[] };

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** **bold** and *italic* inside one line, as HTML. */
function inlineToHtml(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, '$1<em>$2</em>');
}

const BULLET = /^\s*[-•●◦▪▸►*]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const HEADING = /^(#{1,3})\s+(.+)$/;

/** Stored markup -> editor HTML. Plain text without markup becomes paragraphs, so older jobs load cleanly. */
export function descriptionToHtml(markup: string): string {
  const lines = String(markup ?? '').replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  let list: 'ul' | 'ol' | null = null;
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) { closeList(); continue; }
    const h = line.match(HEADING);
    const b = line.match(BULLET);
    const n = line.match(NUMBERED);
    if (h) {
      closeList();
      const text = h[2].trim().replace(/^\*\*(.+)\*\*$/, '$1');
      out.push(`<h${h[1].length === 3 ? 3 : 2}>${inlineToHtml(text)}</h${h[1].length === 3 ? 3 : 2}>`);
    } else if (b || n) {
      const kind = b ? 'ul' : 'ol';
      if (list !== kind) { closeList(); out.push(`<${kind}>`); list = kind; }
      out.push(`<li><p>${inlineToHtml((b ?? n)![1])}</p></li>`);
    } else {
      closeList();
      out.push(`<p>${inlineToHtml(line.trim())}</p>`);
    }
  }
  closeList();
  return out.join('');
}

/** Text of an inline run, with bold/italic written back as ** and *. */
function inlineToMarkup(nodes: Node[] | undefined): string {
  return (nodes ?? []).map((n) => {
    if (n.type === 'hardBreak') return '\n';
    if (n.type !== 'text' || !n.text) return '';
    const bold = n.marks?.some((m) => m.type === 'bold');
    const italic = n.marks?.some((m) => m.type === 'italic');
    // Keep surrounding spaces outside the markers, so "** word**" never happens.
    const m = n.text.match(/^(\s*)([\s\S]*?)(\s*)$/)!;
    if (!m[2]) return n.text;
    let core = m[2];
    if (italic) core = `*${core}*`;
    if (bold) core = `**${core}**`;
    return `${m[1]}${core}${m[3]}`;
  }).join('');
}

/** Every paragraph inside a list item (nested lists are flattened, which is how the job page shows them). */
function listItems(list: Node, ordered: boolean, start = 1): string[] {
  const lines: string[] = [];
  let i = start;
  for (const item of list.content ?? []) {
    for (const child of item.content ?? []) {
      if (child.type === 'bulletList' || child.type === 'orderedList') {
        lines.push(...listItems(child, child.type === 'orderedList'));
        continue;
      }
      const text = inlineToMarkup(child.content).replace(/\n+/g, ' ').trim();
      if (!text) continue;
      lines.push(ordered ? `${i++}. ${text}` : `- ${text}`);
    }
  }
  return lines;
}

/** Editor JSON -> stored markup. */
export function descriptionFromDoc(doc: Node | null | undefined): string {
  const blocks: string[] = [];
  for (const node of doc?.content ?? []) {
    if (node.type === 'heading') {
      const text = inlineToMarkup(node.content).replace(/\n+/g, ' ').trim();
      if (text) blocks.push(`${Number(node.attrs?.level) === 3 ? '###' : '##'} ${text}`);
    } else if (node.type === 'bulletList' || node.type === 'orderedList') {
      const items = listItems(node, node.type === 'orderedList', Number(node.attrs?.start) || 1);
      if (items.length) blocks.push(items.join('\n'));
    } else if (node.type === 'paragraph') {
      const text = inlineToMarkup(node.content).trim();
      if (text) blocks.push(text);
    } else if (node.type === 'blockquote') {
      const inner = descriptionFromDoc({ type: 'doc', content: node.content });
      if (inner) blocks.push(inner);
    }
  }
  return blocks.join('\n\n');
}
