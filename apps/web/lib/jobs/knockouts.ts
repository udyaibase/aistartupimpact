/**
 * Screening-question knockouts and the discriminatory-question blocklist. Pure functions, no server imports: used by
 * the job composer (client), the publish check, the apply route and the match.
 *
 * Knockouts never reject anyone automatically. A failed one flags the candidate, groups them under "Didn't meet
 * must-haves" on the board and skips the automatic AI review; a person decides.
 */

export type QuestionType = 'text' | 'yesno' | 'choice' | 'number';

export interface KnockoutQuestion {
  id: string;
  question: string;
  type: QuestionType | string;
  options?: string[];
  /** Yes/No: the answer the role needs. */
  knockoutAnswer?: 'yes' | 'no' | string;
  /** Multiple choice: the answers that meet the role (empty or absent = no knockout). */
  acceptedOptions?: string[];
  /** Number: the answer must be at least / at most this. */
  minValue?: number | null;
  maxValue?: number | null;
}

/** True when the question has a pass rule (so it can knock a candidate out). */
export function isKnockout(q: KnockoutQuestion): boolean {
  if (q.type === 'yesno') return q.knockoutAnswer === 'yes' || q.knockoutAnswer === 'no';
  if (q.type === 'choice') return Array.isArray(q.acceptedOptions) && q.acceptedOptions.length > 0;
  if (q.type === 'number') return typeof q.minValue === 'number' || typeof q.maxValue === 'number';
  return false;
}

/** A numeric answer as typed ("3", "3.5", "3 years", "₹12 L"): the first number, or null. */
export function numberAnswer(raw: string | undefined): number | null {
  const m = (raw ?? '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export interface KnockoutResult { id: string; question: string; status: 'pass' | 'fail' | 'unknown'; detail: string; /** Added to the job after they applied. */ notAsked?: boolean }

/**
 * Evaluate every knockout question against the stored answers. Unanswered counts as not met, but a question added
 * after someone applied (no stored answer at all) never counts against them: they were never asked.
 */
export function evaluateKnockouts(questionsRaw: unknown, answersRaw: unknown): { results: KnockoutResult[]; knockedOut: boolean } {
  const questions = (Array.isArray(questionsRaw) ? questionsRaw : []) as KnockoutQuestion[];
  const answers = new Map(((Array.isArray(answersRaw) ? answersRaw : []) as { id: string; answer: string }[]).map((a) => [a?.id, String(a?.answer ?? '')]));
  const results: KnockoutResult[] = [];
  for (const q of questions) {
    if (!q || !isKnockout(q)) continue;
    if (!answers.has(q.id)) { results.push({ id: q.id, question: q.question, status: 'unknown', detail: 'Asked after they applied', notAsked: true }); continue; }
    const a = (answers.get(q.id) ?? '').trim();
    let status: KnockoutResult['status'];
    let detail: string;
    if (q.type === 'yesno') {
      const want = q.knockoutAnswer === 'yes' ? 'Yes' : 'No';
      status = !a ? 'unknown' : a === q.knockoutAnswer ? 'pass' : 'fail';
      detail = a ? `Answered ${a === 'yes' ? 'Yes' : 'No'} · needs ${want}` : `Not answered · needs ${want}`;
    } else if (q.type === 'choice') {
      const ok = q.acceptedOptions!;
      status = !a ? 'unknown' : ok.includes(a) ? 'pass' : 'fail';
      detail = a ? `Answered “${a}” · needs ${ok.map((o) => `“${o}”`).join(' or ')}` : `Not answered · needs ${ok.join(' or ')}`;
    } else {
      const n = numberAnswer(a);
      const min = typeof q.minValue === 'number' ? q.minValue : null;
      const max = typeof q.maxValue === 'number' ? q.maxValue : null;
      const need = min != null && max != null ? `${fmt(min)}–${fmt(max)}` : min != null ? `at least ${fmt(min)}` : `at most ${fmt(max!)}`;
      status = n == null ? 'unknown' : (min == null || n >= min) && (max == null || n <= max) ? 'pass' : 'fail';
      detail = n == null ? `Not answered · needs ${need}` : `Answered ${fmt(n)} · needs ${need}`;
    }
    results.push({ id: q.id, question: q.question, status, detail });
  }
  return { results, knockedOut: results.some((r) => r.status !== 'pass' && !r.notAsked) };
}

/* ------------------------------------------------------------------ blocklist */

/**
 * Questions that screen on who someone is rather than what they can do. They can't be used, on any plan. Checked in
 * the composer as the employer types and again on the server before a job is published.
 */
const BLOCKED: [RegExp, string][] = [
  [/\b(age|aged|how old|years old|date of birth|dob|birth ?date|birth ?year|year of birth)\b/i, 'age'],
  [/\b(gender|sex|male or female|man or woman|transgender)\b/i, 'gender'],
  [/\b(marital|married|unmarried|spouse|husband|wife|divorced|widowed|engaged to)\b/i, 'marital status'],
  [/\b(pregnan\w*|maternity plans?|planning (a |to have )?(baby|child|children|family)|how many (kids|children))\b/i, 'pregnancy or family plans'],
  [/\b(religion|religious|hindu|muslim|christian|sikh|jain|buddhist|parsi)\b/i, 'religion'],
  [/\b(caste|sub-?caste|jati|gotra|sc\/st|scheduled (caste|tribe)|obc|which community|your community)\b/i, 'caste or community'],
  [/\b(your|a recent|passport[- ]size)\s+(photo|photograph|picture)\b|\bselfie\b/i, 'a photo'],
  [/\b(height|weight|complexion|skin colou?r|fair skin)\b/i, 'appearance'],
  [/\b(disabilit\w*|disabled|handicap\w*|medical condition|health condition)\b/i, 'disability or health'],
];

/** Why a question can't be used for screening, or null when it's fine. */
export function blockedQuestion(text: string): string | null {
  const t = text.normalize('NFKC');
  const hit = BLOCKED.find(([re]) => re.test(t));
  return hit ? `This question can’t be used for screening: it asks about ${hit[1]}. Ask about skills, experience or practical needs instead.` : null;
}

/* ------------------------------------------------------------------ suggestions (from the job's own fields, no AI) */

export interface SuggestedKnockout { question: string; type: 'yesno' | 'number'; knockoutAnswer?: 'yes'; minValue?: number }

/** Up to 4 knockouts built from what the job already says: experience, must-have skills and the office. */
export function suggestKnockouts(job: { experienceMin?: number | null; mustHaveSkills?: string[]; skills?: string[]; workType?: string; city?: string | null }): SuggestedKnockout[] {
  const out: SuggestedKnockout[] = [];
  if (job.experienceMin != null && job.experienceMin > 0) out.push({ question: 'How many years of relevant work experience do you have?', type: 'number', minValue: job.experienceMin });
  const must = (job.mustHaveSkills?.length ? job.mustHaveSkills : job.skills ?? []).slice(0, 2);
  for (const s of must) out.push({ question: `Have you used ${s} in a job or a real project?`, type: 'yesno', knockoutAnswer: 'yes' });
  if (job.city && (job.workType === 'ONSITE' || job.workType === 'HYBRID')) out.push({ question: `Can you work from our ${job.city} office${job.workType === 'HYBRID' ? ' on office days' : ''}?`, type: 'yesno', knockoutAnswer: 'yes' });
  return out.slice(0, 4);
}
