import { htmlToPlainText, sanitizeStoryHtml } from '@/lib/sanitize';

/**
 * What a founder writes, made ready to store. Stories come from the story editor as formatted text (HTML); updates
 * are plain text. Formatted text is cleaned here, on the way in, to headings, bold, italics, quotes, lists, links and
 * pictures uploaded through our own media upload: no scripts, outside images, styles or anything else, whatever the
 * request contained.
 */

/** A story needs at least this much text before it can go to our editors. */
export const STORY_MIN_TEXT = 100;
export const STORY_MAX_TEXT = 50_000;

const HAS_TAGS = /<[a-z!/][^>]*>/i;

export interface PreparedBody {
  /** What to store as the article's content. */
  content: string;
  /** The words only: for search, previews, and counting. */
  text: string;
  words: number;
  readMinutes: number;
}

export function prepareBody(raw: string | undefined | null): PreparedBody {
  const given = raw ?? '';
  const formatted = HAS_TAGS.test(given);
  const content = formatted ? sanitizeStoryHtml(given).trim() : given;
  // Block ends become spaces before the tags go, so "end.</p><p>Start" doesn't read "end.Start".
  const text = formatted ? htmlToPlainText(content.replace(/<\/(p|h[1-6]|li|blockquote|pre)>|<br\s*\/?>/gi, ' ')) : given.replace(/\s+/g, ' ').trim();
  const words = text ? text.split(/\s+/).length : 0;
  return { content, text, words, readMinutes: Math.max(1, Math.ceil(words / 200)) };
}

/** A message when this body can't be published or sent for review yet, or null when it can. */
export function bodyProblem(type: string, body: PreparedBody): string | null {
  if (type === 'FOUNDER_STORY') {
    if (body.text.length < STORY_MIN_TEXT) return `A story needs at least ${STORY_MIN_TEXT} characters before it can be sent for review.`;
    if (body.text.length > STORY_MAX_TEXT) return `A story can be up to ${STORY_MAX_TEXT.toLocaleString('en-IN')} characters.`;
    return null;
  }
  return body.text.length === 0 ? 'Write your update before publishing it.' : null;
}
