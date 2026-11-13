import { NextRequest, NextResponse } from 'next/server';
import { getFounderSession } from '@/lib/founder-auth';
import { findFounderWorkspace, openFounderWorkspace } from '@/lib/employer/founder-workspace';
import { logEmployerActivity } from '@/lib/workspace-activity';

export const dynamic = 'force-dynamic';

/**
 * "Continue with your founder account" on the employer login page.
 * Signed-in founders with a workspace go straight to it; otherwise they pick a verified startup.
 */
export async function GET(request: NextRequest) {
  const url = (path: string) => new URL(path, request.nextUrl.origin);
  const session = await getFounderSession();
  if (!session) return NextResponse.redirect(url(`/auth/login?returnTo=${encodeURIComponent('/founder/hiring')}`));

  const workspace = await findFounderWorkspace(session.userId);
  if (workspace?.startupId) {
    try {
      const opened = await openFounderWorkspace(session.userId, workspace.startupId);
      await logEmployerActivity(opened.id, 'signed_in', { actor: { name: session.name, email: session.email }, request, metadata: { method: 'founder' } });
      return NextResponse.redirect(url('/employer/dashboard'));
    } catch { /* ownership changed since; let them choose again */ }
  }
  return NextResponse.redirect(url('/founder/hiring'));
}
