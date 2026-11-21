import { isPublicWebUrl } from '@/lib/founder/listing-validation';

/**
 * Server checks for what founders post about their startup: updates, stories and milestones. Updates go public the
 * moment they're posted, so the browser form's checks aren't enough.
 */

export const CONTENT_TITLE_MIN = 3;
export const CONTENT_TITLE_MAX = 200;
export const CONTENT_BODY_MAX = 100_000;
export const CONTENT_EXCERPT_MAX = 500;
/** Updates a startup can publish in 24 hours. Enough for a launch day; stops a taken-over account flooding the feed. */
export const UPDATES_PER_DAY = 5;

export interface ContentFields {
  title?: string;
  content?: string;
  excerpt?: string | null;
  coverImage?: string | null;
}
type Checked<T> = { ok: true; data: T } | { ok: false; error: string };

/** A cover image must be a full https address on a public host. Empty clears it. */
export function coverImageProblem(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > 2000) return 'Cover image must be a web address starting with https://';
  if (!value.startsWith('https://') || !isPublicWebUrl(value)) return 'Cover image must be a web address starting with https://';
  return null;
}

/**
 * Checks the fields of an update or story. On create the title is required; on edit only the fields sent are checked.
 * Returns only the fields that were sent, cleaned.
 */
export function checkContentFields(body: Record<string, unknown>, mode: 'create' | 'edit'): Checked<ContentFields> {
  const data: ContentFields = {};

  if (body.title !== undefined || mode === 'create') {
    if (typeof body.title !== 'string' || body.title.trim().length < CONTENT_TITLE_MIN) {
      return { ok: false, error: `Title must be at least ${CONTENT_TITLE_MIN} characters` };
    }
    if (body.title.trim().length > CONTENT_TITLE_MAX) return { ok: false, error: `Title must be ${CONTENT_TITLE_MAX} characters or less` };
    data.title = body.title.trim();
  }

  if (body.content !== undefined && body.content !== null) {
    if (typeof body.content !== 'string') return { ok: false, error: 'Content must be text' };
    if (body.content.length > CONTENT_BODY_MAX) {
      return { ok: false, error: `Content is too long. Keep it under ${CONTENT_BODY_MAX.toLocaleString('en-IN')} characters.` };
    }
    data.content = body.content;
  }

  if (body.excerpt !== undefined) {
    if (body.excerpt !== null && typeof body.excerpt !== 'string') return { ok: false, error: 'Summary must be text' };
    if (typeof body.excerpt === 'string' && body.excerpt.length > CONTENT_EXCERPT_MAX) {
      return { ok: false, error: `Summary must be ${CONTENT_EXCERPT_MAX} characters or less` };
    }
    data.excerpt = (body.excerpt as string | null)?.trim() || null;
  }

  if (body.coverImage !== undefined) {
    const problem = coverImageProblem(body.coverImage);
    if (problem) return { ok: false, error: problem };
    data.coverImage = (body.coverImage as string | null) || null;
  }

  return { ok: true, data };
}

export const MILESTONE_CURRENCIES = ['INR', 'USD', 'EUR'] as const;
const EARLIEST_MILESTONE = new Date('1990-01-01T00:00:00Z');

/** A real date, not before 1990 and not more than a year ahead. */
export function checkMilestoneDate(value: unknown, now = new Date()): Checked<Date> {
  const date = typeof value === 'string' || typeof value === 'number' || value instanceof Date ? new Date(value) : new Date(NaN);
  if (Number.isNaN(date.getTime())) return { ok: false, error: 'Enter a valid date' };
  const latest = new Date(now);
  latest.setFullYear(latest.getFullYear() + 1);
  if (date < EARLIEST_MILESTONE) return { ok: false, error: 'That date looks too far back' };
  if (date > latest) return { ok: false, error: 'The date can’t be more than a year ahead' };
  return { ok: true, data: date };
}

/** Empty means no amount. Otherwise a number from 0 up. */
export function checkMilestoneAmount(value: unknown): Checked<number | null> {
  if (value === undefined || value === null || value === '') return { ok: true, data: null };
  const amount = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(amount)) return { ok: false, error: 'Amount must be a number' };
  if (amount < 0) return { ok: false, error: 'Amount can’t be negative' };
  if (amount > 1e15) return { ok: false, error: 'Amount looks too large' };
  return { ok: true, data: amount };
}

export function checkMilestoneCurrency(value: unknown): Checked<string> {
  if (value === undefined || value === null || value === '') return { ok: true, data: 'INR' };
  return (MILESTONE_CURRENCIES as readonly unknown[]).includes(value) ? { ok: true, data: value as string } : { ok: false, error: 'Choose INR, USD or EUR' };
}
