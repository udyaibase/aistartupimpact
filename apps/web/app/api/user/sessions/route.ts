import { jwtSecret } from '@/lib/jwt-secret';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';
const JWT_SECRET = jwtSecret(process.env.USER_JWT_SECRET, 'USER_JWT_SECRET');

async function getSessionUserId(request: NextRequest): Promise<{ userId: string; sessionId: string } | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get('user-token')?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return { userId: (payload as any).userId, sessionId: (payload as any).sessionId };
  } catch {
    return null;
  }
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
