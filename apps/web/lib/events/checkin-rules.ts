/**
 * Shared check-in rules (client-safe). Used by the live check-in API, the offline sync API and the offline door
 * app, so all three agree on who can be let in.
 */

export const BLOCKED_STATUSES: Record<string, string> = {
  CANCELLED: 'Registration cancelled',
  PENDING_PAYMENT: 'Ticket not paid yet',
  PENDING_APPROVAL: 'Registration pending approval',
  WAITLISTED: 'On the waitlist, not confirmed',
};

export type RosterRow = {
  id: string; qrToken: string | null; name: string; email: string; company: string | null; occupation: string | null;
  tier: string | null; status: string; checkedInAt: string | null;
};

/** A QR code holds the token, a ticket URL ending in /e/<token>, or a URL with ?token=. */
export function parseScanValue(code: string): string {
  const v = code.trim();
  if (v.includes('/e/')) return v.split('/e/').pop()!.split(/[?#]/)[0];
  if (v.includes('token=')) {
    try { return new URL(v).searchParams.get('token') ?? v; } catch { return v; }
  }
  return v;
}

/**
 * An exact match in the roster: the ticket's QR code or the full email. A name never matches here, because a
 * partial name ("an") fits many people and would admit whoever comes first; names go through `searchRoster`.
 */
export function findInRoster(rows: RosterRow[], input: string): RosterRow | null {
  const v = input.trim();
  if (!v) return null;
  const low = v.toLowerCase();
  return rows.find((r) => r.qrToken && r.qrToken === v)
    ?? rows.find((r) => r.email.toLowerCase() === low)
    ?? null;
}

/** People whose name contains the text (2+ characters), for the door staff to pick from. */
export function searchRoster(rows: RosterRow[], input: string, limit = 8): RosterRow[] {
  const low = input.trim().toLowerCase();
  if (low.length < 2) return [];
  return rows.filter((r) => r.name.toLowerCase().includes(low)).slice(0, limit);
}

/** Offline scans carry the time on the device; never in the future, never more than 3 days back. */
export function clampScanTime(raw: unknown, now = new Date()): Date {
  const t = typeof raw === 'string' || typeof raw === 'number' ? new Date(raw) : null;
  if (!t || Number.isNaN(t.getTime())) return now;
  const min = now.getTime() - 3 * 86_400_000;
  return new Date(Math.min(now.getTime(), Math.max(min, t.getTime())));
}
