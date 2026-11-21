/**
 * Turns the Markdown that ChatGPT, Claude and note apps put on the clipboard into the HTML our description editor
 * understands. Pasted as plain text, that Markdown used to stay as raw symbols: "# Heading", "**bold**", "- item".
 *
 * It covers what the editor can show: headings, bold, italic, links, bullet and numbered lists, quotes, dividers
 * and line breaks. Everything is escaped first, so pasted text can never become markup of its own. Tables and
 * code blocks, which the editor has no button for, are kept as readable text.
 */

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Web and mail links only. */
const safeHref = (href: string) => (/^(https?:\/\/|mailto:)/i.test(href.trim()) ? href.trim() : null);

/** Bold, italic, code and links inside one line. The text is escaped before any tag is added. */
function inline(text: string): string {
  let out = esc(text);
  // Links first, so their text can still carry bold or italic.
  out = out.replace(/\[([^\]\n]+)\]\(([^)\s]+)(?:\s+&quot;[^)]*&quot;)?\)/g, (all, label: string, href: string) => {
    const url = safeHref(href.replace(/&amp;/g, '&'));
    return url ? `<a href="${esc(url)}">${label}</a>` : label;
  });
  out = out.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  out = out.replace(/\*\*\*([^*\n]+)\*\*\*/g, '<strong><em>$1</em></strong>');
  out = out.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/__([^_\n]+)__/g, '<strong>$1</strong>');
  // Single * or _ is italic only when it hugs the words, so "5 * 3" and snake_case are left alone.
  out = out.replace(/(^|[\s(])\*(?!\s)([^*\n]+?)(?<!\s)\*(?=[\s).,!?:;]|$)/g, '$1<em>$2</em>');
  out = out.replace(/(^|[\s(])_(?!\s)([^_\n]+?)(?<!\s)_(?=[\s).,!?:;]|$)/g, '$1<em>$2</em>');
  return out;
}

const HEADING = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/;
const BULLET = /^\s*[-*+•]\s+(.*)$/;
const NUMBERED = /^\s*\d{1,3}[.)]\s+(.*)$/;
const QUOTE = /^\s*>\s?(.*)$/;
const RULE = /^\s*([-*_])(?:\s*\1){2,}\s*$/;
const FENCE = /^\s*(```|~~~)/;

/** True when plain text carries Markdown marks worth converting. */
export function looksLikeMarkdown(text: string): boolean {
  return /^\s{0,3}#{1,6}\s+\S/m.test(text)
    || /^\s*[-*+]\s+\S/m.test(text)
    || /^\s*\d{1,3}[.)]\s+\S/m.test(text)
    || /\*\*[^*\n]+\*\*/.test(text)
    || /\[[^\]\n]+\]\((https?:\/\/|mailto:)[^)\s]+\)/.test(text)
    || /^\s*>\s+\S/m.test(text);
}

export function markdownToHtml(input: string): string {
  const lines = input.replace(/\r\n?/g, '\n').replace(/ /g, ' ').split('\n');
  const out: string[] = [];
  let paragraph: string[] = [];
  let list: { tag: 'ul' | 'ol'; items: string[] } | null = null;
  let quote: string[] = [];
  let fenced = false;

  const flushParagraph = () => { if (paragraph.length) { out.push(`<p>${paragraph.map(inline).join('<br>')}</p>`); paragraph = []; } };
  const flushList = () => { if (list) { out.push(`<${list.tag}>${list.items.map((i) => `<li><p>${i}</p></li>`).join('')}</${list.tag}>`); list = null; } };
  const flushQuote = () => { if (quote.length) { out.push(`<blockquote><p>${quote.map(inline).join('<br>')}</p></blockquote>`); quote = []; } };
  const flushAll = () => { flushParagraph(); flushList(); flushQuote(); };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (FENCE.test(line)) { flushAll(); fenced = !fenced; continue; } // the fence marks go; the lines inside stay as text
    if (fenced) { paragraph.push(line); continue; }
    if (!line.trim()) { flushAll(); continue; }

    const heading = HEADING.exec(line);
    if (heading) {
      flushAll();
      // The editor has two heading sizes: "#" and "##" are the larger, anything deeper the smaller.
      const level = heading[1].length <= 2 ? 2 : 3;
      out.push(`<h${level}>${inline(heading[2].replace(/\*\*/g, ''))}</h${level}>`);
      continue;
    }
    if (RULE.test(line)) { flushAll(); out.push('<hr>'); continue; }

    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    if (bullet || numbered) {
      flushParagraph(); flushQuote();
      const tag = bullet ? 'ul' : 'ol';
      if (list && list.tag !== tag) flushList();
      if (!list) list = { tag, items: [] };
      list.items.push(inline((bullet ?? numbered)![1].replace(/^\[[ xX]\]\s+/, '')));
      continue;
    }
    // An indented line straight after a list item continues that item.
    if (list && /^\s{2,}\S/.test(raw)) { list.items[list.items.length - 1] += `<br>${inline(line.trim())}`; continue; }

    const quoted = QUOTE.exec(line);
    if (quoted) { flushParagraph(); flushList(); quote.push(quoted[1]); continue; }

    flushList(); flushQuote();
    paragraph.push(line.trim());
  }
  flushAll();
  return out.join('');
}

/**
 * Line breaks typed or pasted inside a paragraph are stored as real <br> tags. Left as raw newline characters they
 * show in the editor but vanish the next time the HTML is read, which ran whole paragraphs together.
 */
export function keepLineBreaks(html: string): string {
  if (!html.includes('\n')) return html;
  // Leave code blocks alone: there a newline is meant literally.
  return html.split(/(<pre[\s\S]*?<\/pre>)/g).map((part, i) => (i % 2 ? part : part.replace(/\n/g, '<br>'))).join('');
}

/**
 * What to show in the editor for a saved description. Older descriptions, and ones saved as plain text, have no
 * tags at all: their line breaks and any Markdown become proper formatting instead of one long paragraph.
 */
export function descriptionForEditor(saved: string): string {
  const text = saved ?? '';
  if (!text.trim()) return '';
  if (/<(p|h[1-6]|ul|ol|li|br|blockquote|strong|em|a)\b/i.test(text)) return keepLineBreaks(text);
  return markdownToHtml(text);
}
