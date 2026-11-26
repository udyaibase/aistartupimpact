import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '@udyaibase/database';
import { requireApiAuth } from '@/lib/api-auth';
import { logAuditEvent } from '@/lib/audit-log';
import { withPublicRefresh } from '@/lib/refresh-public';

async function postHandler(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { error } = await requireApiAuth(['SUPER_ADMIN']);
  if (error) return error;
  try {
    await prisma.governmentScheme.delete({ where: { id: params.id } });
    logAuditEvent({ action: 'DELETE', resourceType: 'INDIA_AI_SCHEME', resourceId: params.id });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting scheme:', error);
    return NextResponse.json({ success: false, error: 'Failed to delete scheme' }, { status: 500 });
  }
}

export const POST = withPublicRefresh(['india-ai', 'home'], postHandler);
