'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, CircleHelp, Loader2, Lock, RefreshCw, Sparkles, X } from 'lucide-react';
import type { ApplicationDetail } from '@/lib/employer/applications';

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

const EXP: Record<string, string> = { strong: 'Closely matches this role', some: 'Related work', none: 'Not shown in the resume' };

export default function AiReview({ id, ai, access, onChanged }: {
  id: string;
  ai: ApplicationDetail['ai'];
  access: AiAccess;
  onChanged: () => void;
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
    <h3 id="ai" className="flex items-center gap-1.5 text-sm font-semibold text-gray-900 dark:text-white mb-2">
      <Sparkles className="w-4 h-4 text-violet-600 dark:text-violet-400" aria-hidden /> AI review
    </h3>
  );

  if (!access.enabled) {
    return (
      <section aria-labelledby="ai" className="rounded-[12px] border border-dashed border-violet-200 dark:border-violet-900/60 p-3.5">
        {heading}
        <p className="text-[13px] text-gray-600 dark:text-gray-400">
          AI reads the resume against this job, shows which must-haves are really there (with quotes) and suggests questions for the interview.
        </p>
        {access.canBuy ? (
          <Link href="/employer/billing" className="mt-2.5 inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-[10px] bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-[13px] font-semibold">
            <Lock className="w-3.5 h-3.5" aria-hidden /> Available on Featured and Premium
          </Link>
        ) : (
          <p className="mt-2 text-xs text-gray-500">Available on Featured and Premium. Ask your account owner to upgrade.</p>
        )}
      </section>
    );
  }

  const runButton = (label: string, force: boolean) => access.canRun && (
    <button type="button" onClick={() => run(force)} disabled={busy}
      className="inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-[10px] border border-gray-300 dark:border-gray-700 text-[13px] font-semibold text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50">
      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : force ? <RefreshCw className="w-3.5 h-3.5" aria-hidden /> : <Sparkles className="w-3.5 h-3.5" aria-hidden />} {label}
    </button>
  );

  if (!ai || ai.status === 'FAILED' || (ai.status === 'DONE' && !ai.result)) {
    return (
      <section aria-labelledby="ai">
        {heading}
        <p className="text-[13px] text-gray-600 dark:text-gray-400 mb-2">
          {ai?.status === 'FAILED' ? 'The last AI review didn’t finish. It wasn’t counted.' : 'Not reviewed yet.'}
        </p>
        {runButton(busy ? 'Reviewing…' : 'Review with AI', false)}
        {error && <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-400">{error}</p>}
      </section>
    );
  }

  if (ai.status === 'PENDING') {
    return (
      <section aria-labelledby="ai">
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
  return (
    <section aria-labelledby="ai" className="rounded-[12px] border border-violet-100 dark:border-violet-900/50 bg-violet-50/40 dark:bg-violet-950/20 p-3.5">
      <div className="flex items-start justify-between gap-2">
        {heading}
        <span className="flex items-center gap-1.5 shrink-0">
          <span className={`text-[12px] font-semibold px-2 py-0.5 rounded ${rec.cls}`}>{rec.label}</span>
          <span className="text-[12px] font-bold tabular-nums text-gray-900 dark:text-white" title="Fit out of 100, worked out from the quoted evidence">{ai.fitScore}</span>
        </span>
      </div>

      {ai.stale && (
        <p className="mb-2 text-[12.5px] text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 rounded-[8px] px-2.5 py-1.5">
          The job’s requirements changed after this review. Re-run it to compare against the new ones.
        </p>
      )}
      {!r.resumeRead && <p className="mb-2 text-[12.5px] text-gray-600 dark:text-gray-400">No readable resume, so this is based on the form answers only.</p>}

      {r.summary && <p className="text-[13.5px] text-gray-800 dark:text-gray-200">{r.summary}</p>}

      {r.mustHaves.length > 0 && (
        <div className="mt-3">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">Must-haves</p>
          <ul className="space-y-1.5">
            {r.mustHaves.map((m) => (
              <li key={m.skill} className="flex items-start gap-2 text-[13px]">
                <span className={`mt-0.5 w-5 h-5 rounded-full grid place-items-center shrink-0 ${MUST[m.status].cls}`}>{MUST[m.status].icon}</span>
                <span className="min-w-0">
                  <span className="font-medium text-gray-900 dark:text-white">{m.skill}</span>
                  <span className="text-gray-500"> · {MUST[m.status].label}</span>
                  {m.evidence && <q className="block text-gray-600 dark:text-gray-400 italic">{m.evidence}</q>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {r.otherSkills?.length > 0 && (
        <div className="mt-3">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">Other skills</p>
          <ul className="flex flex-wrap gap-1.5">
            {r.otherSkills.map((m) => (
              <li key={m.skill} title={MUST[m.status].label} className={`inline-flex items-center gap-1 h-7 px-2 rounded-[8px] text-[12.5px] ${MUST[m.status].cls}`}>
                {MUST[m.status].icon} {m.skill}<span className="sr-only"> ({MUST[m.status].label})</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {r.experience && (
        <div className="mt-3 text-[13px]">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-gray-500 mb-1">Relevant experience</p>
          <span className="text-gray-900 dark:text-white">{EXP[r.experience.level]}</span>
          {r.experience.evidence && <q className="block text-gray-600 dark:text-gray-400 italic">{r.experience.evidence}</q>}
        </div>
      )}

      {r.strengths.length > 0 && (
        <div className="mt-3">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">Strengths</p>
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
        <div className="mt-3">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">Not shown</p>
          <ul className="list-disc pl-5 space-y-0.5 text-[13px] text-gray-700 dark:text-gray-300">{r.gaps.map((g, i) => <li key={i}>{g}</li>)}</ul>
        </div>
      )}

      {r.questions.length > 0 && (
        <div className="mt-3">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">Ask in the interview</p>
          <ol className="list-decimal pl-5 space-y-0.5 text-[13px] text-gray-700 dark:text-gray-300">{r.questions.map((q, i) => <li key={i}>{q}</li>)}</ol>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {runButton(busy ? 'Reviewing…' : 'Re-run (uses 1 review)', true)}
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-400">{error}</p>}
      <p className="mt-2 text-xs text-gray-500">
        AI suggestion based on the resume and answers, with names and contact details removed. Every quote is checked against the resume, and the fit number is worked out from those checks, not given by the AI. Read the resume before deciding; a person makes every decision.
      </p>
    </section>
  );
}
