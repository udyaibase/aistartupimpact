'use client';

import { useState } from 'react';
import { Check, FileText, Loader2, Quote, Sparkles } from 'lucide-react';
import type { SharedCandidate, Vote } from '@/lib/employer/shortlist-share';

const VOTE_LABEL: Record<Vote, string> = { YES: 'Yes', MAYBE: 'Maybe', NO: 'No' };
const VOTE_STYLE: Record<Vote, string> = {
  YES: 'border-green-600 bg-green-600 text-white',
  MAYBE: 'border-amber-500 bg-amber-500 text-white',
  NO: 'border-gray-700 bg-gray-700 text-white',
};

export default function ShortlistVoting({ token, data }: {
  token: string;
  data: { sharedWithName: string; jobTitle: string; company: string; expiresAt: string; candidates: SharedCandidate[] };
}) {
  const [votes, setVotes] = useState<Record<string, { vote: Vote | null; comment: string }>>(
    Object.fromEntries(data.candidates.map((c) => [c.id, { vote: c.vote, comment: c.comment ?? '' }])),
  );
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState('');
  const done = Object.values(votes).filter((v) => v.vote).length;

  async function save(id: string, vote: Vote, comment: string) {
    setSaving(id); setError('');
    try {
      const res = await fetch(`/api/hiring/shortlist/${token}/vote`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ applicationId: id, vote, comment }) });
      const d = await res.json().catch(() => ({}));
      if (res.ok) setVotes((v) => ({ ...v, [id]: { vote, comment } }));
      else setError(d.error || 'Couldn’t save. Try again.');
    } catch { setError('You seem to be offline. Your vote wasn’t saved.'); }
    setSaving(null);
  }

  const until = new Date(data.expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 sm:py-12 font-jakarta">
      <p className="text-sm text-gray-600 dark:text-gray-400">{data.company} · shared with {data.sharedWithName}</p>
      <h1 className="font-sora font-bold text-2xl text-gray-900 dark:text-white mt-1">Shortlist: {data.jobTitle}</h1>
      <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">Say yes, maybe or no to each candidate. The hiring team sees your answers right away. {done} of {data.candidates.length} done · link works until {until}.</p>
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}

      {data.candidates.length === 0 ? (
        <p className="mt-8 text-gray-600 dark:text-gray-400">Nobody is on the shortlist yet. Check back later.</p>
      ) : (
        <ol className="mt-6 space-y-4">
          {data.candidates.map((c) => {
            const v = votes[c.id];
            return (
              <li key={c.id} className="rounded-[14px] border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="text-[16px] font-semibold text-gray-900 dark:text-white">{c.fullName}</h2>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{[c.currentTitle, c.currentCompany].filter(Boolean).join(' at ') || 'Candidate'}{c.city ? ` · ${c.city}` : ''}</p>
                  </div>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">{c.stage}</span>
                </div>
                <p className="flex flex-wrap gap-1.5 mt-2 text-[12px]">
                  {c.ai?.fitScore != null && <span className="inline-flex items-center gap-1 font-semibold px-1.5 py-0.5 rounded bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200"><Sparkles className="w-3 h-3" aria-hidden /> AI fit {c.ai.fitScore}</span>}
                  <span className="font-semibold px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">{c.matchScore}% match</span>
                  {c.experienceYears != null && <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">{c.experienceYears} yrs</span>}
                  {c.noticePeriodDays != null && <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">{c.noticePeriodDays === 0 ? 'Can join now' : `${c.noticePeriodDays}d notice`}</span>}
                  {c.expectedCtcLakh != null && <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">Expects ₹{c.expectedCtcLakh} L</span>}
                </p>
                {c.ai && (
                  <div className="mt-3 space-y-1.5 text-[13.5px]">
                    {c.ai.summary && <p className="text-gray-800 dark:text-gray-200">{c.ai.summary}</p>}
                    {c.ai.strengths.map((s, i) => (
                      <p key={i}>
                        <span className="flex items-start gap-1.5 font-medium text-gray-900 dark:text-white"><Check className="w-3.5 h-3.5 mt-0.5 text-green-600 shrink-0" aria-hidden />{s.point}</span>
                        {s.evidence && <span className="ml-5 flex items-start gap-1 italic text-gray-600 dark:text-gray-400"><Quote className="w-3 h-3 mt-1 shrink-0 opacity-60" aria-hidden />{s.evidence}</span>}
                      </p>
                    ))}
                  </div>
                )}
                {c.skillsMatched.length > 0 && <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">Has: {c.skillsMatched.join(', ')}</p>}
                {c.hasResume && (
                  <a href={`/api/hiring/shortlist/${token}/resume/${c.id}`} className="mt-3 inline-flex items-center gap-1.5 min-h-[40px] text-sm font-semibold text-gray-800 dark:text-gray-200 hover:underline">
                    <FileText className="w-4 h-4" aria-hidden /> Download resume
                  </a>
                )}
                <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                  <div role="radiogroup" aria-label={`Your answer for ${c.fullName}`} className="flex flex-wrap items-center gap-2">
                    {(['YES', 'MAYBE', 'NO'] as Vote[]).map((opt) => (
                      <button key={opt} type="button" role="radio" aria-checked={v.vote === opt} disabled={saving === c.id}
                        onClick={() => save(c.id, opt, v.comment)}
                        className={`min-h-[40px] min-w-[72px] px-3 rounded-[10px] border text-sm font-semibold ${v.vote === opt ? VOTE_STYLE[opt] : 'border-gray-300 dark:border-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                        {VOTE_LABEL[opt]}
                      </button>
                    ))}
                    {saving === c.id && <Loader2 className="w-4 h-4 animate-spin text-gray-400" aria-label="Saving" />}
                  </div>
                  <label htmlFor={`cm-${c.id}`} className="sr-only">Comment for the team</label>
                  <input id={`cm-${c.id}`} value={v.comment} maxLength={300} placeholder="Add a comment for the team (optional)"
                    onChange={(e) => setVotes((x) => ({ ...x, [c.id]: { ...x[c.id], comment: e.target.value } }))}
                    onBlur={() => v.vote && v.comment !== (data.candidates.find((x) => x.id === c.id)?.comment ?? '') && save(c.id, v.vote, v.comment)}
                    className="mt-2 w-full min-h-[40px] px-3 rounded-[10px] border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-sm text-gray-900 dark:text-white" />
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <p className="mt-8 text-xs text-gray-500">Contact details are kept private. This page is only for you; please don’t forward the link.</p>
    </div>
  );
}
