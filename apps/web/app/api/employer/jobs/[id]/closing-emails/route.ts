import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { employerApi } from '@/lib/employer/api-session';
import { writeLimited } from '@/lib/employer/write-limit';
import { notifyClosedJob } from '@/lib/employer/closing';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** After a job closed itself as filled: the team chose to send the "role closed" email to everyone still waiting. */
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const limited = await writeLimited(request, 'jobs/[id]/closing-emails');
  if (limited) return limited;
  const { id } = await props.params;
  const g = await employerApi('jobs.manage');
  if (g.error) return g.error;
  const job = await prisma.jobBoardListing.findFirst({ where: { id, employerId: g.session.id, status: 'CLOSED' }, select: { id: true } });
  if (!job) return NextResponse.json({ error: 'Only closed jobs send closing emails.' }, { status: 409 });
  const r = await notifyClosedJob(id, g.session.email);
  return NextResponse.json({ success: true, ...r });
}
