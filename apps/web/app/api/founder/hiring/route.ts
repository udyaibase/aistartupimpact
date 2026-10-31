import { NextRequest, NextResponse } from 'next/server';
import { getFounderSession } from '@/lib/founder-auth';
import { openFounderWorkspace, WorkspaceError } from '@/lib/employer/founder-workspace';

export const dynamic = 'force-dynamic';

/** "Start hiring" from the founder portal: opens the startup's hiring workspace and signs the founder in. */
export async function POST(request: NextRequest) {
  const session = await getFounderSession();
  if (!session) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });

  const { startupId } = await request.json().catch(() => ({}));
  if (typeof startupId !== 'string' || !startupId) return NextResponse.json({ error: 'Choose a startup.' }, { status: 400 });

  try {
    await openFounderWorkspace(session.userId, startupId);
    return NextResponse.json({ success: true, redirect: '/employer/dashboard' });
  } catch (err) {
    if (err instanceof WorkspaceError) return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    console.error('[POST /api/founder/hiring]', err);
    return NextResponse.json({ error: 'Couldn’t open hiring. Try again.' }, { status: 500 });
  }
}
