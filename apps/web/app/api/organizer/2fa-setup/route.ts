import { NextRequest, NextResponse } from 'next/server';
import { getOrganizerSession } from '@/lib/organizer-auth';
import { twoFactorSetupResponse } from '@/lib/auth/account-two-factor';
import { logOrganizerActivity, organizerActor } from '@/lib/workspace-activity';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const session = await getOrganizerSession();
    if (!session) return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    const body = await request.json();
    const response = await twoFactorSetupResponse(session.email, body);
    if (body.action === 'verify' && (await response.clone().json()).success) await logOrganizerActivity(session.id, '2fa_enabled', { actor: organizerActor(session), request });
    return response;
  } catch (error) {
    console.error('2FA setup error:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ success: false, error: 'Failed to set up 2FA' }, { status: 500 });
  }
}
