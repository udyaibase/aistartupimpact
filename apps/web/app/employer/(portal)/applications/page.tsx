import { listingScope } from '@/lib/employer/permissions';
import { prisma } from '@udyaibase/database';
import { requirePagePermission } from '@/lib/employer/page-guard';
import { BOARD_LIMIT, GENERAL_LABEL, employerContext, loadBoard } from '@/lib/employer/applications';
import { stageCountsByJob } from '@/lib/employer/job-stages';
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
    select: { id: true, title: true, status: true, isGeneral: true, expiresAt: true },
  });
  const jobId = sp.job && jobs.some((j) => j.id === sp.job) ? sp.job : null;
  const [cards, ctx, team, plan, stages] = await Promise.all([
    loadBoard(session.id, jobId ?? undefined, session.jobIds), employerContext(session.id), listTeam(session.id), planStatus(session.id),
    stageCountsByJob(jobs.map((j) => j.id)),
  ]);
  const now = new Date();
  // Role tabs: open roles first, then paused and closed ones that have candidates, then general applications.
  const rank = (j: (typeof jobs)[number]) => (j.isGeneral ? 3 : j.status === 'OPEN' && !(j.expiresAt && j.expiresAt <= now) ? 0 : j.status === 'PAUSED' ? 1 : 2);
  const roleTabs = jobs
    .map((j) => ({
      id: j.id,
      title: j.isGeneral ? GENERAL_LABEL : j.title,
      status: j.isGeneral ? 'GENERAL' : rank(j) === 2 ? 'CLOSED' : j.status,
      isGeneral: j.isGeneral,
      count: stages[j.id]?.total ?? 0,
      unseen: stages[j.id]?.unseen ?? 0,
    }))
    .filter((j) => j.count > 0 || (!j.isGeneral && j.status !== 'CLOSED') || j.id === jobId)
    .sort((a, b) => rank(jobs.find((j) => j.id === a.id)!) - rank(jobs.find((j) => j.id === b.id)!));

  const templates = Object.fromEntries(
    Object.entries(STAGE_TEMPLATES).map(([k, t]) => [k, { ...t, subject: t!.subject.replace(/\{\{company\}\}/g, ctx.company), body: t!.body.replace(/\{\{company\}\}/g, ctx.company) }]),
  );

  return (
    <>
    {cards.length >= BOARD_LIMIT && (
      <p role="status" className="mb-4 rounded-[10px] border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-900/40 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
        Showing your {BOARD_LIMIT.toLocaleString('en-IN')} most recent candidates. Pick a role above to see everyone who applied to it, or export to CSV.
      </p>
    )}
    <PipelineBoard
      key={jobId ?? 'all'}
      jobs={roleTabs}
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
