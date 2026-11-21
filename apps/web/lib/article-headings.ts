import sanitizeHtmlLib from 'sanitize-html';
import { htmlToPlainText } from '@/lib/sanitize';

/**
 * Gives each section heading (h2) of already-cleaned article HTML an id, for the "In this story" contents list, and
 * returns the headings in order. Uses a real HTML parser (sanitize-html), not regular expressions: everything else in
 * the HTML is left as it is.
 */
export function addHeadingIds(html: string): { html: string; headings: { id: string; text: string }[] } {
  // Pass 1: read the headings' text, in order.
  const texts: string[] = [];
  sanitizeHtmlLib(html, {
    allowedTags: false,
    allowedAttributes: false,
    exclusiveFilter: (frame) => {
      if (frame.tag === 'h2') texts.push(frame.text.replace(/\s+/g, ' ').trim());
      return false;
    },
  });

  const used = new Set<string>();
  const ids = texts.map((text) => {
    if (!text) return null;
    const base = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'section';
    let id = base;
    for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
    used.add(id);
    return id;
  });

  // Pass 2: put the ids on the headings.
  let i = 0;
  const out = sanitizeHtmlLib(html, {
    allowedTags: false,
    allowedAttributes: false,
    transformTags: {
      h2: (tagName, attribs) => {
        const id = ids[i++];
        return { tagName, attribs: id ? { ...attribs, id } : attribs };
      },
    },
  });

  const headings = texts.flatMap((text, k) => (ids[k] ? [{ id: ids[k] as string, text }] : []));
  return { html: out, headings };
}

/** The words of some HTML, lower-cased with single spaces: for comparing two pieces of text. */
export function comparableText(html: string): string {
  return htmlToPlainText(html.replace(/<\/(p|h[1-6]|li|blockquote)>/gi, ' ')).toLowerCase();
}
