import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { neon } from '@neondatabase/serverless';
import { startupRejectionHtml } from '@udyaibase/utils';
import { sendEmailFireAndForget } from '@/lib/email-send';
import { requireApiAuth } from '@/lib/api-auth';
import { logAuditEvent } from '@/lib/audit-log';
import { withPublicRefresh } from '@/lib/refresh-public';

const sql = neon(process.env.DATABASE_URL!);

async function postHandler(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { error: authError } = await requireApiAuth(['SUPER_ADMIN', 'EDITOR_IN_CHIEF']);
  if (authError) return authError;
  try {

    const body = await request.json();
    const reason = body.reason || 'No specific reason provided.';

    const startups = await sql`
      SELECT s.id, s.name, s.slug, s.tagline, s.description, s."websiteUrl", s."ownerId", s.stage,
             fu.email AS "founderEmail", fu.name AS "founderName"
      FROM "Startup" s
      LEFT JOIN "FounderUser" fu ON fu.id = s."ownerId"
      WHERE s.id = ${params.id}
      LIMIT 1
    `;

    if (startups.length === 0) {
      return NextResponse.json({ error: 'Startup not found' }, { status: 404 });
    }

    const startup = startups[0] as any;

    await prisma.$executeRaw`
      UPDATE "Startup"
      SET "claimStatus" = 'REJECTED'::"ClaimStatus",
          "isApproved" = false,
          "approvedAt" = NULL,
          "updatedAt" = NOW()
      WHERE id = ${params.id}
    `;

    if (startup.founderEmail) {
      sendEmailFireAndForget({
        to: startup.founderEmail,
        subject: `Action Required: Your startup "${startup.name}" requires changes`,
        html: startupRejectionHtml(startup.name, startup.founderName || 'there', reason, {
          tagline: startup.tagline,
          description: startup.description,
          stage: startup.stage,
          websiteUrl: startup.websiteUrl,
        }),
        type: 'rejection',
      });
    }

    logAuditEvent({ action: 'REJECT', resourceType: 'STARTUP', resourceId: params.id, resourceName: startup.name, after: { reason } });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Reject startup error:', error);
    return NextResponse.json(
      { error: 'Failed to reject startup' },
      { status: 500 }
    );
  }
}

export const POST = withPublicRefresh(['startups', 'india-ai', 'home'], postHandler);
