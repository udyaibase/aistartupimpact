import { NextRequest, NextResponse } from 'next/server';
import { getEmployerSession } from '@/lib/employer-auth';
import { can, forbidden } from '@/lib/employer/permissions';
import { gstinLookupResponse } from '@/lib/billing/gstin-route';

export const dynamic = 'force-dynamic';

/** GST register lookup for the billing form: legal name and registered address for a GSTIN. */
export async function GET(request: NextRequest) {
  const session = await getEmployerSession();
  if (!session) return NextResponse.json({ error: 'Please log in again.' }, { status: 401 });
  if (!can(session.role, 'account.manage')) return forbidden();
  return gstinLookupResponse(request, `employer:${session.id}`);
}
