'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Check, Loader2, Search, Send, UserCheck } from 'lucide-react';
import type { PoolCandidate } from '@/lib/employer/talent';

const card = 'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-[14px]';
const input = 'min-h-[40px] px-3 rounded-[10px] border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#A50F15]/25 focus:border-[#A50F15]';
const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export default function TalentPool({ people: initial, jobs, canInvite }: {
  people: PoolCandidate[];
  jobs: { id: string; title: string }[];
  canInvite: boolean;
}) {
  const [people, setPeople] = useState(initial);
  const [q, setQ] = useState('');
  const [skill, setSkill] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [pick, setPick] = useState<Record<string, string>>({});
  const [toast, setToast] = useState('');

  const skills = useMemo(() => Array.from(new Set(people.flatMap((p) => p.skills))).sort(), [people]);
  const shown = people.filter((p) =>
    (!q || `${p.fullName} ${p.currentTitle ?? ''} ${p.currentCompany ?? ''} ${p.city ?? ''} ${p.appliedFor}`.toLowerCase().includes(q.toLowerCase()))
    && (!skill || p.skills.includes(skill)));

  async function invite(p: PoolCandidate) {
    const listingId = pick[p.id] || jobs.find((j) => !p.appliedTo.includes(j.id) && !p.invitedTo.includes(j.id))?.id;
    if (!listingId) return;
    setBusy(p.id);
    try {
      const res = await fetch('/api/employer/talent/invite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ applicationId: p.id, listingId }) });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setPeople((ps) => ps.map((x) => (x.id === p.id ? { ...x, invitedTo: [...x.invitedTo, listingId] } : x)));
        setToast(`Invited ${p.fullName.split(' ')[0]} to apply for ${jobs.find((j) => j.id === listingId)?.title}.`);
      } else setToast(d.error || 'Couldn’t send the invite.');
    } catch {
      setToast('You seem to be offline.');
    }
    setBusy(null);
  }

  return (
    <div className="font-jakarta space-y-5">
      <div>
        <h1 className="portal-title">Talent pool</h1>
        <p className="portal-subtitle">Past applicants who said yes to hearing about other roles. Each person stays for 12 months from their application and can leave any time.</p>
      </div>

      {people.length === 0 ? (
        <div className={`${card} px-4 py-12 text-center`}>
          <UserCheck className="w-8 h-8 text-gray-400 mx-auto mb-2" aria-hidden />
          <p className="text-[15px] font-semibold text-gray-900 dark:text-white">No one in your talent pool yet</p>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 max-w-md mx-auto">When candidates apply, they can choose to hear about your other roles. Those who do appear here, so your next hire can start with people who already like you.</p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" aria-hidden />
              <label htmlFor="tp-q" className="sr-only">Search the talent pool</label>
              <input id="tp-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, role, city" className={`${input} w-full pl-9`} />
            </div>
            <select aria-label="Skill" value={skill} onChange={(e) => setSkill(e.target.value)} className={input}>
              <option value="">Any skill</option>{skills.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <span className="self-center text-sm text-gray-500">{shown.length} of {people.length}</span>
          </div>

          <ul className="grid gap-3 md:grid-cols-2">
            {shown.map((p) => {
              const options = jobs.filter((j) => !p.appliedTo.includes(j.id));
              const open = options.filter((j) => !p.invitedTo.includes(j.id));
              return (
                <li key={p.id} className={`${card} p-4 flex flex-col`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link href={`/employer/applications?candidate=${p.id}`} className="text-[15px] font-semibold text-gray-900 dark:text-white hover:text-[#A50F15]">{p.fullName}</Link>
                      <p className="text-[13px] text-gray-600 dark:text-gray-400 truncate">{[p.currentTitle, p.currentCompany].filter(Boolean).join(' at ') || '—'}{p.city ? ` · ${p.city}` : ''}</p>
                    </div>
                    {p.experienceYears != null && <span className="shrink-0 text-[12px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">{p.experienceYears} yrs</span>}
                  </div>
                  <p className="mt-2 text-[12.5px] text-gray-500">Applied for {p.appliedFor} · {fmt(p.appliedAt)} · {p.furthestStage}</p>
                  {p.skills.length > 0 && (
                    <p className="mt-2 flex flex-wrap gap-1">
                      {p.skills.slice(0, 8).map((s) => <span key={s} className="text-[11.5px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">{s}</span>)}
                    </p>
                  )}
                  {canInvite && (
                    <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 flex flex-wrap items-center gap-2">
                      {jobs.length === 0 ? (
                        <span className="text-[13px] text-gray-500">Publish a job to invite people from your pool.</span>
                      ) : open.length === 0 ? (
                        <span className="inline-flex items-center gap-1 text-[13px] text-gray-600 dark:text-gray-400"><Check className="w-3.5 h-3.5" aria-hidden /> Invited or applied to all your open jobs</span>
                      ) : (
                        <>
                          <label htmlFor={`tp-job-${p.id}`} className="sr-only">Job to invite {p.fullName} to</label>
                          <select id={`tp-job-${p.id}`} value={pick[p.id] ?? open[0].id} onChange={(e) => setPick((x) => ({ ...x, [p.id]: e.target.value }))} className={`${input} flex-1 min-w-0`}>
                            {open.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
                          </select>
                          <button type="button" onClick={() => invite(p)} disabled={busy === p.id}
                            className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-[10px] bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold disabled:opacity-50">
                            {busy === p.id ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Send className="w-4 h-4" aria-hidden />} Invite to apply
                          </button>
                        </>
                      )}
                      {p.invitedTo.length > 0 && <span className="w-full text-[12px] text-gray-500">Invited to {p.invitedTo.map((id) => jobs.find((j) => j.id === id)?.title ?? 'a closed job').join(', ')}</span>}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {toast && (
        <div role="status" className="fixed z-[130] bottom-[calc(5rem+env(safe-area-inset-bottom))] md:bottom-6 left-1/2 -translate-x-1/2 max-w-[calc(100%-2rem)] px-4 py-2.5 rounded-[12px] bg-gray-900 text-white text-sm shadow-xl">
          {toast}
          <button type="button" onClick={() => setToast('')} className="ml-3 font-semibold underline">OK</button>
        </div>
      )}
    </div>
  );
}
