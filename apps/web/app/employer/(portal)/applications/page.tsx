import { listingScope } from '@/lib/employer/permissions';
import { prisma } from '@udyaibase/database';
import { requirePagePermission } from '@/lib/employer/page-guard';
import { BOARD_LIMIT, employerContext, loadBoard } from '@/lib/employer/applications';
import { STAGE_TEMPLATES } from '@/lib/employer/pipeline';
import { can } from '@/lib/employer/roles';
import { listTeam } from '@/lib/employer/team';
import PipelineBoard from '@/components/employer/pipeline/PipelineBoard';
import { planStatus } from '@/lib/employer/billing';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Candidates' };

export default async function CandidatesPage(props: { searchParams: Promise<{ job?: string; stage?: string; candidate?: string }> }) {
  const session = await requirePagePermission('candidates.view');
  const sp = await props.searchParams;

  const jobs = await prisma.jobBoardListing.findMany({
    where: { ...listingScope(session), deletedAt: null, status: { not: 'DRAFT' } },
    orderBy: [{ status: 'asc' }, { publishedAt: 'desc' }],
    select: { id: true, title: true, status: true, _count: { select: { Applications: { where: { NOT: { email: { endsWith: '@deleted.invalid' } } } } } } },
  });
  const jobId = sp.job && jobs.some((j) => j.id === sp.job) ? sp.job : null;
  const [cards, ctx, team, plan] = await Promise.all([loadBoard(session.id, jobId ?? undefined, session.jobIds), employerContext(session.id), listTeam(session.id), planStatus(session.id)]);

  const templates = Object.fromEntries(
    Object.entries(STAGE_TEMPLATES).map(([k, t]) => [k, { ...t, subject: t!.subject.replace(/\{\{company\}\}/g, ctx.company), body: t!.body.replace(/\{\{company\}\}/g, ctx.company) }]),
  );

  return (
    <>
    {cards.length >= BOARD_LIMIT && (
      <p role="status" className="mb-4 rounded-[10px] border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-900/40 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
        Showing your {BOARD_LIMIT.toLocaleString('en-IN')} most recent candidates. Choose a job to see everyone who applied to it, or export to CSV.
      </p>
    )}
    <PipelineBoard
      key={jobId ?? 'all'}
      jobs={jobs.map((j) => ({ id: j.id, title: j.title, status: j.status, count: j._count.Applications }))}
      jobId={jobId}
      cards={cards}
      templates={templates}
      bookingUrl={ctx.bookingUrl}
      initialStage={sp.stage ?? null}
      initialCandidate={sp.candidate && cards.some((c) => c.id === sp.candidate) ? sp.candidate : null}
      canMove={can(session.role, 'candidates.move')}
      canExport={can(session.role, 'candidates.export')}
      ai={{ enabled: !!plan && plan.ai.limit > 0, used: plan?.ai.used ?? 0, limit: plan?.ai.limit ?? 0, canBuy: can(session.role, 'account.manage') }}
      teammates={team.filter((t) => t.status !== 'PENDING' && t.email.toLowerCase() !== session.email.toLowerCase()).map((t) => ({ email: t.email, name: t.name || t.email.split('@')[0] }))}
    />
    </>
  );
}
