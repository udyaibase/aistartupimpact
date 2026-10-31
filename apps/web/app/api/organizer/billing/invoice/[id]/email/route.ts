import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/organizer-auth/require-permission';
import { invoiceEmailResponse } from '@/lib/billing/invoice-routes';

export const dynamic = 'force-dynamic';

/** "Email again": send the invoice to the current invoice email and CCs. */
export async function POST(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const result = await requirePermission('billing');
  if (result instanceof NextResponse) return result;
  return invoiceEmailResponse('organizer', id, result.organizerId);
}
