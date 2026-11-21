import { NextResponse } from 'next/server';
import type { Ratelimit } from '@upstash/ratelimit';
import { getFounderSession, type FounderSession } from '@/lib/founder-auth';
import { checkRateLimit, rateLimitMessage, retryAfterHeaders } from '@/lib/rate-limit';

type Guard = { session: FounderSession; error?: undefined } | { session?: undefined; error: NextResponse };

/**
 * The one sign-in check for founder API routes:
 *
 *   const guard = await founderApi();
 *   if (guard.error) return guard.error;
 *   const session = guard.session;
 *
 * A signed-out request always gets the same 401. Routes used to check by hand, and those that let the check throw
 * answered with a 500 instead. What a founder may do with a particular listing, story or team is still checked by the
 * route (listingAccess, verifyStartupAccess, teamContext): this only answers "who is signed in".
 */
export async function founderApi(): Promise<Guard> {
  const session = await getFounderSession();
  if (!session) return { error: NextResponse.json({ success: false, error: 'Please sign in again.' }, { status: 401 }) };
  return { session };
}

/** A ready 429 when this key has used up the limiter, otherwise null: `const limited = await tooMany(...); if (limited) return limited;` */
export async function tooMany(limiter: Ratelimit | null, key: string): Promise<NextResponse | null> {
  const { success, reset } = await checkRateLimit(limiter, key);
  if (success) return null;
  return NextResponse.json({ success: false, error: rateLimitMessage(reset) }, { status: 429, headers: retryAfterHeaders(reset) });
}
