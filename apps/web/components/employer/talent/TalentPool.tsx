'use client';

import { yearsText } from '@/lib/jobs/format';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Check, Clock, Loader2, MessageSquare, Plus, Search, Send, Tag, Target, UserCheck, X } from 'lucide-react';
import type { PoolCandidate } from '@/lib/employer/talent';
import { matchSkills, normalizeSkill } from '@/lib/jobs/skills';
import { cleanTags, MAX_TAGS, MAX_TAG_LENGTH } from '@/lib/employer/talent-tags';

const card = 'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-[14px]';
const input = 'min-h-[40px] px-3 rounded-[10px] border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#A50F15]/25 focus:border-[#A50F15]';
const chip = 'inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full';
const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const PAGE = 50;

export interface PoolJob { id: string; title: string; skills: string[]; mustHaveSkills: string[]; experienceMin: number | null; experienceMax: number | null }

interface Fit { score: number; matched: number; total: number; mustOk: boolean; mustMissing: string[]; expOk: boolean | null }

/** How well a pool candidate fits a role: same deterministic skill matching as applications, no AI. */
function fitFor(p: PoolCandidate, job: PoolJob): Fit {
  const matched = matchSkills(job.skills, p.skills).length;
  const have = new Set(p.skills.map(normalizeSkill));
  const mustMissing = job.mustHaveSkills.filter((s) => !have.has(normalizeSkill(s)));
  const expOk = p.experienceYears == null || (job.experienceMin == null && job.experienceMax == null)
    ? null
    : p.experienceYears >= (job.experienceMin ?? 0) && (job.experienceMax == null || p.experienceYears <= job.experienceMax + 2);
  const skillPart = job.skills.length ? (matched / job.skills.length) * 70 : 35;
  const score = Math.round(skillPart + (mustMissing.length === 0 ? 20 : 0) + (expOk === false ? 0 : 10) + p.furthestRank * 2);
  return { score, matched, total: job.skills.length, mustOk: mustMissing.length === 0, mustMissing, expOk };
}

export default function TalentPool({ people: initial, jobs, canInvite, canNote, hiredHidden = 0 }: {
  people: PoolCandidate[];
  jobs: PoolJob[];
  canInvite: boolean;
  canNote: boolean;
  hiredHidden?: number;
}) {
  const [people, setPeople] = useState(initial);
  const [q, setQ] = useState('');
  const [skill, setSkill] = useState('');
  const [tag, setTag] = useState('');
  const [ending, setEnding] = useState(false);
  const [roleId, setRoleId] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [busy, setBusy] = useState<string | null>(null);
  const [pick, setPick] = useState<Record<string, string>>({});
  const [toast, setToast] = useState('');

  const role = jobs.find((j) => j.id === roleId) ?? null;
  const skills = useMemo(() => Array.from(new Set(people.flatMap((p) => p.skills))).sort(), [people]);
  const tags = useMemo(() => Array.from(new Set(people.flatMap((p) => p.tags))).sort(), [people]);
  const endingCount = people.filter((p) => p.expiringSoon).length;

  const shown = useMemo(() => {
    const list = people
      .filter((p) =>
        (!q || `${p.fullName} ${p.currentTitle ?? ''} ${p.currentCompany ?? ''} ${p.city ?? ''} ${p.appliedFor} ${p.tags.join(' ')}`.toLowerCase().includes(q.toLowerCase()))
        && (!skill || p.skills.includes(skill))
        && (!tag || p.tags.includes(tag))
        && (!ending || p.expiringSoon)
        // Ranking for a role: leave out people who already applied to it.
        && (!role || !p.appliedTo.includes(role.id)))
      .map((p) => ({ p, fit: role ? fitFor(p, role) : null }));
    if (role) list.sort((a, b) => b.fit!.score - a.fit!.score || +new Date(b.p.appliedAt) - +new Date(a.p.appliedAt));
    return list;
  }, [people, q, skill, tag, ending, role]);

  const update = (id: string, patch: Partial<PoolCandidate>) => setPeople((ps) => ps.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  async function invite(p: PoolCandidate, listingId: string) {
    setBusy(p.id);
    try {
      const res = await fetch('/api/employer/talent/invite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ applicationId: p.id, listingId }) });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        update(p.id, { invitedTo: [...p.invitedTo, listingId] });
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
        <p className="portal-subtitle">
          Past applicants who said yes to hearing about your other roles. Each person stays 12 months from when they agreed, gets a reminder before it ends, and can leave any time.
        </p>
        {hiredHidden > 0 && (
          <p className="mt-1 text-[13px] text-gray-500">{hiredHidden} {hiredHidden === 1 ? 'person you hired isn’t' : 'people you hired aren’t'} shown.</p>
        )}
      </div>

      {people.length === 0 ? (
        <div className={`${card} px-4 py-12 text-center`}>
          <UserCheck className="w-8 h-8 text-gray-400 mx-auto mb-2" aria-hidden />
          <p className="portal-item-title">No one in your talent pool yet</p>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 max-w-md mx-auto">When candidates apply, they can choose to hear about your other roles. Those who do appear here, so your next hire can start with people who already know you.</p>
        </div>
      ) : (
        <>
          {/* Find people for a role */}
          <div className={`${card} p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3`}>
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white shrink-0"><Target className="w-4 h-4 text-[#A50F15]" aria-hidden /> Find people for a role</span>
            {jobs.length === 0 ? (
              <span className="text-sm text-gray-500">Publish a job to rank your pool against it. <Link href="/employer/jobs/new" className="font-semibold text-gray-900 dark:text-white hover:underline">Post a job</Link></span>
            ) : (
              <>
                <label htmlFor="tp-role" className="sr-only">Role</label>
                <select id="tp-role" value={roleId} onChange={(e) => { setRoleId(e.target.value); setLimit(PAGE); }} className={`${input} sm:max-w-xs w-full`}>
                  <option value="">Choose an open role</option>
                  {jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
                </select>
                {role && <span className="text-[13px] text-gray-600 dark:text-gray-400">Best matches first, by skills, must-haves and experience. People who already applied are left out.</span>}
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" aria-hidden />
              <label htmlFor="tp-q" className="sr-only">Search the talent pool</label>
              <input id="tp-q" type="search" value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} placeholder="Search name, role, city, tag" className={`${input} w-full pl-9`} />
            </div>
            <select aria-label="Skill" value={skill} onChange={(e) => { setSkill(e.target.value); setLimit(PAGE); }} className={input}>
              <option value="">Any skill</option>{skills.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            {tags.length > 0 && (
              <select aria-label="Tag" value={tag} onChange={(e) => { setTag(e.target.value); setLimit(PAGE); }} className={input}>
                <option value="">Any tag</option>{tags.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            )}
            {endingCount > 0 && (
              <label className="inline-flex items-center gap-2 min-h-[40px] px-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                <input type="checkbox" checked={ending} onChange={(e) => { setEnding(e.target.checked); setLimit(PAGE); }} className="w-4 h-4 accent-[#A50F15]" /> Ending within 30 days ({endingCount})
              </label>
            )}
            <span className="self-center text-sm text-gray-500 tabular-nums">{shown.length} of {people.length}</span>
          </div>

          {shown.length === 0 ? (
            <p className={`${card} px-4 py-8 text-center text-sm text-gray-600 dark:text-gray-400`}>No one matches these filters.</p>
          ) : (
            <ul className="grid gap-3 md:grid-cols-2">
              {shown.slice(0, limit).map(({ p, fit }) => (
                <PoolCard key={p.id} p={p} fit={fit} jobs={jobs} role={role} canInvite={canInvite} canNote={canNote}
                  busy={busy === p.id} pick={pick[p.id]} onPick={(v) => setPick((m) => ({ ...m, [p.id]: v }))}
                  onInvite={(listingId) => invite(p, listingId)} onUpdate={(patch) => update(p.id, patch)} onToast={setToast} />
              ))}
            </ul>
          )}
          {shown.length > limit && (
            <div className="text-center">
              <button type="button" onClick={() => setLimit((l) => l + PAGE)} className="min-h-[44px] px-5 rounded-[10px] border border-gray-300 dark:border-gray-700 text-sm font-semibold text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800">
                Show {Math.min(PAGE, shown.length - limit)} more · {shown.length - limit} left
              </button>
            </div>
          )}
        </>
      )}

      {toast && (
        <div role="status" className="fixed z-toast left-1/2 -translate-x-1/2 bottom-[calc(5rem+env(safe-area-inset-bottom))] md:bottom-6 flex items-center gap-3 px-4 py-3 rounded-[12px] bg-gray-900 text-white text-sm shadow-xl max-w-[92vw]">
          <span>{toast}</span>
          <button onClick={() => setToast('')} aria-label="Dismiss" className="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-800"><X className="w-4 h-4" aria-hidden /></button>
        </div>
      )}
    </div>
  );
}

function PoolCard({ p, fit, jobs, role, canInvite, canNote, busy, pick, onPick, onInvite, onUpdate, onToast }: {
  p: PoolCandidate; fit: Fit | null; jobs: PoolJob[]; role: PoolJob | null; canInvite: boolean; canNote: boolean;
  busy: boolean; pick?: string; onPick: (v: string) => void; onInvite: (listingId: string) => void;
  onUpdate: (patch: Partial<PoolCandidate>) => void; onToast: (s: string) => void;
}) {
  const [tagDraft, setTagDraft] = useState('');
  const [tagging, setTagging] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const options = jobs.filter((j) => !p.appliedTo.includes(j.id));
  const open = options.filter((j) => !p.invitedTo.includes(j.id));
  const selected = pick || (role && open.some((j) => j.id === role.id) ? role.id : open[0]?.id) || '';

  async function saveTags(next: string[]) {
    const clean = cleanTags(next) ?? [];
    const before = p.tags;
    onUpdate({ tags: clean });
    try {
      const res = await fetch('/api/employer/talent/tags', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ applicationId: p.id, tags: clean }) });
      if (!res.ok) { onUpdate({ tags: before }); onToast((await res.json().catch(() => ({}))).error || 'Couldn’t save tags.'); }
    } catch { onUpdate({ tags: before }); onToast('You seem to be offline.'); }
  }

  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    if (!note.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/employer/applications/${p.id}/notes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: note }) });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        onUpdate({ noteCount: p.noteCount + 1, lastNote: { authorName: d.note.authorName, body: d.note.body, createdAt: d.note.createdAt } });
        setNote(''); setNoteOpen(false);
      } else onToast(d.error || 'Couldn’t save the note.');
    } catch { onToast('You seem to be offline.'); }
    setSaving(false);
  }

  return (
    <li className={`${card} p-4 flex flex-col gap-3`}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="portal-item-title truncate">{p.fullName}</p>
          <p className="text-[13px] text-gray-600 dark:text-gray-400 truncate">
            {[p.currentTitle, p.currentCompany].filter(Boolean).join(' at ') || 'Applicant'}{p.city ? ` · ${p.city}` : ''}{p.experienceYears != null ? ` · ${yearsText(p.experienceYears)}` : ''}
          </p>
        </div>
        {fit && (
          <span className={`shrink-0 text-xs font-bold px-2 py-1 rounded-[8px] tabular-nums ${fit.score >= 75 ? 'bg-green-50 text-green-800 dark:bg-green-900/30 dark:text-green-300' : fit.score >= 50 ? 'bg-blue-50 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'}`}
            title="Fit for the chosen role">{Math.min(100, fit.score)}% fit</span>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <span className={`${chip} bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300`}>{p.furthestStage}</span>
        <span className={`${chip} bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300`}>Applied for {p.appliedFor} · {fmt(p.appliedAt)}</span>
        {p.expiringSoon
          ? <span className={`${chip} bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300`}><Clock className="w-3 h-3" aria-hidden /> Ends {fmt(p.poolUntil)}</span>
          : <span className={`${chip} text-gray-500`}>In pool until {fmt(p.poolUntil)}</span>}
      </div>

      {fit && (
        <p className="text-[13px] text-gray-700 dark:text-gray-300">
          {fit.total ? <><span className="font-semibold tabular-nums">{fit.matched}/{fit.total}</span> skills</> : 'No skills listed on the role'}
          {' · '}{fit.mustOk ? 'All must-haves' : <span className="text-amber-800 dark:text-amber-300">Missing {fit.mustMissing.slice(0, 2).join(', ')}{fit.mustMissing.length > 2 ? ` +${fit.mustMissing.length - 2}` : ''}</span>}
          {fit.expOk === false && <> · <span className="text-amber-800 dark:text-amber-300">Experience outside range</span></>}
        </p>
      )}

      {p.skills.length > 0 && <p className="text-[13px] text-gray-500 line-clamp-2">{p.skills.join(' · ')}</p>}

      {/* Team tags: private, never shown to the candidate */}
      <div className="flex flex-wrap items-center gap-1.5">
        {p.tags.map((t) => (
          <span key={t} className={`${chip} bg-[#A50F15]/8 text-[#A50F15] border border-[#A50F15]/20`}>
            <Tag className="w-3 h-3" aria-hidden /> {t}
            {canNote && <button type="button" onClick={() => saveTags(p.tags.filter((x) => x !== t))} aria-label={`Remove tag ${t}`} className="-mr-1 w-5 h-5 inline-flex items-center justify-center rounded-full hover:bg-[#A50F15]/10"><X className="w-3 h-3" aria-hidden /></button>}
          </span>
        ))}
        {canNote && p.tags.length < MAX_TAGS && (tagging ? (
          <form onSubmit={(e) => { e.preventDefault(); if (tagDraft.trim()) saveTags([...p.tags, tagDraft]); setTagDraft(''); setTagging(false); }} className="inline-flex">
            <label htmlFor={`tag-${p.id}`} className="sr-only">New tag</label>
            <input id={`tag-${p.id}`} autoFocus value={tagDraft} maxLength={MAX_TAG_LENGTH} onChange={(e) => setTagDraft(e.target.value)}
              onBlur={() => { if (tagDraft.trim()) saveTags([...p.tags, tagDraft]); setTagDraft(''); setTagging(false); }}
              placeholder="e.g. backend" className="h-7 w-28 px-2 rounded-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-xs" />
          </form>
        ) : (
          <button type="button" onClick={() => setTagging(true)} className={`${chip} min-h-[28px] border border-dashed border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-400`}>
            <Plus className="w-3 h-3" aria-hidden /> Tag
          </button>
        ))}
      </div>

      {/* Team notes (shared with the candidate's application) */}
      {(p.lastNote || canNote) && (
        <div className="rounded-[10px] bg-gray-50 dark:bg-gray-800/50 px-3 py-2">
          {p.lastNote ? (
            <p className="text-[13px] text-gray-700 dark:text-gray-300">
              <span className="font-semibold">{p.lastNote.authorName}:</span> <span className="line-clamp-2 inline">{p.lastNote.body}</span>
              <span className="block text-xs text-gray-500 mt-0.5">{fmt(p.lastNote.createdAt)}{p.noteCount > 1 ? ` · ${p.noteCount} notes in total` : ''}</span>
            </p>
          ) : !noteOpen && <p className="text-[13px] text-gray-500">No team notes yet.</p>}
          {canNote && (noteOpen ? (
            <form onSubmit={addNote} className="mt-2 flex flex-col gap-2">
              <label htmlFor={`note-${p.id}`} className="sr-only">Note</label>
              <textarea id={`note-${p.id}`} autoFocus rows={2} maxLength={4000} value={note} onChange={(e) => setNote(e.target.value)}
                placeholder="Private to your team, e.g. strong system design, revisit in Q2"
                className="w-full px-3 py-2 rounded-[8px] border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-sm" />
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => { setNoteOpen(false); setNote(''); }} className="min-h-[36px] px-3 text-sm font-semibold text-gray-600 dark:text-gray-300">Cancel</button>
                <button type="submit" disabled={saving || !note.trim()} className="inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-[8px] bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold disabled:opacity-50">
                  {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />} Save note
                </button>
              </div>
            </form>
          ) : (
            <button type="button" onClick={() => setNoteOpen(true)} className="mt-1 inline-flex items-center gap-1 min-h-[32px] text-[13px] font-semibold text-gray-700 dark:text-gray-300 hover:underline">
              <MessageSquare className="w-3.5 h-3.5" aria-hidden /> Add note
            </button>
          ))}
        </div>
      )}

      {canInvite && (
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-gray-100 dark:border-gray-800">
          {jobs.length === 0 ? (
            <span className="text-[13px] text-gray-500 pt-2">Publish a job to invite people from your pool.</span>
          ) : open.length === 0 ? (
            <span className="inline-flex items-center gap-1 text-[13px] text-gray-600 dark:text-gray-400 pt-2"><Check className="w-3.5 h-3.5" aria-hidden /> Invited or applied to all your open jobs</span>
          ) : (
            <div className="flex flex-col min-[420px]:flex-row gap-2 w-full pt-2">
              <label htmlFor={`tp-job-${p.id}`} className="sr-only">Job to invite {p.fullName} to</label>
              <select id={`tp-job-${p.id}`} value={selected} onChange={(e) => onPick(e.target.value)} className={`${input} flex-1 min-w-0`}>
                {open.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
              </select>
              <button type="button" onClick={() => selected && onInvite(selected)} disabled={busy || !selected}
                className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3.5 rounded-[10px] bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold disabled:opacity-50">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Send className="w-4 h-4" aria-hidden />} Invite to apply
              </button>
            </div>
          )}
          {p.invitedTo.length > 0 && <span className="w-full text-xs text-gray-500">Invited to {p.invitedTo.map((id) => jobs.find((j) => j.id === id)?.title ?? 'a closed job').join(', ')}</span>}
        </div>
      )}
    </li>
  );
}
