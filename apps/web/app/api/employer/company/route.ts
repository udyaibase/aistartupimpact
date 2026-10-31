import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getEmployerSession } from '@/lib/employer-auth';
import { can, forbidden } from '@/lib/employer/permissions';
import { refreshPaths, refreshSections } from '@/lib/revalidate';

export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const session = await getEmployerSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!can(session.role, 'jobs.view')) return forbidden();

    const result = await sql`
      SELECT e."companyName", e.email, e."startupClaimMethod", e."verifiedCompanyDomain", e.description, e."websiteUrl", e.industry, e."companySize",
             e.location, e.country, e."linkedinUrl", e."twitterUrl", e."logoUrl", e."startupId",
             s.name AS "startupName", s.slug AS "startupSlug", s."logoUrl" AS "startupLogo",
             s."headquartersCity" AS "startupCity", s.stage AS "startupStage", s."websiteUrl" AS "startupWebsite"
      FROM "JobBoardEmployer" e
      LEFT JOIN "Startup" s ON s.id = e."startupId"
      WHERE e.id = ${session.id}
    `;

    return NextResponse.json({ company: result[0] || null });
  } catch (error: any) {
    console.error('[GET /api/employer/company]', error);
    return NextResponse.json({ error: 'Failed to fetch company' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getEmployerSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!can(session.role, 'company.manage')) return forbidden();

    const body = await request.json();

    // Linking a startup requires proving domain ownership: /api/employer/claim/start + /verify.
    if (body.action === 'connect_startup') {
      return NextResponse.json(
        { error: 'Verify a work email on the startup’s domain to link it.', code: 'claim_required' },
        { status: 410 },
      );
    }

    // Handle startup disconnect
    if (body.action === 'disconnect_startup') {
      await sql`UPDATE "JobBoardEmployer" SET "startupId" = NULL, "startupClaimMethod" = NULL, "startupClaimVerifiedAt" = NULL, "verifiedCompanyDomain" = NULL, "updatedAt" = NOW() WHERE id = ${session.id}`;
      await sql`UPDATE "JobBoardListing" SET "startupId" = NULL WHERE "employerId" = ${session.id}`;
      return NextResponse.json({ success: true, connected: false });
    }

    // Regular profile update
    await sql`
      UPDATE "JobBoardEmployer"
      SET
        "companyName" = ${body.companyName || session.companyName},
        "description" = ${body.description || null},
        "websiteUrl" = ${body.websiteUrl || null},
        "industry" = ${body.industry || null},
        "companySize" = ${body.companySize || null},
        "location" = ${body.location || null},
        "country" = ${body.country || null},
        "linkedinUrl" = ${body.linkedinUrl || null},
        "twitterUrl" = ${body.twitterUrl || null},
        "updatedAt" = NOW()
      WHERE id = ${session.id}
    `;

    refreshSections(['jobs']); // company name and logo show on every job and the company page
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[PUT /api/employer/company]', error);
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  }
}
