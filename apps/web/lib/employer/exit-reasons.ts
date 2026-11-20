/**
 * Why a candidate left the pipeline. A fixed list in code (not a table) so reports can group by it.
 * Internal only: never shown to the candidate in emails or on their status page.
 */
export const EXIT_REASONS = [
  { code: 'SKILL_GAP', label: 'Skills don’t match' },
  { code: 'EXPERIENCE', label: 'Experience level' },
  { code: 'SALARY', label: 'Salary above budget' },
  { code: 'NOTICE', label: 'Notice period too long' },
  { code: 'LOCATION', label: 'Location' },
  { code: 'FIT', label: 'Culture or communication' },
  { code: 'POSITION_CLOSED', label: 'Position filled or closed' },
  { code: 'OTHER', label: 'Other (add a note)' },
] as const;

export type ExitReason = (typeof EXIT_REASONS)[number]['code'];

export const EXIT_NOTE_MAX = 300;

export function exitReasonLabel(code: string | null | undefined): string | null {
  return EXIT_REASONS.find((r) => r.code === code)?.label ?? null;
}

/** Days an On hold candidate waits by default before coming back to the team. */
export const ON_HOLD_DEFAULT_DAYS = 30;
/** The furthest ahead a come-back date can be. */
export const ON_HOLD_MAX_DAYS = 180;

export type ExitInput =
  | { ok: true; reason: ExitReason | null; note: string | null; holdUntil: Date | null }
  | { ok: false; error: string; field: string };

/**
 * Checks the reason, note and come-back date sent with a move.
 * Rejecting needs a reason ("Other" also needs a note); On hold needs a date between tomorrow and 180 days out.
 */
export function parseExitInput(toStatus: string, body: { reason?: unknown; note?: unknown; holdUntil?: unknown }, now = new Date()): ExitInput {
  const note = typeof body.note === 'string' ? body.note.trim().replace(/\s+/g, ' ').slice(0, EXIT_NOTE_MAX) || null : null;
  const reason = typeof body.reason === 'string' && EXIT_REASONS.some((r) => r.code === body.reason) ? (body.reason as ExitReason) : null;

  if (toStatus === 'REJECTED') {
    if (!reason) return { ok: false, error: 'Choose a reason for rejecting.', field: 'reason' };
    if (reason === 'OTHER' && !note) return { ok: false, error: 'Add a short note for “Other”.', field: 'note' };
    return { ok: true, reason, note, holdUntil: null };
  }
  if (toStatus === 'ON_HOLD') {
    let until: Date | null = null;
    if (body.holdUntil == null || body.holdUntil === '') until = new Date(now.getTime() + ON_HOLD_DEFAULT_DAYS * 864e5);
    else if (typeof body.holdUntil === 'string' && !Number.isNaN(Date.parse(body.holdUntil))) until = new Date(body.holdUntil);
    if (!until) return { ok: false, error: 'Pick a date to come back to this candidate.', field: 'holdUntil' };
    const days = (until.getTime() - now.getTime()) / 864e5;
    if (days < 0.5 || days > ON_HOLD_MAX_DAYS + 1) return { ok: false, error: `Pick a date between tomorrow and ${ON_HOLD_MAX_DAYS} days from now.`, field: 'holdUntil' };
    return { ok: true, reason, note, holdUntil: until };
  }
  return { ok: true, reason: null, note: null, holdUntil: null };
}
