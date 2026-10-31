import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { requirePermission } from '@/lib/organizer-auth/require-permission';
import { parseBillingProfile } from '@/lib/billing/details';

export const dynamic = 'force-dynamic';

/** Save the billing profile (bill-to and invoice emails) used on invoices. */
export async function PATCH(request: NextRequest) {
  const result = await requirePermission('billing');
  if (result instanceof NextResponse) return result;
  const parsed = parseBillingProfile(await request.json().catch(() => ({})));
  if (!parsed.ok) return NextResponse.json({ success: false, error: parsed.error, field: parsed.field }, { status: 400 });
  await prisma.eventOrganizer.update({ where: { id: result.organizerId }, data: parsed.data });
  return NextResponse.json({ success: true, details: parsed.data, warnings: parsed.warnings });
}
