import { NextRequest, NextResponse } from 'next/server';
import { getGoogleAuthUrl } from '@/lib/google-oauth';
import { startOAuthState } from '@/lib/auth/oauth-state';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    // The state is tied to this browser by a cookie, and checked when Google sends the person back.
    const { state, attach } = startOAuthState(request.nextUrl.searchParams.get('returnTo'), '/founder/dashboard');
    return attach(NextResponse.redirect(getGoogleAuthUrl(state)));
  } catch (error) {
    console.error('Google OAuth initiation error:', error);
    return NextResponse.redirect(new URL('/auth/signup?error=oauth_failed', request.url));
  }
}
