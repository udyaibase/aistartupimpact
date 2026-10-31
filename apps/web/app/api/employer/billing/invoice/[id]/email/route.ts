import { NextRequest, NextResponse } from 'next/server';
import { getEmployerSession } from '@/lib/employer-auth';
import { can, forbidden } from '@/lib/employer/permissions';
import { invoiceEmailResponse } from '@/lib/billing/invoice-routes';

export const dynamic = 'force-dynamic';

/** "Email again": send the invoice to the current invoice email and CCs. */
export async function POST(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const session = await getEmployerSession();
  if (!session) return NextResponse.json({ error: 'Please log in again.' }, { status: 401 });
  if (!can(session.role, 'account.manage')) return forbidden();
  return invoiceEmailResponse('employer', id, session.id);
}
