import { NextRequest, NextResponse } from 'next/server';
import { creditNotePdfResponse } from '@/lib/billing/invoice-routes';
import { employerApi } from '@/lib/employer/api-session';

export const dynamic = 'force-dynamic';

/** GST credit note (PDF) for a refunded payment of this workspace. */
export async function GET(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const guard = await employerApi('account.manage');
  if (guard.error) return guard.error;
  const session = guard.session;
  return creditNotePdfResponse('employer', id, session.id);
}
