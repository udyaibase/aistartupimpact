import { NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { getEmployerSession } from '@/lib/employer-auth';
import { can, forbidden } from '@/lib/employer/permissions';

export const dynamic = 'force-dynamic';

/** Spreadsheet formulas can't run from a cell that starts with = + - or @. */
const cell = (v: string) => `"${(/^[=+\-@]/.test(v) ? `'${v}` : v).replace(/"/g, '""')}"`;

/** CSV of confirmed "get notified" subscribers. */
export async function GET() {
  const session = await getEmployerSession();
  if (!session) return NextResponse.json({ error: 'Please log in again.' }, { status: 401 });
  if (!can(session.role, 'widget.manage')) return forbidden();
  const rows = await prisma.jobBoardCareersSubscriber.findMany({
    where: { employerId: session.id, confirmedAt: { not: null }, unsubscribedAt: null },
    orderBy: { confirmedAt: 'desc' },
    take: 10_000,
    select: { email: true, source: true, confirmedAt: true, lastNotifiedAt: true },
  });
  const lines = [
    'email,signed_up_on,confirmed_at,last_emailed_at',
    ...rows.map((r) => [r.email, r.source === 'WIDGET' ? 'website' : 'udyaibase', r.confirmedAt?.toISOString() ?? '', r.lastNotifiedAt?.toISOString() ?? ''].map(cell).join(',')),
  ];
  return new NextResponse(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="notify-me-subscribers.csv"',
      'Cache-Control': 'no-store',
    },
  });
}
