/**
 * Before/after baseline: runs the ORIGINAL review pipeline (as it was before the resume engine) on the same test set
 * as scripts/resume-eval.ts, so both can be compared on equal terms. Old reader: first 3 pages, text joined in the
 * order the PDF stores it, 12,000 characters. Old review: gpt-4o-mini, free-text quotes checked against the text,
 * the old fit formula. Nothing is stored except the usual AI cost rows.
 *
 * Run from apps/web: npx dotenv-cli -e ../../.env -- npx tsx --tsconfig tsconfig.json scripts/resume-eval-legacy.ts [--runs 2]
 */
import { unzipSync, strFromU8 } from 'fflate';
import { getDocumentProxy } from 'unpdf';
import { aiCallListeners, openaiChat } from '../lib/ops/ai';
import { aiCostMicroUsd } from '@udyaibase/utils/ai-cost';
import { SCHEMA, SYSTEM, norm, redact, scoreOf, validate } from '../lib/jobs/ai-screen';
import { docxText } from '../lib/jobs/resume-text';
import { normalizeSkill } from '../lib/jobs/skills';
import { CASES, JOBS, renderCase, type CaseSpec } from '../eval/resume/cases';

const arg = (n: string, d: string) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1]! : d; };
const RUNS = Number(arg('runs', '1'));
const MODEL = 'gpt-4o-mini';

/** The reader exactly as it was: first 3 pages, pieces joined in stored order, capped. */
async function oldText(bytes: Uint8Array, ext: 'pdf' | 'docx'): Promise<string> {
  let text = '';
  if (ext === 'pdf') {
    const pdf = await getDocumentProxy(bytes.slice());
    const parts: string[] = [];
    for (let i = 1; i <= Math.min(pdf.numPages, 3); i++) {
      const content = await (await pdf.getPage(i)).getTextContent();
      parts.push(content.items.map((it) => ('str' in it ? it.str : '')).join(' '));
    }
    text = parts.join('\n');
  } else {
    const files = unzipSync(bytes, { filter: (f) => f.name === 'word/document.xml' });
    text = docxText(files['word/document.xml'] ? strFromU8(files['word/document.xml']!) : '');
  }
  return text.replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim().slice(0, 12_000);
}

function acceptable(c: CaseSpec, skill: string): string[] {
  const n = normalizeSkill(skill);
  const has = (xs?: string[]) => (xs ?? []).some((x) => normalizeSkill(x) === n);
  const acc = Object.entries(c.truth.accept ?? {}).find(([k]) => normalizeSkill(k) === n);
  if (acc) return acc[1];
  if (has(c.truth.used)) return ['used'];
  if (has(c.truth.listed)) return ['listed'];
  return ['none'];
}

(async () => {
  const docs = new Map<string, { bytes: Uint8Array; ext: 'pdf' | 'docx' }>();
  for (const c of CASES) docs.set(c.id, await renderCase(c));
  const runs: { reqs: { want: string[]; got: string; id: string }[]; scores: Map<string, number>; bands: { band: string; want?: string }[]; tokensIn: number; tokensOut: number; cost: number; seconds: number; reviews: number }[] = [];
  for (let run = 1; run <= RUNS; run++) {
    const r = { reqs: [] as { want: string[]; got: string; id: string }[], scores: new Map<string, number>(), bands: [] as { band: string; want?: string }[], tokensIn: 0, tokensOut: 0, cost: 0, seconds: 0, reviews: 0 };
    const listener = (x: { model: string; promptTokens: number; completionTokens: number }) => { if (x.model === MODEL) { r.tokensIn += x.promptTokens; r.tokensOut += x.completionTokens; r.cost += aiCostMicroUsd(MODEL, x.promptTokens, x.completionTokens) / 1e6; } };
    aiCallListeners.push(listener);
    const t0 = Date.now();
    for (const c of CASES) {
      const d = docs.get(c.id)!;
      const resume = redact(await oldText(d.bytes, d.ext), c.name);
      const readable = resume.length > 50 ? resume : '';
      for (const j of JOBS) {
        const mustList = j.mustHaveSkills.length ? j.mustHaveSkills : j.skills;
        const user = `<job>\nTitle: ${j.title}\nExperience: ${j.experienceMin}+ years\nWork type: ${j.workType}\nMust-have skills: ${mustList.join(', ')}\nOther skills: ${j.skills.filter((s) => !mustList.includes(s)).join(', ') || 'none'}\nDescription: ${j.description.replace(/<[^>]+>/g, ' ')}\n</job>\n\n<candidate_form>\nNothing entered.\n</candidate_form>\n\n<resume>\n${readable || '(No resume text available. Review the form only and say so in the summary.)'}\n</resume>`;
        const data = await openaiChat('ai_screening', { model: MODEL, temperature: 0, response_format: { type: 'json_schema', json_schema: SCHEMA }, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }] }, 45_000);
        const result = validate(JSON.parse(data.choices?.[0]?.message?.content ?? '{}'), { source: norm(readable), mustList, otherList: j.skills.filter((s) => !mustList.includes(s)), confirmed: [], resumeRead: !!readable });
        const { fitScore } = scoreOf(result);
        r.reviews++;
        r.scores.set(`${c.id}/${j.id}`, fitScore);
        r.bands.push({ band: fitScore >= 70 ? 'high' : fitScore >= 40 ? 'mid' : 'low', want: c.truth.band[j.id] });
        if (!readable) continue;
        // The old review had two levels: shown in the resume, or not. "Listed only" didn't exist, so not-found is fair there.
        for (const m of [...result.mustHaves, ...result.otherSkills]) {
          const want = acceptable(c, m.skill);
          const got = m.status === 'evidenced' ? 'used' : 'none';
          const ev = (m as { evidence?: string }).evidence;
          r.reqs.push({ want: want.includes('listed') ? [...want, 'none'] : want, got, id: `${c.id}/${j.id} ${m.skill}${ev ? ` (quote: "${ev.slice(0, 60)}")` : ''}` });
        }
      }
    }
    r.seconds = (Date.now() - t0) / 1000;
    aiCallListeners.splice(aiCallListeners.indexOf(listener), 1);
    runs.push(r);
  }
  const r0 = runs[0]!;
  const RANK: Record<string, number> = { none: 0, claimed: 1, listed: 2, related: 3, used: 4 };
  const ok = r0.reqs.filter((x) => x.want.includes(x.got)).length;
  const over = r0.reqs.filter((x) => RANK[x.got]! > Math.max(...x.want.map((w) => RANK[w]!))).length;
  const under = r0.reqs.filter((x) => RANK[x.got]! < Math.min(...x.want.map((w) => RANK[w]!))).length;
  const banded = r0.bands.filter((b) => b.want);
  let same = 0, compared = 0;
  if (runs.length > 1) for (const [k, v] of r0.scores) { compared++; if (runs[1]!.scores.get(k) === v) same++; }
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '–');
  for (const x of r0.reqs.filter((x) => !x.want.includes(x.got))) console.log(`mistake ${x.id}: got ${x.got}, expected ${x.want.join(' or ')}`);
  console.log(JSON.stringify({
    skillEvidenceCorrect: pct(ok, r0.reqs.length), overClaims: `${over} (${pct(over, r0.reqs.length)})`, underClaims: `${under} (${pct(under, r0.reqs.length)})`,
    scoreBandAsExpected: pct(banded.filter((b) => b.band === b.want).length, banded.length), sameScoreOnRerun: compared ? pct(same, compared) : 'not measured',
    tokensPerReview: { in: Math.round(r0.tokensIn / r0.reviews), out: Math.round(r0.tokensOut / r0.reviews) },
    costPerReviewInr: ((r0.cost / r0.reviews) * 84).toFixed(3), secondsPerRun: Math.round(r0.seconds),
    scores: Object.fromEntries(r0.scores),
  }, null, 1));
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
