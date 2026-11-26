import { verifyUserToken } from '@/lib/user-session';
import { jwtSecret } from '@/lib/jwt-secret';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
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

    // Verify the token, that the account is open and that this sign-in hasn't been ended.
    const ids = await verifyUserToken(token);
    if (!ids) return NextResponse.json({ user: null });
    const payload = { userId: ids.userId };

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

    // Hiring portal: the workspace's own account, or an active teammate. The portal has its own sign-in, so this
    // only decides whether the account menu offers the link.
    let hasEmployer = false;
    try {
      const employerRows = await sql`
        SELECT 1 FROM "JobBoardEmployer" WHERE LOWER(email) = LOWER(${user.email}) AND "deactivatedAt" IS NULL
        UNION ALL
        SELECT 1 FROM "JobBoardTeamMember" WHERE LOWER(email) = LOWER(${user.email}) AND status = 'ACTIVE'
        LIMIT 1
      `;
      hasEmployer = employerRows.length > 0;
    } catch {}

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
        hasEmployer,
      }
    });
  } catch (error) {
    console.error('Session error:', error);
    return NextResponse.json({ user: null });
  }
}
