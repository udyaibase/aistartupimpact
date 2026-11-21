import { cookies } from 'next/headers';
import { decodeJwt } from 'jose';
import { sql } from '@/lib/db';
import { destroyUnifiedSession } from '@/lib/unified-auth';

/**
 * Ending sessions on the server. Removing a cookie from the browser isn't enough: a copy of that cookie would keep
 * working until it expires. Every sign-in is backed by a row (WebUserSession, FounderSession, UnifiedSession), and
 * sign-out deletes the row, so the cookie stops working wherever it is.
 */

/** The three cookies one person's sign-in can leave in a browser. */
export const SIGN_IN_COOKIES = ['founder-token', 'user-token', 'unified_session'] as const;

/** A claim from a cookie we issued, read without verifying: only used to find the row to delete, never to grant access. */
function claim(token: string | undefined, name: string): string | null {
  if (!token) return null;
  try {
    const value = decodeJwt(token)[name];
    return typeof value === 'string' && value ? value : null;
  } catch {
    return null;
  }
}

/** Ends this browser's sessions on the server and clears its sign-in cookies. Safe to call when not signed in. */
export async function signOutThisDevice(): Promise<void> {
  const store = await cookies();
  const webSessionId = claim(store.get('user-token')?.value, 'sessionId');
  const founderSessionId = claim(store.get('founder-token')?.value, 'sid');
  try {
    if (webSessionId) await sql`DELETE FROM "WebUserSession" WHERE id = ${webSessionId}`;
    if (founderSessionId) await sql`DELETE FROM "FounderSession" WHERE id = ${founderSessionId}`;
  } catch (e) {
    console.error('[sign-out] could not end the session on the server:', e instanceof Error ? e.message : 'unknown error');
  }
  await destroyUnifiedSession(); // deletes its own row and cookie
  for (const name of SIGN_IN_COOKIES) store.delete(name);
}

/**
 * Ends every session of the person with this email, on every device and in every portal. `keepWebSessionId` leaves one
 * site session running (the device a password was just changed on).
 */
export async function endAccountSessions(email: string, opts: { keepWebSessionId?: string | null } = {}): Promise<void> {
  const address = email.toLowerCase();
  // Founder cookies issued before this moment stop working, including older ones that have no session row.
  await sql`UPDATE "FounderUser" SET "sessionsValidAfter" = NOW() WHERE email = ${address}`;
  if (opts.keepWebSessionId) {
    await sql`DELETE FROM "WebUserSession" WHERE "webUserId" IN (SELECT id FROM "WebUser" WHERE email = ${address}) AND id != ${opts.keepWebSessionId}`;
  } else {
    await sql`DELETE FROM "WebUserSession" WHERE "webUserId" IN (SELECT id FROM "WebUser" WHERE email = ${address})`;
  }
  await sql`DELETE FROM "UnifiedSession" WHERE "userId" IN (SELECT id FROM "UnifiedUser" WHERE email = ${address})`;
  await sql`DELETE FROM "EventOrganizerSession" WHERE "organizerId" IN (SELECT id FROM "EventOrganizer" WHERE lower(email) = ${address})`;
  await sql`DELETE FROM "FounderSession" WHERE "userId" IN (SELECT id FROM "FounderUser" WHERE email = ${address})`;
}

/** "Sign out everywhere": ends all of this person's sessions, then clears this browser's cookies. */
export async function signOutEverywhere(email: string): Promise<void> {
  await endAccountSessions(email);
  const store = await cookies();
  for (const name of SIGN_IN_COOKIES) store.delete(name);
  store.delete('organizer_session');
}
