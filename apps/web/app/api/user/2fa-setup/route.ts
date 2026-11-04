import { NextRequest, NextResponse } from 'next/server';
import { getUserSession } from '@/lib/user-session';
import { twoFactorSetupResponse } from '@/lib/auth/account-two-factor';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const session = await getUserSession();
    if (!session) return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    const body = await request.json();
    const response = await twoFactorSetupResponse(session.email, body);
    return response;
  } catch (error) {
    console.error('2FA setup error:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ success: false, error: 'Failed to set up 2FA' }, { status: 500 });
  }
}
