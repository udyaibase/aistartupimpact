import { NextRequest, NextResponse } from 'next/server';
import { apiRateLimit, authRateLimit, checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';

/**
 * Limits for signed-in employer actions. Everyday writes get the general limit, which autosave stays well inside;
 * security steps get the tight one. Each route counts separately, so one busy screen can't block another.
 */
export async function writeLimited(request: NextRequest, route: string, kind: 'write' | 'sensitive' = 'write'): Promise<NextResponse | null> {
  const { success } = await checkRateLimit(kind === 'sensitive' ? authRateLimit : apiRateLimit, `employer:${route}:${getClientIdentifier(request)}`);
  return success ? null : NextResponse.json({ success: false, error: 'Too many requests. Please wait a little and try again.' }, { status: 429 });
}
