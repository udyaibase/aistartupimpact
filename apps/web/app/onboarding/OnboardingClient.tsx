'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { completeOnboarding, skipOnboarding } from './actions';
import {
  Newspaper, Wrench, Briefcase, Rocket, CalendarDays, GraduationCap, TrendingUp, Lightbulb,
  MapPin, Loader2, X, Check, ArrowLeft, ArrowRight, Calendar, Building2,
} from 'lucide-react';
import {
  INTENTS, MAX_INTENTS, TOPICS, TOPIC_GROUPS, MAX_TOPICS, REFERRAL_SOURCES, EXPERIENCE_LEVELS, WORK_MODES, MAX_JOB_ROLES,
  type IntentValue,
} from '@/lib/personalization/topics';

const INTENT_ICONS: Record<IntentValue, typeof Newspaper> = {
  reading_news: Newspaper, exploring_tools: Wrench, looking_for_jobs: Briefcase, following_startups: Rocket,
  attending_events: CalendarDays, learning_ai: GraduationCap, investor_vc: TrendingUp, founder_builder: Lightbulb,
};

/** Cities people pick most, as one-tap shortcuts that fill the search. */
const POPULAR_CITIES = ['Bengaluru', 'Mumbai', 'Delhi', 'Hyderabad', 'Pune', 'Chennai'];
/** Roles shown before "Show all roles". */
const ROLES_SHOWN = 12;

/** Portals open only when the person chooses to: onboarding ends on the website with an offer instead. */
const PORTALS = [
  { prefix: '/founder', icon: Lightbulb, title: 'List your startup in the founder portal', body: 'Add your startup or AI tool, verify your domain and post jobs. Your founder portal is set up the first time you open it.', cta: 'Open founder portal', later: 'You can do this later from “Submit your startup” on the website.' },
  { prefix: '/organizer', icon: Calendar, title: 'Host your event in the organizer portal', body: 'Create events, manage registrations and check people in. Your organizer portal is set up the first time you open it.', cta: 'Open organizer portal', later: 'You can do this later from the Events page.' },
  { prefix: '/employer', icon: Building2, title: 'Hire in the employer portal', body: 'Post jobs and review candidates with your team.', cta: 'Open employer portal', later: 'You can do this later from the Jobs page.' },
] as const;
const portalFor = (path: string) => PORTALS.find((p) => path === p.prefix || path.startsWith(`${p.prefix}/`) || path.startsWith(`${p.prefix}?`));

type Step = 'intents' | 'topics' | 'jobs' | 'finish';
type CityResult = { id: string; name: string; state: string | null; country: string };

const card = 'rounded-[14px] border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900';
const primaryBtn = 'inline-flex items-center justify-center gap-2 min-h-[44px] px-5 rounded-[10px] bg-gray-900 hover:bg-gray-800 dark:bg-white dark:hover:bg-gray-100 text-white dark:text-gray-900 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors';
const quietBtn = 'inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3 rounded-[10px] text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors';
const chip = (on: boolean) => `inline-flex items-center gap-1 sm:gap-1.5 min-h-[36px] sm:min-h-[40px] px-3 sm:px-3.5 rounded-full border text-[13px] sm:text-sm font-medium transition-colors ${on ? 'border-gray-900 dark:border-white bg-gray-900 dark:bg-white text-white dark:text-gray-900' : 'border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 hover:border-gray-500'}`;
const sectionLabel = 'block text-sm font-semibold text-gray-900 dark:text-gray-100';
const hint = 'text-[13px] text-gray-500 dark:text-gray-400';

export default function OnboardingClient({
  jobRoles = [],
  returnTo,
  userName,
  finished = false,
}: {
  /** Every job role, with how many open jobs it has right now (most first). */
  jobRoles?: { value: string; label: string; count: number }[];
  returnTo: string;
  userName: string;
  /** Onboarding is already done and they were headed to a portal: start on the "open the portal?" screen. */
  finished?: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>('intents');
  const [loading, setLoading] = useState<'' | 'finish' | 'skip'>('');
  const [intents, setIntents] = useState<IntentValue[]>([]);
  const [topics, setTopics] = useState<string[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [showAllRoles, setShowAllRoles] = useState(false);
  const [experience, setExperience] = useState<string | null>(null);
  const [workModes, setWorkModes] = useState<string[]>([]);
  const [referral, setReferral] = useState<string | null>(null);
  const [referralDetail, setReferralDetail] = useState('');
  const [newsletter, setNewsletter] = useState(false);

  const [cityId, setCityId] = useState<string | null>(null);
  const [cityName, setCityName] = useState('');
  const [cityQuery, setCityQuery] = useState('');
  const [cityResults, setCityResults] = useState<CityResult[]>([]);
  const [searchingCity, setSearchingCity] = useState(false);
  const [cityNotice, setCityNotice] = useState<'' | 'none' | 'error'>('');
  const [activeCity, setActiveCity] = useState(-1);
  const [finishError, setFinishError] = useState('');
  const [done, setDone] = useState<{ href: string; portal: (typeof PORTALS)[number] } | null>(() => {
    const portal = finished ? portalFor(returnTo) : undefined;
    return portal ? { href: returnTo, portal } : null;
  });
  const headingRef = useRef<HTMLHeadingElement>(null);
  const cityInputRef = useRef<HTMLInputElement>(null);

  const firstName = userName.split(' ')[0];
  const forJobs = intents.includes('looking_for_jobs');
  const steps: Step[] = forJobs ? ['intents', 'topics', 'jobs', 'finish'] : ['intents', 'topics', 'finish'];
  const index = steps.indexOf(step);
  const rolesShown = showAllRoles ? jobRoles : jobRoles.slice(0, ROLES_SHOWN);
  const topicsByGroup = useMemo(() => TOPIC_GROUPS.map((g) => ({ group: g, items: TOPICS.filter((t) => t.group === g) })), []);

  useEffect(() => { headingRef.current?.focus(); }, [step, done]);

  const go = (s: Step) => { setFinishError(''); setStep(s); window.scrollTo({ top: 0 }); };
  const next = () => go(steps[index + 1]);
  const back = () => go(steps[index - 1]);
  const toggle = <T,>(list: T[], v: T, max: number) => (list.includes(v) ? list.filter((x) => x !== v) : list.length >= max ? list : [...list, v]);

  /** Go where they were headed, unless that's a portal: then show the offer. */
  const leave = (dest: string) => {
    const portal = portalFor(dest);
    if (portal) { setDone({ href: dest, portal }); setLoading(''); window.scrollTo({ top: 0 }); return; }
    router.push(dest);
    router.refresh();
  };

  useEffect(() => {
    setCityNotice('');
    setActiveCity(-1);
    if (cityQuery.trim().length < 2) { setCityResults([]); setSearchingCity(false); return; }
    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      setSearchingCity(true);
      try {
        const res = await fetch(`/api/cities/search?q=${encodeURIComponent(cityQuery)}`, { signal: controller.signal });
        const data = res.ok ? await res.json() : null;
        if (!Array.isArray(data)) throw new Error('search failed');
        setCityResults(data);
        setCityNotice(data.length ? '' : 'none');
        setSearchingCity(false);
      } catch (e) {
        if ((e as Error).name === 'AbortError') return; // a newer keystroke reports its own result
        setCityResults([]);
        setCityNotice('error');
        setSearchingCity(false);
      }
    }, 250);
    return () => { clearTimeout(timeout); controller.abort(); };
  }, [cityQuery]);

  const pickCity = (c: CityResult) => {
    setCityId(c.id);
    setCityName(`${c.name}${c.state ? `, ${c.state}` : ''}, ${c.country}`);
    setCityQuery('');
    setCityResults([]);
  };
  const onCityKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!cityResults.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveCity((i) => (i + 1) % cityResults.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveCity((i) => (i <= 0 ? cityResults.length - 1 : i - 1)); }
    else if (e.key === 'Enter' && activeCity >= 0) { e.preventDefault(); pickCity(cityResults[activeCity]); }
    else if (e.key === 'Escape') setCityResults([]);
  };

  const handleFinish = async () => {
    setLoading('finish');
    setFinishError('');
    try {
      const result = await completeOnboarding({
        intents, topics, cityId: cityId || undefined, newsletter,
        jobPrefs: forJobs ? { roles, experience, workModes } : undefined,
        referralSource: referral || undefined,
        referralDetail: referral === 'other' ? referralDetail : undefined,
      });
      if ('success' in result) {
        // Nowhere particular to go back to: open the part of the site they said they came for first.
        const START: Partial<Record<IntentValue, string>> = {
          reading_news: '/news',
          exploring_tools: '/tools',
          looking_for_jobs: roles.length === 1 ? `/jobs?category=${encodeURIComponent(roles[0])}` : '/jobs',
          following_startups: '/startups',
          attending_events: '/events',
          investor_vc: '/startups',
          founder_builder: '/founder/startups/new',
        };
        const first = intents[0];
        leave(returnTo === '/' && first && START[first] ? START[first]! : returnTo);
        return;
      }
      setFinishError(result.error);
    } catch {
      setFinishError('Couldn’t reach the server. Check your connection and try again.');
    }
    setLoading('');
  };

  const handleSkipAll = async () => {
    setLoading('skip');
    setFinishError('');
    try {
      const result = await skipOnboarding();
      if ('success' in result) { leave(returnTo); return; }
      setFinishError(result.error);
    } catch {
      setFinishError('Couldn’t reach the server. Check your connection and try again.');
    }
    setLoading('');
  };

  const heading = (title: string, sub: string) => (
    <div className="mb-5 sm:mb-7">
      <h1 ref={headingRef} tabIndex={-1} className="font-sora font-bold text-[22px] sm:text-[28px] leading-tight text-gray-900 dark:text-white focus:outline-none">{title}</h1>
      <p className="mt-1.5 text-[14px] sm:text-[15px] text-gray-600 dark:text-gray-400">{sub}</p>
    </div>
  );

  /** Under the content: optional status on the left, the main button on the right (full width on phones). */
  const footer = (primary: React.ReactNode, note?: React.ReactNode) => (
    <div className="mt-5 sm:mt-6">
      {finishError && <p role="alert" className="mb-4 rounded-[10px] border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 px-3.5 py-2.5 text-sm text-red-800 dark:text-red-300">{finishError}</p>}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        {note && <p className={`${hint} sm:mr-auto`} aria-live="polite">{note}</p>}
        <div className="flex flex-col sm:flex-row gap-3 sm:ml-auto [&>button]:w-full sm:[&>button]:w-auto">{primary}</div>
      </div>
    </div>
  );

  return (
    <>
    {!done && (
      <div className="sticky top-0 z-10 bg-[#F7F7F8]/90 dark:bg-gray-950/90 backdrop-blur pt-[env(safe-area-inset-top)]">
        <div className="mx-auto max-w-[680px] px-2 sm:px-4 h-14 flex items-center gap-2 sm:gap-3">
          <button type="button" onClick={back} disabled={index === 0} aria-label="Back"
            className={`w-10 h-10 shrink-0 flex items-center justify-center rounded-full text-gray-700 dark:text-gray-300 hover:bg-gray-200/70 dark:hover:bg-gray-800 ${index === 0 ? 'invisible' : ''}`}>
            <ArrowLeft className="w-5 h-5" aria-hidden />
          </button>
          <div className="flex-1 flex gap-1.5" role="progressbar" aria-label={`Step ${index + 1} of ${steps.length}`} aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={index + 1}>
            {steps.map((s, i) => (
              <span key={s} className="h-1.5 flex-1 rounded-full bg-gray-200 dark:bg-gray-800 overflow-hidden">
                <span className={`block h-full rounded-full bg-gray-900 dark:bg-white transition-[width] duration-300 ${i <= index ? 'w-full' : 'w-0'}`} />
              </span>
            ))}
          </div>
          <button type="button" onClick={handleSkipAll} disabled={!!loading}
            className="shrink-0 min-h-[40px] px-3 rounded-full text-sm font-semibold text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200/70 dark:hover:bg-gray-800 disabled:opacity-50">
            {loading === 'skip' ? 'Skipping…' : 'Skip'}
          </button>
        </div>
      </div>
    )}
    <main className="mx-auto max-w-[680px] px-4 pt-4 sm:pt-8 pb-[calc(2.5rem+env(safe-area-inset-bottom))]">
      {done ? (
        <>
          <div className="mb-6 sm:mb-8">
            <span className="flex w-11 h-11 items-center justify-center rounded-full bg-gray-900 dark:bg-white text-white dark:text-gray-900 mb-5" aria-hidden><Check className="w-5 h-5" strokeWidth={3} /></span>
            <h1 ref={headingRef} tabIndex={-1} className="font-sora font-bold text-[24px] sm:text-[28px] leading-tight text-gray-900 dark:text-white focus:outline-none">You’re all set, {firstName}</h1>
            <p className="mt-2 text-[15px] text-gray-600 dark:text-gray-400">Your Udyaibase account is ready. Here’s where you can go next.</p>
          </div>
          <div className={`${card} p-5 sm:p-6`}>
            <div className="flex items-start gap-3.5">
              <span className="flex w-10 h-10 shrink-0 items-center justify-center rounded-[10px] border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"><done.portal.icon className="w-[18px] h-[18px]" aria-hidden /></span>
              <div className="min-w-0">
                <h2 className="text-[16px] font-semibold text-gray-900 dark:text-white">{done.portal.title}</h2>
                <p className="mt-1 text-[14px] text-gray-600 dark:text-gray-400">{done.portal.body}</p>
              </div>
            </div>
            <div className="mt-5 flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
              <button type="button" onClick={() => { router.push('/'); router.refresh(); }} className={quietBtn}>Not now, go to homepage</button>
              <button type="button" onClick={() => { window.location.href = done.href; }} className={primaryBtn}>{done.portal.cta} <ArrowRight className="w-4 h-4" aria-hidden /></button>
            </div>
          </div>
          <p className="mt-4 text-[13px] text-gray-500 dark:text-gray-400">{done.portal.later}</p>
        </>
      ) : (
        <>
          <p className="mb-1.5 text-[13px] font-medium text-gray-500 dark:text-gray-400">Step {index + 1} of {steps.length}</p>

          {step === 'intents' && (
            <>
              {heading(`Welcome, ${firstName}. What are you here for?`, `Choose up to ${MAX_INTENTS}. We’ll shape your home page around them, and you can change this any time in Settings.`)}
              <div role="group" aria-label="What you're here for" className={`${card} divide-y divide-gray-100 dark:divide-gray-800 overflow-hidden`}>
                {INTENTS.map(({ value, label, description }) => {
                  const on = intents.includes(value);
                  const full = !on && intents.length >= MAX_INTENTS;
                  const Icon = INTENT_ICONS[value];
                  return (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={on}
                      aria-disabled={full || undefined}
                      onClick={() => !full && setIntents((l) => toggle(l, value, MAX_INTENTS))}
                      className={`w-full flex items-center gap-3 sm:gap-3.5 px-3.5 sm:px-4 py-3 sm:py-3.5 text-left transition-colors focus-visible:outline-none focus-visible:bg-gray-50 dark:focus-visible:bg-gray-800/60 ${on ? 'bg-gray-50 dark:bg-gray-800/60' : full ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-50 dark:hover:bg-gray-800/40'}`}
                    >
                      <span className={`flex w-9 h-9 sm:w-10 sm:h-10 shrink-0 items-center justify-center rounded-[10px] border ${on ? 'border-gray-900 dark:border-white bg-gray-900 dark:bg-white text-white dark:text-gray-900' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'}`}>
                        <Icon className="w-[18px] h-[18px]" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[14px] sm:text-[15px] font-semibold text-gray-900 dark:text-white">{label}</span>
                        <span className="block text-[13px] text-gray-600 dark:text-gray-400 mt-0.5">{description}</span>
                      </span>
                      <span aria-hidden className={`flex w-5 h-5 shrink-0 items-center justify-center rounded-[6px] border ${on ? 'border-gray-900 dark:border-white bg-gray-900 dark:bg-white' : 'border-gray-300 dark:border-gray-600'}`}>
                        {on && <Check className="w-3 h-3 text-white dark:text-gray-900" strokeWidth={3} />}
                      </span>
                    </button>
                  );
                })}
              </div>
              {footer(<button type="button" onClick={next} disabled={!intents.length} className={primaryBtn}>Continue</button>, intents.length ? `${intents.length} of ${MAX_INTENTS} chosen` : `Choose up to ${MAX_INTENTS}`)}
            </>
          )}

          {step === 'topics' && (
            <>
              {heading('Which topics do you want to follow?', 'We use these for your news, startups, tools and jobs.')}
              <div className="space-y-6">
                {topicsByGroup.map(({ group, items }) => (
                  <div key={group} role="group" aria-label={group}>
                    <h2 className="mb-2.5 text-[13px] font-semibold text-gray-500 dark:text-gray-400">{group}</h2>
                    <div className="flex flex-wrap gap-1.5 sm:gap-2">
                      {items.map((t) => {
                        const on = topics.includes(t.id);
                        return (
                          <button key={t.id} type="button" aria-pressed={on} onClick={() => setTopics((l) => toggle(l, t.id, MAX_TOPICS))} className={chip(on)}>
                            {on && <Check className="w-3.5 h-3.5" strokeWidth={3} aria-hidden />}
                            {t.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              {footer(
                <button type="button" onClick={next} className={primaryBtn}>{topics.length ? 'Continue' : 'Continue without topics'}</button>,
                topics.length >= MAX_TOPICS ? `${MAX_TOPICS} chosen, the most you can follow` : topics.length ? `${topics.length} chosen` : 'Optional. Pick 3 or more for the best results.',
              )}
            </>
          )}

          {step === 'jobs' && (
            <>
              {heading('What kind of job are you looking for?', 'We’ll show matching jobs first. Everything here is optional and you can change it later.')}
              <div className="space-y-7">
                <div role="group" aria-labelledby="ob-roles">
                  <div className="flex items-baseline justify-between gap-3 mb-2.5">
                    <h2 id="ob-roles" className={sectionLabel}>Roles</h2>
                    <span className={hint}>Up to {MAX_JOB_ROLES}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 sm:gap-2">
                    {rolesShown.map((r) => {
                      const on = roles.includes(r.value);
                      return (
                        <button key={r.value} type="button" aria-pressed={on} onClick={() => setRoles((l) => toggle(l, r.value, MAX_JOB_ROLES))} className={chip(on)}>
                          {on && <Check className="w-3.5 h-3.5" strokeWidth={3} aria-hidden />}
                          {r.label}
                          {r.count > 0 && <span className={on ? 'opacity-70' : 'text-gray-500 dark:text-gray-400'}>{r.count}</span>}
                        </button>
                      );
                    })}
                  </div>
                  {jobRoles.length > ROLES_SHOWN && (
                    <button type="button" onClick={() => setShowAllRoles((v) => !v)} className="mt-2 min-h-[40px] text-[13px] font-semibold text-gray-700 dark:text-gray-300 hover:underline">
                      {showAllRoles ? 'Show fewer roles' : `Show all ${jobRoles.length} roles`}
                    </button>
                  )}
                </div>

                <div role="radiogroup" aria-labelledby="ob-exp">
                  <h2 id="ob-exp" className={`${sectionLabel} mb-2.5`}>Experience</h2>
                  <div className="flex flex-wrap gap-1.5 sm:gap-2">
                    {EXPERIENCE_LEVELS.map((e) => {
                      const on = experience === e.value;
                      return <button key={e.value} type="button" role="radio" aria-checked={on} onClick={() => setExperience(on ? null : e.value)} className={chip(on)}>{e.label}</button>;
                    })}
                  </div>
                </div>

                <div role="group" aria-labelledby="ob-mode">
                  <h2 id="ob-mode" className={`${sectionLabel} mb-2.5`}>Where you want to work</h2>
                  <div className="flex flex-wrap gap-1.5 sm:gap-2">
                    {WORK_MODES.map((w) => {
                      const on = workModes.includes(w.value);
                      return (
                        <button key={w.value} type="button" aria-pressed={on} onClick={() => setWorkModes((l) => toggle(l, w.value, WORK_MODES.length))} className={chip(on)}>
                          {on && <Check className="w-3.5 h-3.5" strokeWidth={3} aria-hidden />}{w.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
              {footer(<button type="button" onClick={next} className={primaryBtn}>Continue</button>)}
            </>
          )}

          {step === 'finish' && (
            <>
              {heading('Almost done', 'Two quick questions. Both are optional.')}
              <div className="space-y-8">
                <div>
                  <label htmlFor="ob-city" className={`${sectionLabel} mb-1`}>Where are you based?</label>
                  <p className={`${hint} mb-2.5`}>For events and jobs near you. We only save your city, never your exact location.</p>
                  {cityName ? (
                    <div className="flex items-center gap-3 min-h-[48px] px-3.5 rounded-[10px] border border-gray-900 dark:border-gray-300 bg-white dark:bg-gray-900">
                      <MapPin className="w-4 h-4 text-gray-500 shrink-0" aria-hidden />
                      <span className="flex-1 min-w-0 truncate text-[15px] font-medium text-gray-900 dark:text-white">{cityName}</span>
                      <button type="button" onClick={() => { setCityId(null); setCityName(''); setTimeout(() => cityInputRef.current?.focus(), 0); }}
                        aria-label="Change city" className="w-9 h-9 -mr-2 flex items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800">
                        <X className="w-4 h-4" aria-hidden />
                      </button>
                    </div>
                  ) : (
                    <div className="relative">
                      <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" aria-hidden />
                      <input
                        id="ob-city" ref={cityInputRef} type="text" role="combobox"
                        aria-expanded={cityResults.length > 0} aria-controls="ob-city-list" aria-autocomplete="list"
                        aria-activedescendant={activeCity >= 0 ? `ob-city-${activeCity}` : undefined}
                        value={cityQuery} onChange={(e) => setCityQuery(e.target.value)} onKeyDown={onCityKey}
                        placeholder="Start typing your city" autoComplete="off" enterKeyHint="search"
                        className="w-full min-h-[48px] pl-10 pr-10 rounded-[10px] border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-[15px] text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/15 dark:focus:ring-white/20 focus:border-gray-900 dark:focus:border-gray-300"
                      />
                      {searchingCity && <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-gray-400" aria-label="Searching" />}
                      {cityResults.length > 0 && (
                        <ul id="ob-city-list" role="listbox" className={`${card} absolute left-0 right-0 top-full mt-1.5 z-20 max-h-64 overflow-y-auto py-1 shadow-lg`}>
                          {cityResults.map((c, i) => (
                            <li key={c.id} id={`ob-city-${i}`} role="option" aria-selected={i === activeCity}
                              onMouseDown={(e) => { e.preventDefault(); pickCity(c); }}
                              className={`px-3.5 py-2.5 min-h-[44px] flex items-center cursor-pointer text-[15px] text-gray-900 dark:text-white ${i === activeCity ? 'bg-gray-100 dark:bg-gray-800' : 'hover:bg-gray-50 dark:hover:bg-gray-800/60'}`}>
                              <span>{c.name}<span className="text-gray-500 dark:text-gray-400">{c.state ? `, ${c.state}` : ''}, {c.country}</span></span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                  {!cityId && !searchingCity && cityNotice && (
                    <p role="status" className="mt-2 text-[13px] text-gray-600 dark:text-gray-400">
                      {cityNotice === 'none'
                        ? `No city matches “${cityQuery.trim()}”. Try another spelling, for example Bengaluru or Bangalore.`
                        : 'City search isn’t working right now. You can finish without it and add your city later.'}
                    </p>
                  )}
                  {!cityId && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {POPULAR_CITIES.map((c) => (
                        <button key={c} type="button" onClick={() => { setCityQuery(c); cityInputRef.current?.focus(); }}
                          className="min-h-[36px] px-3 rounded-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-[13px] font-medium text-gray-800 dark:text-gray-200 hover:border-gray-500">
                          {c}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div role="radiogroup" aria-labelledby="ob-ref">
                  <h2 id="ob-ref" className={`${sectionLabel} mb-1`}>How did you hear about Udyaibase?</h2>
                  <p className={`${hint} mb-2.5`}>It helps us reach more people like you.</p>
                  <div className="flex flex-wrap gap-1.5 sm:gap-2">
                    {REFERRAL_SOURCES.map((r) => {
                      const on = referral === r.value;
                      return <button key={r.value} type="button" role="radio" aria-checked={on} onClick={() => setReferral(on ? null : r.value)} className={chip(on)}>{r.label}</button>;
                    })}
                  </div>
                  {referral === 'other' && (
                    <input
                      aria-label="Where did you hear about Udyaibase?" value={referralDetail} onChange={(e) => setReferralDetail(e.target.value.slice(0, 120))}
                      maxLength={120} placeholder="Tell us where (optional)"
                      className="mt-3 w-full min-h-[44px] px-3.5 rounded-[10px] border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-[15px] text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/15 dark:focus:ring-white/20 focus:border-gray-900 dark:focus:border-gray-300"
                    />
                  )}
                </div>

                <label className={`${card} flex items-start gap-3 p-4 cursor-pointer`}>
                  <input type="checkbox" checked={newsletter} onChange={(e) => setNewsletter(e.target.checked)} className="mt-0.5 w-5 h-5 shrink-0 rounded border-gray-300 dark:border-gray-600 accent-gray-900 dark:accent-white" />
                  <span>
                    <span className="block text-[15px] font-semibold text-gray-900 dark:text-white">Send me the weekly Udyaibase newsletter</span>
                    <span className={`block mt-0.5 ${hint}`}>The week’s top AI news, startups and jobs. Unsubscribe in one click.</span>
                  </span>
                </label>
              </div>
              {footer(
                <button type="button" onClick={handleFinish} disabled={!!loading} className={primaryBtn}>
                  {loading === 'finish' && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
                  {loading === 'finish' ? 'Finishing…' : 'Finish'}
                </button>,
              )}
            </>
          )}
        </>
      )}
    </main>
    </>
  );
}
