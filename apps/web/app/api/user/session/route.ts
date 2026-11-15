import { jwtSecret } from '@/lib/jwt-secret';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';
const JWT_SECRET = jwtSecret(process.env.USER_JWT_SECRET, 'USER_JWT_SECRET');

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('user-token')?.value;

    if (!token) {
      return NextResponse.json({ user: null });
    }

    // Verify token
    const verified = await jwtVerify(token, JWT_SECRET);
    const payload = verified.payload as any;

    // Get web user from database
    const users = await sql`
      SELECT 
        id, email, name, avatar, slug, bio, twitter, linkedin, instagram, facebook, github,
        "isActive", "termsAcceptedAt"::text as "termsAcceptedAt", "termsVersion"
      FROM "WebUser"
      WHERE id = ${payload.userId}
      LIMIT 1
    `;

    if (users.length === 0 || !users[0].isActive) {
      return NextResponse.json({ user: null });
    }

    const user = users[0];

    // Check workspace links via UnifiedUser (by email match)
    let founderId: string | null = null;
    let organizerId: string | null = null;

    try {
      const founderRows = await sql`
        SELECT f.id FROM "FounderUser" f
        JOIN "UnifiedUser" u ON f."unifiedUserId" = u.id
        WHERE u.email = ${user.email}
        LIMIT 1
      `;
      if (founderRows.length > 0) founderId = founderRows[0].id;

      const organizerRows = await sql`
        SELECT o.id FROM "EventOrganizer" o
        JOIN "UnifiedUser" u ON o."unifiedUserId" = u.id
        WHERE u.email = ${user.email}
        LIMIT 1
      `;
      if (organizerRows.length > 0) organizerId = organizerRows[0].id;
    } catch {
      // If unified tables don't exist yet or query fails, just skip
      // Also try direct email match as fallback
      try {
        const founderDirect = await sql`
          SELECT id FROM "FounderUser" WHERE email = ${user.email} LIMIT 1
        `;
        if (founderDirect.length > 0) founderId = founderDirect[0].id;

        const organizerDirect = await sql`
          SELECT id FROM "EventOrganizer" WHERE email = ${user.email} LIMIT 1
        `;
        if (organizerDirect.length > 0) organizerId = organizerDirect[0].id;
      } catch {}
    }

    return NextResponse.json({ 
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        slug: user.slug,
        bio: user.bio,
        twitter: user.twitter,
        linkedin: user.linkedin,
        instagram: user.instagram,
        facebook: user.facebook,
        github: user.github,
        termsAcceptedAt: user.termsAcceptedAt,
        termsVersion: user.termsVersion,
        // Workspace links
        founderId,
        organizerId,
      }
    });
  } catch (error) {
    console.error('Session error:', error);
    return NextResponse.json({ user: null });
  }
}
