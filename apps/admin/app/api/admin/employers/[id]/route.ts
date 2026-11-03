import { NextRequest, NextResponse } from 'next/server';
import { isPaidPlan, PLANS, type PlanKey } from '@udyaibase/utils/employer-plans';
import { neon } from '@neondatabase/serverless';
import { requireApiAuth } from '@/lib/api-auth';
import { logAuditEvent } from '@/lib/audit-log';
import { withPublicRefresh } from '@/lib/refresh-public';

const sql = neon(process.env.DATABASE_URL!);

async function putHandler(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { error } = await requireApiAuth();
  if (error) return error;

  try {
    const body = await request.json();
    const { id } = params;

    if (body.isVerified !== undefined) {
      await sql`UPDATE "JobBoardEmployer" SET "isVerified" = ${body.isVerified}, "updatedAt" = NOW() WHERE id = ${id}`;
    }
    if (body.isActive !== undefined) {
      await sql`UPDATE "JobBoardEmployer" SET "isActive" = ${body.isActive}, "updatedAt" = NOW() WHERE id = ${id}`;
    }
    if (body.plan) {
      if (body.plan !== 'FREE' && !isPaidPlan(String(body.plan))) return NextResponse.json({ error: 'Unknown plan.' }, { status: 400 });
      const maxJobs = PLANS[body.plan as PlanKey].maxActiveJobs;
      await sql`UPDATE "JobBoardEmployer" SET plan = ${body.plan}::"JobBoardPlan", "maxActiveJobs" = ${maxJobs}, "updatedAt" = NOW() WHERE id = ${id}`;
    }

    logAuditEvent({ action: 'UPDATE', resourceType: 'EMPLOYER', resourceId: id, after: body });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Admin Employers PUT]', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

export const PUT = withPublicRefresh(['jobs'], putHandler);
