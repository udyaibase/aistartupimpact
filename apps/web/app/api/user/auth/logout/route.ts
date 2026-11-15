import { jwtSecret } from '@/lib/jwt-secret';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';
const JWT_SECRET = jwtSecret(process.env.USER_JWT_SECRET, 'USER_JWT_SECRET');

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('user-token')?.value;

    if (token) {
      try {
        const verified = await jwtVerify(token, JWT_SECRET);
        const sessionId = (verified.payload as any).sessionId;

        // Delete session from database
        if (sessionId) {
          await sql`
            DELETE FROM "WebUserSession"
            WHERE id = ${sessionId}
          `.catch(() => {
            // Session might already be deleted
          });
        }
      } catch (error) {
        // Token invalid, just clear cookie
      }
    }

    // Clear cookie
    const response = NextResponse.json({ success: true });
    response.cookies.delete('user-token');

    return response;
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
