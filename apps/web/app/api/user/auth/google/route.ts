import { NextRequest, NextResponse } from 'next/server';
import { startOAuthState } from '@/lib/auth/oauth-state';

export const dynamic = 'force-dynamic';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI_USER || 'http://localhost:3000/api/user/auth/google/callback';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const returnTo = searchParams.get('returnTo') || '/profile';

  // Build Google OAuth URL
  const googleAuthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  googleAuthUrl.searchParams.append('client_id', GOOGLE_CLIENT_ID || '');
  googleAuthUrl.searchParams.append('redirect_uri', GOOGLE_REDIRECT_URI);
  googleAuthUrl.searchParams.append('response_type', 'code');
  googleAuthUrl.searchParams.append('scope', 'openid email profile');
  googleAuthUrl.searchParams.append('access_type', 'offline');
  googleAuthUrl.searchParams.append('prompt', 'consent');
  // The state is tied to this browser by a cookie, and checked when Google sends the person back.
  const { state, attach } = startOAuthState(returnTo, '/profile');
  googleAuthUrl.searchParams.append('state', state);
  return attach(NextResponse.redirect(googleAuthUrl.toString()));
}
