import { prisma } from '@udyaibase/database';
import { roundsOf, scorecardSkills } from '@/lib/employer/rounds';

/**
 * Simple scorecards: each interviewer rates the job's key skills 1 to 4 and says yes or no, per round.
 * Interviewers see colleagues' cards for a round only after submitting their own (no anchoring on others' scores);
 * owners and recruiters, who make the decision, see every card.
 */

export const RATING_LABEL = ['', 'Poor', 'Mixed', 'Good', 'Strong'] as const;

export interface ScorecardView {
  round: string; authorName: string; authorEmail: string; mine: boolean;
  ratings: Record<string, number>; recommendation: 'YES' | 'NO'; notes: string | null; updatedAt: string;
}

export function cleanScorecard(b: { round?: unknown; ratings?: unknown; recommendation?: unknown; notes?: unknown }, rounds: string[], skills: string[]):
  { ok: true; round: string; ratings: Record<string, number>; recommendation: 'YES' | 'NO'; notes: string | null } | { ok: false; error: string } {
  const round = typeof b.round === 'string' && rounds.includes(b.round) ? b.round : null;
  if (!round) return { ok: false, error: 'Pick the round you interviewed for.' };
  if (b.recommendation !== 'YES' && b.recommendation !== 'NO') return { ok: false, error: 'Say yes or no.' };
  const raw = (b.ratings && typeof b.ratings === 'object' ? b.ratings : {}) as Record<string, unknown>;
  const ratings: Record<string, number> = {};
  for (const s of skills) {
    const v = Number(raw[s]);
    if (!Number.isInteger(v) || v < 1 || v > 4) return { ok: false, error: `Rate “${s}” from 1 to 4.` };
    ratings[s] = v;
  }
  const notes = typeof b.notes === 'string' ? b.notes.trim().slice(0, 2000) || null : null;
  return { ok: true, round, ratings, recommendation: b.recommendation, notes };
}

/** Cards for one candidate as this person may see them, plus the rounds and skills to rate. */
export async function loadScorecards(applicationId: string, viewer: { email: string; role: string }) {
  const app = await prisma.jobBoardApplication.findUnique({
    where: { id: applicationId },
    select: { Listing: { select: { interviewRounds: true, skills: true, mustHaveSkills: true } } },
  });
  if (!app) return null;
  const rows = await prisma.jobBoardScorecard.findMany({ where: { applicationId }, orderBy: { createdAt: 'asc' } });
  const me = viewer.email.toLowerCase();
  const submitted = new Set(rows.filter((r) => r.authorEmail.toLowerCase() === me).map((r) => r.round));
  const seesAll = viewer.role === 'OWNER' || viewer.role === 'RECRUITER';
  const visible = rows.filter((r) => r.authorEmail.toLowerCase() === me || seesAll || submitted.has(r.round));
  const hidden = rows.length - visible.length;
  return {
    rounds: roundsOf(app.Listing.interviewRounds),
    skills: scorecardSkills(app.Listing),
    hidden,
    cards: visible.map((r): ScorecardView => ({
      round: r.round, authorName: r.authorName, authorEmail: r.authorEmail, mine: r.authorEmail.toLowerCase() === me,
      ratings: r.ratings as Record<string, number>, recommendation: r.recommendation as 'YES' | 'NO', notes: r.notes, updatedAt: r.updatedAt.toISOString(),
    })),
  };
}
