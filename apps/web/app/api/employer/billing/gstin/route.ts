import { NextRequest, NextResponse } from 'next/server';
import { gstinLookupResponse } from '@/lib/billing/gstin-route';
import { employerApi } from '@/lib/employer/api-session';

export const dynamic = 'force-dynamic';

/** GST register lookup for the billing form: legal name and registered address for a GSTIN. */
export async function GET(request: NextRequest) {
  const guard = await employerApi('account.manage');
  if (guard.error) return guard.error;
  const session = guard.session;
  return gstinLookupResponse(request, `employer:${session.id}`);
}
