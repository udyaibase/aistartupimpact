'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, CircleHelp, Loader2, Lock, RefreshCw, Sparkles, X } from 'lucide-react';
import type { ApplicationDetail } from '@/lib/employer/applications';
import type { ScreenV3Result } from '@/lib/jobs/ai-screen-v3';
import type { EvidenceLevel } from '@/lib/jobs/resume-score';

export interface AiAccess {
  /** The plan includes AI screening. */
  enabled: boolean;
  /** This viewer may run it (recruiters and owners). */
  canRun: boolean;
  /** This viewer can change the plan (owner). */
  canBuy: boolean;
}

const REC: Record<string, { label: string; cls: string }> = {
  shortlist: { label: 'Suggests shortlist', cls: 'bg-violet-50 text-violet-800 dark:bg-violet-900/30 dark:text-violet-200' },
  consider: { label: 'Worth a look', cls: 'bg-blue-50 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200' },
  weak: { label: 'Weak fit', cls: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
};

const MUST: Record<string, { label: string; icon: React.ReactNode; cls: string }> = {
  evidenced: { label: 'Shown in resume', icon: <Check className="w-3 h-3" aria-hidden />, cls: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' },
  claimed: { label: 'Ticked, not shown in resume', icon: <CircleHelp className="w-3 h-3" aria-hidden />, cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' },
  not_found: { label: 'Not found', icon: <X className="w-3 h-3" aria-hidden />, cls: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' },
};

/** With no readable resume the evidence can only be the candidate's own answers, so the labels say that. */
const mustLabel = (status: string, resumeRead: boolean) =>
  resumeRead ? MUST[status].label : status === 'evidenced' ? 'Shown in their answers' : status === 'claimed' ? 'Ticked only' : MUST[status].label;

const EXP: Record<string, string> = { strong: 'Closely matches this role', some: 'Related work', none: 'Not shown in the resume' };

export default function AiReview({ id, ai, access, onChanged, skipReason = null }: {
  id: string;
  ai: ApplicationDetail['ai'];
  access: AiAccess;
  onChanged: () => void;
  /** Why the automatic review didn't run (it's skipped for failed knockouts and scanned resumes). */
  skipReason?: 'knockout' | 'scanned' | null;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function run(force: boolean) {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/employer/applications/ai-screen', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [id], force }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) setError(d.error || 'AI review failed. Try again.');
      else if (d.failed) setError('AI review failed. Try again in a minute.');
      onChanged();
    } catch {
      setError('You seem to be offline.');
    }
    setBusy(false);
  }

  const heading = (
    <h3 id="ai" className="flex items-center gap-1.5 text-sm font-semibold text-gray-900 dark:text-white mb-2.5">
      <Sparkles className="w-4 h-4 text-violet-600 dark:text-violet-400" aria-hidden /> AI review
    </h3>
  );

  if (!access.enabled) {
    return (
      <section aria-labelledby="ai" className="rounded-[12px] border border-dashed border-violet-300 dark:border-violet-800/70 bg-violet-50/40 dark:bg-violet-950/20 p-3.5">
        {heading}
        <p className="text-[13px] text-gray-600 dark:text-gray-400">
          AI reads the resume against this job, shows which must-haves are really there (with quotes) and suggests questions for the interview.
        </p>
        {access.canBuy ? (
          <Link href="/employer/billing" className="mt-2.5 inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-[10px] bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-[13px] font-semibold">
            <Lock className="w-3.5 h-3.5" aria-hidden /> Available on Featured and Premium
          </Link>
        ) : (
          <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">Available on Featured and Premium. Ask your account owner to upgrade.</p>
        )}
      </section>
    );
  }

  const runButton = (label: string, force: boolean) => access.canRun && (
    <button type="button" onClick={() => run(force)} disabled={busy}
      className="inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-[10px] border border-gray-400 dark:border-gray-700 bg-white dark:bg-transparent text-[13px] font-semibold text-gray-900 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50">
      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : force ? <RefreshCw className="w-3.5 h-3.5" aria-hidden /> : <Sparkles className="w-3.5 h-3.5" aria-hidden />} {label}
    </button>
  );

  if (!ai || ai.status === 'FAILED' || (ai.status === 'DONE' && !ai.result)) {
    return (
      <section aria-labelledby="ai" className="rounded-[12px] border border-violet-300 dark:border-violet-800/70 bg-violet-50 dark:bg-violet-950/30 p-3.5 shadow-sm dark:shadow-none">
        {heading}
        <p className="text-[13px] text-gray-600 dark:text-gray-400 mb-2">
          {ai?.status === 'FAILED' ? 'The last AI review didn’t finish. It wasn’t counted.'
            : skipReason === 'knockout' ? 'Not reviewed automatically: this candidate didn’t meet a must-answer question. Run a review if you still want one.'
            : skipReason === 'scanned' ? 'Not reviewed automatically: the resume is scanned, so AI can’t read it. Open the resume to read it yourself.'
            : 'Not reviewed yet.'}
        </p>
        {runButton(busy ? 'Screening…' : 'Screen with AI', false)}
        {error && <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-400">{error}</p>}
      </section>
    );
  }

  if (ai.status === 'PENDING') {
    return (
      <section aria-labelledby="ai" className="rounded-[12px] border border-violet-300 dark:border-violet-800/70 bg-violet-50 dark:bg-violet-950/30 p-3.5 shadow-sm dark:shadow-none">
        {heading}
        <p className="flex items-center gap-2 text-[13px] text-gray-600 dark:text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> Reviewing this candidate…
        </p>
        <button type="button" onClick={onChanged} className="mt-1 min-h-[36px] text-[13px] font-semibold text-gray-700 dark:text-gray-300 hover:underline">Check again</button>
      </section>
    );
  }

  const r = ai.result!;
  const rec = REC[ai.recommendation ?? 'weak'];
  if ('v' in r && r.v === 3) {
    return <ReviewV3 r={r} fitScore={ai.fitScore ?? 0} rec={rec} stale={ai.stale} heading={heading} canBuy={access.canBuy}
      rerun={runButton(busy ? 'Reviewing…' : 'Re-run (uses 1 review)', true)} error={error} />;
  }
  return (
    <section aria-labelledby="ai" className="rounded-[12px] border border-violet-300 dark:border-violet-800/70 bg-violet-50 dark:bg-violet-950/30 p-3.5 shadow-sm dark:shadow-none">
      <div className="flex items-start justify-between gap-2">
        {heading}
        <span className="flex items-center gap-1.5 shrink-0">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded ${rec.cls}`}>{rec.label}</span>
          <span className="text-xs font-bold tabular-nums text-gray-900 dark:text-white" title="Fit out of 100, worked out from the quoted evidence">{ai.fitScore}</span>
        </span>
      </div>

      {ai.stale && (
        <p className="mb-2 text-[13px] text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 rounded-[8px] px-2.5 py-1.5">
          The job’s requirements changed after this review. Re-run it to compare against the new ones.
        </p>
      )}
      {!r.resumeRead && <p className="mb-2 text-[13px] text-gray-600 dark:text-gray-400">No readable resume, so this is based on the form answers only.</p>}

      {r.summary && <p className="text-sm text-gray-800 dark:text-gray-200">{r.summary}</p>}

      {r.mustHaves.length > 0 && (
        <div className="mt-3 pt-3 border-t border-violet-200 dark:border-violet-900/60">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400 mb-1.5">Must-haves</p>
          <ul className="space-y-1.5">
            {r.mustHaves.map((m) => (
              <li key={m.skill} className="flex items-start gap-2 text-[13px]">
                <span className={`mt-0.5 w-5 h-5 rounded-full grid place-items-center shrink-0 ${MUST[m.status].cls}`}>{MUST[m.status].icon}</span>
                <span className="min-w-0">
                  <span className="font-medium text-gray-900 dark:text-white">{m.skill}</span>
                  <span className="text-gray-600 dark:text-gray-400"> · {mustLabel(m.status, r.resumeRead)}</span>
                  {m.evidence && <q className="block text-gray-600 dark:text-gray-400 italic">{m.evidence}</q>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {r.otherSkills?.length > 0 && (
        <div className="mt-3 pt-3 border-t border-violet-200 dark:border-violet-900/60">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400 mb-1.5">Other skills</p>
          <ul className="flex flex-wrap gap-1.5">
            {r.otherSkills.map((m) => (
              <li key={m.skill} title={mustLabel(m.status, r.resumeRead)} className={`inline-flex items-center gap-1 h-7 px-2 rounded-[8px] text-[13px] ${MUST[m.status].cls}`}>
                {MUST[m.status].icon} {m.skill}<span className="sr-only"> ({mustLabel(m.status, r.resumeRead)})</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {r.experience && (
        <div className="mt-3 pt-3 border-t border-violet-200 dark:border-violet-900/60 text-[13px]">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400 mb-1">Relevant experience</p>
          <span className="text-gray-900 dark:text-white">{r.experience.level === 'none' && !r.resumeRead ? 'Not shown in their answers' : EXP[r.experience.level]}</span>
          {r.experience.evidence && <q className="block text-gray-600 dark:text-gray-400 italic">{r.experience.evidence}</q>}
        </div>
      )}

      {r.strengths.length > 0 && (
        <div className="mt-3 pt-3 border-t border-violet-200 dark:border-violet-900/60">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400 mb-1.5">Strengths</p>
          <ul className="space-y-1.5">
            {r.strengths.map((s, i) => (
              <li key={i} className="text-[13px]">
                <span className="text-gray-900 dark:text-white">{s.point}</span>
                <q className="block text-gray-600 dark:text-gray-400 italic">{s.evidence}</q>
              </li>
            ))}
          </ul>
        </div>
      )}

      {r.gaps.length > 0 && (
        <div className="mt-3 pt-3 border-t border-violet-200 dark:border-violet-900/60">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400 mb-1.5">Not shown</p>
          <ul className="list-disc pl-5 space-y-0.5 text-[13px] text-gray-700 dark:text-gray-300">{r.gaps.map((g, i) => <li key={i}>{g}</li>)}</ul>
        </div>
      )}

      {r.questions.length > 0 && (
        <div className="mt-3 pt-3 border-t border-violet-200 dark:border-violet-900/60">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400 mb-1.5">Ask in the interview</p>
          <ol className="list-decimal pl-5 space-y-0.5 text-[13px] text-gray-700 dark:text-gray-300">{r.questions.map((q, i) => <li key={i}>{q}</li>)}</ol>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {runButton(busy ? 'Reviewing…' : 'Re-run (uses 1 review)', true)}
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-400">{error}</p>}
      <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">
        AI suggestion based on the resume and answers, with names and contact details removed. Every quote is checked against the resume, and the fit number is worked out from those checks, not given by the AI. Read the resume before deciding; a person makes every decision.
      </p>
    </section>
  );
}

const LEVEL: Record<EvidenceLevel, { label: string; cls: string; icon: React.ReactNode }> = {
  used: { label: 'Used in work', cls: 'border-green-300 bg-green-50 text-green-900 dark:border-green-800 dark:bg-green-900/30 dark:text-green-300', icon: <Check className="w-3 h-3" aria-hidden /> },
  related: { label: 'Related work', cls: 'border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-900/30 dark:text-sky-300', icon: <Check className="w-3 h-3" aria-hidden /> },
  listed: { label: 'Listed only', cls: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-300', icon: <CircleHelp className="w-3 h-3" aria-hidden /> },
  claimed: { label: 'Ticked on form only', cls: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-300', icon: <CircleHelp className="w-3 h-3" aria-hidden /> },
  none: { label: 'Not found', cls: 'border-gray-300 bg-white text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300', icon: <X className="w-3 h-3" aria-hidden /> },
};
const CONF: Record<string, string> = {
  High: 'border-green-300 bg-green-50 text-green-900 dark:border-green-800 dark:bg-green-900/30 dark:text-green-300',
  Medium: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  Low: 'border-red-300 bg-red-50 text-red-800 dark:border-red-900/60 dark:bg-red-900/30 dark:text-red-300',
};
const CONF_HINT: Record<string, string> = {
  High: 'Resume read cleanly, every role dated.',
  Medium: 'Some roles have no dates or parts of the resume couldn’t be placed.',
  Low: 'Little could be read from the resume (scanned, or no roles found). Read it yourself.',
};
const REL: Record<string, string> = { same: 'Same kind of work', related: 'Related', unrelated: 'Unrelated' };
const label = 'text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400 mb-1.5';
const divider = 'mt-3 pt-3 border-t border-violet-200 dark:border-violet-900/60';

/** The profile-based review: score with its breakdown, and every requirement with the resume lines that show it. */
function ReviewV3({ r, fitScore, rec, stale, heading, rerun, error, canBuy }: {
  r: ScreenV3Result; fitScore: number; rec: { label: string; cls: string }; stale: boolean; canBuy: boolean;
  heading: React.ReactNode; rerun: React.ReactNode; error: string;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const must = r.requirements.filter((x) => x.must);
  const nice = r.requirements.filter((x) => !x.must);
  const reqList = (xs: ScreenV3Result['requirements']) => (
    <ul className="space-y-1.5">
      {xs.map((q) => {
        const lv = LEVEL[q.level];
        const expanded = open === q.id;
        return (
          <li key={q.id} className="rounded-[10px] border border-violet-200/80 dark:border-violet-900/60 bg-white dark:bg-gray-900/60">
            <button type="button" onClick={() => setOpen(expanded ? null : q.id)} aria-expanded={expanded} disabled={!q.evidence.length}
              className="w-full flex items-center gap-2 px-2.5 py-2 text-left disabled:cursor-default">
              <span className="font-medium text-[13px] text-gray-900 dark:text-white flex-1 min-w-0 truncate">{q.name}</span>
              {q.recent === true && <span className="text-[11px] text-gray-600 dark:text-gray-400 shrink-0" title="Used in their latest 2 years of work">recent</span>}
              <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-semibold ${lv.cls}`}>{lv.icon}{lv.label}</span>
            </button>
            {expanded && q.evidence.length > 0 && (
              <ul className="px-2.5 pb-2 space-y-1.5">
                {q.evidence.map((e) => (
                  <li key={e.line} className="text-[13px]">
                    <q className="block text-gray-800 dark:text-gray-200">{e.text}</q>
                    <span className="block text-[11px] text-gray-600 dark:text-gray-400">Line {e.line} · {e.where}</span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );

  return (
    <section aria-labelledby="ai" className="rounded-[12px] border border-violet-300 dark:border-violet-800/70 bg-violet-50 dark:bg-violet-950/30 p-3.5 shadow-sm dark:shadow-none">
      <div className="flex items-start justify-between gap-2">
        {heading}
        <span className={`text-xs font-semibold px-2 py-0.5 rounded ${rec.cls}`}>{rec.label}</span>
      </div>

      <div className="flex items-end gap-3">
        <p className="font-sora text-3xl font-bold tabular-nums text-gray-900 dark:text-white leading-none">{fitScore}<span className="text-sm font-semibold text-gray-600 dark:text-gray-400">/100</span></p>
        <span className={`mb-0.5 inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-semibold ${CONF[r.confidence]}`} title={CONF_HINT[r.confidence]}>{r.confidence} confidence</span>
      </div>
      <p className="mt-1.5 text-xs font-semibold text-violet-900 dark:text-violet-200">AI suggests, your team decides.</p>
      <p className="text-xs text-gray-600 dark:text-gray-400">{CONF_HINT[r.confidence]}</p>
      {r.tier === 'standard' && (
        <p className="mt-1.5 text-xs text-gray-700 dark:text-gray-300">
          Standard AI review (Free plan). Paid plans use our most accurate model.{' '}
          {canBuy && <Link href="/employer/billing" className="font-semibold text-violet-800 dark:text-violet-300 underline">Compare plans</Link>}
        </p>
      )}

      {stale && <p className="mt-2 text-[13px] text-amber-900 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-800 rounded-[8px] px-2.5 py-1.5">The job’s requirements changed after this review. Re-run it to compare against the new ones.</p>}
      {r.capped && <p className="mt-2 text-[13px] text-amber-900 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-800 rounded-[8px] px-2.5 py-1.5">{r.capped}</p>}
      {r.summary && <p className="mt-2.5 text-sm text-gray-800 dark:text-gray-200">{r.summary}</p>}

      <div className={divider}>
        <p className={label}>How the score adds up</p>
        <ul className="space-y-2">
          {r.breakdown.map((b) => (
            <li key={b.key}>
              <div className="flex items-baseline justify-between gap-2 text-[13px]">
                <span className="font-medium text-gray-900 dark:text-white">{b.label}</span>
                <span className="tabular-nums text-gray-700 dark:text-gray-300">{Math.round(b.earned)} / {Math.round(b.max)}</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-violet-200/70 dark:bg-violet-900/50 overflow-hidden" aria-hidden>
                <div className="h-full rounded-full bg-violet-600 dark:bg-violet-400" style={{ width: `${b.max ? Math.min(100, (b.earned / b.max) * 100) : 0}%` }} />
              </div>
              <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-400">{b.detail}</p>
            </li>
          ))}
        </ul>
      </div>

      {must.length > 0 && <div className={divider}><p className={label}>Must-haves · tap to see the resume lines</p>{reqList(must)}</div>}
      {nice.length > 0 && <div className={divider}><p className={label}>Nice-to-haves</p>{reqList(nice)}</div>}

      {r.roles.length > 0 && (
        <div className={divider}>
          <p className={label}>Experience · {r.relevantYears} of {r.totalYears} yrs relevant</p>
          <ul className="space-y-1">
            {r.roles.map((x, i) => (
              <li key={i} className="flex items-center gap-2 text-[13px]">
                <span className="min-w-0 flex-1 truncate text-gray-900 dark:text-white">{x.title || 'Role'}{x.company && <span className="text-gray-600 dark:text-gray-400"> · {x.company}</span>}{x.internship && <span className="text-gray-600 dark:text-gray-400"> · internship</span>}</span>
                <span className="shrink-0 text-xs text-gray-700 dark:text-gray-300">{x.relevance ? REL[x.relevance] : 'Not rated'}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {r.questions.length > 0 && (
        <div className={divider}>
          <p className={label}>Ask in the interview</p>
          <ol className="list-decimal pl-5 space-y-0.5 text-[13px] text-gray-700 dark:text-gray-300">{r.questions.map((q, i) => <li key={i}>{q}</li>)}</ol>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">{rerun}</div>
      {error && <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-400">{error}</p>}
      <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">
        The AI only points to resume lines; names and contact details are removed first. Every line is checked, skills are also found by code, and the score is worked out from fixed weights, never given by the AI. Time between jobs and college names never count. Never decide on the score alone.
      </p>
    </section>
  );
}

