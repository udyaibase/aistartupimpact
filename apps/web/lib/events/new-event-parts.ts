import type { Prisma } from '@udyaibase/database';
import { cleanSessions, eventDayCount, type SessionInput } from './agenda';

/**
 * Everything the create form sends besides the event's own fields: speakers, ticket types, registration questions
 * and the agenda. Saved in the same transaction as the event, so a new event never ends up half-created.
 * (Editing uses the event PUT route, which matches these field mappings.)
 */

const TIER_TYPES = ['EARLY_BIRD', 'REGULAR', 'VIP'] as const;
const QUESTION_TYPES = ['TEXT', 'SELECT', 'CHECKBOX'] as const;
const MAX_SPEAKERS = 50;
const MAX_TIERS = 20;
const MAX_QUESTIONS = 20;

type Raw = Record<string, unknown>;
const list = (v: unknown, max: number): Raw[] => (Array.isArray(v) ? v.slice(0, max).filter((x): x is Raw => !!x && typeof x === 'object') : []);
const str = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);
const nameKey = (v: unknown) => str(v, 100).toLowerCase();

/** Does any ticket cost money? (Paid tickets need an activated payout account.) */
export const hasPaidTickets = (raw: unknown) => list(raw, MAX_TIERS).some((t) => Number(t.priceRupees) > 0);

export type AgendaPlan = { sessions: (SessionInput & { speakerName: string | null })[] } | { error: string };

/**
 * Check the agenda before anything is saved. Sessions name their speaker (the speakers are created in the same
 * save, so they have no id yet); unknown names are dropped. Days can't go past the event's last day.
 */
export function planAgenda(raw: unknown, speakers: unknown, event: { startAt: Date; endAt: Date; timezone: string }): AgendaPlan {
  const names = new Set(list(speakers, MAX_SPEAKERS).map((s) => nameKey(s.name)).filter(Boolean));
  const items = list(raw, 300).filter((a) => str(a.title, 200) || str(a.startTime, 5));
  const r = cleanSessions(items.map((a) => ({ ...a, speakerId: nameKey(a.speaker) })), { tracks: [], speakerIds: names });
  if ('error' in r) return { error: `Agenda, session ${r.row + 1}: ${r.error}` };
  const days = eventDayCount(event.startAt, event.endAt, event.timezone);
  return {
    sessions: r.sessions.map((s) => ({ ...s, id: undefined, dayNumber: Math.min(s.dayNumber, days), speakerName: s.speakerId, speakerId: null })),
  };
}

export async function createEventParts(
  tx: Prisma.TransactionClient,
  eventId: string,
  data: { speakers?: unknown; ticketTiers?: unknown; customQuestions?: unknown },
  agenda: (SessionInput & { speakerName: string | null })[],
) {
  // Speakers first, so agenda sessions can point at them.
  const speakerIds = new Map<string, string>();
  for (const [i, s] of list(data.speakers, MAX_SPEAKERS).entries()) {
    const name = str(s.name, 100);
    if (!name || speakerIds.has(name.toLowerCase())) continue;
    const created = await tx.eventSpeaker.create({
      data: {
        eventId, name, title: str(s.title, 100) || null, company: str(s.company, 100) || null,
        headshotUrl: str(s.photo, 500) || null, bio: str(s.linkedin, 500) || null, sortOrder: i,
      },
      select: { id: true },
    });
    speakerIds.set(name.toLowerCase(), created.id);
  }

  const tiers = list(data.ticketTiers, MAX_TIERS);
  if (tiers.length) {
    await tx.eventTicketTier.createMany({
      data: tiers.map((t) => ({
        eventId,
        name: str(t.name, 60) || 'General',
        tierType: TIER_TYPES.includes(t.type as never) ? (t.type as (typeof TIER_TYPES)[number]) : 'REGULAR',
        quantity: Number.parseInt(String(t.quantity), 10) > 0 ? Number.parseInt(String(t.quantity), 10) : null,
        description: str(t.description, 500) || null,
        priceCents: Math.max(0, Math.round(Number(t.priceRupees ?? 0) * 100)) || 0,
      })),
    });
  }

  const questions = list(data.customQuestions, MAX_QUESTIONS).filter((q) => str(q.text, 300));
  if (questions.length) {
    await tx.eventCustomQuestion.createMany({
      data: questions.map((q, i) => {
        const type = QUESTION_TYPES.includes(q.type as never) ? (q.type as (typeof QUESTION_TYPES)[number]) : 'TEXT';
        return {
          eventId, questionText: str(q.text, 300), questionType: type, required: q.required === true, sortOrder: i,
          options: type === 'SELECT' && typeof q.options === 'string' ? q.options.split(',').map((o) => o.trim()).filter(Boolean).slice(0, 30) : undefined,
        };
      }),
    });
  }

  if (agenda.length) {
    await tx.eventAgendaItem.createMany({
      data: agenda.map((s, i) => ({
        eventId, dayNumber: s.dayNumber, startTime: s.startTime, endTime: s.endTime, title: s.title, description: s.description,
        speakerId: s.speakerName ? speakerIds.get(s.speakerName) ?? null : null, sortOrder: i,
      })),
    });
  }
}
