/**
 * How far a talent-pool candidate got with this company, shared by the Talent pool page, the Add candidates dialog
 * and the server. No server imports.
 */

/** Furthest stage reached, in the board's order (Assessment and Final decision included). */
export const STAGE_RANK: Record<string, number> = { APPLIED: 0, REVIEWED: 0, SHORTLISTED: 1, ASSESSMENT: 2, INTERVIEW: 3, DECISION: 4, OFFER: 5 };
const LABEL = ['Applied', 'Screened', 'Took the assessment', 'Interviewed', 'Reached the final decision', 'Got an offer'];

/** "Interviewed", or "Interviewed, not selected" when every application they sent ended in a rejection. */
export function furthestStageLabel(rank: number, rejected: boolean, anyActive: boolean): string {
  if (rank < 0) return 'Not selected';
  return !anyActive && rejected ? `${LABEL[rank]}, not selected` : LABEL[rank]!;
}

/** Rank and label from a person's applications (statuses) and the stages they passed through on the way. */
export function furthestStage(statuses: string[], passed: string[] = []): { rank: number; label: string } {
  let rank = -1;
  for (const s of [...statuses, ...passed]) rank = Math.max(rank, STAGE_RANK[s] ?? -1);
  const rejected = statuses.includes('REJECTED');
  const anyActive = statuses.some((s) => s !== 'REJECTED');
  return { rank, label: furthestStageLabel(rank, rejected, anyActive) };
}

/** Colour by how far they got: an offer or interview is the strongest reason to call again. */
export function stageStyle(rank: number) {
  if (rank >= 5) return { dot: 'bg-amber-500', text: 'text-amber-800 dark:text-amber-300', star: true };
  if (rank >= 3) return { dot: 'bg-emerald-500', text: 'text-emerald-800 dark:text-emerald-300', star: true };
  if (rank >= 1) return { dot: 'bg-sky-500', text: 'text-sky-800 dark:text-sky-300', star: false };
  return { dot: 'bg-gray-400', text: 'text-gray-700 dark:text-gray-300', star: false };
}
