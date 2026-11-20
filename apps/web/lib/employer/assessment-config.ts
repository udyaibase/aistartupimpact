/**
 * Assessments: what a job asks candidates to do between screening and interviews, and how the team scores it.
 * Pure (no database), so the pipeline settings in the browser and the server use the same rules.
 *
 * Five kinds cover almost any role:
 *   TAKE_HOME    an assignment or case study they work on and hand in (code, analysis, design, a plan)
 *   QUESTIONS    written questions they answer on our page (scenarios, short essays, screening)
 *   WORK_SAMPLE  past work they share (portfolio, writing samples, GitHub, case studies)
 *   EXTERNAL     a test on another site (HackerRank, Codility, TestGorilla, Google Form); they tell us when done
 *   LIVE         an exercise done in a call (role-play, pair programming, presentation); the team scores it
 * An optional rubric (up to 8 criteria with weights) makes scoring consistent across reviewers.
 */

export const ASSESSMENT_KINDS = ['TAKE_HOME', 'QUESTIONS', 'WORK_SAMPLE', 'EXTERNAL', 'LIVE'] as const;
export type AssessmentKind = (typeof ASSESSMENT_KINDS)[number];

export const KIND_LABEL: Record<AssessmentKind, string> = {
  TAKE_HOME: 'Take-home assignment or case study',
  QUESTIONS: 'Written questions',
  WORK_SAMPLE: 'Work samples or portfolio',
  EXTERNAL: 'Online test on another site',
  LIVE: 'Live exercise or presentation',
};
export const KIND_HINT: Record<AssessmentKind, string> = {
  TAKE_HOME: 'They get a brief and a deadline, then hand in a link or file.',
  QUESTIONS: 'They answer your questions on a private page.',
  WORK_SAMPLE: 'They share past work: portfolio, writing, code or case studies.',
  EXTERNAL: 'They take a test on HackerRank, Codility, TestGorilla or a Google Form, then tell you they’re done. You enter the score.',
  LIVE: 'Done in a call (role-play, pair programming, presentation). You score it afterwards.',
};
/** Kinds where the candidate gets a private page to hand in work or say they're done. */
export const HAS_CANDIDATE_PAGE: readonly AssessmentKind[] = ['TAKE_HOME', 'QUESTIONS', 'WORK_SAMPLE', 'EXTERNAL'];

export interface RubricCriterion { name: string; weight: number }
export interface AssessmentConfig {
  kind: AssessmentKind;
  title: string;
  brief: string;
  url: string | null;
  deadlineDays: number;
  passMark: number | null;
  maxScore: number;
  questions: string[];
  rubric: RubricCriterion[];
}

export const LIMITS = { questions: 10, questionLength: 500, rubric: 8, links: 5, answerLength: 5000 } as const;

const SITE_HOSTS = (): string[] => {
  const hosts = ['udyaibase.com', 'www.udyaibase.com', 'admin.udyaibase.com', 'localhost'];
  try { const h = new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://udyaibase.com').hostname; if (!hosts.includes(h)) hosts.push(h); } catch { /* default list */ }
  return hosts;
};

/**
 * A link into our own hiring portal (the employer, admin or API pages) can't be opened by a candidate. People paste
 * these by mistake when they meant the test's own link.
 */
export function isOwnPortalLink(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.hostname.startsWith('admin.')) return SITE_HOSTS().some((h) => u.hostname.endsWith(h.replace(/^www\./, '')));
    return SITE_HOSTS().includes(u.hostname) && /^\/(employer|api|admin|founder|organizer)(\/|$)/.test(u.pathname);
  } catch {
    return false;
  }
}

const cleanText = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().replace(/[ \t]+/g, ' ').slice(0, n) : '');

/**
 * The job's assessment setup; null turns it off. `strict` (for what a person just typed) also refuses links into
 * our own portal; stored setups are read leniently so an old job never loses its assessment.
 */
export function cleanAssessmentConfig(v: unknown, opts: { strict?: boolean } = {}): { ok: true; config: AssessmentConfig | null } | { ok: false; error: string; field: string } {
  if (v == null || v === false) return { ok: true, config: null };
  const i = v as Record<string, unknown>;
  const kind = (ASSESSMENT_KINDS as readonly string[]).includes(String(i.kind)) ? (i.kind as AssessmentKind) : null;
  if (!kind) return { ok: false, error: 'Choose the type of assessment.', field: 'kind' };
  const title = cleanText(i.title, 80) || defaultTitle(kind);
  const brief = typeof i.brief === 'string' ? i.brief.trim().slice(0, 4000) : '';
  if (kind === 'TAKE_HOME' && brief.length < 20) return { ok: false, error: 'Describe the task in a few lines.', field: 'brief' };
  if (kind === 'WORK_SAMPLE' && brief.length < 10) return { ok: false, error: 'Say what work you’d like to see.', field: 'brief' };
  const rawUrl = typeof i.url === 'string' ? i.url.trim() : '';
  const url = rawUrl ? (/^https:\/\/[^\s]+\.[^\s]+$/.test(rawUrl) && rawUrl.length <= 500 ? rawUrl : 'bad') : null;
  if (url === 'bad') return { ok: false, error: 'The link must start with https://', field: 'url' };
  if (kind === 'EXTERNAL' && !url) return { ok: false, error: 'Add the link to the test.', field: 'url' };
  if (opts.strict && url && isOwnPortalLink(url)) {
    return { ok: false, error: 'That link is a page in your hiring portal, which candidates can’t open. Paste the test’s own link (for example from HackerRank or Google Forms).', field: 'url' };
  }
  const questions = (Array.isArray(i.questions) ? i.questions : []).map((q) => cleanText(q, LIMITS.questionLength)).filter(Boolean).slice(0, LIMITS.questions);
  if (kind === 'QUESTIONS' && !questions.length) return { ok: false, error: 'Add at least one question.', field: 'questions' };
  const seen = new Set<string>();
  const rubric = (Array.isArray(i.rubric) ? i.rubric : [])
    .map((c) => ({ name: cleanText((c as RubricCriterion)?.name, 60), weight: Math.min(5, Math.max(1, Math.round(Number((c as RubricCriterion)?.weight) || 1))) }))
    .filter((c) => c.name && !seen.has(c.name.toLowerCase()) && seen.add(c.name.toLowerCase()))
    .slice(0, LIMITS.rubric);
  const days = Math.round(Number(i.deadlineDays ?? 3));
  if (!Number.isFinite(days) || days < 1 || days > 14) return { ok: false, error: 'Give them between 1 and 14 days.', field: 'deadlineDays' };
  const maxScore = Math.round(Number(i.maxScore ?? 10));
  if (!Number.isFinite(maxScore) || maxScore < 1 || maxScore > 1000) return { ok: false, error: 'Max score must be between 1 and 1000.', field: 'maxScore' };
  const pm = i.passMark === '' || i.passMark == null ? null : Number(i.passMark);
  if (pm != null && (!Number.isFinite(pm) || pm < 0 || pm > maxScore)) return { ok: false, error: 'The pass mark must be between 0 and the max score.', field: 'passMark' };
  return { ok: true, config: { kind, title, brief, url, deadlineDays: days, passMark: pm, maxScore, questions: kind === 'QUESTIONS' ? questions : [], rubric } };
}

export function defaultTitle(kind: AssessmentKind): string {
  return { TAKE_HOME: 'Take-home assignment', QUESTIONS: 'Written questions', WORK_SAMPLE: 'Work samples', EXTERNAL: 'Online test', LIVE: 'Live exercise' }[kind];
}

/**
 * Rubric total on the assessment's scale: each criterion is scored 1–5 and weighted. Null until every criterion has
 * a score.
 */
export function rubricTotal(rubric: RubricCriterion[], scores: Record<string, number>, maxScore: number): number | null {
  if (!rubric.length) return null;
  let got = 0;
  let max = 0;
  for (const c of rubric) {
    const s = Number(scores[c.name]);
    if (!Number.isInteger(s) || s < 1 || s > 5) return null;
    got += s * c.weight;
    max += 5 * c.weight;
  }
  return Math.round((got / max) * maxScore * 10) / 10;
}

export const RUBRIC_LABEL = ['', 'Poor', 'Weak', 'Meets the bar', 'Strong', 'Exceptional'] as const;

// ── Library: ready-made assessments to start from ─────────────────

export interface AssessmentPreset { id: string; name: string; family: string; config: AssessmentConfig }

const preset = (id: string, name: string, family: string, c: Partial<AssessmentConfig> & Pick<AssessmentConfig, 'kind'>): AssessmentPreset => ({
  id, name, family,
  config: { title: name, brief: '', url: null, deadlineDays: 3, passMark: null, maxScore: 10, questions: [], rubric: [], ...c },
});

export const ASSESSMENT_LIBRARY: AssessmentPreset[] = [
  preset('swe-take-home', 'Coding take-home', 'Engineering', {
    kind: 'TAKE_HOME', deadlineDays: 3, passMark: 6,
    brief: 'Build a small, working version of a feature similar to what you’d build here. Keep it to about 3 hours. Share a GitHub link with a README that explains how to run it, the trade-offs you made, and what you’d do with more time.',
    rubric: [{ name: 'Correctness', weight: 3 }, { name: 'Code quality', weight: 2 }, { name: 'Testing', weight: 2 }, { name: 'Communication (README)', weight: 1 }],
  }),
  preset('coding-test', 'Online coding test', 'Engineering', {
    kind: 'EXTERNAL', deadlineDays: 2, maxScore: 100, passMark: 60,
    brief: 'A timed coding test on our test partner’s site. Set aside about 60–90 minutes in one sitting.',
  }),
  preset('ml-take-home', 'ML / AI take-home', 'AI & ML', {
    kind: 'TAKE_HOME', deadlineDays: 4, passMark: 6,
    brief: 'Using the dataset or problem we describe, build a small model or LLM pipeline, evaluate it, and explain your results. Share a notebook or repo and a short write-up of what worked, what didn’t, and why.',
    rubric: [{ name: 'Problem framing', weight: 2 }, { name: 'Modelling approach', weight: 3 }, { name: 'Evaluation', weight: 3 }, { name: 'Write-up', weight: 1 }],
  }),
  preset('data-case', 'Data analysis case study', 'Data & analytics', {
    kind: 'TAKE_HOME', deadlineDays: 3, passMark: 6,
    brief: 'We’ll share a sample dataset. Find the three most useful insights for the business and recommend what to do. Share your queries or notebook and a 1–2 page summary (or 5 slides).',
    rubric: [{ name: 'Analysis and accuracy', weight: 3 }, { name: 'Quality of insights', weight: 3 }, { name: 'SQL / Python', weight: 2 }, { name: 'Presentation', weight: 1 }],
  }),
  preset('design-challenge', 'Design challenge', 'Design', {
    kind: 'TAKE_HOME', deadlineDays: 4, passMark: 6,
    brief: 'Redesign one flow we describe for our users. Show your thinking: the problem, a few options, and your final design. Share a Figma link. Spend no more than 4 hours; rough is fine.',
    rubric: [{ name: 'Problem framing', weight: 2 }, { name: 'Interaction design', weight: 3 }, { name: 'Visual craft', weight: 2 }, { name: 'Rationale', weight: 2 }],
  }),
  preset('portfolio-review', 'Portfolio review', 'Design', {
    kind: 'WORK_SAMPLE', deadlineDays: 3,
    brief: 'Share your portfolio and two case studies you’re most proud of. For each, tell us your role, the problem, and the outcome.',
    rubric: [{ name: 'Quality of work', weight: 3 }, { name: 'Process and thinking', weight: 2 }, { name: 'Relevance to the role', weight: 2 }],
  }),
  preset('product-case', 'Product case study', 'Product', {
    kind: 'TAKE_HOME', deadlineDays: 4, passMark: 6,
    brief: 'Pick one problem our users have (we’ll suggest a few). Write a short product brief: who it’s for, the problem, how you’d measure success, and the first version you’d ship. 2 pages or 6 slides at most.',
    rubric: [{ name: 'User understanding', weight: 3 }, { name: 'Prioritisation', weight: 2 }, { name: 'Metrics', weight: 2 }, { name: 'Clarity', weight: 1 }],
  }),
  preset('writing-sample', 'Writing samples', 'Marketing & content', {
    kind: 'WORK_SAMPLE', deadlineDays: 3,
    brief: 'Share 2–3 pieces you’ve written that you’re proud of (articles, landing pages, emails or docs) and a line on the goal of each.',
    rubric: [{ name: 'Clarity', weight: 3 }, { name: 'Voice and style', weight: 2 }, { name: 'Fit for our audience', weight: 2 }],
  }),
  preset('sales-role-play', 'Sales role-play', 'Sales', {
    kind: 'LIVE', passMark: 6,
    brief: 'A 20-minute discovery call with one of us playing a prospect. We’ll share the scenario a day before.',
    rubric: [{ name: 'Discovery questions', weight: 3 }, { name: 'Handling objections', weight: 2 }, { name: 'Next steps and closing', weight: 2 }, { name: 'Clarity', weight: 1 }],
  }),
  preset('support-scenarios', 'Customer support scenarios', 'Operations & support', {
    kind: 'QUESTIONS', deadlineDays: 2, passMark: 6,
    brief: 'Answer as you would reply to the customer. There are no trick questions; we’re looking at tone, accuracy and judgement.',
    questions: [
      'A customer says their order is late for the second time and they want a refund now. Write your reply.',
      'A customer reports a bug you can’t reproduce. What do you ask them, and what do you tell the engineering team?',
      'You have 40 open tickets and 2 are from large accounts. How do you plan your next two hours?',
    ],
    rubric: [{ name: 'Empathy and tone', weight: 2 }, { name: 'Accuracy', weight: 2 }, { name: 'Judgement', weight: 2 }],
  }),
  preset('screening-questions', 'Screening questionnaire', 'Any role', {
    kind: 'QUESTIONS', deadlineDays: 3,
    brief: 'A few short questions so we can get to know you before we talk.',
    questions: ['Why does this role interest you?', 'Tell us about a piece of work you’re proud of and your part in it.', 'What would you want to learn or achieve in your first 6 months?'],
  }),
  preset('leadership-presentation', 'Strategy presentation', 'Leadership', {
    kind: 'LIVE',
    brief: 'A 30-minute session: present your 90-day plan for the role (we’ll share context a few days before), then discuss it with the panel.',
    rubric: [{ name: 'Strategic thinking', weight: 3 }, { name: 'Prioritisation', weight: 2 }, { name: 'People leadership', weight: 2 }, { name: 'Communication', weight: 2 }],
  }),
  preset('aptitude-test', 'Aptitude test', 'Internships & campus', {
    kind: 'EXTERNAL', deadlineDays: 2, maxScore: 100, passMark: 50,
    brief: 'A 45-minute online test covering logical reasoning and basics for the role.',
  }),
];

export function presetById(id: string): AssessmentPreset | null {
  return ASSESSMENT_LIBRARY.find((p) => p.id === id) ?? null;
}
