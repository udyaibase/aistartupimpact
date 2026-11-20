import { prisma, Prisma } from '@udyaibase/database';
import type { EmployerSession } from '@/lib/employer-auth';
import { cancelAssessment, configOf } from '@/lib/employer/assessments';
import { cleanAssessmentConfig, presetById, type AssessmentConfig } from '@/lib/employer/assessment-config';
import { cancelInterview } from '@/lib/employer/interviews';
import { cleanRounds, roundsOf } from '@/lib/employer/rounds';
import { isRealInbox } from '@/lib/employer/owners';

/**
 * Pipeline templates. Every template uses the same stages; a template sets the steps inside them: the interview
 * rounds and whether there's an assessment. A job copies its template's setup when it's applied, so editing a saved
 * template (which bumps its version) never moves candidates already interviewing. Editing a live job's steps first
 * shows who is affected (open assessments, booked interviews in a removed round); the team lets those finish or
 * cancels them.
 */

export interface PipelineConfig { assessment: AssessmentConfig | null; rounds: string[] }
export interface TemplateView { key: string; name: string; family: string; builtIn: boolean; version: number; config: PipelineConfig; description: string }

const lib = (id: string): AssessmentConfig => presetById(id)!.config;

/** The steps in plain words: "Coding take-home → Technical → System design → Culture & values". */
export function stepsLine(c: PipelineConfig): string {
  return ['Screening', ...(c.assessment ? [c.assessment.title] : []), ...c.rounds, 'Final decision', 'Offer'].join(' → ');
}

const built = (key: string, name: string, family: string, config: PipelineConfig): TemplateView => ({ key, name, family, builtIn: true, version: 1, config, description: stepsLine(config) });

/**
 * Ready-made templates, named the way hiring teams talk about them. Keys FOUNDER_LED and WITH_ASSESSMENT predate the
 * rest and stay as they are, so jobs set up with them keep working.
 */
export const BUILT_IN_LIST: TemplateView[] = [
  built('FOUNDER_LED', 'Standard (lean startup hire)', 'Any role', { assessment: null, rounds: ['Hiring manager interview'] }),
  built('WITH_ASSESSMENT', 'Software engineering', 'Engineering', { assessment: lib('swe-take-home'), rounds: ['Technical interview', 'System design', 'Culture & values'] }),
  built('AI_ML', 'AI & machine learning', 'AI & ML', { assessment: lib('ml-take-home'), rounds: ['ML deep dive', 'System design', 'Founder interview'] }),
  built('DATA', 'Data & analytics', 'Data & analytics', { assessment: lib('data-case'), rounds: ['SQL & analytics interview', 'Business case discussion', 'Hiring manager interview'] }),
  built('PRODUCT_DESIGN', 'Product design', 'Design', { assessment: lib('portfolio-review'), rounds: ['Portfolio presentation', 'Design critique', 'Cross-functional interview'] }),
  built('PRODUCT_MANAGEMENT', 'Product management', 'Product', { assessment: lib('product-case'), rounds: ['Product sense', 'Execution & metrics', 'Leadership interview'] }),
  built('SALES', 'Sales & business development', 'Sales', { assessment: lib('sales-role-play'), rounds: ['Hiring manager interview', 'Founder interview'] }),
  built('OPERATIONS', 'Operations & customer support', 'Operations & support', { assessment: lib('support-scenarios'), rounds: ['Hiring manager interview'] }),
  built('CAMPUS', 'Internships & campus hiring', 'Internships & campus', { assessment: lib('aptitude-test'), rounds: ['Technical interview', 'HR interview'] }),
  built('LEADERSHIP', 'Senior & leadership hires', 'Leadership', { assessment: lib('leadership-presentation'), rounds: ['Hiring manager interview', 'Panel interview', 'Founder interview', 'Reference check'] }),
];
export const BUILT_IN: Record<string, TemplateView> = Object.fromEntries(BUILT_IN_LIST.map((t) => [t.key, t]));
const BUILT_IN_NAMES = new Set(BUILT_IN_LIST.map((t) => t.name.toLowerCase()));

/** `strict` for what a person just entered (see cleanAssessmentConfig). */
export function cleanPipelineConfig(v: unknown, opts: { strict?: boolean } = {}): { ok: true; config: PipelineConfig } | { ok: false; error: string; field: string } {
  const i = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const a = cleanAssessmentConfig(i.assessment ?? null, opts);
  if (!a.ok) return a;
  const rounds = cleanRounds(i.rounds ?? []) ?? [];
  return { ok: true, config: { assessment: a.config, rounds: rounds.length ? rounds : ['Interview'] } };
}

export async function listTemplates(employerId: string): Promise<TemplateView[]> {
  const own = await prisma.jobBoardPipelineTemplate.findMany({ where: { employerId, archivedAt: null }, orderBy: { name: 'asc' }, take: 50 });
  return [
    ...own.map((t) => {
      const c = cleanPipelineConfig(t.config);
      const config = c.ok ? c.config : BUILT_IN.FOUNDER_LED.config;
      return { key: t.id, name: t.name, family: 'Your templates', builtIn: false, version: t.version, description: stepsLine(config), config };
    }),
    ...BUILT_IN_LIST,
  ];
}

/** Saves a job's steps as a company template by role family. Same name again = a new version (jobs keep theirs). */
export async function saveTemplate(employerId: string, actorEmail: string, name: unknown, config: unknown): Promise<{ ok: true; id: string; version: number } | { ok: false; error: string }> {
  const n = typeof name === 'string' ? name.trim().replace(/\s+/g, ' ').slice(0, 60) : '';
  if (n.length < 2) return { ok: false, error: 'Name the template, e.g. “AI engineering”.' };
  if (BUILT_IN_NAMES.has(n.toLowerCase())) return { ok: false, error: 'That name is taken by a ready-made template.' };
  const c = cleanPipelineConfig(config, { strict: true });
  if (!c.ok) return { ok: false, error: c.error };
  const existing = await prisma.jobBoardPipelineTemplate.findFirst({ where: { employerId, archivedAt: null, name: { equals: n, mode: 'insensitive' } } });
  if (existing) {
    const t = await prisma.jobBoardPipelineTemplate.update({ where: { id: existing.id }, data: { config: c.config as unknown as Prisma.InputJsonValue, version: { increment: 1 } } });
    return { ok: true, id: t.id, version: t.version };
  }
  if ((await prisma.jobBoardPipelineTemplate.count({ where: { employerId, archivedAt: null } })) >= 50) return { ok: false, error: 'Up to 50 templates. Remove one first.' };
  const t = await prisma.jobBoardPipelineTemplate.create({ data: { employerId, name: n, config: c.config as unknown as Prisma.InputJsonValue, createdBy: actorEmail } });
  return { ok: true, id: t.id, version: t.version };
}

export async function archiveTemplate(employerId: string, id: string): Promise<boolean> {
  const r = await prisma.jobBoardPipelineTemplate.updateMany({ where: { id, employerId, archivedAt: null }, data: { archivedAt: new Date() } });
  return r.count > 0;
}

/** A job's current pipeline settings. */
export async function jobPipeline(employerId: string, listingId: string) {
  const l = await prisma.jobBoardListing.findFirst({
    where: { id: listingId, employerId, deletedAt: null, isGeneral: false },
    select: { id: true, title: true, pipelineTemplate: true, pipelineVersion: true, assessment: true, interviewRounds: true, decisionOwnerEmail: true, decisionDelegateEmail: true, recruitersSeeOffers: true },
  });
  if (!l) return null;
  return {
    id: l.id, title: l.title, template: l.pipelineTemplate, version: l.pipelineVersion,
    config: { assessment: configOf(l.assessment), rounds: roundsOf(l.interviewRounds) } as PipelineConfig,
    decisionOwnerEmail: l.decisionOwnerEmail, decisionDelegateEmail: l.decisionDelegateEmail, recruitersSeeOffers: l.recruitersSeeOffers,
  };
}

export interface ChangeImpact {
  openAssessments: { id: string; candidate: string; status: string }[];
  bookedInterviews: { id: string; candidate: string; round: string; startAt: string }[];
  inRemovedRounds: { id: string; candidate: string; round: string }[];
}

/** Who a change to a live job's steps would affect. */
/** Only people still in the process count: not those who've left, been turned down or been hired. */
const inProgress = (listingId: string): Prisma.JobBoardApplicationWhereInput => ({ listingId, withdrawnAt: null, status: { notIn: ['REJECTED', 'HIRED'] } });

export async function previewChange(listingId: string, current: PipelineConfig, next: PipelineConfig, now = new Date()): Promise<ChangeImpact> {
  const removed = current.rounds.filter((r) => !next.rounds.includes(r));
  const [assessments, interviews, inRounds] = await Promise.all([
    current.assessment && !next.assessment
      ? prisma.jobBoardAssessment.findMany({ where: { status: { in: ['SENT', 'SUBMITTED'] }, Application: inProgress(listingId) }, select: { id: true, status: true, Application: { select: { fullName: true } } } })
      : Promise.resolve([]),
    removed.length
      ? prisma.jobBoardInterview.findMany({ where: { status: 'SCHEDULED', round: { in: removed }, startAt: { gt: now }, Application: inProgress(listingId) }, select: { id: true, round: true, startAt: true, Application: { select: { fullName: true } } } })
      : Promise.resolve([]),
    removed.length
      ? prisma.jobBoardApplication.findMany({ where: { listingId, status: 'INTERVIEW', interviewRound: { in: removed }, withdrawnAt: null }, select: { id: true, fullName: true, interviewRound: true } })
      : Promise.resolve([]),
  ]);
  return {
    openAssessments: assessments.map((a) => ({ id: a.id, candidate: a.Application.fullName, status: a.status })),
    bookedInterviews: interviews.map((i) => ({ id: i.id, candidate: i.Application.fullName, round: i.round, startAt: i.startAt.toISOString() })),
    inRemovedRounds: inRounds.map((a) => ({ id: a.id, candidate: a.fullName, round: a.interviewRound ?? '' })),
  };
}

const hasImpact = (i: ChangeImpact) => i.openAssessments.length + i.bookedInterviews.length + i.inRemovedRounds.length > 0;

/**
 * Changes a job's pipeline. If it affects people, nothing changes until the team says what to do with them:
 * `affected: 'finish'` lets open assessments and booked interviews go ahead; `'cancel'` cancels them and tells the
 * candidates. People sitting in a removed round move to the job's first remaining round.
 */
export async function updateJobPipeline(opts: {
  session: Pick<EmployerSession, 'id' | 'role' | 'email' | 'jobIds'>; listingId: string;
  input: { template?: unknown; config?: unknown; decisionOwnerEmail?: unknown; decisionDelegateEmail?: unknown; recruitersSeeOffers?: unknown; affected?: unknown };
  now?: Date;
}): Promise<{ ok: true; impact?: ChangeImpact } | { ok: false; error: string; status: number; impact?: ChangeImpact; needsChoice?: boolean }> {
  const { session, input } = opts;
  const now = opts.now ?? new Date();
  const job = await jobPipeline(session.id, opts.listingId);
  if (!job) return { ok: false, error: 'Job not found.', status: 404 };

  // The steps: from a template, or edited directly.
  let next = job.config;
  let template = job.template;
  let version = job.version;
  if (typeof input.template === 'string' && input.template !== job.template) {
    const t = (await listTemplates(session.id)).find((x) => x.key === input.template);
    if (!t) return { ok: false, error: 'Template not found.', status: 404 };
    next = t.config; template = t.key; version = t.version;
  }
  if (input.config !== undefined) {
    const c = cleanPipelineConfig(input.config, { strict: true });
    if (!c.ok) return { ok: false, error: c.error, status: 400 };
    next = c.config;
  }

  const data: Prisma.JobBoardListingUpdateInput = {};
  // People settings (owners only): who decides, and whether recruiters see offer amounts.
  if (input.decisionOwnerEmail !== undefined || input.decisionDelegateEmail !== undefined || input.recruitersSeeOffers !== undefined) {
    if (session.role !== 'OWNER') return { ok: false, error: 'Only owners can change who decides and who sees offers.', status: 403 };
    const team = await prisma.jobBoardTeamMember.findMany({ where: { employerId: session.id, status: 'ACTIVE', role: { in: ['OWNER', 'RECRUITER'] } }, select: { email: true } });
    const employer = await prisma.jobBoardEmployer.findUnique({ where: { id: session.id }, select: { email: true } });
    const allowed = new Set([...team.map((t) => t.email.toLowerCase()), ...(employer && isRealInbox(employer.email) ? [employer.email.toLowerCase()] : [])]);
    const person = (v: unknown, label: string): string | null | Error => {
      if (v == null || v === '') return null;
      const e = String(v).trim().toLowerCase();
      return allowed.has(e) ? e : new Error(`${label} must be an owner or recruiter on your team.`);
    };
    if (input.decisionOwnerEmail !== undefined) {
      const p = person(input.decisionOwnerEmail, 'The decision owner');
      if (p instanceof Error) return { ok: false, error: p.message, status: 400 };
      data.decisionOwnerEmail = p;
    }
    if (input.decisionDelegateEmail !== undefined) {
      const p = person(input.decisionDelegateEmail, 'The delegate');
      if (p instanceof Error) return { ok: false, error: p.message, status: 400 };
      data.decisionDelegateEmail = p;
    }
    if (typeof input.recruitersSeeOffers === 'boolean') data.recruitersSeeOffers = input.recruitersSeeOffers;
  }

  const stepsChanged = JSON.stringify(next) !== JSON.stringify(job.config);
  let impact: ChangeImpact | undefined;
  if (stepsChanged) {
    impact = await previewChange(job.id, job.config, next, now);
    if (hasImpact(impact)) {
      if (input.affected !== 'finish' && input.affected !== 'cancel') return { ok: false, error: 'This change affects people already in progress. Choose what happens to them.', status: 409, impact, needsChoice: true };
      if (input.affected === 'cancel') {
        for (const a of impact.openAssessments) await cancelAssessment(session.id, a.id, { notify: true, actorEmail: session.email });
        for (const i of impact.bookedInterviews) await cancelInterview({ employerId: session.id, interviewId: i.id, actorEmail: session.email, jobIds: session.jobIds });
      }
      if (impact.inRemovedRounds.length) {
        await prisma.jobBoardApplication.updateMany({ where: { id: { in: impact.inRemovedRounds.map((a) => a.id) } }, data: { interviewRound: next.rounds[0] } });
      }
    }
    data.assessment = next.assessment ? (next.assessment as unknown as Prisma.InputJsonValue) : Prisma.DbNull;
    data.interviewRounds = next.rounds.length === 1 && next.rounds[0] === 'Interview' ? [] : next.rounds;
    data.pipelineTemplate = template;
    data.pipelineVersion = version;
  }
  if (Object.keys(data).length) await prisma.jobBoardListing.update({ where: { id: job.id }, data });
  return { ok: true, impact };
}
