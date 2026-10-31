import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { neon } from '@neondatabase/serverless';
import { calculateImpactScore } from '@/lib/impact-score';
import { startupApprovalHtml } from '@udyaibase/utils';
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

    const startups = await sql`
      SELECT s.id, s.name, s.slug, s."ownerId", s.stage, s."employeeCount", s."foundedYear",
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

    const fundingResult = await sql`
      SELECT COALESCE(SUM("amountUsd"), 0)::bigint AS total FROM "FundingRound" WHERE "startupId" = ${params.id}
    `;
    const totalFundingUsdCents = Number(fundingResult[0]?.total || 0);

    const { total: impactScore } = calculateImpactScore({
      totalFundingUsdCents,
      employeeCount: startup.employeeCount ?? null,
      stage: startup.stage,
      foundedYear: startup.foundedYear ?? null,
    });

    await prisma.$executeRaw`
      UPDATE "Startup"
      SET "claimStatus" = 'CLAIMED'::"ClaimStatus",
          "isApproved" = true,
          "approvedAt" = NOW(),
          "impactScore" = ${impactScore},
          "updatedAt" = NOW()
      WHERE id = ${params.id}
    `;

    if (startup.founderEmail) {
      sendEmailFireAndForget({
        to: startup.founderEmail,
        subject: `Your startup "${startup.name}" is now live on Udyaibase`,
        html: startupApprovalHtml(startup.name, startup.founderName || 'there', startup.slug),
        type: 'approval',
      });
    }

    logAuditEvent({ action: 'APPROVE', resourceType: 'STARTUP', resourceId: params.id, resourceName: startup.name });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Approve startup error:', error);
    return NextResponse.json(
      { error: 'Failed to approve startup' },
      { status: 500 }
    );
  }
}

export const POST = withPublicRefresh(['startups', 'india-ai', 'home'], postHandler);
