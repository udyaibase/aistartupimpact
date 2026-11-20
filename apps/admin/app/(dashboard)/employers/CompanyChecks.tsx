'use client';

import { useEffect, useState } from 'react';
import { ShieldCheck, ExternalLink, Loader2, Check, X } from 'lucide-react';
import { getCompanyChecksAction, decideCompanyCheckAction } from './actions';

interface Check {
  id: string; companyName: string; email: string; websiteUrl: string | null; linkedinUrl: string | null; companyCin: string | null;
  companyReview: string; companyReviewRequestedAt: string | null; companyReviewRequestedBy: string | null;
  companyReviewedAt: string | null; companyReviewedBy: string | null; companyReviewNote: string | null;
  startupName: string | null; startupSlug: string | null; waitingJobs: string | null;
}

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://udyaibase.com').replace(/\/$/, '');
const link = 'inline-flex items-center gap-1 text-xs text-brand hover:underline font-jakarta';

/** How long a pending check has waited, in working hours terms the team can act on. */
function waited(iso: string | null) {
  if (!iso) return '';
  const h = (Date.now() - new Date(iso).getTime()) / 36e5;
  return h < 1 ? `${Math.max(1, Math.round(h * 60))} min ago` : h < 48 ? `${Math.round(h)} h ago` : `${Math.round(h / 24)} days ago`;
}

/**
 * The company check queue: a workspace whose startup isn't founder-verified pressed Publish. Check the website,
 * LinkedIn and MCA record the same working day. Passing publishes the waiting jobs (2 live max, "Email verified").
 */
export default function CompanyChecks() {
  const [rows, setRows] = useState<Check[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');

  const load = async () => {
    const r = await getCompanyChecksAction();
    setRows(r.success ? (r.data as Check[]) : []);
    if (!r.success) setMsg(r.error || 'Couldn’t load checks');
  };
  useEffect(() => { void load(); }, []);

  async function decide(c: Check, approve: boolean) {
    const note = (notes[c.id] || '').trim();
    if (!approve && !note) { setMsg('Add a short reason before failing a check; the team sees it.'); return; }
    setBusy(c.id); setMsg('');
    const r = await decideCompanyCheckAction(c.id, approve, note);
    setBusy(null);
    if (!r.success) { setMsg(r.error || 'Failed'); return; }
    setMsg(approve ? `${c.companyName} passed. ${r.published ? `${r.published} job${r.published === 1 ? '' : 's'} went live.` : 'No jobs were waiting.'}` : `${c.companyName} failed; the team was emailed.`);
    void load();
  }

  if (!rows) return null;
  const pending = rows.filter((r) => r.companyReview === 'PENDING');
  const recent = rows.filter((r) => r.companyReview !== 'PENDING');

  return (
    <section className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-5 space-y-4" aria-labelledby="cc-h">
      <div>
        <h2 id="cc-h" className="font-sora font-bold text-base text-navy dark:text-white flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-brand" /> Company checks {pending.length > 0 && <span className="text-xs font-semibold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">{pending.length} waiting</span>}
        </h2>
        <p className="text-xs text-gray-500 font-jakarta mt-1">Same working day (Mon–Sat, 9:30–18:30 IST). Check the website is real and matches the email domain, the LinkedIn page, and the MCA record (mca.gov.in, by CIN or name). Passing allows 2 live jobs with an “Email verified” label.</p>
      </div>
      {msg && <p role="status" className="text-sm font-jakarta text-gray-700 dark:text-gray-300">{msg}</p>}
      {pending.length === 0 && <p className="text-sm text-gray-400 font-jakarta">Nothing waiting.</p>}
      <ul className="space-y-3">
        {pending.map((c) => (
          <li key={c.id} className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-2">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h3 className="font-sora font-semibold text-sm text-navy dark:text-white">{c.companyName}</h3>
              <span className="text-xs text-gray-500 font-jakarta">asked {waited(c.companyReviewRequestedAt)} by {c.companyReviewRequestedBy}</span>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {c.websiteUrl && <a className={link} href={c.websiteUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="w-3 h-3" /> Website</a>}
              {c.linkedinUrl ? <a className={link} href={c.linkedinUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="w-3 h-3" /> LinkedIn</a> : <span className="text-xs text-gray-400">No LinkedIn given</span>}
              <span className="text-xs text-gray-600 dark:text-gray-400 font-jakarta">CIN/LLPIN: {c.companyCin || 'not given'}</span>
              {c.startupSlug && <a className={link} href={`${SITE}/startups/${c.startupSlug}`} target="_blank" rel="noopener noreferrer"><ExternalLink className="w-3 h-3" /> {c.startupName}</a>}
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400 font-jakarta">Waiting jobs: {c.waitingJobs || 'none'}</p>
            <div className="flex flex-col sm:flex-row gap-2">
              <input aria-label={`Reason for ${c.companyName} (needed to fail)`} placeholder="Reason the team sees if it fails (e.g. website doesn’t mention the company)" value={notes[c.id] || ''} onChange={(e) => setNotes({ ...notes, [c.id]: e.target.value })} className="input-field flex-1 text-sm" maxLength={300} />
              <button type="button" disabled={busy === c.id} onClick={() => decide(c, true)} className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-green-600 text-white text-sm font-semibold disabled:opacity-50">
                {busy === c.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Pass
              </button>
              <button type="button" disabled={busy === c.id} onClick={() => decide(c, false)} className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-red-300 text-red-700 text-sm font-semibold disabled:opacity-50">
                <X className="w-4 h-4" /> Fail
              </button>
            </div>
          </li>
        ))}
      </ul>
      {recent.length > 0 && (
        <details>
          <summary className="text-xs font-semibold text-gray-500 cursor-pointer font-jakarta">Decided in the last 14 days ({recent.length})</summary>
          <ul className="mt-2 space-y-1">
            {recent.map((c) => (
              <li key={c.id} className="text-xs text-gray-600 dark:text-gray-400 font-jakarta">
                <span className={c.companyReview === 'APPROVED' ? 'text-green-700' : 'text-red-700'}>{c.companyReview === 'APPROVED' ? 'Passed' : 'Failed'}</span> · {c.companyName} · by {c.companyReviewedBy} {waited(c.companyReviewedAt)}{c.companyReviewNote ? ` · “${c.companyReviewNote}”` : ''}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
