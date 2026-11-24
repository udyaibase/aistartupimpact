/**
 * Side by side on real applications (step 4 rollout check): for recent applications that already have an old (v2)
 * AI review, builds the new profile and v3 review in memory and prints old vs new scores. Nothing is saved: no
 * profiles, no reviews (only the usual AI cost rows). Prints application ids and numbers only, never names or text.
 *
 * With --labels file.json (see eval/resume/human-labels.example.json), also compares both against your team's scores.
 *
 * Run from apps/web (production: use the production env file; resumes are read from private storage):
 *   npx dotenv-cli -e ../../.env -- npx tsx --tsconfig tsconfig.json scripts/resume-compare.ts [--limit 30] [--labels labels.json]
 */
import { readFileSync } from 'fs';
import { prisma } from '@udyaibase/database';
import { readResume } from '../lib/jobs/resume-storage';
import { sniffResume } from '../lib/jobs/resume-text';
import { extractResume } from '../lib/jobs/resume-extract';
import { buildProfile } from '../lib/jobs/resume-profile';
import { screenFromProfile } from '../lib/jobs/ai-screen-v3';

const arg = (name: string, d: string) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1]! : d; };
const LIMIT = Number(arg('limit', '30'));
const LABELS = arg('labels', '');

/** Spearman rank correlation (1 = same order, 0 = unrelated). */
function spearman(a: number[], b: number[]) {
  const rank = (xs: number[]) => { const s = xs.map((v, i) => [v, i] as const).sort((x, y) => x[0] - y[0]); const r = new Array(xs.length); s.forEach(([, i], k) => { r[i] = k; }); return r as number[]; };
  const ra = rank(a), rb = rank(b), n = a.length;
  if (n < 3) return NaN;
  return 1 - (6 * ra.reduce((t, x, i) => t + (x - rb[i]!) ** 2, 0)) / (n * (n * n - 1));
}

(async () => {
  const labels: { applicationId: string; score: number }[] = LABELS ? JSON.parse(readFileSync(LABELS, 'utf8')) : [];
  const where = labels.length
    ? { id: { in: labels.map((l) => l.applicationId) } }
    : { resumeKey: { not: null }, withdrawnAt: null, Listing: { isGeneral: false }, AiScreening: { status: 'DONE' as const } };
  const apps = await prisma.jobBoardApplication.findMany({
    where, orderBy: { appliedAt: 'desc' }, take: labels.length || LIMIT,
    select: {
      id: true, fullName: true, resumeKey: true, confirmedSkills: true, experienceYears: true, city: true, noticePeriodDays: true, expectedCtcLakh: true, screeningAnswers: true,
      AiScreening: { select: { fitScore: true, promptVersion: true } },
      Listing: { select: { title: true, description: true, skills: true, mustHaveSkills: true, experienceMin: true, experienceMax: true, workType: true, city: true, salaryMax: true, salaryCurrency: true, maxNoticeDays: true, screeningQuestions: true } },
    },
  });
  const rows: { id: string; old: number | null; neu: number | null; human: number | null; conf: string; note: string }[] = [];
  for (const a of apps) {
    const human = labels.find((l) => l.applicationId === a.id)?.score ?? null;
    const old = a.AiScreening?.promptVersion?.startsWith('screen-v3') ? null : a.AiScreening?.fitScore ?? null;
    try {
      const bytes = await readResume(a.resumeKey!);
      const kind = sniffResume(bytes);
      if (!kind) { rows.push({ id: a.id, old, neu: null, human, conf: '-', note: 'not a PDF/DOCX' }); continue; }
      const p = await buildProfile(await extractResume(bytes, kind), a.fullName);
      if (!p.quality.readable) { rows.push({ id: a.id, old, neu: null, human, conf: 'Low', note: 'scanned: old review stays' }); continue; }
      const s = await screenFromProfile(a.Listing, a, p);
      rows.push({ id: a.id, old, neu: s.fitScore, human, conf: s.result.confidence, note: s.result.capped ? 'capped' : '' });
    } catch (e) {
      rows.push({ id: a.id, old, neu: null, human, conf: '-', note: `error: ${e instanceof Error ? e.message.slice(0, 60) : e}` });
    }
  }
  console.log('| Application | Old score | New score | Change | Team score | Confidence | Note |');
  console.log('|---|---|---|---|---|---|---|');
  for (const r of rows) console.log(`| ${r.id} | ${r.old ?? '–'} | ${r.neu ?? '–'} | ${r.old != null && r.neu != null ? (r.neu - r.old > 0 ? '+' : '') + (r.neu - r.old) : '–'} | ${r.human ?? '–'} | ${r.conf} | ${r.note} |`);
  const both = rows.filter((r) => r.old != null && r.neu != null);
  if (both.length) {
    const diffs = both.map((r) => Math.abs(r.neu! - r.old!));
    console.log(`\nOld vs new: ${both.length} compared, average difference ${(diffs.reduce((n, x) => n + x, 0) / diffs.length).toFixed(1)} points, ${diffs.filter((d) => d >= 20).length} moved 20+ points, rank agreement ${spearman(both.map((r) => r.old!), both.map((r) => r.neu!)).toFixed(2)}`);
  }
  const lab = rows.filter((r) => r.human != null);
  for (const [name, key] of [['Old', 'old'], ['New', 'neu']] as const) {
    const xs = lab.filter((r) => r[key] != null);
    if (xs.length < 3) continue;
    const err = xs.reduce((n, r) => n + Math.abs(r[key]! - r.human!), 0) / xs.length;
    console.log(`${name} vs your team: ${xs.length} rated, average difference ${err.toFixed(1)} points, rank agreement ${spearman(xs.map((r) => r[key]!), xs.map((r) => r.human!)).toFixed(2)}`);
  }
  await prisma.$disconnect();
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
