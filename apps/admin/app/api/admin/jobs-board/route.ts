import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { requireApiAuth } from '@/lib/api-auth';

const sql = neon(process.env.DATABASE_URL!);

export async function GET() {
  const { error } = await requireApiAuth();
  if (error) return error;

  try {
    const jobs = await sql`
      SELECT jl.id, jl.slug, jl.title, jl.category, jl."workType", jl."listingTier",
             (jl.status = 'OPEN') AS "isActive", jl."isFeatured", jl."applicationsCount", jl."viewsCount",
             jl."publishedAt"::text, jl."createdAt"::text,
             e."companyName"
      FROM "JobBoardListing" jl
      JOIN "JobBoardEmployer" e ON e.id = jl."employerId"
      WHERE jl."deletedAt" IS NULL
      ORDER BY jl."createdAt" DESC
      LIMIT 200
    `;
    return NextResponse.json({ jobs });
  } catch (error: any) {
    console.error('[Admin Jobs Board]', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
