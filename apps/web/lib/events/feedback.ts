import { prisma } from '@udyaibase/database';
import { feedbackToken } from './after-event';

/**
 * Event feedback: a rating out of 5, a 0–10 "would you recommend" score, up to 3 short questions from the host,
 * and a comment. Collected through a signed link in the thank-you email, so nobody needs to sign in. One response
 * per registration (it can be changed for a while after the event).
 */

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://udyaibase.com').replace(/\/$/, '');

export const MAX_FEEDBACK_QUESTIONS = 3;
/** Feedback stays open this long after the event ends. */
export const FEEDBACK_WINDOW_DAYS = 60;

export interface FeedbackSettings {
  enabled: boolean;
  questions: string[];
}

export function feedbackSettings(raw: unknown): FeedbackSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const questions = (Array.isArray(r.questions) ? r.questions : [])
    .filter((q): q is string => typeof q === 'string')
    .map((q) => q.trim().replace(/\s+/g, ' ').slice(0, 150))
    .filter(Boolean)
    .slice(0, MAX_FEEDBACK_QUESTIONS);
  return { enabled: r.enabled !== false, questions };
}

export const feedbackUrl = (registrationId: string, rating?: number) =>
  `${SITE}/events/feedback?t=${encodeURIComponent(feedbackToken(registrationId))}${rating ? `&r=${rating}` : ''}`;

/** Feedback is open from the start of the event until FEEDBACK_WINDOW_DAYS after it ends. */
export function feedbackOpen(e: { startAt: Date; endAt: Date }, now = new Date()): boolean {
  return e.startAt <= now && now.getTime() <= e.endAt.getTime() + FEEDBACK_WINDOW_DAYS * 86_400_000;
}

export type FeedbackInput = { rating: number; recommend: number | null; answers: { question: string; answer: string }[]; comment: string | null };

/** Validate a submitted response against the host's questions. Null when the rating is missing or out of range. */
export function cleanFeedback(body: Record<string, unknown>, questions: string[]): FeedbackInput | null {
  const rating = Number(body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return null;
  const rec = body.recommend === null || body.recommend === undefined || body.recommend === '' ? null : Number(body.recommend);
  const recommend = rec !== null && Number.isInteger(rec) && rec >= 0 && rec <= 10 ? rec : null;
  const given = Array.isArray(body.answers) ? body.answers : [];
  const answers = questions.map((question, i) => ({ question, answer: String(given[i] ?? '').trim().slice(0, 1000) })).filter((a) => a.answer);
  const comment = String(body.comment ?? '').trim().slice(0, 2000) || null;
  return { rating, recommend, answers, comment };
}

export interface FeedbackSummary {
  responses: number;
  averageRating: number | null;
  /** Net Promoter Score: % 9–10 minus % 0–6, among people who answered. */
  nps: number | null;
  distribution: number[];
  comments: { rating: number; comment: string; at: string }[];
  answers: { question: string; answers: string[] }[];
}

export function summarise(rows: { rating: number; recommend: number | null; answers: unknown; comment: string | null; createdAt: Date }[], questions: string[]): FeedbackSummary {
  const n = rows.length;
  const recs = rows.map((r) => r.recommend).filter((x): x is number => x !== null);
  const nps = recs.length ? Math.round(((recs.filter((x) => x >= 9).length - recs.filter((x) => x <= 6).length) / recs.length) * 100) : null;
  const distribution = [1, 2, 3, 4, 5].map((s) => rows.filter((r) => r.rating === s).length);
  const byQuestion = new Map<string, string[]>(questions.map((q) => [q, []]));
  for (const r of rows) {
    for (const a of (Array.isArray(r.answers) ? r.answers : []) as { question?: string; answer?: string }[]) {
      if (a?.question && a.answer && byQuestion.has(a.question)) byQuestion.get(a.question)!.push(a.answer);
    }
  }
  return {
    responses: n,
    averageRating: n ? Math.round((rows.reduce((s, r) => s + r.rating, 0) / n) * 10) / 10 : null,
    nps,
    distribution,
    comments: rows.filter((r) => r.comment).slice(0, 30).map((r) => ({ rating: r.rating, comment: r.comment!, at: r.createdAt.toISOString() })),
    answers: Array.from(byQuestion.entries()).map(([question, answers]) => ({ question, answers: answers.slice(0, 50) })),
  };
}

export async function feedbackSummary(eventId: string, questions: string[]): Promise<FeedbackSummary> {
  const rows = await prisma.eventFeedback.findMany({
    where: { eventId },
    orderBy: { createdAt: 'desc' },
    take: 2000,
    select: { rating: true, recommend: true, answers: true, comment: true, createdAt: true },
  });
  return summarise(rows, questions);
}
