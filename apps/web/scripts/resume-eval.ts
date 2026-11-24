/**
 * Resume engine benchmark (step 4): runs the test set in eval/resume/cases.ts through extraction, the profile and the
 * scored review for each model, and compares with the declared answers. Nothing is stored except the usual AI cost
 * rows. Makes real model calls (about 12 profiles + 33 reviews per model per run).
 *
 * Run from apps/web:
 *   npx dotenv-cli -e ../../.env -- npx tsx --tsconfig tsconfig.json scripts/resume-eval.ts [--models a,b] [--runs 2] [--json out.json]
 */
import { writeFileSync } from 'fs';
import { aiCallListeners } from '../lib/ops/ai';
import { aiCostMicroUsd } from '@udyaibase/utils/ai-cost';
import { extractResume } from '../lib/jobs/resume-extract';
import { buildProfile } from '../lib/jobs/resume-profile';
import { screenFromProfile } from '../lib/jobs/ai-screen-v3';
import { normalizeSkill } from '../lib/jobs/skills';
import type { ResumeProfileData } from '../lib/jobs/resume-profile-shared';
import { CASES, JOBS, NOW, expectedRelevance, renderCase, type CaseSpec, type Level } from '../eval/resume/cases';

const arg = (name: string, d: string) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1]! : d; };
const MODELS = arg('models', 'gpt-4o-mini,gpt-4.1-mini,gpt-4.1,gpt-5-mini').split(',');
const RUNS = Number(arg('runs', '1'));
/** Build profiles with this model instead of the one being tested (to try a cheaper profile model with a stronger reviewer). */
const PROFILE_WITH = arg('profile-model', '');
const JSON_OUT = arg('json', '');
const RANK: Record<Level, number> = { none: 0, claimed: 1, listed: 2, related: 3, used: 4 };

function acceptable(c: CaseSpec, skill: string): Level[] {
  const n = normalizeSkill(skill);
  const has = (xs?: string[]) => (xs ?? []).some((x) => normalizeSkill(x) === n);
  const acc = Object.entries(c.truth.accept ?? {}).find(([k]) => normalizeSkill(k) === n);
  if (acc) return acc[1];
  if (has(c.truth.used)) return ['used'];
  if (has(c.truth.listed)) return ['listed'];
  return ['none'];
}

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i]!); } }));
  return out;
}

interface Row {
  model: string; run: number;
  extract: { rolesExpected: number; rolesFound: number; titlesExact: number; titlesTotal: number; readableOk: boolean; monthsErr: number | null; internOk: boolean }[];
  reqs: { case: string; job: string; skill: string; must: boolean; got: Level; want: Level[] }[];
  relevance: { case: string; job: string; role: string; got: string | null; want: string[] }[];
  scores: { case: string; job: string; score: number; band: string; want?: string; confidence: string }[];
  tokens: { in: number; out: number; costUsd: number; calls: number; failed: number };
  seconds: number;
  errors: string[];
}

async function runModel(model: string, run: number, docs: Map<string, { bytes: Uint8Array; ext: 'pdf' | 'docx' }>): Promise<Row> {
  const row: Row = { model, run, extract: [], reqs: [], relevance: [], scores: [], tokens: { in: 0, out: 0, costUsd: 0, calls: 0, failed: 0 }, seconds: 0, errors: [] };
  const listener = (c: { model: string; promptTokens: number; completionTokens: number; ok: boolean }) => {
    if (c.model !== model && c.model !== PROFILE_WITH) return;
    row.tokens.calls++; if (!c.ok) row.tokens.failed++;
    row.tokens.in += c.promptTokens; row.tokens.out += c.completionTokens;
    row.tokens.costUsd += aiCostMicroUsd(model, c.promptTokens, c.completionTokens) / 1e6;
  };
  aiCallListeners.push(listener);
  const t0 = Date.now();
  const profiles = await pool(CASES, 4, async (c) => {
    try {
      const d = docs.get(c.id)!;
      const x = await extractResume(d.bytes.slice(), { mime: '', ext: d.ext });
      return await buildProfile(x, c.name, NOW, PROFILE_WITH || model);
    } catch (e) { row.errors.push(`${c.id} profile: ${e instanceof Error ? e.message : e}`); return null; }
  });
  CASES.forEach((c, i) => {
    const p = profiles[i];
    const wantReadable = c.truth.readable !== false;
    const titles = c.roles.map((r) => r.title);
    row.extract.push({
      rolesExpected: c.roles.length, rolesFound: p?.roles.length ?? 0,
      titlesExact: titles.filter((t) => p?.roles.some((r) => r.title === t)).length, titlesTotal: titles.length,
      readableOk: (p?.quality.readable ?? false) === wantReadable,
      monthsErr: p && wantReadable ? Math.abs(p.experience.months - c.truth.months) : null,
      internOk: !p || (p.experience.internMonths === (c.truth.internMonths ?? 0)),
    });
  });
  const pairs = CASES.flatMap((c, i) => (profiles[i]?.quality.readable ? JOBS.map((j) => ({ c, j, p: profiles[i] as ResumeProfileData })) : []));
  await pool(pairs, 4, async ({ c, j, p }) => {
    try {
      const app = { confirmedSkills: [], experienceYears: null, city: null, noticePeriodDays: null, expectedCtcLakh: null, screeningAnswers: [] };
      const s = await screenFromProfile(j, app, p, NOW, model);
      for (const r of s.result.requirements) row.reqs.push({ case: c.id, job: j.id, skill: r.name, must: r.must, got: r.level, want: acceptable(c, r.name) });
      s.result.roles.forEach((r, k) => {
        const spec = c.roles.find((x) => x.title === r.title) ?? c.roles[k];
        const want = spec ? expectedRelevance(spec.kind, j.kind) : null;
        if (want && !spec?.internship) row.relevance.push({ case: c.id, job: j.id, role: r.title, got: r.relevance, want });
      });
      const band = s.fitScore >= 70 ? 'high' : s.fitScore >= 40 ? 'mid' : 'low';
      row.scores.push({ case: c.id, job: j.id, score: s.fitScore, band, want: c.truth.band[j.id], confidence: s.result.confidence });
    } catch (e) { row.errors.push(`${c.id}/${j.id} review: ${e instanceof Error ? e.message : e}`); }
  });
  row.seconds = (Date.now() - t0) / 1000;
  aiCallListeners.splice(aiCallListeners.indexOf(listener), 1);
  return row;
}

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '–');

function summarise(rows: Row[]) {
  const out: Record<string, Record<string, string | number>> = {};
  for (const model of MODELS) {
    const rs = rows.filter((r) => r.model === model);
    const r0 = rs[0]!;
    const reqs = rs.flatMap((r) => r.reqs);
    const ok = reqs.filter((x) => x.want.includes(x.got)).length;
    const over = reqs.filter((x) => RANK[x.got] > Math.max(...x.want.map((w) => RANK[w]))).length;
    const under = reqs.filter((x) => RANK[x.got] < Math.min(...x.want.map((w) => RANK[w]))).length;
    const rel = rs.flatMap((r) => r.relevance);
    const ext = rs.flatMap((r) => r.extract);
    const scored = rs.flatMap((r) => r.scores).filter((s) => s.want);
    const mErr = ext.map((e) => e.monthsErr).filter((x): x is number => x != null);
    // Same pair, different runs: identical score?
    let same = 0, compared = 0;
    if (rs.length > 1) for (const s of rs[0]!.scores) for (const other of rs.slice(1)) {
      const t = other.scores.find((x) => x.case === s.case && x.job === s.job);
      if (t) { compared++; if (t.score === s.score) same++; }
    }
    const reviews = rs.reduce((n, r) => n + r.scores.length, 0);
    const cost = rs.reduce((n, r) => n + r.tokens.costUsd, 0);
    out[model] = {
      'Skill evidence correct': pct(ok, reqs.length),
      'Over-claims (shown but not there)': `${over} (${pct(over, reqs.length)})`,
      'Under-claims (there but missed)': `${under} (${pct(under, reqs.length)})`,
      'Role relevance correct': pct(rel.filter((x) => x.got != null && x.want.includes(x.got)).length, rel.length),
      'Roles found / expected': `${ext.reduce((n, e) => n + e.rolesFound, 0)} / ${ext.reduce((n, e) => n + e.rolesExpected, 0)}`,
      'Job titles exact': pct(ext.reduce((n, e) => n + e.titlesExact, 0), ext.reduce((n, e) => n + e.titlesTotal, 0)),
      'Experience months exact': pct(mErr.filter((x) => x === 0).length, mErr.length),
      'Scanned detected': pct(ext.filter((e) => e.readableOk).length, ext.length),
      'Score band as expected': pct(scored.filter((s) => s.band === s.want).length, scored.length),
      'Same score on re-run': compared ? pct(same, compared) : 'not measured',
      'Seconds per run': Math.round(r0.seconds),
      // Profile cost is spread over the reviews that reuse it (one profile, three jobs here).
      'Cost per review incl. profile (₹, at ₹84/$)': reviews ? ((cost / reviews) * 84).toFixed(3) : '–',
      'Errors': rs.reduce((n, r) => n + r.errors.length, 0),
    };
  }
  return out;
}

(async () => {
  const docs = new Map<string, { bytes: Uint8Array; ext: 'pdf' | 'docx' }>();
  for (const c of CASES) docs.set(c.id, await renderCase(c));
  const rows: Row[] = [];
  for (const model of MODELS) for (let run = 1; run <= RUNS; run++) {
    process.stderr.write(`running ${model} (run ${run})...\n`);
    rows.push(await runModel(model, run, docs));
  }
  const table = summarise(rows);
  const metrics = Object.keys(table[MODELS[0]!]!);
  console.log(`| Metric | ${MODELS.join(' | ')} |`);
  console.log(`|---|${MODELS.map(() => '---').join('|')}|`);
  for (const m of metrics) console.log(`| ${m} | ${MODELS.map((x) => table[x]![m]).join(' | ')} |`);
  for (const r of rows) for (const e of r.errors) console.log(`error ${r.model}: ${e}`);
  // Mistakes, for reading: over-claims are the ones that matter most.
  for (const model of MODELS) {
    const r = rows.find((x) => x.model === model)!;
    const wrong = r.reqs.filter((x) => !x.want.includes(x.got));
    console.log(`\n${model}: ${wrong.length} skill mistakes`);
    for (const w of wrong) console.log(`  ${w.case}/${w.job} ${w.skill}: got ${w.got}, expected ${w.want.join(' or ')}`);
    const relWrong = r.relevance.filter((x) => x.got == null || !x.want.includes(x.got));
    for (const w of relWrong) console.log(`  ${w.case}/${w.job} role "${w.role}": got ${w.got}, expected ${w.want.join(' or ')}`);
    const ext = r.extract.map((e, i) => ({ ...e, id: CASES[i]!.id })).filter((e) => e.rolesFound !== e.rolesExpected || e.titlesExact !== e.titlesTotal || (e.monthsErr ?? 0) !== 0 || !e.readableOk || !e.internOk);
    for (const e of ext) console.log(`  ${e.id} extraction: roles ${e.rolesFound}/${e.rolesExpected}, titles ${e.titlesExact}/${e.titlesTotal}, months off by ${e.monthsErr}, readable ok ${e.readableOk}, internships ok ${e.internOk}`);
    console.log(`  scores: ${r.scores.map((s) => `${s.case}/${s.job}=${s.score}${s.want && s.band !== s.want ? `(want ${s.want})` : ''}`).join(' ')}`);
  }
  if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify({ table, rows }, null, 1));
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
