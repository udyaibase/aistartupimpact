import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/organizer-auth/require-permission';
import { creditNotePdfResponse } from '@/lib/billing/invoice-routes';

export const dynamic = 'force-dynamic';

/** GST credit note (PDF) for a refunded host payment. */
export async function GET(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const result = await requirePermission('billing');
  if (result instanceof NextResponse) return result;
  return creditNotePdfResponse('organizer', id, result.organizerId);
}
