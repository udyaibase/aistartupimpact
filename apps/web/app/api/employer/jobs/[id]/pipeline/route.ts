import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { employerApi, fail } from '@/lib/employer/api-session';
import { writeLimited } from '@/lib/employer/write-limit';
import { jobPipeline, listTemplates, updateJobPipeline } from '@/lib/employer/pipeline-templates';
import { isRealInbox } from '@/lib/employer/owners';

export const dynamic = 'force-dynamic';

/** The job's pipeline (template, steps, decision owner, offer visibility) and the choices for the settings dialog. */
export async function GET(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  // An interviewer limited to other jobs gets the same answer as for a job that doesn't exist.
  const g = await employerApi('jobs.view', { job: id });
  if (g.error) return g.error;
  const job = await jobPipeline(g.session.id, id);
  if (!job) return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
  // Interviewers can't change the pipeline, so they get its steps only: no teammate emails, no decision owner.
  if (g.session.role === 'INTERVIEWER') {
    return NextResponse.json({ job: { ...job, decisionOwnerEmail: null, decisionDelegateEmail: null }, templates: [], people: [], canEditPeople: false });
  }
  const [templates, team, employer] = await Promise.all([
    listTemplates(g.session.id),
    prisma.jobBoardTeamMember.findMany({ where: { employerId: g.session.id, status: 'ACTIVE', role: { in: ['OWNER', 'RECRUITER'] } }, select: { email: true, name: true, role: true } }),
    prisma.jobBoardEmployer.findUnique({ where: { id: g.session.id }, select: { email: true } }),
  ]);
  const people = [...team.map((t) => ({ email: t.email.toLowerCase(), name: t.name || t.email.split('@')[0], role: t.role })),
    ...(employer && isRealInbox(employer.email) && !team.some((t) => t.email.toLowerCase() === employer.email.toLowerCase()) ? [{ email: employer.email.toLowerCase(), name: employer.email.split('@')[0], role: 'OWNER' as const }] : [])];
  return NextResponse.json({ job, templates, people, canEditPeople: g.session.role === 'OWNER' });
}

/** Change it: { template?, config?, decisionOwnerEmail?, decisionDelegateEmail?, recruitersSeeOffers?, affected?: finish|cancel }. */
export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const limited = await writeLimited(request, 'jobs/[id]/pipeline');
  if (limited) return limited;
  const { id } = await props.params;
  const g = await employerApi('jobs.manage');
  if (g.error) return g.error;
  const r = await updateJobPipeline({ session: g.session, listingId: id, input: await request.json().catch(() => ({})) });
  return r.ok ? NextResponse.json({ success: true, impact: r.impact ?? null }) : fail(r);
}
