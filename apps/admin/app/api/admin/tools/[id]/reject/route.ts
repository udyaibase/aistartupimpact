import { NextRequest, NextResponse } from 'next/server';
import { rejectTool } from '@/lib/tool-rejection';
import { requireApiAuth } from '@/lib/api-auth';
import { withPublicRefresh } from '@/lib/refresh-public';


async function postHandler(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { error } = await requireApiAuth(['SUPER_ADMIN', 'EDITOR_IN_CHIEF']);
  if (error) return error;
  try {
    const { id } = params;

    const body = await request.json().catch(() => ({}));
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (!reason) return NextResponse.json({ success: false, error: 'Add a reason for the founder.' }, { status: 400 });

    const { found } = await rejectTool(id, reason);
    if (!found) return NextResponse.json({ success: false, error: 'Tool not found' }, { status: 404 });

    return NextResponse.json({ success: true, message: 'Tool rejected successfully' });
  } catch (error: any) {
    console.error('Error rejecting tool:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to reject tool' },
      { status: 500 }
    );
  }
}

export const POST = withPublicRefresh(['tools', 'home'], postHandler);
