import { NextRequest, NextResponse } from 'next/server';
import { clearEmployerSession, revokeEmployerSessions } from '@/lib/employer-auth';

export const dynamic = 'force-dynamic';

/**
 * Sign out. `{ everywhere: true }` ends this person's sessions on every device; otherwise only this one.
 * The session is ended on the server as well as in the browser, so a copied cookie stops working.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    await revokeEmployerSessions(body?.everywhere === true ? 'all' : 'this');
    await clearEmployerSession();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[POST /api/employer/auth/logout]', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ error: 'Logout failed' }, { status: 500 });
  }
}
