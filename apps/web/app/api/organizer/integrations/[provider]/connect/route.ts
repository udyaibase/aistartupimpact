import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/organizer-auth/require-permission';
import { authorizeUrl, isProvider } from '@/lib/integrations/providers';
import { makeState } from '@/lib/integrations/meetings';

export const dynamic = 'force-dynamic';

/** Start connecting Zoom or Google: off to their consent screen with a one-time state. */
export async function GET(request: NextRequest, props: { params: Promise<{ provider: string }> }) {
  const { provider } = await props.params;
  const back = (q: string) => NextResponse.redirect(new URL(`/organizer/settings?${q}`, request.url));
  if (!isProvider(provider)) return back('integration_error=unknown');
  const session = await requirePermission('settings');
  if (session instanceof NextResponse) return back('integration_error=permission');
  const { state, cookie } = makeState(provider, session.organizerId, session.id);
  const url = authorizeUrl(provider, state);
  if (!url) return back('integration_error=not_configured');
  const res = NextResponse.redirect(url);
  res.cookies.set('udy_int_state', cookie, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/api/organizer/integrations', maxAge: 900 });
  return res;
}
