import { verifyUserToken } from '@/lib/user-session';
import { jwtSecret } from '@/lib/jwt-secret';
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { recommendFor } from '@/lib/personalization/recommend';

export const dynamic = 'force-dynamic';

const JWT_SECRET = jwtSecret(process.env.USER_JWT_SECRET, 'USER_JWT_SECRET');

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get('user-token')?.value;
    if (!token) return NextResponse.json({ items: [] });

    const userId = (await verifyUserToken(token))?.userId;
    if (!userId) return NextResponse.json({ items: [] });

    const users = await sql`SELECT "onboardingCompleted" FROM "WebUser" WHERE id = ${userId} LIMIT 1`;
    if (users.length === 0 || !users[0].onboardingCompleted) return NextResponse.json({ items: [] });
    return NextResponse.json({ items: await recommendFor(userId) });
  } catch (e) {
    console.error('Recommendations error:', e);
    return NextResponse.json({ items: [] });
  }
}
