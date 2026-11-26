import { verifyUserToken } from '@/lib/user-session';
import { jwtSecret } from '@/lib/jwt-secret';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';
const JWT_SECRET = jwtSecret(process.env.USER_JWT_SECRET, 'USER_JWT_SECRET');

async function getSessionUserId(request: NextRequest): Promise<{ userId: string; sessionId: string } | null> {
  // Signature, open account and a sign-in that hasn't been ended (lib/user-session.ts).
  const ids = await verifyUserToken((await cookies()).get('user-token')?.value);
  return ids ? { userId: ids.userId, sessionId: ids.sessionId ?? '' } : null;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await getSessionUserId(request);
    if (!auth) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const sessions = await sql`
      SELECT id, "ipAddress", "userAgent", "createdAt", "expiresAt"
      FROM "WebUserSession"
      WHERE "webUserId" = ${auth.userId} AND "expiresAt" > NOW()
      ORDER BY "createdAt" DESC
    `;

    return NextResponse.json({
      sessions: sessions.map((s: any) => ({
        id: s.id,
        ipAddress: s.ipAddress,
        userAgent: s.userAgent,
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
        isCurrent: s.id === auth.sessionId,
      })),
    });
  } catch (error) {
    console.error('Error fetching sessions:', error);
    return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await getSessionUserId(request);
    if (!auth) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { sessionId } = await request.json();

    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID required' }, { status: 400 });
    }

    if (sessionId === auth.sessionId) {
      return NextResponse.json({ error: 'Cannot revoke your current session' }, { status: 400 });
    }

    await sql`
      DELETE FROM "WebUserSession"
      WHERE id = ${sessionId} AND "webUserId" = ${auth.userId}
    `;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error revoking session:', error);
    return NextResponse.json({ error: 'Failed to revoke session' }, { status: 500 });
  }
}
