import { NextRequest, NextResponse } from 'next/server';
import { invoicePdfResponse } from '@/lib/billing/invoice-routes';
import { employerApi } from '@/lib/employer/api-session';

export const dynamic = 'force-dynamic';

/** GST tax invoice (PDF) for one of this workspace's paid plan payments. */
export async function GET(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const guard = await employerApi('account.manage');
  if (guard.error) return guard.error;
  const session = guard.session;
  return invoicePdfResponse('employer', id, session.id);
}
