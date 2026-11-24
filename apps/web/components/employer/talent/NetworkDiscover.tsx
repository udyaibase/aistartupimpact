'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Check, Loader2, Search, Send, ShieldCheck, Target, X } from 'lucide-react';
import NetworkCardView from '@/components/network/NetworkCardView';
import { EXPERIENCE_RANGES, type ExperienceRange } from '@/lib/employer/talent-filters';
import { MESSAGE_MAX, MESSAGE_MIN, REQUEST_EXPIRE_DAYS, networkFit, WORK_MODES, type IntroStatus, type NetworkCard, type WorkMode } from '@/lib/network/rules';
import TalentTabs from './TalentTabs';

const card = 'bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-800 rounded-[14px] shadow-sm dark:shadow-none';
const input = 'min-h-[40px] px-3 rounded-[10px] border border-gray-400 dark:border-gray-700 bg-white dark:bg-gray-950 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#A50F15]/25 focus:border-[#A50F15]';
const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
const PAGE = 50;

interface Job { id: string; title: string; skills: string[]; mustHaveSkills: string[]; experienceMin: number | null; experienceMax: number | null }
interface Sent { id: string; jobTitle: string; headline: string; status: IntroStatus; statusText: string; createdAt: string; applicationId: string | null }
interface Access { allowed: boolean; reason: 'ok' | 'not_in_pilot' | 'paused'; allowance: number; used: number; left: number }

const fit = networkFit;

export default function NetworkDiscover({ people: initial, jobs, access: initialAccess, canRequest, sent: initialSent }: {
  people: NetworkCard[]; jobs: Job[]; access: Access; canRequest: boolean; sent: Sent[];
}) {
  const [people, setPeople] = useState(initial);
  const [access, setAccess] = useState(initialAccess);
  const [sent, setSent] = useState(initialSent);
  const [q, setQ] = useState('');
  const [skill, setSkill] = useState('');
  const [exp, setExp] = useState<ExperienceRange>('');
  const [mode, setMode] = useState<'' | WorkMode>('');
  const [roleId, setRoleId] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [asking, setAsking] = useState<string | null>(null);
  const [toast, setToast] = useState('');

  const role = jobs.find((j) => j.id === roleId) ?? null;
  const skills = useMemo(() => Array.from(new Set(people.flatMap((p) => p.skills))).sort(), [people]);
  const shown = useMemo(() => {
    const r = EXPERIENCE_RANGES[exp];
    const list = people.filter((p) =>
      (!q || `${p.headline} ${p.city ?? ''} ${p.skills.join(' ')}`.toLowerCase().includes(q.toLowerCase()))
      && (!skill || p.skills.includes(skill))
      && (r.min == null && r.max == null || (p.experienceYears != null && (r.min == null || p.experienceYears >= r.min) && (r.max == null || p.experienceYears <= r.max)))
      && (!mode || p.workMode === mode || p.workMode === 'ANY'))
      .map((p) => ({ p, score: role ? fit(p, role) : null }));
    if (role) list.sort((a, b) => b.score! - a.score!);
    return list;
  }, [people, q, skill, exp, mode, role]);

  const paused = access.reason === 'paused';
  const canAsk = canRequest && access.allowed && access.left > 0 && jobs.length > 0;

  return (
    <div className="font-jakarta space-y-5">
      <div>
        <h1 className="portal-title">Talent</h1>
        <TalentTabs active="network" />
        <p className="portal-subtitle mt-3">
          Job seekers who chose to be found. You see their skills and experience, not who they are. Send a personal request for one of your open jobs; if they accept, they apply like anyone else and you get their details with the application.
        </p>
      </div>

      <div className={`${card} p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4`}>
        <span className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"><ShieldCheck className="w-4 h-4 text-[#A50F15]" aria-hidden /> Pilot</span>
        <span className="text-sm text-gray-900 dark:text-white font-semibold tabular-nums">{access.left} of {access.allowance} requests left this month</span>
        <span className="text-[13px] text-gray-500">One request per person every 90 days. Requests close after {REQUEST_EXPIRE_DAYS} days without a reply.</span>
      </div>
      {paused && (
        <p role="alert" className="rounded-[12px] border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
          Requests are paused for your company while our team reviews a report from a job seeker. This usually takes a working day. You can still see the list.
        </p>
      )}

      {jobs.length > 0 && (
        <div className={`${card} p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3`}>
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white shrink-0"><Target className="w-4 h-4 text-[#A50F15]" aria-hidden /> Rank for a role</span>
          <label htmlFor="nw-role" className="sr-only">Role</label>
          <select id="nw-role" value={roleId} onChange={(e) => { setRoleId(e.target.value); setLimit(PAGE); }} className={`${input} sm:max-w-xs w-full`}>
            <option value="">Choose an open role</option>
            {jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
          </select>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" aria-hidden />
          <label htmlFor="nw-q" className="sr-only">Search the network</label>
          <input id="nw-q" type="search" value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} placeholder="Search role, city, skill" className={`${input} w-full pl-9`} />
        </div>
        <select aria-label="Skill" value={skill} onChange={(e) => { setSkill(e.target.value); setLimit(PAGE); }} className={input}>
          <option value="">Any skill</option>{skills.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select aria-label="Experience" value={exp} onChange={(e) => { setExp(e.target.value as ExperienceRange); setLimit(PAGE); }} className={input}>
          {(Object.keys(EXPERIENCE_RANGES) as ExperienceRange[]).map((k) => <option key={k} value={k}>{EXPERIENCE_RANGES[k].label}</option>)}
        </select>
        <select aria-label="Work preference" value={mode} onChange={(e) => { setMode(e.target.value as '' | WorkMode); setLimit(PAGE); }} className={input}>
          <option value="">Any work preference</option>
          {(['REMOTE', 'HYBRID', 'ONSITE'] as WorkMode[]).map((k) => <option key={k} value={k}>{WORK_MODES[k]}</option>)}
        </select>
        <span className="text-sm text-gray-500 tabular-nums">{shown.length} of {people.length}</span>
      </div>

      {people.length === 0 ? (
        <div className={`${card} px-4 py-12 text-center`}>
          <p className="portal-item-title">No one to show yet</p>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 max-w-md mx-auto">The network is new. As job seekers turn on “Open to opportunities”, they appear here. People who already applied to you are in your talent pool instead.</p>
        </div>
      ) : shown.length === 0 ? (
        <p className={`${card} px-4 py-8 text-center text-sm text-gray-600 dark:text-gray-400`}>No one matches these filters.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {shown.slice(0, limit).map(({ p, score }) => (
            <li key={p.id} className="min-w-0">
              <NetworkCardView
                card={p}
                footer={asking === p.id ? (
                  <RequestForm person={p} jobs={jobs} defaultJob={roleId} onCancel={() => setAsking(null)}
                    onSent={(left, jobTitle, id) => {
                      setAccess((a) => ({ ...a, left, used: a.used + 1 }));
                      setPeople((ps) => ps.map((x) => (x.id === p.id ? { ...x, requestedAt: new Date().toISOString() } : x)));
                      setSent((s) => [{ id, jobTitle, headline: p.headline, status: 'PENDING', statusText: 'Waiting for a reply', createdAt: new Date().toISOString(), applicationId: null }, ...s]);
                      setAsking(null);
                      setToast('Request sent. We’ve emailed them; you’ll see their answer below.');
                    }}
                    onError={setToast} />
                ) : (
                  <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
                    {p.requestedAt ? (
                      <span className="inline-flex items-center gap-1 text-[13px] text-gray-600 dark:text-gray-400 min-h-[40px]"><Check className="w-3.5 h-3.5" aria-hidden /> Requested on {fmt(p.requestedAt)}</span>
                    ) : canRequest ? (
                      <button type="button" disabled={!canAsk} onClick={() => setAsking(p.id)}
                        title={!access.allowed ? 'Requests are paused' : access.left < 1 ? 'No requests left this month' : jobs.length === 0 ? 'Publish a job first' : undefined}
                        className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3.5 rounded-[10px] bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold disabled:opacity-50">
                        <Send className="w-4 h-4" aria-hidden /> Ask to apply
                      </button>
                    ) : <span className="text-[13px] text-gray-500">Only owners and recruiters can send requests.</span>}
                  </div>
                )}
              >
                {score != null && (
                  <span className={`shrink-0 text-xs font-bold px-2 py-1 rounded-[8px] tabular-nums ${score >= 75 ? 'border border-green-300 bg-green-50 text-green-900 dark:border-transparent dark:bg-green-900/30 dark:text-green-300' : score >= 50 ? 'border border-blue-300 bg-blue-50 text-blue-900 dark:border-transparent dark:bg-blue-900/30 dark:text-blue-300' : 'border border-gray-300 bg-gray-50 text-gray-800 dark:border-transparent dark:bg-gray-800 dark:text-gray-300'}`}
                    title="Fit for the chosen role">{score}% fit</span>
                )}
              </NetworkCardView>
            </li>
          ))}
        </ul>
      )}
      {shown.length > limit && (
        <div className="text-center">
          <button type="button" onClick={() => setLimit((l) => l + PAGE)} className="min-h-[44px] px-5 rounded-[10px] border border-gray-400 dark:border-gray-700 text-sm font-semibold text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800">
            Show more · {shown.length - limit} left
          </button>
        </div>
      )}

      <section aria-labelledby="nw-sent">
        <h2 id="nw-sent" className="portal-section-title">Your requests</h2>
        {sent.length === 0 ? (
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">None yet.</p>
        ) : (
          <ul className={`${card} mt-2 divide-y divide-gray-100 dark:divide-gray-800`}>
            {sent.map((r) => (
              <li key={r.id} className="px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="min-w-0 flex-1 text-sm text-gray-900 dark:text-white"><span className="font-semibold">{r.headline}</span> <span className="text-gray-600 dark:text-gray-400">· {r.jobTitle} · {fmt(r.createdAt)}</span></span>
                {r.applicationId ? (
                  <Link href={`/employer/applications?candidate=${r.applicationId}`} className="text-sm font-semibold text-[#A50F15] hover:underline">Applied: open</Link>
                ) : (
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${r.status === 'ACCEPTED' ? 'border border-green-300 bg-green-50 text-green-900 dark:border-transparent dark:bg-green-900/30 dark:text-green-300' : 'border border-gray-300 bg-gray-50 text-gray-800 dark:border-transparent dark:bg-gray-800 dark:text-gray-300'}`}>{r.statusText}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {toast && (
        <div role="status" className="fixed z-toast left-1/2 -translate-x-1/2 bottom-[calc(5rem+env(safe-area-inset-bottom))] md:bottom-6 flex items-center gap-3 px-4 py-3 rounded-[12px] bg-gray-900 text-white text-sm shadow-xl max-w-[92vw]">
          <span>{toast}</span>
          <button onClick={() => setToast('')} aria-label="Dismiss" className="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-800"><X className="w-4 h-4" aria-hidden /></button>
        </div>
      )}
    </div>
  );
}

function RequestForm({ person, jobs, defaultJob, onCancel, onSent, onError }: {
  person: NetworkCard; jobs: Job[]; defaultJob: string; onCancel: () => void;
  onSent: (left: number, jobTitle: string, id: string) => void; onError: (s: string) => void;
}) {
  const [listingId, setListingId] = useState(defaultJob || jobs[0]?.id || '');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const len = message.trim().length;

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch('/api/employer/network/requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profileId: person.id, listingId, message }) });
      const d = await res.json().catch(() => ({}));
      if (res.ok) onSent(d.left, jobs.find((j) => j.id === listingId)?.title ?? '', d.id);
      else onError(d.error || 'Couldn’t send the request.');
    } catch { onError('You seem to be offline.'); }
    setBusy(false);
  }

  return (
    <form onSubmit={send} className="pt-3 border-t border-gray-100 dark:border-gray-800 space-y-2">
      <label htmlFor={`nw-job-${person.id}`} className="block text-sm font-semibold text-gray-900 dark:text-white">Job</label>
      <select id={`nw-job-${person.id}`} value={listingId} onChange={(e) => setListingId(e.target.value)} className={`${input} w-full`}>
        {jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
      </select>
      <label htmlFor={`nw-msg-${person.id}`} className="block text-sm font-semibold text-gray-900 dark:text-white">Your note</label>
      <textarea id={`nw-msg-${person.id}`} rows={4} maxLength={MESSAGE_MAX} value={message} onChange={(e) => setMessage(e.target.value)} autoFocus
        placeholder="Why this role, and why them. e.g. “We’re building retrieval for legal docs and your RAG + PyTorch work stood out…”"
        className="w-full px-3 py-2 rounded-[10px] border border-gray-400 dark:border-gray-700 bg-white dark:bg-gray-950 text-sm text-gray-900 dark:text-white" />
      <p className={`text-xs tabular-nums ${len > 0 && len < MESSAGE_MIN ? 'text-amber-700 dark:text-amber-300' : 'text-gray-500'}`}>
        {len < MESSAGE_MIN ? `At least ${MESSAGE_MIN} characters (${len} so far)` : `${len}/${MESSAGE_MAX}`}
      </p>
      <div className="flex flex-col-reverse min-[420px]:flex-row min-[420px]:justify-end gap-2">
        <button type="button" onClick={onCancel} className="min-h-[40px] px-3 text-sm font-semibold text-gray-600 dark:text-gray-300">Cancel</button>
        <button type="submit" disabled={busy || len < MESSAGE_MIN || !listingId}
          className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3.5 rounded-[10px] bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold disabled:opacity-50">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Send className="w-4 h-4" aria-hidden />} Send request
        </button>
      </div>
    </form>
  );
}
