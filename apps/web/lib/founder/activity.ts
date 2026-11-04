import type { NextRequest } from 'next/server';
import { headers } from 'next/headers';
import { prisma } from '@udyaibase/database';
import { clientIpFromHeaders } from '@/lib/client-ip';

import type { FounderActivity } from '@udyaibase/utils';

/** The current request's headers, or null outside a request (scripts, tests). */
async function currentHeaders(): Promise<Headers | null> {
  try { return await headers(); } catch { return null; }
}

/**
 * Activity log of a founder's account: what was done, when and from where. The founder sees it at /founder/activity.
 * Kept for one year, then deleted by the data-retention job. Survives account deletion on purpose (no foreign key).
 * Never pass passwords, codes or tokens in metadata, and mask other people's emails. A logging failure must never
 * break the action itself.
 */
export async function logFounderActivity(
  founderId: string,
  action: FounderActivity,
  opts: { request?: NextRequest; metadata?: Record<string, string | number | boolean> } = {},
): Promise<void> {
  try {
    // Server actions have no request object, but do have the request's headers.
    const requestHeaders = opts.request?.headers ?? (await currentHeaders());
    await prisma.founderActivityLog.create({
      data: {
        founderId,
        action,
        ipAddress: requestHeaders ? clientIpFromHeaders(requestHeaders) : null,
        userAgent: requestHeaders?.get('user-agent')?.slice(0, 300) ?? null,
        metadata: opts.metadata,
      },
    });
  } catch (err) {
    console.error('[founder-activity] could not record', action, err instanceof Error ? err.message : 'unknown error');
  }
}

/** Records a sign-in, for people who have a founder account. Every sign-in route shares one identity by email. */
export async function logFounderSignIn(email: string, request: NextRequest, method: 'password' | 'password_2fa' | 'google'): Promise<void> {
  try {
    const founder = await prisma.founderUser.findUnique({ where: { email: email.toLowerCase() }, select: { id: true } });
    if (founder) await logFounderActivity(founder.id, 'signed_in', { request, metadata: { method } });
  } catch (err) {
    console.error('[founder-activity] could not record sign-in', err instanceof Error ? err.message : 'unknown error');
  }
}

/** Records a failed sign-in on a founder account, so they can spot someone trying to get in. No password is stored. */
export async function logFounderSignInFailed(email: string, request: NextRequest, reason: 'wrong_password' | 'wrong_2fa_code'): Promise<void> {
  try {
    const founder = await prisma.founderUser.findUnique({ where: { email: email.toLowerCase() }, select: { id: true } });
    if (founder) await logFounderActivity(founder.id, 'sign_in_failed', { request, metadata: { reason } });
  } catch (err) {
    console.error('[founder-activity] could not record failed sign-in', err instanceof Error ? err.message : 'unknown error');
  }
}
