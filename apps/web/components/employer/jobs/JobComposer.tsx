'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check, Loader2, Plus, Trash2, Info, Eye, AlertTriangle, BadgeCheck } from 'lucide-react';
import {
  CURRENCIES, EMPLOYMENT_TYPES, EXPERIENCE_BANDS, JOB_CATEGORIES, MAX_OPEN_DAYS, MAX_SCREENING_QUESTIONS, MAX_SKILLS,
  WORK_TYPES, publishProblems, salaryUnit, type JobDraft, type ScreeningQuestion,
} from '@/lib/jobs/composer';
import { Card, Field, Segmented, TagInput, Toggle, inputCls } from './fields';
import { JobPreview, ListingStrength, type ComposerCompany } from './JobPreview';
import StartFaster from './StartFaster';
import PublishedScreen from './PublishedScreen';

type Status = 'NEW' | 'DRAFT' | 'OPEN' | 'PAUSED' | 'CLOSED';
type Errors = Partial<Record<keyof JobDraft, string>>;

const AUTOSAVE_MS = 2000;
const SKILL_SUGGESTIONS = ['Python', 'TypeScript', 'React', 'Node.js', 'PyTorch', 'LLMs', 'SQL', 'AWS', 'Figma', 'Go'];
const QUESTION_SUGGESTIONS: Omit<ScreeningQuestion, 'id'>[] = [
  { question: 'What is your notice period?', type: 'text', required: true },
  { question: 'Are you open to working from our office?', type: 'yesno', required: true },
  { question: 'Share a link to something you’ve built.', type: 'text', required: false },
];

function ago(ts: number) {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min ago` : 'over an hour ago';
}

const STATUS_LABEL: Record<Status, string> = { NEW: 'New job', DRAFT: 'Draft', OPEN: 'Open', PAUSED: 'Paused', CLOSED: 'Closed' };

export default function JobComposer({
  jobId: initialId, initialDraft, initialStatus, initialSlug, initialSavedAt, company, previousJobs, emailVerified,
  approval = { required: false, canDecide: false }, everPublished = false, approvalRequest = null,
}: {
  jobId?: string;
  initialDraft: JobDraft;
  initialStatus: Status;
  initialSlug?: string;
  initialSavedAt?: string | null;
  company: ComposerCompany;
  previousJobs: { id: string; title: string }[];
  emailVerified: boolean;
  /** required: this recruiter's new jobs wait for an owner. canDecide: owner, can decline a request. */
  approval?: { required: boolean; canDecide: boolean };
  everPublished?: boolean;
  approvalRequest?: { at: string; by: string | null } | null;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<JobDraft>(initialDraft);
  const [id, setId] = useState(initialId);
  const [status, setStatus] = useState<Status>(initialStatus);
  const [slug, setSlug] = useState(initialSlug ?? '');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>(initialSavedAt ? 'saved' : 'idle');
  const [savedAt, setSavedAt] = useState<number | null>(initialSavedAt ? new Date(initialSavedAt).getTime() : null);
  const [saveError, setSaveError] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [notice, setNotice] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [actionError, setActionError] = useState<React.ReactNode>('');
  const [published, setPublished] = useState(false);
  const [request, setRequest] = useState(approvalRequest);
  const [declineNote, setDeclineNote] = useState<string | null>(null);
  const needsApproval = approval.required && !everPublished;
  const [, tick] = useState(0);

  const draftRef = useRef(draft);
  const idRef = useRef(id);
  const version = useRef(0);
  const savedVersion = useRef(0);
  const inflight = useRef<Promise<boolean> | null>(null);
  const isDraft = status === 'NEW' || status === 'DRAFT';

  draftRef.current = draft;
  idRef.current = id;

  const update = useCallback(<K extends keyof JobDraft>(key: K, value: JobDraft[K]) => {
    version.current++;
    setDraft((d) => ({ ...d, [key]: value }));
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
  }, []);

  /** Saves the latest draft. Creates the row on first save (only ever with a title). */
  const save = useCallback(async (): Promise<boolean> => {
    if (inflight.current) await inflight.current;
    const d = draftRef.current;
    if (!d.title.trim()) return false;
    const v = version.current;
    const run = (async () => {
      setSaveState('saving');
      setSaveError('');
      try {
        const currentId = idRef.current;
        const res = await fetch(currentId ? `/api/employer/jobs/${currentId}` : '/api/employer/jobs', {
          method: currentId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ draft: d }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setSaveState('error');
          setSaveError(data.error || 'Couldn’t save.');
          if (data.field) setErrors((e) => ({ ...e, [data.field]: data.error }));
          return false;
        }
        if (!currentId && data.job?.id) {
          idRef.current = data.job.id;
          setId(data.job.id);
          setStatus('DRAFT');
          // Keep the component mounted; just make the URL resumable.
          window.history.replaceState(null, '', `/employer/jobs/${data.job.id}/edit`);
        }
        if (data.job?.slug) setSlug(data.job.slug);
        savedVersion.current = v;
        setSavedAt(Date.now());
        setSaveState('saved');
        return true;
      } catch {
        setSaveState('error');
        setSaveError('You seem to be offline. We’ll keep your changes here.');
        return false;
      }
    })();
    inflight.current = run;
    const ok = await run;
    inflight.current = null;
    return ok;
  }, []);

  // Autosave drafts: nothing is stored until there is a title, then 2s after the last change.
  useEffect(() => {
    if (!isDraft || !draft.title.trim() || version.current === savedVersion.current) return;
    const t = setTimeout(() => { save(); }, AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [draft, isDraft, save]);

  useEffect(() => {
    const i = setInterval(() => tick((n) => n + 1), 15_000);
    return () => clearInterval(i);
  }, []);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (version.current !== savedVersion.current && draftRef.current.title.trim()) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  function focusField(field: keyof JobDraft) {
    const el = document.getElementById(`job-${field}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el?.focus({ preventScroll: true });
  }

  function showProblems() {
    const problems = publishProblems(draftRef.current);
    if (!problems.length) return false;
    setErrors(Object.fromEntries(problems.map((p) => [p.field, p.message])));
    setActionError(`Fix ${problems.length} thing${problems.length === 1 ? '' : 's'} before ${isDraft ? 'publishing' : 'saving'}.`);
    focusField(problems[0].field);
    return true;
  }

  async function publish() {
    setActionError('');
    if (showProblems()) return;
    setPublishing(true);
    try {
      if (!(await save())) { setActionError('Couldn’t save the job. Try again.'); return; }
      const res = await fetch(`/api/employer/jobs/${idRef.current}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: status === 'CLOSED' || status === 'PAUSED' ? 'resume' : 'publish' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.code === 'email_unverified') {
          setActionError(<>Verify your email before publishing. Your job is saved as a draft. <a href="#verify-email" className="font-semibold underline">Verify now</a></>);
        } else if (data.code === 'startup_unverified') {
          setActionError(<>Verify your startup before publishing. Your job is saved as a draft. <Link href="/employer/company" className="font-semibold underline">Verify now</Link></>);
        } else {
          setActionError(data.error || 'Couldn’t publish. Try again.');
          if (data.field) { setErrors((e) => ({ ...e, [data.field]: data.error })); focusField(data.field); }
        }
        return;
      }
      if (data.approval === 'requested') {
        setRequest({ at: new Date().toISOString(), by: null });
        setNotice('Sent to your workspace owners. The job stays a draft until one of them publishes it. You can keep editing.');
        return;
      }
      setStatus('OPEN');
      setPublished(true);
      document.querySelector('main')?.scrollTo({ top: 0 });
    } catch {
      setActionError('You seem to be offline. Check your connection and try again.');
    } finally {
      setPublishing(false);
    }
  }

  async function decline() {
    setPublishing(true);
    setActionError('');
    try {
      const res = await fetch(`/api/employer/jobs/${idRef.current}/status`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'decline', note: declineNote ?? '' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setActionError(data.error || 'Couldn’t send it back. Try again.'); return; }
      setRequest(null);
      setDeclineNote(null);
      setNotice('Sent back. They’ve been emailed and the job stays a draft.');
    } catch {
      setActionError('You seem to be offline. Check your connection and try again.');
    } finally {
      setPublishing(false);
    }
  }

  async function saveLive() {
    setActionError('');
    if (showProblems()) return;
    setPublishing(true);
    const ok = await save();
    setPublishing(false);
    if (ok) setNotice(status === 'OPEN' ? 'Changes saved. They’re live now.' : 'Changes saved.');
  }

  async function duplicate(sourceId: string) {
    const res = await fetch('/api/employer/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ duplicateOf: sourceId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.job?.id) throw new Error(data.error || 'Couldn’t copy that job.');
    router.push(`/employer/jobs/${data.job.id}/edit`);
  }

  function fill(partial: Partial<JobDraft>, note: string) {
    version.current++;
    setDraft((d) => ({ ...d, ...partial }));
    setErrors({});
    setNotice(note);
  }

  const setQuestions = (qs: ScreeningQuestion[]) => update('screeningQuestions', qs);
  const addQuestion = (q: Omit<ScreeningQuestion, 'id'>) => {
    if (draft.screeningQuestions.length >= MAX_SCREENING_QUESTIONS) return;
    setQuestions([...draft.screeningQuestions, { ...q, id: Math.random().toString(36).slice(2, 10) }]);
  };

  if (published && id) {
    return <PublishedScreen title={draft.title} slug={slug} companyName={company.name} jobId={id} />;
  }

  const unit = salaryUnit(draft.salaryCurrency);
  const today = new Date().toISOString().slice(0, 10);
  const maxDate = new Date(Date.now() + MAX_OPEN_DAYS * 86_400_000).toISOString().slice(0, 10);
  const err = (k: keyof JobDraft) => errors[k];
  const aria = (k: keyof JobDraft, hint = false) => ({
    'aria-invalid': !!errors[k] || undefined,
    'aria-describedby': errors[k] ? `job-${k}-error` : hint ? `job-${k}-hint` : undefined,
  });
  const usedSuggestions = new Set(draft.screeningQuestions.map((q) => q.question));

  const saveLine = !isDraft
    ? saveState === 'saving' ? 'Saving…' : saveState === 'error' ? saveError : 'Edits to a live job apply when you save.'
    : !draft.title.trim()
      ? 'Add a job title to start saving a draft.'
      : saveState === 'saving' ? 'Saving draft…'
      : saveState === 'error' ? saveError
      : savedAt ? `Draft saved ${ago(savedAt)}` : 'Draft not saved yet';

  return (
    <div className="font-jakarta">
      <div className="flex items-start gap-3 mb-5">
        <Link href="/employer/jobs" aria-label="Back to jobs" className="w-10 h-10 -ml-2 flex items-center justify-center rounded-[10px] text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 shrink-0">
          <ArrowLeft className="w-5 h-5" aria-hidden />
        </Link>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="portal-title">{status === 'NEW' ? 'Post a job' : 'Edit job'}</h1>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">{STATUS_LABEL[status]}</span>
          </div>
          <p className="portal-subtitle">Candidates see the preview on the right. You can edit the job after it’s live.</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_340px] gap-5 lg:gap-6 items-start">
        <div className="space-y-4 min-w-0">
          {!company.verified && (
            <div role="status" className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-[14px] border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800/50">
              <AlertTriangle className="hidden sm:block w-5 h-5 text-amber-600 shrink-0" aria-hidden />
              <p className="flex-1 text-sm text-amber-900 dark:text-amber-200">
                <span className="font-semibold">Verify your startup to publish.</span> Jobs on Udyaibase always belong to a verified startup. You can write and save this job now.
              </p>
              <Link href="/employer/company" className="inline-flex items-center justify-center min-h-[40px] px-4 rounded-md bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold shrink-0">Verify startup</Link>
            </div>
          )}

          {status === 'NEW' && <StartFaster previousJobs={previousJobs} onFill={fill} onDuplicate={duplicate} />}

          {isDraft && request && approval.canDecide && (
            <div role="status" className="p-4 rounded-[14px] border border-blue-200 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-900/40">
              <p className="text-sm text-blue-900 dark:text-blue-200">
                <span className="font-semibold">{request.by ?? 'A recruiter'} asked to publish this job</span> on {new Date(request.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}. Review it, then publish, or send it back with a note.
              </p>
              {declineNote === null ? (
                <button type="button" onClick={() => setDeclineNote('')} className="mt-2 min-h-[40px] text-sm font-semibold text-blue-900 dark:text-blue-200 hover:underline">Send back with a note</button>
              ) : (
                <div className="mt-3 space-y-2">
                  <label htmlFor="decline-note" className="block text-sm font-semibold text-gray-900 dark:text-white">What should they change? <span className="font-normal text-gray-500">(optional)</span></label>
                  <textarea id="decline-note" value={declineNote} onChange={(e) => setDeclineNote(e.target.value)} maxLength={500} rows={3} className={inputCls} />
                  <div className="flex gap-2">
                    <button type="button" onClick={decline} disabled={publishing} className="min-h-[40px] px-4 rounded-[10px] bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold disabled:opacity-50">Send back</button>
                    <button type="button" onClick={() => setDeclineNote(null)} className="min-h-[40px] px-3 text-sm font-semibold text-gray-600 hover:underline">Cancel</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {isDraft && needsApproval && request && !notice && (
            <div role="status" className="flex items-start gap-2 p-3 rounded-[12px] border border-gray-200 bg-gray-50 dark:bg-gray-900 dark:border-gray-800 text-sm text-gray-700 dark:text-gray-300">
              <Info className="w-4 h-4 mt-0.5 shrink-0" aria-hidden /> Waiting for an owner to publish this job (asked {new Date(request.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}).
            </div>
          )}

          {notice && (
            <div role="status" className="flex items-start gap-2 p-3 rounded-[12px] border border-blue-200 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-900/40 text-sm text-blue-900 dark:text-blue-200">
              <Info className="w-4 h-4 mt-0.5 shrink-0" aria-hidden /> <span className="flex-1">{notice}</span>
              <button type="button" onClick={() => setNotice('')} className="text-[13px] font-semibold hover:underline">Dismiss</button>
            </div>
          )}

          <Card id="basics" title="Role">
            <Field label="Job title" htmlFor="job-title" error={err('title')} hint="Use the title people search for, like “Backend Engineer”.">
              <input id="job-title" value={draft.title} onChange={(e) => update('title', e.target.value)} maxLength={120}
                placeholder="e.g. Founding ML Engineer" className={inputCls} {...aria('title', true)} />
            </Field>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Category" htmlFor="job-category">
                <select id="job-category" value={draft.category} onChange={(e) => update('category', e.target.value)} className={inputCls}>
                  {JOB_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </Field>
              <Field label="Team" htmlFor="job-department" optional>
                <input id="job-department" value={draft.department} onChange={(e) => update('department', e.target.value)} placeholder="e.g. Engineering" className={inputCls} />
              </Field>
            </div>
            <Segmented label="Employment type" value={draft.employmentType} options={EMPLOYMENT_TYPES} onChange={(v) => update('employmentType', v)} />
            <Segmented label="Experience" value={draft.experienceBand} options={[{ value: '', label: 'Any' }, ...EXPERIENCE_BANDS]} onChange={(v) => update('experienceBand', v)} />
            <Field label="Hiring manager" htmlFor="job-hiringManagerName" optional hint="Shown on the job as the person this role reports to.">
              <input id="job-hiringManagerName" value={draft.hiringManagerName} onChange={(e) => update('hiringManagerName', e.target.value)} placeholder="e.g. Priya Sharma, CTO" className={inputCls} {...aria('hiringManagerName', true)} />
            </Field>
          </Card>

          <Card id="location" title="Location">
            <Segmented label="Where they’ll work" value={draft.workType} options={WORK_TYPES} onChange={(v) => update('workType', v)} />
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="City" htmlFor="job-city" optional={draft.workType === 'REMOTE'} error={err('city')}>
                <input id="job-city" value={draft.city} onChange={(e) => update('city', e.target.value)} placeholder="e.g. Bengaluru" autoComplete="address-level2" className={inputCls} {...aria('city')} />
              </Field>
              <Field label="Country" htmlFor="job-country" optional>
                <input id="job-country" value={draft.country} onChange={(e) => update('country', e.target.value)} placeholder="e.g. India" autoComplete="country-name" className={inputCls} />
              </Field>
            </div>
          </Card>

          <Card id="pay" title="Pay" hint="Jobs that show a salary range get more applicants.">
            <div className="grid grid-cols-[110px_1fr_1fr] gap-2 sm:gap-3 items-end">
              <Field label="Currency" htmlFor="job-salaryCurrency">
                <select id="job-salaryCurrency" value={draft.salaryCurrency} onChange={(e) => update('salaryCurrency', e.target.value)} className={inputCls}>
                  {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              {(['salaryMin', 'salaryMax'] as const).map((k) => (
                <Field key={k} label={k === 'salaryMin' ? 'Minimum' : 'Maximum'} htmlFor={`job-${k}`}>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500" aria-hidden>{unit.symbol.trim()}</span>
                    <input id={`job-${k}`} inputMode="decimal" value={draft[k]} onChange={(e) => update(k, e.target.value.replace(/[^\d.]/g, ''))}
                      placeholder={k === 'salaryMin' ? (unit.suffix === 'L' ? '18' : '80') : (unit.suffix === 'L' ? '28' : '120')}
                      className={`${inputCls} pl-8 pr-9`} {...aria(k)} aria-describedby="pay-unit" />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-gray-500" aria-hidden>{unit.suffix}</span>
                  </div>
                </Field>
              ))}
            </div>
            <p id="pay-unit" className="text-[13px] text-gray-500 dark:text-gray-400 -mt-2">
              {unit.suffix === 'L' ? 'In lakh per year. 18 means ₹18,00,000.' : `In thousands per year. 80 means ${unit.symbol.trim()}80,000.`}
            </p>
            {err('salaryMax') && <p className="text-[13px] text-red-700 dark:text-red-400 -mt-2">{err('salaryMax')}</p>}
            <Toggle id="job-showSalary" label="Show the salary on the job" checked={draft.showSalary} onChange={(v) => update('showSalary', v)} />
            <Toggle id="job-hasEsops" label="ESOPs or equity offered" checked={draft.hasEsops} onChange={(v) => update('hasEsops', v)} />
          </Card>

          <Card id="about" title="About the role">
            <Field label="One-line summary" htmlFor="job-shortDescription" optional hint="Shown on job cards and in search results.">
              <input id="job-shortDescription" value={draft.shortDescription} onChange={(e) => update('shortDescription', e.target.value)} maxLength={200}
                placeholder="e.g. Build the retrieval layer behind our AI copilot." className={inputCls} {...aria('shortDescription', true)} />
            </Field>
            <Field label="Description" htmlFor="job-description" error={err('description')} hint="Use “## Heading” for sections and “- ” for bullets.">
              <textarea id="job-description" value={draft.description} onChange={(e) => update('description', e.target.value)} rows={12}
                placeholder={'## About the role\n…\n\n## What you’ll do\n- …\n\n## What we’re looking for\n- …'}
                className={`${inputCls} py-2.5 resize-y font-[inherit] leading-relaxed`} {...aria('description', true)} />
            </Field>
            <div>
              <label htmlFor="job-skills" className="block text-sm font-semibold text-gray-900 dark:text-white mb-1.5">Skills</label>
              <TagInput id="job-skills" tags={draft.skills} max={MAX_SKILLS} placeholder="Type a skill and press Enter" suggestions={SKILL_SUGGESTIONS} onChange={(t) => update('skills', t)} />
              <p className="mt-1.5 text-[13px] text-gray-500 dark:text-gray-400">Candidates pick which of these they have, so you see “4 of 5 skills” on each application.</p>
              {draft.skills.length > 1 && (
                <fieldset className="mt-3">
                  <legend className="text-sm font-semibold text-gray-900 dark:text-white">Must-haves <span className="font-normal text-gray-500">(optional)</span></legend>
                  <p className="text-[13px] text-gray-500 dark:text-gray-400 mb-2">Tap the skills this role can’t do without. They count most in each candidate’s match score.</p>
                  <div className="flex flex-wrap gap-1.5">
                    {draft.skills.map((s) => {
                      const on = draft.mustHaveSkills.includes(s);
                      return (
                        <button key={s} type="button" aria-pressed={on}
                          onClick={() => update('mustHaveSkills', on ? draft.mustHaveSkills.filter((x) => x !== s) : [...draft.mustHaveSkills.filter((x) => draft.skills.includes(x)), s])}
                          className={`inline-flex items-center gap-1 h-8 px-2.5 rounded-[8px] border text-[13px] font-medium ${on ? 'border-brand bg-brand/5 text-brand' : 'border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-gray-400'}`}>
                          {on && <Check className="w-3.5 h-3.5" aria-hidden />} {s}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              )}
            </div>
          </Card>

          <Card id="screening" title="Screening questions" hint={`Optional. Up to ${MAX_SCREENING_QUESTIONS} — every extra question loses applicants.`}>
            {draft.screeningQuestions.length > 0 && (
              <ol className="space-y-3">
                {draft.screeningQuestions.map((q, i) => (
                  <li key={q.id} className="p-3 rounded-[12px] border border-gray-200 dark:border-gray-800 space-y-2.5">
                    <div className="flex items-start gap-2">
                      <label htmlFor={`q-${q.id}`} className="sr-only">Question {i + 1}</label>
                      <input id={i === 0 ? 'job-screeningQuestions' : `q-${q.id}`} value={q.question} maxLength={200} placeholder={`Question ${i + 1}`}
                        onChange={(e) => setQuestions(draft.screeningQuestions.map((x) => x.id === q.id ? { ...x, question: e.target.value } : x))}
                        aria-invalid={!!err('screeningQuestions') && !q.question.trim() || undefined}
                        className={inputCls} />
                      <button type="button" onClick={() => setQuestions(draft.screeningQuestions.filter((x) => x.id !== q.id))} aria-label={`Remove question ${i + 1}`}
                        className="w-11 h-11 flex items-center justify-center rounded-[10px] text-gray-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 shrink-0">
                        <Trash2 className="w-4 h-4" aria-hidden />
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                      <label className="inline-flex items-center gap-2 text-[13px] text-gray-700 dark:text-gray-300">
                        Answer
                        <select value={q.type} onChange={(e) => setQuestions(draft.screeningQuestions.map((x) => x.id === q.id ? { ...x, type: e.target.value as 'text' | 'yesno' } : x))}
                          className="min-h-[36px] px-2 rounded-[8px] border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-[13px]">
                          <option value="text">Short answer</option>
                          <option value="yesno">Yes / No</option>
                        </select>
                      </label>
                      <label className="inline-flex items-center gap-2 text-[13px] text-gray-700 dark:text-gray-300">
                        <input type="checkbox" checked={q.required} onChange={(e) => setQuestions(draft.screeningQuestions.map((x) => x.id === q.id ? { ...x, required: e.target.checked } : x))}
                          className="w-4 h-4 rounded border-gray-300 text-brand" />
                        Required
                      </label>
                      {q.type === 'yesno' && (
                        <label className="inline-flex items-center gap-2 text-[13px] text-gray-700 dark:text-gray-300">
                          Flag if the answer isn’t
                          <select value={q.knockoutAnswer ?? ''}
                            onChange={(e) => setQuestions(draft.screeningQuestions.map((x) => x.id === q.id ? { ...x, knockoutAnswer: (e.target.value || undefined) as 'yes' | 'no' | undefined } : x))}
                            className="min-h-[36px] px-2 rounded-[8px] border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-[13px]">
                            <option value="">— (no flag)</option>
                            <option value="yes">Yes</option>
                            <option value="no">No</option>
                          </select>
                        </label>
                      )}
                    </div>
                    {q.type === 'yesno' && q.knockoutAnswer && (
                      <p className="text-xs text-gray-500">Candidates who answer {q.knockoutAnswer === 'yes' ? 'No' : 'Yes'} are flagged on your board, never rejected automatically.</p>
                    )}
                  </li>
                ))}
              </ol>
            )}
            {err('screeningQuestions') && <p className="text-[13px] text-red-700 dark:text-red-400">{err('screeningQuestions')}</p>}
            {draft.screeningQuestions.length < MAX_SCREENING_QUESTIONS ? (
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => addQuestion({ question: '', type: 'text', required: false })}
                  className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-[10px] border border-gray-300 dark:border-gray-700 text-sm font-semibold text-gray-800 dark:text-gray-200 hover:border-gray-400">
                  <Plus className="w-4 h-4" aria-hidden /> Add a question
                </button>
                {QUESTION_SUGGESTIONS.filter((s) => !usedSuggestions.has(s.question)).map((s) => (
                  <button key={s.question} type="button" onClick={() => addQuestion(s)}
                    className="min-h-[40px] px-3 rounded-[10px] border border-dashed border-gray-300 dark:border-gray-700 text-[13px] text-gray-700 dark:text-gray-300 hover:border-brand hover:text-brand text-left">
                    + {s.question}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-[13px] text-gray-500">You’ve reached {MAX_SCREENING_QUESTIONS} questions.</p>
            )}
          </Card>

          <Card id="apply" title="Applications">
            <Segmented label="How people apply" value={draft.applicationType}
              options={[{ value: 'INTERNAL', label: 'On Udyaibase (recommended)' }, { value: 'EXTERNAL', label: 'On my own site or email' }] as const}
              onChange={(v) => update('applicationType', v)} />
            {draft.applicationType === 'INTERNAL' ? (
              <p className="text-[13px] text-gray-600 dark:text-gray-400">Candidates apply with their resume and appear in your pipeline, where you can shortlist, email and track them.</p>
            ) : (
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Application link" htmlFor="job-applicationUrl" error={err('applicationUrl')}>
                  <input id="job-applicationUrl" type="url" inputMode="url" value={draft.applicationUrl} onChange={(e) => update('applicationUrl', e.target.value)}
                    placeholder="https://…" className={inputCls} {...aria('applicationUrl')} />
                </Field>
                <Field label="Or email" htmlFor="job-applicationEmail" error={err('applicationEmail')}>
                  <input id="job-applicationEmail" type="email" inputMode="email" value={draft.applicationEmail} onChange={(e) => update('applicationEmail', e.target.value)}
                    placeholder="jobs@yourcompany.com" className={inputCls} {...aria('applicationEmail')} />
                </Field>
              </div>
            )}
            <Field label="Prefer people who can join within" htmlFor="job-maxNoticeDays" optional hint="Used in the match score. Candidates with longer notice still apply.">
              <select id="job-maxNoticeDays" value={draft.maxNoticeDays} onChange={(e) => update('maxNoticeDays', e.target.value)} className={`${inputCls} sm:max-w-[220px]`} aria-describedby="job-maxNoticeDays-hint">
                <option value="">No preference</option>
                <option value="0">Immediately</option>
                <option value="15">15 days</option>
                <option value="30">30 days</option>
                <option value="60">60 days</option>
                <option value="90">90 days</option>
              </select>
            </Field>
            <Field label="Closes on" htmlFor="job-closesOn" hint={`Applications stop after this date. Up to ${MAX_OPEN_DAYS} days; you can renew later.`}>
              <input id="job-closesOn" type="date" value={draft.closesOn} min={today} max={maxDate} onChange={(e) => update('closesOn', e.target.value)}
                className={`${inputCls} sm:max-w-[220px]`} aria-describedby="job-closesOn-hint" />
            </Field>
          </Card>

          <Card id="where" title="Where this job appears">
            <div className="space-y-3" id="job-showOnJobsPage" tabIndex={-1}>
              <Toggle id="where-jobs" label="Udyaibase jobs page" hint="Searchable by everyone looking for AI jobs." checked={draft.showOnJobsPage} onChange={(v) => update('showOnJobsPage', v)} />
              <Toggle id="where-profile" label="Your company profile" checked={draft.showOnProfile} onChange={(v) => update('showOnProfile', v)} />
              <Toggle id="where-careers" label="Your website (careers widget)" hint={<Link href="/employer/careers" className="text-brand hover:underline">Set up the widget</Link>} checked={draft.showOnCareers} onChange={(v) => update('showOnCareers', v)} />
              <Toggle id="where-google" disabled checked={company.verified}
                label={<span className="inline-flex items-center gap-1.5">Google for Jobs {company.verified && <BadgeCheck className="w-4 h-4 text-green-700" aria-hidden />}</span>}
                hint={company.verified
                  ? 'Included automatically for verified companies.'
                  : <>Available after you <Link href="/employer/company" className="text-brand hover:underline">claim your startup</Link>, so Google only shows jobs from verified companies.</>}
                onChange={() => {}} />
            </div>
            {err('showOnJobsPage') && <p className="text-[13px] text-red-700 dark:text-red-400">{err('showOnJobsPage')}</p>}
          </Card>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-0" id="job-preview" aria-label="Preview">
          <ListingStrength draft={draft} company={company} />
          <JobPreview draft={draft} company={company} />
        </aside>
      </div>

      {/* Action bar: sits above the mobile tab bar, at the bottom of the scroll area on desktop. */}
      <div className="sticky z-10 bottom-[calc(4rem+env(safe-area-inset-bottom))] md:bottom-0 mt-5 -mx-4 md:-mx-8 lg:-mx-10 px-4 md:px-8 lg:px-10 py-3 bg-white/95 dark:bg-gray-950/95 backdrop-blur border-t border-gray-200 dark:border-gray-800">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
          <div className="flex-1 min-w-0" aria-live="polite">
            {actionError ? (
              <p role="alert" className="flex items-start gap-1.5 text-[13px] text-red-700 dark:text-red-400"><AlertTriangle className="w-4 h-4 mt-px shrink-0" aria-hidden /><span>{actionError}</span></p>
            ) : (
              <p className={`text-[13px] ${saveState === 'error' ? 'text-red-700 dark:text-red-400' : 'text-gray-600 dark:text-gray-400'}`}>
                {saveLine}
                {!emailVerified && isDraft && <span className="block text-amber-700 dark:text-amber-400">Verify your email to publish.</span>}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <a href="#job-preview" aria-label="Preview" className="lg:hidden inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3 rounded-[10px] text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800">
              <Eye className="w-4 h-4" aria-hidden /><span className="hidden sm:inline">Preview</span>
            </a>
            {isDraft ? (
              <>
                <button type="button" onClick={() => save()} disabled={!draft.title.trim() || saveState === 'saving'}
                  className="flex-1 sm:flex-none whitespace-nowrap min-h-[44px] px-4 rounded-[10px] border border-gray-300 dark:border-gray-700 text-sm font-semibold text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50">
                  Save draft
                </button>
                <button type="button" onClick={publish} disabled={publishing} className="btn-brand flex-1 sm:flex-none gap-2 whitespace-nowrap px-4 disabled:opacity-60">
                  {publishing && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} {needsApproval ? (request ? 'Update request' : 'Send for approval') : 'Publish job'}
                </button>
              </>
            ) : (
              <>
                {status !== 'OPEN' && (
                  <button type="button" onClick={publish} disabled={publishing}
                    className="flex-1 sm:flex-none min-h-[44px] px-4 rounded-[10px] border border-gray-300 dark:border-gray-700 text-sm font-semibold text-gray-800 dark:text-gray-200 hover:bg-gray-50 disabled:opacity-50">
                    Save and reopen
                  </button>
                )}
                <button type="button" onClick={saveLive} disabled={publishing} className="btn-brand flex-1 sm:flex-none gap-2 whitespace-nowrap px-4 disabled:opacity-60">
                  {publishing && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} Save changes
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
