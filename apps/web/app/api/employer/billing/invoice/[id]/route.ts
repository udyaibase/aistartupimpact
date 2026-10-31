import { NextRequest, NextResponse } from 'next/server';
import { getEmployerSession } from '@/lib/employer-auth';
import { can, forbidden } from '@/lib/employer/permissions';
import { invoicePdfResponse } from '@/lib/billing/invoice-routes';

export const dynamic = 'force-dynamic';

/** GST tax invoice (PDF) for one of this workspace's paid plan payments. */
export async function GET(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const session = await getEmployerSession();
  if (!session) return NextResponse.json({ error: 'Please log in again.' }, { status: 401 });
  if (!can(session.role, 'account.manage')) return forbidden();
  return invoicePdfResponse('employer', id, session.id);
}
