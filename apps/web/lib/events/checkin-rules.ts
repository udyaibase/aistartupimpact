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

/**
 * One person in the offline list saved on a door volunteer's device. It never holds the ticket code or the email
 * itself, only one-way hashes of them (salted with the event id), so a lost or shared phone doesn't give away
 * working tickets or a mailing list. The door app hashes what it scans and compares.
 */
export type RosterRow = {
  id: string;
  /** rosterHash(eventId, 'ticket', qrToken) */
  tokenHash: string | null;
  /** rosterHash(eventId, 'email', email) */
  emailHash: string | null;
  /** "as***@gmail.com", for showing who was found. */
  emailHint: string;
  name: string; company: string | null; occupation: string | null;
  tier: string | null; status: string; checkedInAt: string | null;
};

/** What goes into a roster hash: the event id (so hashes can't be compared across events), a kind, and the value. */
export const rosterHashInput = (eventId: string, kind: 'ticket' | 'email', value: string) =>
  `udyaibase-checkin:${eventId}:${kind}:${kind === 'email' ? value.trim().toLowerCase() : value.trim()}`;

/** SHA-256 (hex) in the browser, for comparing a scan with the saved list. The server makes the same hash with Node. */
export async function rosterHash(eventId: string, kind: 'ticket' | 'email', value: string): Promise<string> {
  const bytes = new TextEncoder().encode(rosterHashInput(eventId, kind, value));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

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
 * An exact match in the roster: the ticket's QR code or the full email (both compared as hashes). A name never
 * matches here, because a partial name ("an") fits many people and would admit whoever comes first; names go
 * through `searchRoster`.
 */
export async function findInRoster(rows: RosterRow[], eventId: string, input: string): Promise<RosterRow | null> {
  const v = input.trim();
  if (!v) return null;
  const token = await rosterHash(eventId, 'ticket', v);
  const byToken = rows.find((r) => r.tokenHash && r.tokenHash === token);
  if (byToken) return byToken;
  if (!v.includes('@')) return null;
  const email = await rosterHash(eventId, 'email', v);
  return rows.find((r) => r.emailHash && r.emailHash === email) ?? null;
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
