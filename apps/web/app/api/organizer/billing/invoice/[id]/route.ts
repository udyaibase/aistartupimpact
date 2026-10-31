import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/organizer-auth/require-permission';
import { invoicePdfResponse } from '@/lib/billing/invoice-routes';

export const dynamic = 'force-dynamic';

/** GST tax invoice (PDF) for one of this host's paid payments (Pro or Event Boost). */
export async function GET(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const result = await requirePermission('billing');
  if (result instanceof NextResponse) return result;
  return invoicePdfResponse('organizer', id, result.organizerId);
}
