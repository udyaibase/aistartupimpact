import { NextRequest, NextResponse } from 'next/server';
import { getUserSession } from '@/lib/user-session';
import { twoFactorStatusResponse } from '@/lib/auth/account-two-factor';

export const dynamic = 'force-dynamic';

export async function GET(_request?: NextRequest) {
  try {
    const session = await getUserSession();
    if (!session) return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    return await twoFactorStatusResponse(session.email);
  } catch (error) {
    console.error('2FA status error:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ success: false, error: 'Failed to fetch 2FA status' }, { status: 500 });
  }
}
