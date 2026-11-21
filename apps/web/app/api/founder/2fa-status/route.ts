import { NextRequest, NextResponse } from 'next/server';
import { founderApi } from '@/lib/founder/api-session';
import { twoFactorStatusResponse } from '@/lib/auth/account-two-factor';

export const dynamic = 'force-dynamic';

export async function GET(_request?: NextRequest) {
  try {
    const guard = await founderApi();
    if (guard.error) return guard.error;
    const session = guard.session;
    return await twoFactorStatusResponse(session.email);
  } catch (error) {
    console.error('2FA status error:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ success: false, error: 'Failed to fetch 2FA status' }, { status: 500 });
  }
}
