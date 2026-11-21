import type { NextResponse } from 'next/server';
import { organizerWriteRateLimit } from '@/lib/rate-limit';
import { tooMany } from '@/lib/founder/api-session';

/**
 * The limit for host portal writes with no stricter limit of their own:
 *
 *   const limited = await hostWriteLimit(session.id);
 *   if (limited) return limited;
 *
 * Counted per signed-in person, across workspaces. 90 a minute is far above what the portal's screens send (the
 * event form saves a few times a minute); it stops a script, not a person.
 */
export function hostWriteLimit(personId: string): Promise<NextResponse | null> {
  return tooMany(organizerWriteRateLimit, `host:${personId}`);
}
