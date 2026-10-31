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

    if (body.isActive !== undefined) {
      await sql`UPDATE "JobBoardListing" SET "status" = (CASE WHEN ${body.isActive} THEN 'OPEN' ELSE 'PAUSED' END)::"JobBoardListingStatus", "closedAt" = NULL, "closeReason" = NULL, "isActive" = ${body.isActive}, "updatedAt" = NOW() WHERE id = ${id}`;
    }
    if (body.isFeatured !== undefined) {
      await sql`UPDATE "JobBoardListing" SET "isFeatured" = ${body.isFeatured}, "updatedAt" = NOW() WHERE id = ${id}`;
    }
    if (body.listingTier) {
      await sql`UPDATE "JobBoardListing" SET "listingTier" = ${body.listingTier}::"JobBoardTier", "updatedAt" = NOW() WHERE id = ${id}`;
    }

    logAuditEvent({ action: 'UPDATE', resourceType: 'JOB_LISTING', resourceId: id, after: body });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Admin Jobs Board PUT]', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

// DELETE: Soft-delete job
async function deleteHandler(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { error } = await requireApiAuth(['SUPER_ADMIN']);
  if (error) return error;

  try {
    await sql`UPDATE "JobBoardListing" SET "deletedAt" = NOW(), "isActive" = false, "status" = 'CLOSED', "closedAt" = NOW(), "closeReason" = 'MANUAL' WHERE id = ${params.id}`;

    logAuditEvent({ action: 'DELETE', resourceType: 'JOB_LISTING', resourceId: params.id });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Admin Jobs Board DELETE]', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

export const PUT = withPublicRefresh(['jobs', 'home'], putHandler);
export const DELETE = withPublicRefresh(['jobs', 'home'], deleteHandler);
