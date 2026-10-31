import { NextRequest, NextResponse } from 'next/server';
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
      const maxJobs = body.plan === 'PREMIUM' ? 999 : body.plan === 'FEATURED' ? 5 : 1;
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
