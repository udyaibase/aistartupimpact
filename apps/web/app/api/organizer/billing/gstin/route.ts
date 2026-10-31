import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/organizer-auth/require-permission';
import { gstinLookupResponse } from '@/lib/billing/gstin-route';

export const dynamic = 'force-dynamic';

/** GST register lookup for the billing form: legal name and registered address for a GSTIN. */
export async function GET(request: NextRequest) {
  const result = await requirePermission('billing');
  if (result instanceof NextResponse) return result;
  return gstinLookupResponse(request, `organizer:${result.organizerId}`);
}
