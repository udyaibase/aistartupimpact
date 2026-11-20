'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, Loader2, Minus, Scale, X } from 'lucide-react';

interface Finalist {
  id: string; fullName: string; status: string; currentTitle: string | null; currentCompany: string | null;
  mustHaves: { skill: string; met: boolean }[];
  assessment: { score: number | null; maxScore: number | null; passMark: number | null; status: string; kind: string } | null;
  rounds: { round: string; cards: { author: string; recommendation: 'YES' | 'NO'; ratings: Record<string, number> }[]; pending: string[]; disagreement: { conflict: boolean; skills: string[] } }[];
  ai: { fitScore: number | null; strengths: string[]; gaps: string[] } | null;
  salaryAskLakh: number | null; noticePeriodDays: number | null;
  lastDecision: { decision: string; reason: string; by: string; at: string } | null;
}
interface Data { job: { title: string; rounds: string[]; band: { minLakh: number | null; maxLakh: number | null } | null; decisionOwner: string }; finalists: Finalist[]; canDecide: boolean }

const avg = (cards: Finalist['rounds'][number]['cards']) => {
  const v = cards.flatMap((c) => Object.values(c.ratings));
  return v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : null;
};

/**
 * Finalists side by side, evidence first: must-haves, assessment, each round's scorecards (missing ones shown as
 * Feedback pending, disagreements flagged), AI strengths and gaps, salary against the band, notice period.
 * Source isn't shown: it's for reports, not for choosing between people.
 */
export default function CompareFinalists({ jobId, onClose, onOpen }: { jobId: string; onClose: () => void; onOpen: (id: string) => void }) {
  const [d, setD] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    fetch(`/api/employer/jobs/${jobId}/finalists`).then(async (r) => { const data = await r.json(); if (r.ok) setD(data); else setError(data.error || 'Couldn’t load.'); }).catch(() => setError('You seem to be offline.'));
    titleRef.current?.focus();
  }, [jobId]);
  const th = 'text-left align-top px-3 py-2 text-xs font-semibold text-gray-500 w-36';
  const td = 'align-top px-3 py-2 text-[13px] text-gray-800 dark:text-gray-200 min-w-[180px]';

  return (
    <div className="fixed inset-0 z-dialog flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}>
      <div role="dialog" aria-modal="true" aria-labelledby="cmp-title" className="w-full sm:max-w-5xl max-h-[92dvh] overflow-auto rounded-t-[16px] sm:rounded-[16px] bg-white dark:bg-gray-900 p-4 sm:p-6 shadow-xl font-jakarta">
        <div className="flex items-start gap-2 mb-3">
          <h2 id="cmp-title" ref={titleRef} tabIndex={-1} className="portal-dialog-title flex-1 flex items-center gap-2"><Scale className="w-5 h-5" aria-hidden /> Compare finalists{d ? `: ${d.job.title}` : ''}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="w-9 h-9 flex items-center justify-center rounded-[8px] hover:bg-gray-100 dark:hover:bg-gray-800"><X className="w-4 h-4" aria-hidden /></button>
        </div>
        {!d ? (error ? <p role="alert" className="text-sm text-red-700">{error}</p> : <Loader2 className="w-5 h-5 animate-spin text-gray-400" aria-label="Loading" />) : d.finalists.length === 0 ? (
          <p className="text-sm text-gray-600 dark:text-gray-400">Nobody is in Final decision yet. Move candidates there after their last interview.</p>
        ) : (
          <>
            <p className="mb-3 text-[13px] text-gray-600 dark:text-gray-400">Decided by <strong>{d.job.decisionOwner}</strong>{d.canDecide ? ' (you can record it: open a candidate)' : ''}.</p>
            <table className="w-full border-collapse">
              <thead><tr className="border-b border-gray-200 dark:border-gray-800"><th className={th} scope="col"><span className="sr-only">Evidence</span></th>
                {d.finalists.map((f) => <th key={f.id} scope="col" className={`${td} text-left`}><button type="button" onClick={() => onOpen(f.id)} className="font-bold text-gray-900 dark:text-white underline">{f.fullName}</button><span className="block text-xs font-normal text-gray-500">{[f.currentTitle, f.currentCompany].filter(Boolean).join(' at ')}</span></th>)}
              </tr></thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                <tr><th scope="row" className={th}>Must-haves</th>{d.finalists.map((f) => <td key={f.id} className={td}><ul className="space-y-0.5">{f.mustHaves.map((m) => <li key={m.skill} className="flex items-center gap-1">{m.met ? <Check className="w-3.5 h-3.5 text-green-600" aria-hidden /> : <Minus className="w-3.5 h-3.5 text-gray-400" aria-hidden />}<span className={m.met ? '' : 'text-gray-500'}>{m.skill}</span><span className="sr-only">{m.met ? ' (has)' : ' (not shown)'}</span></li>)}</ul></td>)}</tr>
                <tr><th scope="row" className={th}>Assessment</th>{d.finalists.map((f) => <td key={f.id} className={td}>{f.assessment ? (f.assessment.score != null ? <>{f.assessment.score}/{f.assessment.maxScore}{f.assessment.passMark != null && <span className="text-xs text-gray-500"> (pass {f.assessment.passMark})</span>}</> : f.assessment.status === 'SUBMITTED' ? 'Submitted, not scored' : 'Not submitted') : '—'}</td>)}</tr>
                {d.job.rounds.map((round, ri) => (
                  <tr key={round}><th scope="row" className={th}>{round}</th>{d.finalists.map((f) => {
                    const r = f.rounds[ri];
                    return (
                      <td key={f.id} className={td}>
                        {r.cards.length === 0 && r.pending.length === 0 && <span className="text-gray-400">—</span>}
                        {r.cards.map((c, i) => <span key={i} className="block"><span className={`text-xs font-bold px-1.5 rounded ${c.recommendation === 'YES' ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-800'}`}>{c.recommendation === 'YES' ? 'Yes' : 'No'}</span> {c.author}</span>)}
                        {avg(r.cards) && <span className="block text-xs text-gray-500">Average rating {avg(r.cards)} / 4</span>}
                        {r.pending.length > 0 && <span className="block text-xs font-semibold text-amber-700">Feedback pending: {r.pending.map((e) => e.split('@')[0]).join(', ')}</span>}
                        {r.disagreement.conflict && <span className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-red-700"><AlertTriangle className="w-3.5 h-3.5" aria-hidden /> Interviewers disagree{r.disagreement.skills.length ? ` on ${r.disagreement.skills.join(', ')}` : ''}: discuss before deciding</span>}
                      </td>
                    );
                  })}</tr>
                ))}
                <tr><th scope="row" className={th}>AI: strengths</th>{d.finalists.map((f) => <td key={f.id} className={td}>{f.ai?.strengths.length ? <ul className="list-disc pl-4">{f.ai.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul> : '—'}</td>)}</tr>
                <tr><th scope="row" className={th}>AI: gaps</th>{d.finalists.map((f) => <td key={f.id} className={td}>{f.ai?.gaps.length ? <ul className="list-disc pl-4">{f.ai.gaps.map((s, i) => <li key={i}>{s}</li>)}</ul> : '—'}</td>)}</tr>
                <tr><th scope="row" className={th}>Salary asked</th>{d.finalists.map((f) => {
                  const over = f.salaryAskLakh != null && d.job.band?.maxLakh != null && f.salaryAskLakh > d.job.band.maxLakh;
                  return <td key={f.id} className={td}>{f.salaryAskLakh != null ? <span className={over ? 'text-amber-700 font-semibold' : ''}>₹{f.salaryAskLakh} L{over ? ' (above band)' : ''}</span> : '—'}{d.job.band && <span className="block text-xs text-gray-500">Band ₹{d.job.band.minLakh ?? '?'}–{d.job.band.maxLakh ?? '?'} L</span>}</td>;
                })}</tr>
                <tr><th scope="row" className={th}>Notice period</th>{d.finalists.map((f) => <td key={f.id} className={td}>{f.noticePeriodDays == null ? '—' : f.noticePeriodDays === 0 ? 'Immediate' : `${f.noticePeriodDays} days`}</td>)}</tr>
                <tr><th scope="row" className={th}>Decision</th>{d.finalists.map((f) => <td key={f.id} className={td}>{f.lastDecision ? <>{f.lastDecision.decision === 'PROCEED' ? 'Proceed to offer' : f.lastDecision.decision === 'BACKUP' ? 'Backup' : 'Not moving ahead'}<span className="block text-xs text-gray-500">“{f.lastDecision.reason}” · {f.lastDecision.by.split('@')[0]}</span></> : <span className="text-gray-400">Not decided</span>}</td>)}</tr>
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}
