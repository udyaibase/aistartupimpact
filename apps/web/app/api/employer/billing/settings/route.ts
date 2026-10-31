import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { getEmployerSession } from '@/lib/employer-auth';
import { can, forbidden } from '@/lib/employer/permissions';
import { parseBillingProfile } from '@/lib/billing/details';

export const dynamic = 'force-dynamic';

export async function PATCH(request: NextRequest) {
  const session = await getEmployerSession();
  if (!session) return NextResponse.json({ error: 'Please log in again.' }, { status: 401 });
  if (!can(session.role, 'account.manage')) return forbidden();
  const body = await request.json().catch(() => ({}));
  if (typeof body.aiAutoScreen === 'boolean') {
    await prisma.jobBoardEmployer.update({ where: { id: session.id }, data: { aiAutoScreen: body.aiAutoScreen } });
    return NextResponse.json({ success: true });
  }
  if (body.billing && typeof body.billing === 'object') {
    const parsed = parseBillingProfile(body.billing);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error, field: parsed.field }, { status: 400 });
    await prisma.jobBoardEmployer.update({ where: { id: session.id }, data: parsed.data });
    return NextResponse.json({ success: true, details: parsed.data, warnings: parsed.warnings });
  }
  return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 });
}
