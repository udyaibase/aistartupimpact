import { NextRequest, NextResponse } from 'next/server';
import { founderApi, tooMany } from '@/lib/founder/api-session';
import { founderWriteRateLimit } from '@/lib/rate-limit';
import { twoFactorSetupResponse } from '@/lib/auth/account-two-factor';
import { logFounderActivity } from '@/lib/founder/activity';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const guard = await founderApi();
    if (guard.error) return guard.error;
    const session = guard.session;
    const limited = await tooMany(founderWriteRateLimit, `2fa-setup:${session.userId}`);
    if (limited) return limited;
    const body = await request.json();
    const response = await twoFactorSetupResponse(session.email, body);
    if (body.action === 'verify' && (await response.clone().json()).success) await logFounderActivity(session.userId, '2fa_enabled', { request });
    return response;
  } catch (error) {
    console.error('2FA setup error:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ success: false, error: 'Failed to set up 2FA' }, { status: 500 });
  }
}
