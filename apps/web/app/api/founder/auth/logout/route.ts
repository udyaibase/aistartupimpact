import { NextRequest, NextResponse } from 'next/server';
import { getFounderSession } from '@/lib/founder-auth';
import { signOutEverywhere, signOutThisDevice } from '@/lib/auth/sessions';
import { logFounderActivity } from '@/lib/founder/activity';

export const dynamic = 'force-dynamic';

/**
 * Signs out. The session is ended on the server, so a copy of the cookie stops working too.
 * `{ everywhere: true }` ends every session of this person, on every device.
 */
export async function POST(request: NextRequest) {
  try {
    const { everywhere } = (await request.json().catch(() => ({}))) as { everywhere?: unknown };
    if (everywhere === true) {
      const session = await getFounderSession();
      if (!session) return NextResponse.json({ success: false, error: 'Please sign in again.' }, { status: 401 });
      await signOutEverywhere(session.email);
      await logFounderActivity(session.userId, 'signed_out_everywhere', { request });
      return NextResponse.json({ success: true, everywhere: true });
    }
    await signOutThisDevice();
    return NextResponse.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ error: 'Logout failed' }, { status: 500 });
  }
}
