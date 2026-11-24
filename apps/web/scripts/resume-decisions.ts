/**
 * The real test: does the new engine agree with what recruiters actually did? For past applications with a resume and
 * a decision (moved on to Screening or beyond = shortlisted; Not moving ahead without ever being shortlisted =
 * rejected), builds the new profile and review in memory and compares them with the decision. Nothing is saved
 * (only the usual AI cost rows). Prints counts and percentages only, never names or resume text.
 *
 * Caveat: recruiters saw the old AI score when deciding, which may have nudged them. Treat agreement as a guide, not
 * truth. The number to watch for "too strict": how often recruiters shortlisted someone the engine rates Weak.
 *
 * Run from apps/web (production: the production env file; resumes are read from private storage):
 *   npx dotenv-cli -e ../../.env -- npx tsx --tsconfig tsconfig.json scripts/resume-decisions.ts [--limit 300] [--model gpt-4.1]
 */
import { prisma } from '@udyaibase/database';
import type { JobBoardAppStatus } from '@prisma/client';
import { readResume } from '../lib/jobs/resume-storage';
import { sniffResume } from '../lib/jobs/resume-text';
import { extractResume } from '../lib/jobs/resume-extract';
import { buildProfile } from '../lib/jobs/resume-profile';
import { screenFromProfile, SCREEN_V3_MODEL } from '../lib/jobs/ai-screen-v3';
import { ensureSkillOverrides } from '../lib/jobs/skill-overrides';

const arg = (n: string, d: string) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1]! : d; };
const LIMIT = Number(arg('limit', '300'));
const MODEL = arg('model', SCREEN_V3_MODEL);
const SHORTLISTED: JobBoardAppStatus[] = ['SHORTLISTED', 'ASSESSMENT', 'INTERVIEW', 'DECISION', 'OFFER', 'HIRED'];

/** Chance a random shortlisted candidate scores above a random rejected one (0.5 = no better than a coin, 1 = perfect). */
function auc(pos: number[], neg: number[]): number {
  if (!pos.length || !neg.length) return NaN;
  let wins = 0;
  for (const p of pos) for (const n of neg) wins += p > n ? 1 : p === n ? 0.5 : 0;
  return wins / (pos.length * neg.length);
}

(async () => {
  await ensureSkillOverrides(true);
  const half = Math.ceil(LIMIT / 2);
  const select = {
    id: true, fullName: true, resumeKey: true, status: true, confirmedSkills: true, experienceYears: true, city: true, noticePeriodDays: true, expectedCtcLakh: true, screeningAnswers: true,
    AiScreening: { select: { fitScore: true, recommendation: true, promptVersion: true } },
    Events: { select: { toStatus: true } },
    Listing: { select: { title: true, description: true, skills: true, mustHaveSkills: true, experienceMin: true, experienceMax: true, workType: true, city: true, salaryMax: true, salaryCurrency: true, maxNoticeDays: true, screeningQuestions: true } },
  } as const;
  const base = { resumeKey: { not: null }, withdrawnAt: null, sourcedState: null, Listing: { isGeneral: false } };
  // Balanced sample: half shortlisted, half rejected, newest first.
  const [pos, neg] = await Promise.all([
    prisma.jobBoardApplication.findMany({ where: { ...base, OR: [{ status: { in: SHORTLISTED } }, { Events: { some: { toStatus: { in: SHORTLISTED } } } }] }, orderBy: { appliedAt: 'desc' }, take: half, select }),
    prisma.jobBoardApplication.findMany({ where: { ...base, status: 'REJECTED', NOT: { Events: { some: { toStatus: { in: SHORTLISTED } } } } }, orderBy: { appliedAt: 'desc' }, take: half, select }),
  ]);
  type Row = { shortlisted: boolean; neu: number | null; rec: string | null; old: number | null; oldRec: string | null; scanned: boolean };
  const rows: Row[] = [];
  for (const [list, shortlisted] of [[pos, true], [neg, false]] as const) {
    for (const a of list) {
      const old = a.AiScreening && !a.AiScreening.promptVersion?.startsWith('screen-v3') ? a.AiScreening.fitScore : null;
      const oldRec = a.AiScreening && !a.AiScreening.promptVersion?.startsWith('screen-v3') ? a.AiScreening.recommendation : null;
      try {
        const bytes = await readResume(a.resumeKey!);
        const kind = sniffResume(bytes);
        if (!kind) continue;
        const p = await buildProfile(await extractResume(bytes, kind), a.fullName);
        if (!p.quality.readable) { rows.push({ shortlisted, neu: null, rec: null, old, oldRec, scanned: true }); continue; }
        const s = await screenFromProfile(a.Listing, a, p, new Date(), MODEL);
        rows.push({ shortlisted, neu: s.fitScore, rec: s.recommendation, old, oldRec, scanned: false });
      } catch { /* unreadable file: skip */ }
    }
  }
  const scored = rows.filter((r) => r.neu != null);
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '–');
  const P = scored.filter((r) => r.shortlisted), N = scored.filter((r) => !r.shortlisted);
  console.log(`Applications: ${rows.length} (${P.length} shortlisted, ${N.length} rejected scored; ${rows.filter((r) => r.scanned).length} scanned, not scored). Model: ${MODEL}.`);
  console.log('Recruiters saw the old AI score when deciding: treat agreement as a guide, not truth.\n');
  console.log(`New engine: shortlisted candidates score higher than rejected ones ${(auc(P.map((r) => r.neu!), N.map((r) => r.neu!)) * 100).toFixed(0)}% of the time (50% = coin toss).`);
  const withOld = scored.filter((r) => r.old != null);
  if (withOld.length >= 10) {
    const oP = withOld.filter((r) => r.shortlisted), oN = withOld.filter((r) => !r.shortlisted);
    console.log(`Old score on the same applications: ${(auc(oP.map((r) => r.old!), oN.map((r) => r.old!)) * 100).toFixed(0)}%; new on them: ${(auc(oP.map((r) => r.neu!), oN.map((r) => r.neu!)) * 100).toFixed(0)}%.`);
  }
  console.log('\n| Engine says | Shortlisted by recruiters | Rejected by recruiters |');
  console.log('|---|---|---|');
  for (const [rec, label] of [['shortlist', 'Suggests shortlist'], ['consider', 'Worth a look'], ['weak', 'Weak fit']] as const) {
    const n = scored.filter((r) => r.rec === rec);
    console.log(`| ${label} | ${n.filter((r) => r.shortlisted).length} | ${n.filter((r) => !r.shortlisted).length} |`);
  }
  const weakButShortlisted = P.filter((r) => r.rec === 'weak').length;
  console.log(`\nToo strict? Shortlisted by recruiters but rated Weak: ${weakButShortlisted} of ${P.length} (${pct(weakButShortlisted, P.length)}).`);
  console.log(`Too lenient? Rejected by recruiters but suggested for shortlist: ${N.filter((r) => r.rec === 'shortlist').length} of ${N.length} (${pct(N.filter((r) => r.rec === 'shortlist').length, N.length)}).`);
  const oldWeakP = P.filter((r) => r.oldRec === 'weak').length;
  if (P.some((r) => r.oldRec)) console.log(`Old engine, same shortlisted people rated Weak: ${oldWeakP} of ${P.filter((r) => r.oldRec).length} (${pct(oldWeakP, P.filter((r) => r.oldRec).length)}).`);
  await prisma.$disconnect();
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
