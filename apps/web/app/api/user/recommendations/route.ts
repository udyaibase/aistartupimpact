import { jwtSecret } from '@/lib/jwt-secret';
import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { sql } from '@/lib/db';
import { recommendFor } from '@/lib/personalization/recommend';

export const dynamic = 'force-dynamic';

const JWT_SECRET = jwtSecret(process.env.USER_JWT_SECRET, 'USER_JWT_SECRET');

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get('user-token')?.value;
    if (!token) return NextResponse.json({ items: [] });

    const { payload } = await jwtVerify(token, JWT_SECRET);
    const userId = payload.userId as string;
    if (!userId) return NextResponse.json({ items: [] });

    const users = await sql`SELECT "onboardingCompleted" FROM "WebUser" WHERE id = ${userId} LIMIT 1`;
    if (users.length === 0 || !users[0].onboardingCompleted) return NextResponse.json({ items: [] });
    return NextResponse.json({ items: await recommendFor(userId) });
  } catch (e) {
    console.error('Recommendations error:', e);
    return NextResponse.json({ items: [] });
  }
}
