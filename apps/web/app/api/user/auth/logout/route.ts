import { NextRequest, NextResponse } from 'next/server';
import { getUserSession } from '@/lib/user-session';
import { getFounderSession } from '@/lib/founder-auth';
import { getUnifiedSession } from '@/lib/unified-auth';
import { signOutEverywhere, signOutThisDevice } from '@/lib/auth/sessions';
import { logFounderActivity } from '@/lib/founder/activity';

export const dynamic = 'force-dynamic';

/**
 * Signs out of the site and the founder portal: every sign-in cookie this browser holds is ended on the server and
 * cleared. `{ everywhere: true }` ends every session of this person, on every device.
 */
export async function POST(request: NextRequest) {
  try {
    const { everywhere } = (await request.json().catch(() => ({}))) as { everywhere?: unknown };
    if (everywhere === true) {
      // Whichever sign-in this browser has: site, founder portal, or the events workspace.
      const [user, founder, unified] = await Promise.all([getUserSession(), getFounderSession(), getUnifiedSession().catch(() => null)]);
      const email = user?.email ?? founder?.email ?? unified?.email;
      if (!email) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
      await signOutEverywhere(email);
      if (founder) await logFounderActivity(founder.userId, 'signed_out_everywhere', { request });
      return NextResponse.json({ success: true, everywhere: true });
    }
    await signOutThisDevice();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Logout error:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
