import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { requireApiAuth } from '@/lib/api-auth';
import { sectionRoles } from '@/lib/section-access';

const sql = neon(process.env.DATABASE_URL!);

export async function GET() {
  const { error } = await requireApiAuth(sectionRoles('/employers'));
  if (error) return error;

  try {
    const employers = await sql`
      SELECT e.id, e."companyName", e.slug, e.email, e."logoUrl", e."websiteUrl",
             e.plan, e."isVerified", e."isActive", e."deactivatedAt"::text, e."companySize", e.industry,
             e."createdAt"::text,
             (SELECT COUNT(*)::int FROM "JobBoardListing" WHERE "employerId" = e.id AND "deletedAt" IS NULL) AS "jobCount"
      FROM "JobBoardEmployer" e
      ORDER BY e."createdAt" DESC
      LIMIT 200
    `;
    return NextResponse.json({ employers });
  } catch (error: any) {
    console.error('[Admin Employers]', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
