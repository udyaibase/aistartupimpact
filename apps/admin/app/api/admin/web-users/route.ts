import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { requireApiAuth } from '@/lib/api-auth';
import { sectionRoles } from '@/lib/section-access';

const sql = neon(process.env.DATABASE_URL!);

export async function GET(request: NextRequest) {
  const { error } = await requireApiAuth(sectionRoles('/web-users'));
  if (error) return error;

  try {
    const users = await sql`
      SELECT
        u.id,
        u.email,
        u.name,
        u.slug,
        u.avatar,
        u.bio,
        u.twitter,
        u.linkedin,
        u."isActive",
        u."lastLoginAt"::text AS "lastLoginAt",
        u."createdAt"::text AS "createdAt",
        COALESCE(COUNT(s.id), 0)::int AS "sessionCount"
      FROM "WebUser" u
      LEFT JOIN "WebUserSession" s ON s."webUserId" = u.id
      GROUP BY u.id, u.email, u.name, u.slug, u.avatar, u.bio, u.twitter, u.linkedin, u."isActive", u."lastLoginAt", u."createdAt"
      ORDER BY u."createdAt" DESC
    `;

    const formattedUsers = users.map((user: any) => ({
      ...user,
      _count: {
        WebUserSession: user.sessionCount,
      },
    }));

    return NextResponse.json({ users: formattedUsers });
  } catch (error) {
    console.error('Error fetching web users:', error);
    return NextResponse.json(
      { error: 'Failed to fetch web users' },
      { status: 500 }
    );
  }
}
