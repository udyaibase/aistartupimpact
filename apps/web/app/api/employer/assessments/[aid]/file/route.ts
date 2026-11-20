import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { employerApi } from '@/lib/employer/api-session';
import { resumeDownloadUrl } from '@/lib/jobs/resume-storage';

export const dynamic = 'force-dynamic';

/** The candidate's submitted file (5-minute download link). */
export async function GET(_request: NextRequest, props: { params: Promise<{ aid: string }> }) {
  const { aid } = await props.params;
  const g = await employerApi('candidates.view');
  if (g.error) return g.error;
  const a = await prisma.jobBoardAssessment.findFirst({
    where: { id: aid, submissionKey: { not: null }, Application: { Listing: { employerId: g.session.id, ...(g.session.jobIds ? { id: { in: g.session.jobIds } } : {}) } } },
    select: { submissionKey: true, Application: { select: { fullName: true } } },
  });
  if (!a?.submissionKey) return NextResponse.json({ error: 'File not found.' }, { status: 404 });
  const url = await resumeDownloadUrl(a.submissionKey, `${a.Application.fullName} assessment.${a.submissionKey.split('.').pop()}`);
  return url ? NextResponse.redirect(url) : NextResponse.json({ error: 'Storage isn’t set up.' }, { status: 503 });
}
