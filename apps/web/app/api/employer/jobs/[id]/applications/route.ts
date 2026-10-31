import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getEmployerSession } from '@/lib/employer-auth';
import { can, forbidden, canSeeJob } from '@/lib/employer/permissions';

export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const session = await getEmployerSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!can(session.role, 'candidates.view')) return forbidden();

    const { id } = params;

    // Verify this job belongs to the employer
    const jobCheck = await sql`
      SELECT id, title FROM "JobBoardListing"
      WHERE id = ${id} AND "employerId" = ${session.id}
      LIMIT 1
    `;

    if (jobCheck.length === 0 || !canSeeJob(session, id)) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const applications = await sql`
      SELECT id, "fullName", email, phone, "linkedinUrl", "portfolioUrl",
             "githubUrl", "resumeUrl", "resumeKey", "coverLetter", status, notes, rating,
             "appliedAt"::text, "reviewedAt"::text, "statusChangedAt"::text
      FROM "JobBoardApplication"
      WHERE "listingId" = ${id}
      ORDER BY "appliedAt" DESC
    `;

    return NextResponse.json({
      jobTitle: (jobCheck[0] as any).title,
      applications,
    });
  } catch (error: any) {
    console.error('[GET /api/employer/jobs/[id]/applications]', error);
    return NextResponse.json({ error: 'Failed to fetch applications' }, { status: 500 });
  }
}
