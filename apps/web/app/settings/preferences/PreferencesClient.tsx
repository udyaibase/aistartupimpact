'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Loader2, MapPin, X } from 'lucide-react';
import { updatePreferences, clearActivity, type Preferences } from './actions';
import {
  INTENTS, MAX_INTENTS, TOPICS, TOPIC_GROUPS, MAX_TOPICS, EXPERIENCE_LEVELS, WORK_MODES, MAX_JOB_ROLES,
  type IntentValue,
} from '@/lib/personalization/topics';

type CityResult = { id: string; name: string; state: string | null; country: string };

const chip = (on: boolean) => `inline-flex items-center gap-1.5 min-h-[40px] px-3.5 rounded-full border text-sm font-medium transition-colors ${on ? 'border-gray-900 dark:border-white bg-gray-900 dark:bg-white text-white dark:text-gray-900' : 'border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 hover:border-gray-500'}`;
const section = 'rounded-[14px] border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 sm:p-6';
const h2 = 'text-[16px] font-semibold text-gray-900 dark:text-white';
const sub = 'mt-1 mb-4 text-[13px] text-gray-600 dark:text-gray-400';

/** Settings → Preferences and Profile → Preferences: everything onboarding asked, editable, plus history controls. */
export default function PreferencesClient({
  initialPrefs,
  jobRoles,
}: {
  initialPrefs: Preferences | null;
  jobRoles: { value: string; label: string }[];
}) {
  const [intents, setIntents] = useState<string[]>(initialPrefs?.intents ?? []);
  const [topics, setTopics] = useState<string[]>(initialPrefs?.topics ?? []);
  const [roles, setRoles] = useState<string[]>(initialPrefs?.jobPrefs.roles ?? []);
  const [experience, setExperience] = useState<string | null>(initialPrefs?.jobPrefs.experience ?? null);
  const [workModes, setWorkModes] = useState<string[]>(initialPrefs?.jobPrefs.workModes ?? []);
  const [cityId, setCityId] = useState<string | null>(initialPrefs?.cityId ?? null);
  const [cityName, setCityName] = useState(initialPrefs?.cityName ?? '');
  const [cityQuery, setCityQuery] = useState('');
  const [cityResults, setCityResults] = useState<CityResult[]>([]);
  const [searchingCity, setSearchingCity] = useState(false);
  const [status, setStatus] = useState<'' | 'saving' | 'saved' | 'clearing' | 'cleared'>('');
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);
  const cityInputRef = useRef<HTMLInputElement>(null);

  const touch = () => { setDirty(true); setStatus(''); setError(''); };
  const toggle = (list: string[], v: string, max: number) => (list.includes(v) ? list.filter((x) => x !== v) : list.length >= max ? list : [...list, v]);
  const forJobs = intents.includes('looking_for_jobs');

  useEffect(() => {
    if (cityQuery.trim().length < 2) { setCityResults([]); return; }
    const controller = new AbortController();
    const t = setTimeout(async () => {
      setSearchingCity(true);
      try {
        const res = await fetch(`/api/cities/search?q=${encodeURIComponent(cityQuery)}`, { signal: controller.signal });
        const data = res.ok ? await res.json() : [];
        setCityResults(Array.isArray(data) ? data : []);
      } catch { /* cancelled or offline */ }
      setSearchingCity(false);
    }, 250);
    return () => { clearTimeout(t); controller.abort(); };
  }, [cityQuery]);

  async function save() {
    setStatus('saving');
    setError('');
    const r = await updatePreferences({ intents, topics, jobPrefs: { roles, experience, workModes }, cityId }).catch(() => ({ error: 'Couldn’t reach the server. Try again.' }));
    if ('error' in r) { setError(r.error); setStatus(''); return; }
    setStatus('saved');
    setDirty(false);
  }

  async function clearHistory() {
    if (!window.confirm('Clear your viewing history? Suggestions will rely only on the interests you chose. This can’t be undone.')) return;
    setStatus('clearing');
    const r = await clearActivity().catch(() => ({ error: 'Couldn’t reach the server. Try again.' }));
    if ('error' in r) { setError(r.error); setStatus(''); return; }
    setStatus('cleared');
  }

  return (
    <div className="space-y-5">
      <section className={section} aria-labelledby="pref-intents">
        <h2 id="pref-intents" className={h2}>What you’re here for</h2>
        <p className={sub}>Up to {MAX_INTENTS}. Your home page shows more of the first one.</p>
        <div className="flex flex-wrap gap-2">
          {INTENTS.map((i) => {
            const on = intents.includes(i.value);
            return (
              <button key={i.value} type="button" aria-pressed={on} onClick={() => { setIntents((l) => toggle(l, i.value as IntentValue, MAX_INTENTS)); touch(); }} className={chip(on)}>
                {on && <Check className="w-3.5 h-3.5" strokeWidth={3} aria-hidden />}{i.label}
              </button>
            );
          })}
        </div>
      </section>

      <section className={section} aria-labelledby="pref-topics">
        <h2 id="pref-topics" className={h2}>Topics you follow</h2>
        <p className={sub}>Used for your news, startups, tools and jobs. Up to {MAX_TOPICS}.</p>
        <div className="space-y-5">
          {TOPIC_GROUPS.map((g) => (
            <div key={g} role="group" aria-label={g}>
              <h3 className="mb-2 text-[13px] font-semibold text-gray-500 dark:text-gray-400">{g}</h3>
              <div className="flex flex-wrap gap-2">
                {TOPICS.filter((t) => t.group === g).map((t) => {
                  const on = topics.includes(t.id);
                  return (
                    <button key={t.id} type="button" aria-pressed={on} onClick={() => { setTopics((l) => toggle(l, t.id, MAX_TOPICS)); touch(); }} className={chip(on)}>
                      {on && <Check className="w-3.5 h-3.5" strokeWidth={3} aria-hidden />}{t.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      {forJobs && (
        <section className={section} aria-labelledby="pref-jobs">
          <h2 id="pref-jobs" className={h2}>Jobs you’re looking for</h2>
          <p className={sub}>Matching jobs appear first. Nothing is hidden.</p>
          <div className="space-y-5">
            <div role="group" aria-label="Roles">
              <h3 className="mb-2 text-[13px] font-semibold text-gray-500 dark:text-gray-400">Roles (up to {MAX_JOB_ROLES})</h3>
              <div className="flex flex-wrap gap-2">
                {jobRoles.map((r) => {
                  const on = roles.includes(r.value);
                  return (
                    <button key={r.value} type="button" aria-pressed={on} onClick={() => { setRoles((l) => toggle(l, r.value, MAX_JOB_ROLES)); touch(); }} className={chip(on)}>
                      {on && <Check className="w-3.5 h-3.5" strokeWidth={3} aria-hidden />}{r.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div role="radiogroup" aria-label="Experience">
              <h3 className="mb-2 text-[13px] font-semibold text-gray-500 dark:text-gray-400">Experience</h3>
              <div className="flex flex-wrap gap-2">
                {EXPERIENCE_LEVELS.map((e) => {
                  const on = experience === e.value;
                  return <button key={e.value} type="button" role="radio" aria-checked={on} onClick={() => { setExperience(on ? null : e.value); touch(); }} className={chip(on)}>{e.label}</button>;
                })}
              </div>
            </div>
            <div role="group" aria-label="Where you want to work">
              <h3 className="mb-2 text-[13px] font-semibold text-gray-500 dark:text-gray-400">Where you want to work</h3>
              <div className="flex flex-wrap gap-2">
                {WORK_MODES.map((w) => {
                  const on = workModes.includes(w.value);
                  return (
                    <button key={w.value} type="button" aria-pressed={on} onClick={() => { setWorkModes((l) => toggle(l, w.value, WORK_MODES.length)); touch(); }} className={chip(on)}>
                      {on && <Check className="w-3.5 h-3.5" strokeWidth={3} aria-hidden />}{w.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
      )}

      <section className={section} aria-labelledby="pref-city">
        <h2 id="pref-city" className={h2}>Your city</h2>
        <p className={sub}>For events and jobs near you. Only the city is saved, never your exact location.</p>
        {cityName ? (
          <div className="flex items-center gap-3 min-h-[48px] px-3.5 rounded-[10px] border border-gray-300 dark:border-gray-700">
            <MapPin className="w-4 h-4 text-gray-500 shrink-0" aria-hidden />
            <span className="flex-1 min-w-0 truncate text-[15px] text-gray-900 dark:text-white">{cityName}</span>
            <button type="button" aria-label="Remove city" onClick={() => { setCityId(null); setCityName(''); touch(); setTimeout(() => cityInputRef.current?.focus(), 0); }}
              className="w-9 h-9 -mr-2 flex items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800">
              <X className="w-4 h-4" aria-hidden />
            </button>
          </div>
        ) : (
          <div className="relative">
            <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" aria-hidden />
            <input ref={cityInputRef} aria-label="City" value={cityQuery} onChange={(e) => setCityQuery(e.target.value)} placeholder="Start typing your city" autoComplete="off"
              className="w-full min-h-[48px] pl-10 pr-10 rounded-[10px] border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-[15px] text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/15 dark:focus:ring-white/20 focus:border-gray-900 dark:focus:border-gray-300" />
            {searchingCity && <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-gray-400" aria-label="Searching" />}
            {cityResults.length > 0 && (
              <ul role="listbox" className="absolute left-0 right-0 top-full mt-1.5 z-20 max-h-64 overflow-y-auto py-1 rounded-[12px] border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-lg">
                {cityResults.map((c) => (
                  <li key={c.id} role="option" aria-selected={false}
                    onMouseDown={(e) => { e.preventDefault(); setCityId(c.id); setCityName(`${c.name}${c.state ? `, ${c.state}` : ''}, ${c.country}`); setCityQuery(''); setCityResults([]); touch(); }}
                    className="px-3.5 py-2.5 min-h-[44px] flex items-center cursor-pointer text-[15px] text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-800/60">
                    {c.name}<span className="text-gray-500 dark:text-gray-400">{c.state ? `, ${c.state}` : ''}, {c.country}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <button type="button" onClick={save} disabled={status === 'saving' || !dirty}
          className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 rounded-[10px] bg-gray-900 hover:bg-gray-800 dark:bg-white dark:hover:bg-gray-100 text-white dark:text-gray-900 text-sm font-semibold disabled:opacity-50">
          {status === 'saving' && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
          {status === 'saving' ? 'Saving…' : 'Save preferences'}
        </button>
        <p role="status" className="text-[13px] text-gray-600 dark:text-gray-400">
          {status === 'saved' ? 'Saved. Your suggestions are updated.' : dirty ? 'You have unsaved changes.' : ''}
        </p>
      </div>
      {error && <p role="alert" className="text-sm text-red-700 dark:text-red-400">{error}</p>}

      <section className={section} aria-labelledby="pref-history">
        <h2 id="pref-history" className={h2}>Viewing history</h2>
        <p className={sub}>What you open in the last 30 days also shapes your suggestions. Clearing it keeps only the interests above.</p>
        <button type="button" onClick={clearHistory} disabled={status === 'clearing'}
          className="min-h-[44px] px-4 rounded-[10px] border border-gray-300 dark:border-gray-700 text-sm font-semibold text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50">
          {status === 'clearing' ? 'Clearing…' : status === 'cleared' ? 'History cleared' : 'Clear viewing history'}
        </button>
      </section>
    </div>
  );
}
