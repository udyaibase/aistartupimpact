import { NextRequest, NextResponse } from 'next/server';
import { getUserSession } from '@/lib/user-session';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await getUserSession();

    if (!session?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const savedJobs = await sql`
      SELECT
        s.id as "savedId",
        s."createdAt"::text as "savedAt",
        jl.id,
        jl.slug,
        jl.title,
        jl."workType",
        jl.city,
        jl.country,
        jl."employmentType",
        jl."salaryMin",
        jl."salaryMax",
        jl."showSalary",
        jl."publishedAt"::text as "publishedAt",
        e."companyName",
        e."logoUrl"
      FROM "JobBoardSaved" s
      INNER JOIN "JobBoardListing" jl ON jl.id = s."listingId"
      INNER JOIN "JobBoardEmployer" e ON e.id = jl."employerId"
      WHERE s."userId" = ${session.id}
        AND jl.status = 'OPEN' AND jl."moderationHold" = false
        AND jl."deletedAt" IS NULL
      ORDER BY s."createdAt" DESC
    `;

    return NextResponse.json({ jobs: savedJobs });
  } catch (error) {
    console.error('Error fetching saved jobs:', error);
    return NextResponse.json({ error: 'Failed to fetch saved jobs' }, { status: 500 });
  }
}
