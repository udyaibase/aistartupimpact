'use client';

import { yearsText } from '@/lib/jobs/format';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Bell, BellOff, Bookmark, Check, Clock, Loader2, MessageSquare, Plus, Search, Send, Star, Tag, Target, Trash2, UserCheck, X } from 'lucide-react';
import type { PoolCandidate } from '@/lib/employer/talent';
import TalentTabs from './TalentTabs';
import { stageStyle } from '@/lib/employer/pool-stage';
import { matchSkills, normalizeSkill } from '@/lib/jobs/skills';
import { cleanTags, MAX_TAGS, MAX_TAG_LENGTH } from '@/lib/employer/talent-tags';
import {
  APPLIED_WITHIN, EMPTY_FILTERS, EXPERIENCE_RANGES, STAGE_FILTERS, describeFilters, hasFilters, matchesTalentFilters,
  type AppliedWithin, type ExperienceRange, type StageFilter, type TalentFilters,
} from '@/lib/employer/talent-filters';

const card = 'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-[14px]';
const input = 'min-h-[40px] px-3 rounded-[10px] border border-gray-400 dark:border-gray-700 bg-white dark:bg-gray-950 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#A50F15]/25 focus:border-[#A50F15]';
const chip = 'inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full';
const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const PAGE = 50;
/** Most people one bulk invite covers (the server checks this too). */
const BULK_MAX = 50;

export interface SavedSearch { id: string; name: string; filters: TalentFilters; alert: boolean; createdByEmail: string }
const sameFilters = (a: TalentFilters, b: TalentFilters) => (Object.keys(a) as (keyof TalentFilters)[]).every((k) => a[k] === b[k]);

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

export default function TalentPool({ people: initial, jobs, canInvite, canNote, hiredHidden = 0, savedSearches = [], myEmail = '', networkPilot = false }: {
  people: PoolCandidate[];
  jobs: PoolJob[];
  savedSearches?: SavedSearch[];
  myEmail?: string;
  /** Show the "Open to opportunities" tab (pilot companies). */
  networkPilot?: boolean;
  canInvite: boolean;
  canNote: boolean;
  hiredHidden?: number;
}) {
  const [people, setPeople] = useState(initial);
  const [filters, setFilters] = useState<TalentFilters>(EMPTY_FILTERS);
  const { q, skill, tag } = filters;
  const [searches, setSearches] = useState(savedSearches);
  const [naming, setNaming] = useState(false);
  const [searchName, setSearchName] = useState('');
  const [savingSearch, setSavingSearch] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkJob, setBulkJob] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
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

  const setFilter = <K extends keyof TalentFilters>(k: K, v: TalentFilters[K]) => { setFilters((f) => ({ ...f, [k]: v })); setLimit(PAGE); };
  const activeSearch = searches.find((s) => sameFilters(s.filters, filters)) ?? null;

  const shown = useMemo(() => {
    const now = Date.now();
    const list = people
      .filter((p) =>
        matchesTalentFilters(p, filters, now)
        && (!ending || p.expiringSoon)
        // Ranking for a role: leave out people who already applied to it.
        && (!role || !p.appliedTo.includes(role.id)))
      .map((p) => ({ p, fit: role ? fitFor(p, role) : null }));
    if (role) list.sort((a, b) => b.fit!.score - a.fit!.score || +new Date(b.p.appliedAt) - +new Date(a.p.appliedAt));
    return list;
  }, [people, filters, ending, role]);

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

  const toggle = (id: string) => setSelected((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else if (n.size < BULK_MAX) n.add(id);
    else setToast(`You can invite up to ${BULK_MAX} people at a time.`);
    return n;
  });
  const selectShown = () => setSelected(new Set(shown.slice(0, Math.min(limit, BULK_MAX)).map(({ p }) => p.id)));
  const picked = people.filter((p) => selected.has(p.id));
  const bulkTarget = bulkJob || role?.id || jobs[0]?.id || '';
  const bulkEligible = picked.filter((p) => !p.appliedTo.includes(bulkTarget) && !p.invitedTo.includes(bulkTarget)).length;

  async function inviteSelected() {
    if (!bulkTarget || !picked.length) return;
    setBulkBusy(true);
    try {
      const res = await fetch('/api/employer/talent/invite-bulk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ applicationIds: picked.map((p) => p.id), listingId: bulkTarget }) });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        const ids = new Set<string>(d.invitedIds ?? []);
        setPeople((ps) => ps.map((x) => (ids.has(x.id) ? { ...x, invitedTo: [...x.invitedTo, bulkTarget] } : x)));
        const skipped = (d.applied ?? 0) + (d.already_invited ?? 0) + (d.hired ?? 0) + (d.not_in_pool ?? 0);
        setToast([
          `Invited ${d.invited} ${d.invited === 1 ? 'person' : 'people'} to apply for ${d.listingTitle}.`,
          skipped ? `${skipped} skipped (already invited, applied or left the pool).` : '',
          d.skippedForCap ? `${d.skippedForCap} not sent: daily limit reached.` : '',
        ].filter(Boolean).join(' '));
        setSelected(new Set());
      } else setToast(d.error || 'Couldn’t send the invites.');
    } catch {
      setToast('You seem to be offline.');
    }
    setBulkBusy(false);
  }

  async function saveSearch(e: React.FormEvent) {
    e.preventDefault();
    if (searchName.trim().length < 2) return;
    setSavingSearch(true);
    try {
      const res = await fetch('/api/employer/talent/searches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: searchName, filters, alert: true }) });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setSearches((s) => [d.search, ...s]);
        setNaming(false); setSearchName('');
        setToast('Search saved. We’ll email you each morning when someone new matches.');
      } else setToast(d.error || 'Couldn’t save the search.');
    } catch { setToast('You seem to be offline.'); }
    setSavingSearch(false);
  }

  async function setAlert(s: SavedSearch, alert: boolean) {
    setSearches((all) => all.map((x) => (x.id === s.id ? { ...x, alert } : x)));
    try {
      const res = await fetch(`/api/employer/talent/searches/${s.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ alert }) });
      if (!res.ok) throw new Error();
      setToast(alert ? `Alerts on for “${s.name}”.` : `Alerts off for “${s.name}”.`);
    } catch {
      setSearches((all) => all.map((x) => (x.id === s.id ? { ...x, alert: !alert } : x)));
      setToast('Couldn’t change the alert.');
    }
  }

  async function removeSearch(s: SavedSearch) {
    const before = searches;
    setSearches((all) => all.filter((x) => x.id !== s.id));
    try {
      const res = await fetch(`/api/employer/talent/searches/${s.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      setToast(`Deleted “${s.name}”.`);
    } catch { setSearches(before); setToast('Couldn’t delete the search.'); }
  }

  return (
    <div className="font-jakarta space-y-5">
      <div>
        <h1 className="portal-title">{networkPilot ? 'Talent' : 'Talent pool'}</h1>
        {networkPilot && <TalentTabs active="pool" />}
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
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white shrink-0"><Target className="w-4 h-4 text-[#A50F15]" aria-hidden /> Hiring for</span>
            {jobs.length === 0 ? (
              <span className="text-sm text-gray-500">Publish a job to rank your pool against it. <Link href="/employer/jobs/new" className="font-semibold text-gray-900 dark:text-white hover:underline">Post a job</Link></span>
            ) : (
              <>
                <label htmlFor="tp-role" className="sr-only">Role</label>
                <select id="tp-role" value={roleId} onChange={(e) => { setRoleId(e.target.value); setLimit(PAGE); }} className={`${input} sm:max-w-xs w-full`}>
                  <option value="">Choose a role to rank and invite</option>
                  {jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
                </select>
                {role && <span className="text-[13px] text-gray-600 dark:text-gray-400">Best fit first. Matching skills are green, missing must-haves red. People who already applied are left out.</span>}
              </>
            )}
          </div>

          {/* Saved searches: one tap to re-run, with a morning email when someone new matches */}
          {(searches.length > 0 || hasFilters(filters)) && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-900 dark:text-white"><Bookmark className="w-4 h-4 text-[#A50F15]" aria-hidden /> Saved searches</span>
              {searches.map((s) => {
                const active = activeSearch?.id === s.id;
                const mine = s.createdByEmail.toLowerCase() === myEmail.toLowerCase();
                return (
                  <span key={s.id} className={`inline-flex items-center rounded-full border text-sm ${active ? 'border-[#A50F15]/40 bg-[#A50F15]/8 text-[#A50F15]' : 'border-gray-300 dark:border-gray-700 text-gray-800 dark:text-gray-200'}`}>
                    <button type="button" onClick={() => { setFilters(s.filters); setLimit(PAGE); }} title={describeFilters(s.filters)} aria-pressed={active}
                      className="min-h-[36px] pl-3 pr-1.5 font-medium max-w-[14rem] truncate">{s.name}</button>
                    {mine && (
                      <button type="button" onClick={() => setAlert(s, !s.alert)} aria-label={s.alert ? `Turn off email alerts for ${s.name}` : `Turn on email alerts for ${s.name}`}
                        title={s.alert ? 'Emails you when someone new matches' : 'Alerts off'} className="w-8 h-9 inline-flex items-center justify-center opacity-80 hover:opacity-100">
                        {s.alert ? <Bell className="w-3.5 h-3.5" aria-hidden /> : <BellOff className="w-3.5 h-3.5" aria-hidden />}
                      </button>
                    )}
                    <button type="button" onClick={() => removeSearch(s)} aria-label={`Delete saved search ${s.name}`} className="w-8 h-9 pr-1 inline-flex items-center justify-center opacity-60 hover:opacity-100">
                      <Trash2 className="w-3.5 h-3.5" aria-hidden />
                    </button>
                  </span>
                );
              })}
              {hasFilters(filters) && !activeSearch && (naming ? (
                <form onSubmit={saveSearch} className="inline-flex items-center gap-1.5">
                  <label htmlFor="tp-search-name" className="sr-only">Name this search</label>
                  <input id="tp-search-name" autoFocus value={searchName} maxLength={60} onChange={(e) => setSearchName(e.target.value)} placeholder="e.g. Senior React, Bengaluru" className={`${input} w-52`} />
                  <button type="submit" disabled={savingSearch || searchName.trim().length < 2} className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-[10px] bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold disabled:opacity-50">
                    {savingSearch && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />} Save
                  </button>
                  <button type="button" onClick={() => { setNaming(false); setSearchName(''); }} className="min-h-[40px] px-2 text-sm font-semibold text-gray-600 dark:text-gray-300">Cancel</button>
                </form>
              ) : (
                <button type="button" onClick={() => setNaming(true)} className="inline-flex items-center gap-1 min-h-[36px] px-3 rounded-full border border-dashed border-gray-300 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:border-gray-400">
                  <Plus className="w-3.5 h-3.5" aria-hidden /> Save this search
                </button>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" aria-hidden />
              <label htmlFor="tp-q" className="sr-only">Search the talent pool</label>
              <input id="tp-q" type="search" value={q} onChange={(e) => setFilter('q', e.target.value)} placeholder="Search name, role, city, tag" className={`${input} w-full pl-9`} />
            </div>
            <select aria-label="Skill" value={skill} onChange={(e) => setFilter('skill', e.target.value)} className={input}>
              <option value="">Any skill</option>{skills.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            {tags.length > 0 && (
              <select aria-label="Tag" value={tag} onChange={(e) => setFilter('tag', e.target.value)} className={input}>
                <option value="">Any tag</option>{tags.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            )}
            <select aria-label="Experience" value={filters.exp} onChange={(e) => setFilter('exp', e.target.value as ExperienceRange)} className={input}>
              {(Object.keys(EXPERIENCE_RANGES) as ExperienceRange[]).map((k) => <option key={k} value={k}>{EXPERIENCE_RANGES[k].label}</option>)}
            </select>
            <select aria-label="Furthest stage" value={filters.stage} onChange={(e) => setFilter('stage', e.target.value as StageFilter)} className={input}>
              {(Object.keys(STAGE_FILTERS) as StageFilter[]).map((k) => <option key={k} value={k}>{STAGE_FILTERS[k].label}</option>)}
            </select>
            <select aria-label="Applied" value={filters.within} onChange={(e) => setFilter('within', e.target.value as AppliedWithin)} className={input}>
              {(Object.keys(APPLIED_WITHIN) as AppliedWithin[]).map((k) => <option key={k} value={k}>{k ? `Applied: ${APPLIED_WITHIN[k].label.toLowerCase()}` : 'Applied any time'}</option>)}
            </select>
            {hasFilters(filters) && (
              <button type="button" onClick={() => { setFilters(EMPTY_FILTERS); setLimit(PAGE); }} className="min-h-[40px] px-2 text-sm font-semibold text-gray-600 dark:text-gray-300 hover:underline">Clear filters</button>
            )}
            {endingCount > 0 && (
              <label className="inline-flex items-center gap-2 min-h-[40px] px-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                <input type="checkbox" checked={ending} onChange={(e) => { setEnding(e.target.checked); setLimit(PAGE); }} className="w-4 h-4 accent-[#A50F15]" /> Ending within 30 days ({endingCount})
              </label>
            )}
            <span className="self-center text-sm text-gray-500 tabular-nums">{shown.length} of {people.length}</span>
            {canInvite && jobs.length > 0 && shown.length > 0 && (
              <button type="button" onClick={selectShown} className="min-h-[40px] px-2 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:underline">
                Select {Math.min(shown.length, limit, BULK_MAX)} shown
              </button>
            )}
          </div>

          {shown.length === 0 ? (
            <p className={`${card} px-4 py-8 text-center text-sm text-gray-600 dark:text-gray-400`}>No one matches these filters.</p>
          ) : (
            <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {shown.slice(0, limit).map(({ p, fit }) => (
                <PoolCard key={p.id} p={p} fit={fit} jobs={jobs} role={role} canInvite={canInvite} canNote={canNote}
                  checked={selected.has(p.id)} onCheck={canInvite && jobs.length > 0 ? () => toggle(p.id) : undefined}
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

      {selected.size > 0 && (
        <div className="fixed z-toast left-1/2 -translate-x-1/2 bottom-[calc(5rem+env(safe-area-inset-bottom))] md:bottom-6 w-[min(44rem,calc(100vw-2rem))] flex flex-col sm:flex-row sm:items-center gap-2 p-3 rounded-[14px] bg-gray-900 text-white shadow-xl">
          <span className="text-sm font-semibold tabular-nums shrink-0">{selected.size} selected</span>
          <label htmlFor="tp-bulk-job" className="sr-only">Job to invite them to</label>
          <select id="tp-bulk-job" value={bulkTarget} onChange={(e) => setBulkJob(e.target.value)} className="min-h-[40px] px-3 rounded-[10px] bg-gray-800 border border-gray-700 text-sm text-white flex-1 min-w-0">
            {jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
          </select>
          <div className="flex gap-2">
            <button type="button" onClick={inviteSelected} disabled={bulkBusy || bulkEligible === 0}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3.5 rounded-[10px] bg-white text-gray-900 text-sm font-semibold disabled:opacity-50">
              {bulkBusy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Send className="w-4 h-4" aria-hidden />}
              {bulkEligible === 0 ? 'All invited or applied' : `Invite ${bulkEligible}`}
            </button>
            <button type="button" onClick={() => setSelected(new Set())} aria-label="Clear selection" className="w-10 h-10 inline-flex items-center justify-center rounded-[10px] hover:bg-gray-800"><X className="w-4 h-4" aria-hidden /></button>
          </div>
        </div>
      )}

      {toast && (
        <div role="status" className={`fixed z-toast left-1/2 -translate-x-1/2 ${selected.size > 0 ? 'bottom-[calc(15rem+env(safe-area-inset-bottom))] sm:bottom-[calc(10rem+env(safe-area-inset-bottom))] md:bottom-24' : 'bottom-[calc(5rem+env(safe-area-inset-bottom))] md:bottom-6'} flex items-center gap-3 px-4 py-3 rounded-[12px] bg-gray-900 text-white text-sm shadow-xl max-w-[92vw]`}>
          <span>{toast}</span>
          <button onClick={() => setToast('')} aria-label="Dismiss" className="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-800"><X className="w-4 h-4" aria-hidden /></button>
        </div>
      )}
    </div>
  );
}

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?';
const monthYear = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
const daysLeft = (iso: string) => Math.max(0, Math.ceil((+new Date(iso) - Date.now()) / 864e5));

function PoolCard({ p, fit, jobs, role, canInvite, canNote, checked, onCheck, busy, pick, onPick, onInvite, onUpdate, onToast }: {
  p: PoolCandidate; fit: Fit | null; jobs: PoolJob[]; role: PoolJob | null; canInvite: boolean; canNote: boolean;
  checked: boolean; onCheck?: () => void;
  busy: boolean; pick?: string; onPick: (v: string) => void; onInvite: (listingId: string) => void;
  onUpdate: (patch: Partial<PoolCandidate>) => void; onToast: (s: string) => void;
}) {
  const [tagDraft, setTagDraft] = useState('');
  const [tagging, setTagging] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const options = jobs.filter((j) => !p.appliedTo.includes(j.id));
  const open = options.filter((j) => !p.invitedTo.includes(j.id));
  const selected = pick || open[0]?.id || '';
  const stage = stageStyle(p.furthestRank);
  const matched = useMemo(() => new Set(role ? matchSkills(role.skills, p.skills).map(normalizeSkill) : []), [role, p.skills]);
  // Matching skills first, so the reason to invite is the first thing HR reads.
  const skills = role ? [...p.skills].sort((a, b) => Number(matched.has(normalizeSkill(b))) - Number(matched.has(normalizeSkill(a)))) : p.skills;
  const meta = [[p.currentTitle, p.currentCompany].filter(Boolean).join(' at ') || null, p.city, p.experienceYears != null ? `${yearsText(p.experienceYears)} exp` : null].filter(Boolean).join(' · ');
  const invitedTitles = p.invitedTo.filter((id) => id !== role?.id).map((id) => jobs.find((j) => j.id === id)?.title ?? 'a closed job');

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
        setNote('');
      } else onToast(d.error || 'Couldn’t save the note.');
    } catch { onToast('You seem to be offline.'); }
    setSaving(false);
  }

  // The one action for this card: invite to the role being hired for, or pick a job when none is chosen.
  let action: React.ReactNode = null;
  if (canInvite) {
    if (jobs.length === 0) action = <span className="text-[13px] text-gray-500">Publish a job to invite</span>;
    else if (role) {
      action = p.invitedTo.includes(role.id)
        ? <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-emerald-700 dark:text-emerald-300"><Check className="w-4 h-4" aria-hidden /> Invited</span>
        : (
          <button type="button" onClick={() => onInvite(role.id)} disabled={busy}
            className="inline-flex items-center justify-center gap-1.5 min-h-[36px] px-3 rounded-[10px] bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-[13px] font-semibold disabled:opacity-50">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : <Send className="w-3.5 h-3.5" aria-hidden />} Invite to apply
          </button>
        );
    } else if (open.length === 0) {
      action = <span className="inline-flex items-center gap-1 text-[13px] text-gray-600 dark:text-gray-400"><Check className="w-3.5 h-3.5" aria-hidden /> Invited to all open jobs</span>;
    } else {
      action = (
        <button type="button" onClick={() => setChoosing((c) => !c)} aria-expanded={choosing}
          className="inline-flex items-center justify-center gap-1.5 min-h-[36px] px-3 rounded-[10px] border border-gray-500 dark:border-gray-700 text-[13px] font-semibold text-gray-900 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800">
          <Send className="w-3.5 h-3.5" aria-hidden /> Invite…
        </button>
      );
    }
  }

  return (
    <li className={`bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-800 rounded-[14px] shadow-sm dark:shadow-none min-w-0 p-4 flex flex-col gap-2.5 ${checked ? 'ring-2 ring-[#A50F15]/40 dark:ring-[#A50F15]/50' : ''}`}>
      {/* Who */}
      <div className="flex items-start gap-3">
        {onCheck && (
          <label className="-m-2 p-2 shrink-0 cursor-pointer">
            <span className="sr-only">Select {p.fullName}</span>
            <input type="checkbox" checked={checked} onChange={onCheck} className="w-5 h-5 mt-2.5 accent-[#A50F15]" />
          </label>
        )}
        <span className="shrink-0 w-11 h-11 rounded-full bg-gradient-to-br from-gray-200 to-gray-300 dark:from-gray-800 dark:to-gray-700 text-gray-800 dark:text-gray-200 text-sm font-bold inline-flex items-center justify-center" aria-hidden>{initials(p.fullName)}</span>
        <div className="min-w-0 flex-1">
          <Link href={`/employer/applications?candidate=${p.id}`} className="portal-item-title truncate block hover:underline" title="Open their application">{p.fullName}</Link>
          <p className="text-[13px] text-gray-600 dark:text-gray-400 truncate">{meta || 'Applicant'}</p>
        </div>
        {fit && (
          <span className={`shrink-0 text-center rounded-[10px] px-2 py-1 tabular-nums border ${fit.score >= 75 ? 'bg-green-50 border-green-300 text-green-900 dark:bg-green-900/30 dark:border-transparent dark:text-green-300' : fit.score >= 50 ? 'bg-blue-50 border-blue-300 text-blue-900 dark:bg-blue-900/30 dark:border-transparent dark:text-blue-300' : 'bg-gray-50 border-gray-300 text-gray-800 dark:bg-gray-800 dark:border-transparent dark:text-gray-300'}`}
            title={`Fit for ${role?.title}: skills, must-haves and experience`}>
            <span className="block text-base font-extrabold leading-tight">{Math.min(100, fit.score)}%</span>
            <span className="block text-[10px] font-semibold uppercase tracking-wide opacity-80">fit</span>
          </span>
        )}
      </div>

      {/* Why them: the furthest they got with you, and when */}
      <p className="text-[13px] leading-snug">
        <span className={`inline-flex items-center gap-1.5 font-semibold ${stage.text}`}>
          <span className={`w-2 h-2 rounded-full ${stage.dot}`} aria-hidden />{stage.star && <Star className="w-3.5 h-3.5 fill-current" aria-hidden />}{p.furthestStage}
        </span>
        <span className="text-gray-600 dark:text-gray-400"> · for {p.appliedFor} · {monthYear(p.appliedAt)}</span>
      </p>

      {/* Fit details for the chosen role */}
      {fit && (
        <p className="text-[13px] text-gray-700 dark:text-gray-300">
          {fit.total ? <><span className="font-semibold tabular-nums">{fit.matched} of {fit.total}</span> skills match</> : 'The role lists no skills'}
          {fit.mustOk ? <span className="text-emerald-700 dark:text-emerald-300"> · all must-haves</span> : null}
          {fit.expOk === false && <span className="text-amber-800 dark:text-amber-300"> · experience outside range</span>}
        </p>
      )}

      {/* Skills: matches green, missing must-haves red */}
      {(skills.length > 0 || (fit && fit.mustMissing.length > 0)) && (
        <div className="flex flex-wrap gap-1">
          {skills.slice(0, 8).map((sk) => {
            const hit = matched.has(normalizeSkill(sk));
            return (
              <span key={sk} className={`${chip} border ${hit ? 'bg-emerald-50 border-emerald-300 text-emerald-900 dark:bg-emerald-900/30 dark:border-transparent dark:text-emerald-300' : 'bg-white border-gray-300 dark:bg-gray-800 dark:border-transparent text-gray-800 dark:text-gray-300'}`}>
                {hit && <Check className="w-3 h-3" aria-hidden />}{sk}
              </span>
            );
          })}
          {skills.length > 8 && <span className={`${chip} text-gray-500`}>+{skills.length - 8}</span>}
          {fit?.mustMissing.slice(0, 3).map((m) => (
            <span key={`miss-${m}`} className={`${chip} border border-red-300 bg-red-50 text-red-800 dark:border-transparent dark:bg-red-900/30 dark:text-red-300`} title="Must-have they don’t list"><X className="w-3 h-3" aria-hidden />{m}</span>
          ))}
        </div>
      )}

      {/* Only the statuses that need attention */}
      {(p.expiringSoon || invitedTitles.length > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {p.expiringSoon && <span className={`${chip} border border-amber-300 bg-amber-50 text-amber-900 dark:border-transparent dark:bg-amber-900/30 dark:text-amber-300`}><Clock className="w-3 h-3" aria-hidden /> Leaves the pool in {daysLeft(p.poolUntil)} days</span>}
          {invitedTitles.length > 0 && <span className={`${chip} border border-gray-300 bg-gray-50 dark:border-transparent dark:bg-gray-800 text-gray-800 dark:text-gray-300`}><Send className="w-3 h-3" aria-hidden /> Invited to {invitedTitles.join(', ')}</span>}
        </div>
      )}

      {/* Footer: tags, notes and the one action */}
      <div className="mt-auto pt-2.5 border-t border-gray-200 dark:border-gray-800 flex flex-wrap items-center gap-1.5">
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
          <button type="button" onClick={() => setTagging(true)} className={`${chip} min-h-[28px] border border-dashed border-gray-400 dark:border-gray-700 text-gray-700 dark:text-gray-400 hover:border-gray-600 hover:text-gray-900`}>
            <Plus className="w-3 h-3" aria-hidden /> Tag
          </button>
        ))}
        {(p.noteCount > 0 || canNote) && (
          <button type="button" onClick={() => setNotesOpen((o) => !o)} aria-expanded={notesOpen}
            className={`${chip} min-h-[28px] ${p.noteCount ? 'border border-sky-400 bg-sky-50 text-sky-900 dark:border-transparent dark:bg-sky-900/30 dark:text-sky-300' : 'border border-dashed border-gray-400 dark:border-gray-700 text-gray-700 dark:text-gray-400 hover:border-gray-600 hover:text-gray-900'}`}>
            <MessageSquare className="w-3 h-3" aria-hidden /> {p.noteCount ? `${p.noteCount} note${p.noteCount === 1 ? '' : 's'}` : 'Note'}
          </button>
        )}
        <span className="ml-auto">{action}</span>
      </div>

      {/* Invite when no role is chosen at the top */}
      {choosing && !role && open.length > 0 && (
        <div className="flex flex-col min-[420px]:flex-row gap-2">
          <label htmlFor={`tp-job-${p.id}`} className="sr-only">Job to invite {p.fullName} to</label>
          <select id={`tp-job-${p.id}`} value={selected} onChange={(e) => onPick(e.target.value)} className={`${input} flex-1 min-w-0`}>
            {open.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
          </select>
          <button type="button" onClick={() => { if (selected) { onInvite(selected); setChoosing(false); } }} disabled={busy || !selected}
            className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3.5 rounded-[10px] bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold disabled:opacity-50">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Send className="w-4 h-4" aria-hidden />} Send invite
          </button>
        </div>
      )}

      {/* Team notes (shared with the candidate's application), opened on demand */}
      {notesOpen && (
        <div className="rounded-[10px] border border-gray-200 dark:border-transparent bg-gray-50 dark:bg-gray-800/50 px-3 py-2 space-y-2">
          {p.lastNote ? (
            <p className="text-[13px] text-gray-700 dark:text-gray-300">
              <span className="font-semibold">{p.lastNote.authorName}:</span> {p.lastNote.body}
              <span className="block text-xs text-gray-500 mt-0.5">{fmt(p.lastNote.createdAt)}{p.noteCount > 1 ? ` · latest of ${p.noteCount}. ` : ' '}<Link href={`/employer/applications?candidate=${p.id}`} className="underline">See all</Link></span>
            </p>
          ) : <p className="text-[13px] text-gray-500">No team notes yet.</p>}
          {canNote && (
            <form onSubmit={addNote} className="flex flex-col gap-2">
              <label htmlFor={`note-${p.id}`} className="sr-only">Note</label>
              <textarea id={`note-${p.id}`} autoFocus rows={2} maxLength={4000} value={note} onChange={(e) => setNote(e.target.value)}
                placeholder="Private to your team, e.g. strong system design, revisit in Q2"
                className="w-full px-3 py-2 rounded-[8px] border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-sm" />
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => { setNotesOpen(false); setNote(''); }} className="min-h-[36px] px-3 text-sm font-semibold text-gray-600 dark:text-gray-300">Close</button>
                <button type="submit" disabled={saving || !note.trim()} className="inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-[8px] bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold disabled:opacity-50">
                  {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />} Save note
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </li>
  );
}
