import { NextRequest, NextResponse } from 'next/server';
import { invoiceEmailResponse } from '@/lib/billing/invoice-routes';
import { writeLimited } from '@/lib/employer/write-limit';
import { employerApi } from '@/lib/employer/api-session';

export const dynamic = 'force-dynamic';

/** "Email again": send the invoice to the current invoice email and CCs. */
export async function POST(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const limited = await writeLimited(_request, 'billing/invoice/[id]/email');
  if (limited) return limited;
  const { id } = await props.params;
  const guard = await employerApi('account.manage');
  if (guard.error) return guard.error;
  const session = guard.session;
  return invoiceEmailResponse('employer', id, session.id);
}
