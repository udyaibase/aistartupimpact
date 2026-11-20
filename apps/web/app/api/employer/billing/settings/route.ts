import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { parseBillingProfile } from '@/lib/billing/details';
import { writeLimited } from '@/lib/employer/write-limit';
import { employerActor, logEmployerActivity } from '@/lib/workspace-activity';
import { employerApi } from '@/lib/employer/api-session';

export const dynamic = 'force-dynamic';

export async function PATCH(request: NextRequest) {
  const limited = await writeLimited(request, 'billing/settings');
  if (limited) return limited;
  const guard = await employerApi('account.manage');
  if (guard.error) return guard.error;
  const session = guard.session;
  const body = await request.json().catch(() => ({}));
  if (typeof body.aiAutoScreen === 'boolean') {
    await prisma.jobBoardEmployer.update({ where: { id: session.id }, data: { aiAutoScreen: body.aiAutoScreen } });
    return NextResponse.json({ success: true });
  }
  if (body.billing && typeof body.billing === 'object') {
    const parsed = parseBillingProfile(body.billing);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error, field: parsed.field }, { status: 400 });
    await prisma.jobBoardEmployer.update({ where: { id: session.id }, data: parsed.data });
    await logEmployerActivity(session.id, 'billing_details_changed', { actor: employerActor(session), request });
    return NextResponse.json({ success: true, details: parsed.data, warnings: parsed.warnings });
  }
  return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 });
}
