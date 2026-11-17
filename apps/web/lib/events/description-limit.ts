import { htmlToPlainText } from '@/lib/sanitize';
import { EVENT_DESCRIPTION_MAX } from '@/lib/events/limits';

export { EVENT_DESCRIPTION_MAX };

/**
 * Server-side check. The editor counts characters inside paragraphs; the plain-text version adds a space between
 * paragraphs and list items, so a small allowance keeps text the editor accepted from being refused here.
 */
export function descriptionTooLong(html: unknown): boolean {
  if (typeof html !== 'string' || !html) return false;
  return htmlToPlainText(html).length > EVENT_DESCRIPTION_MAX + 150;
}

export const DESCRIPTION_TOO_LONG = `The full description can be up to ${EVENT_DESCRIPTION_MAX.toLocaleString('en-IN')} characters. Shorten it and try again.`;
