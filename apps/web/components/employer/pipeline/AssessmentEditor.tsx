'use client';

import { Plus, Trash2 } from 'lucide-react';
import {
  ASSESSMENT_LIBRARY, ASSESSMENT_KINDS, KIND_HINT, KIND_LABEL, LIMITS, defaultTitle,
  type AssessmentConfig, type AssessmentKind,
} from '@/lib/employer/assessment-config';

const input = 'w-full min-h-[40px] px-3 rounded-[10px] border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-sm text-gray-900 dark:text-white';
const label = 'block text-[13px] font-semibold text-gray-800 dark:text-gray-200 mb-1';
const iconBtn = 'w-10 h-10 shrink-0 flex items-center justify-center rounded-[8px] hover:bg-gray-100 dark:hover:bg-gray-800';

export const EMPTY_ASSESSMENT: AssessmentConfig = { kind: 'TAKE_HOME', title: 'Take-home assignment', brief: '', url: null, deadlineDays: 3, passMark: null, maxScore: 10, questions: [], rubric: [] };

/** Families in the order people look for them. */
const FAMILIES = Array.from(new Set(ASSESSMENT_LIBRARY.map((p) => p.family)));

/**
 * The job's assessment: start from the library or from scratch, then adjust. Any kind of assessment fits one of five
 * types; written questions and a scoring rubric are optional extras.
 */
export default function AssessmentEditor({ value, onChange }: { value: AssessmentConfig; onChange: (v: AssessmentConfig) => void }) {
  const a = value;
  const set = (patch: Partial<AssessmentConfig>) => onChange({ ...a, ...patch });
  const page = a.kind !== 'LIVE';

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="as-lib" className={label}>Start from a ready-made assessment <span className="font-normal text-gray-500">(optional)</span></label>
        <select id="as-lib" className={input} value="" onChange={(e) => { const p = ASSESSMENT_LIBRARY.find((x) => x.id === e.target.value); if (p) onChange(JSON.parse(JSON.stringify(p.config))); }}>
          <option value="">Choose one to fill everything in…</option>
          {FAMILIES.map((f) => (
            <optgroup key={f} label={f}>
              {ASSESSMENT_LIBRARY.filter((p) => p.family === f).map((p) => <option key={p.id} value={p.id}>{p.name} · {KIND_LABEL[p.config.kind]}</option>)}
            </optgroup>
          ))}
        </select>
      </div>

      <fieldset>
        <legend className={label}>Type</legend>
        <div className="grid sm:grid-cols-2 gap-2">
          {ASSESSMENT_KINDS.map((k) => (
            <label key={k} className={`flex items-start gap-2 p-2.5 rounded-[10px] border cursor-pointer ${a.kind === k ? 'border-gray-900 dark:border-gray-500' : 'border-gray-200 dark:border-gray-800'}`}>
              <input type="radio" name="as-kind" checked={a.kind === k} className="mt-1 accent-[#A50F15]"
                onChange={() => set({ kind: k as AssessmentKind, title: a.title === defaultTitle(a.kind) || !a.title ? defaultTitle(k as AssessmentKind) : a.title })} />
              <span className="text-[13px]"><span className="font-semibold text-gray-900 dark:text-white">{KIND_LABEL[k]}</span><span className="block text-xs text-gray-600 dark:text-gray-400">{KIND_HINT[k]}</span></span>
            </label>
          ))}
        </div>
      </fieldset>

      <div><label htmlFor="as-title" className={label}>Name candidates see</label><input id="as-title" value={a.title} maxLength={80} onChange={(e) => set({ title: e.target.value })} className={input} placeholder="e.g. Data analysis case study" /></div>

      <div>
        <label htmlFor="as-brief" className={label}>{a.kind === 'QUESTIONS' ? 'Introduction (optional)' : a.kind === 'WORK_SAMPLE' ? 'What work you’d like to see' : a.kind === 'LIVE' ? 'What happens in the session (optional)' : 'The task'}</label>
        <textarea id="as-brief" rows={4} value={a.brief} maxLength={4000} onChange={(e) => set({ brief: e.target.value })} className={`${input} py-2`}
          placeholder={a.kind === 'TAKE_HOME' ? 'What to build or analyse, how long to spend, and what to hand in.' : ''} />
      </div>

      {(a.kind === 'EXTERNAL' || a.kind === 'TAKE_HOME') && (
        <div>
          <label htmlFor="as-url" className={label}>{a.kind === 'EXTERNAL' ? 'Link to the test' : 'Materials link (optional)'}</label>
          <input id="as-url" type="url" value={a.url ?? ''} onChange={(e) => set({ url: e.target.value || null })} className={input} placeholder={a.kind === 'EXTERNAL' ? 'https://www.hackerrank.com/… or https://forms.gle/…' : 'https://drive.google.com/… (dataset, brief, starter code)'} />
          {a.kind === 'EXTERNAL' && <p className="mt-1 text-xs text-gray-500">Use the candidate link from your test provider, not a page in this portal.</p>}
        </div>
      )}

      {a.kind === 'QUESTIONS' && (
        <div>
          <p className={label}>Questions</p>
          <ol className="space-y-1.5">
            {a.questions.map((q, i) => (
              <li key={i} className="flex gap-2">
                <label htmlFor={`as-q${i}`} className="sr-only">Question {i + 1}</label>
                <textarea id={`as-q${i}`} rows={2} value={q} maxLength={LIMITS.questionLength} onChange={(e) => set({ questions: a.questions.map((x, j) => (j === i ? e.target.value : x)) })} className={`${input} py-2`} />
                <button type="button" aria-label={`Remove question ${i + 1}`} onClick={() => set({ questions: a.questions.filter((_, j) => j !== i) })} className={iconBtn}><Trash2 className="w-4 h-4" aria-hidden /></button>
              </li>
            ))}
          </ol>
          {a.questions.length < LIMITS.questions && <button type="button" onClick={() => set({ questions: [...a.questions, ''] })} className="mt-1.5 inline-flex items-center gap-1 text-sm font-semibold underline"><Plus className="w-3.5 h-3.5" aria-hidden /> Add a question</button>}
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        {page && <div><label htmlFor="as-days" className={label}>Days to finish</label><input id="as-days" type="number" min={1} max={14} value={a.deadlineDays} onChange={(e) => set({ deadlineDays: Number(e.target.value) })} className={input} /></div>}
        <div><label htmlFor="as-max" className={label}>Scored out of</label><input id="as-max" type="number" min={1} max={1000} value={a.maxScore} onChange={(e) => set({ maxScore: Number(e.target.value) })} className={input} /></div>
        <div><label htmlFor="as-pass" className={label}>Pass mark <span className="font-normal text-gray-500">(advice)</span></label><input id="as-pass" type="number" min={0} value={a.passMark ?? ''} onChange={(e) => set({ passMark: e.target.value === '' ? null : Number(e.target.value) })} className={input} /></div>
      </div>

      <div>
        <p className={label}>Scoring rubric <span className="font-normal text-gray-500">(optional: reviewers score each 1–5; the total is worked out)</span></p>
        <ul className="space-y-1.5">
          {a.rubric.map((c, i) => (
            <li key={i} className="flex gap-2">
              <label htmlFor={`as-r${i}`} className="sr-only">Criterion {i + 1}</label>
              <input id={`as-r${i}`} value={c.name} maxLength={60} placeholder="e.g. Code quality" onChange={(e) => set({ rubric: a.rubric.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} className={input} />
              <label htmlFor={`as-w${i}`} className="sr-only">Weight for criterion {i + 1}</label>
              <select id={`as-w${i}`} value={c.weight} onChange={(e) => set({ rubric: a.rubric.map((x, j) => (j === i ? { ...x, weight: Number(e.target.value) } : x)) })} className={`${input} w-28`}>
                {[1, 2, 3, 4, 5].map((w) => <option key={w} value={w}>Weight {w}</option>)}
              </select>
              <button type="button" aria-label={`Remove ${c.name || `criterion ${i + 1}`}`} onClick={() => set({ rubric: a.rubric.filter((_, j) => j !== i) })} className={iconBtn}><Trash2 className="w-4 h-4" aria-hidden /></button>
            </li>
          ))}
        </ul>
        {a.rubric.length < LIMITS.rubric && <button type="button" onClick={() => set({ rubric: [...a.rubric, { name: '', weight: 1 }] })} className="mt-1.5 inline-flex items-center gap-1 text-sm font-semibold underline"><Plus className="w-3.5 h-3.5" aria-hidden /> Add a criterion</button>}
      </div>
    </div>
  );
}
