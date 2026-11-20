'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, FileText, Loader2, Sparkles, UploadCloud, X } from 'lucide-react';
import JobAlertSignup from '@/components/jobs/JobAlertSignup';
import WhatsAppChannelCard from '@/components/jobs/WhatsAppChannelCard';
import CandidateSignIn from '@/components/jobs/CandidateSignIn';
import TurnstileWidget from '@/components/shared/TurnstileWidget';
import { AUTOFILL_CONSENT_TEXT } from '@/lib/jobs/consent';
import { parseApplyFormConfig, type ApplyFieldKey, type ApplyFormConfig } from '@/lib/jobs/apply-form';

const HAS_CAPTCHA = !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

export interface ApplyJob {
  slug: string;
  title: string;
  company: string;
  skills: string[];
  screeningQuestions: { id: string; question: string; type: 'text' | 'yesno' | 'choice'; required: boolean; options?: string[] }[];
  consentText: string;
  /** The employer's choice of fields and wording; defaults apply when absent. */
  form?: ApplyFormConfig;
}

/**
 * What to offer after applying, on Udyaibase's own job pages only (never a company's widget or careers page):
 * the WhatsApp jobs channel, a one-tap alert for this role and city, and a few similar open jobs.
 */
export interface AfterApply {
  channel: boolean;
  alert: { category: string | null; city: string | null; remote: boolean } | null;
  similar: { slug: string; title: string; company: string; place: string }[];
  /** Whether `similar` starts with jobs in the same role (else they're just the newest open jobs). */
  sameRole?: boolean;
  /** Applied as a guest: offer to keep it in an account ("My applications"). */
  saveToAccount?: boolean;
}

export interface ApplyAttribution {
  source?: string;
  widgetId?: string;
  ref?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  /** A teammate's referral code (?rc=). */
  rc?: string;
}

interface Details {
  fullName: string; email: string; phone: string; city: string;
  currentTitle: string; currentCompany: string; experienceYears: string; noticePeriodDays: string; expectedCtcLakh: string;
  linkedinUrl: string; githubUrl: string; portfolioUrl: string; coverLetter: string;
}

const EMPTY: Details = {
  fullName: '', email: '', phone: '', city: '', currentTitle: '', currentCompany: '', experienceYears: '', noticePeriodDays: '',
  expectedCtcLakh: '', linkedinUrl: '', githubUrl: '', portfolioUrl: '', coverLetter: '',
};

const NOTICE = [
  { value: '0', label: 'Immediately' }, { value: '15', label: '15 days' }, { value: '30', label: '30 days' },
  { value: '60', label: '60 days' }, { value: '90', label: '90 days' },
];

/** Page variant colours; the widget passes its own via `style`. */
const PAGE_VARS =
  '[--af-text:#111827] [--af-muted:#4b5563] [--af-border:#d1d5db] [--af-surface:#ffffff] [--af-subtle:#f3f4f6] [--af-accent:#A50F15] [--af-on-accent:#ffffff] [--af-radius:10px] [--af-btn-radius:10px] ' +
  'dark:[--af-text:#f9fafb] dark:[--af-muted:#9ca3af] dark:[--af-border:#374151] dark:[--af-surface:#111827] dark:[--af-subtle:#1f2937]';

const field = 'w-full min-h-[44px] px-3 border text-[0.9375rem] focus:outline-none focus:ring-2 focus:ring-[color:var(--af-accent)]/30 focus:border-[color:var(--af-accent)] aria-[invalid=true]:border-red-600';
const fieldStyle = { background: 'var(--af-surface)', color: 'var(--af-text)', borderColor: 'var(--af-border)', borderRadius: 'var(--af-radius)' } as const;

/**
 * Two-step application: (1) consent + bot check + resume upload, (2) confirm autofilled details,
 * skills and screening answers. Used on the job page and inside the website widget.
 */
export default function JobApplyForm({
  job, attribution, variant = 'page', style, onBack, onDone, preview, showBackLink = true, afterApply, prefill, signedInAs, lastResume, prefillFromLast,
}: {
  /** The details came from their last application (not just the account name and email). */
  prefillFromLast?: boolean;
  /** Signed in with a resume on file: offered instead of uploading again ("Resume from your … application, 19 Nov"). */
  lastResume?: { label: string };
  afterApply?: AfterApply;
  /** Signed in: their details from the last application (resume excluded). The resume's autofill only fills gaps. */
  prefill?: Partial<Record<keyof Details, string>>;
  /** Signed in: their account email, shown so they know where this application will appear. */
  signedInAs?: string;
  job: ApplyJob;
  attribution: ApplyAttribution;
  variant?: 'page' | 'embed';
  style?: React.CSSProperties;
  onBack?: () => void;
  /** The top "Back to jobs" link (default on). The widget turns it off: its tabs and "All jobs" link do that job. */
  showBackLink?: boolean;
  onDone?: () => void;
  /** The employer's live preview: shows this step and never touches the server. */
  preview?: 'upload' | 'details' | 'done';
}) {
  const uid = useId();
  const form = job.form ?? parseApplyFormConfig(null);
  const shown = (k: ApplyFieldKey) => form.fields[k] !== 'hidden';
  const [liveStep, setStep] = useState<'upload' | 'details' | 'done'>('upload');
  const step = preview ?? liveStep;
  const [captcha, setCaptcha] = useState('');
  const [trackUrl, setTrackUrl] = useState<string | null>(null);
  const [inAccount, setInAccount] = useState(false);
  const doneRef = useRef<HTMLHeadingElement>(null);
  const [uploading, setUploading] = useState(false);
  const [liveFile, setFile] = useState<{ name: string; sizeBytes: number } | null>(null);
  const file = preview ? { name: 'your-resume.pdf', sizeBytes: 0 } : liveFile;
  const [autofillOk, setAutofillOk] = useState(false);
  const [reuseGone, setReuseGone] = useState(false);
  const [token, setToken] = useState('');
  const [pool, setPool] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [filledCount, setFilledCount] = useState(0);
  const [d, setD] = useState<Details>(() => ({ ...EMPTY, ...Object.fromEntries(Object.entries(prefill ?? {}).filter(([, v]) => v)) }));
  const [skills, setSkills] = useState<string[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [agree, setAgree] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [errorLink, setErrorLink] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const touched = useRef<Set<keyof Details>>(new Set());
  const topRef = useRef<HTMLDivElement>(null);

  const set = (k: keyof Details, v: string) => {
    touched.current.add(k);
    setD((x) => ({ ...x, [k]: v }));
    setErrors((e) => (e[k] ? { ...e, [k]: '' } : e));
  };

  useEffect(() => {
    if (step !== 'upload') topRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    if (variant === 'embed' && window.parent !== window) window.parent.postMessage({ type: 'udyaibase:scroll-top' }, '*');
  }, [step, variant]);

  async function upload(f: File) {
    setError('');
    if (f.size > 5 * 1024 * 1024) { setError('Your resume must be 5 MB or smaller.'); return; }
    if (HAS_CAPTCHA && !captcha) { setError('Please complete the security check first.'); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('slug', job.slug);
      fd.append('turnstileToken', captcha);
      fd.append('file', f);
      const res = await fetch('/api/jobs/apply/session', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || 'Upload failed. Try again.'); setUploading(false); return; }
      setToken(data.token);
      setFile(data.file);
      setStep('details');
      if (autofillOk) autofill(data.token);
    } catch {
      setError('You seem to be offline. Check your connection and try again.');
    }
    setUploading(false);
  }

  /** Signed in: copy the resume from their last application instead of uploading (same result as upload). */
  async function reuse() {
    setError('');
    if (HAS_CAPTCHA && !captcha) { setError('Please complete the security check first.'); return; }
    setUploading(true);
    try {
      const res = await fetch('/api/jobs/apply/reuse', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug: job.slug, turnstileToken: captcha }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || 'Couldn’t use your last resume. Upload it instead.'); if (data.code === 'gone') setReuseGone(true); setUploading(false); return; }
      setToken(data.token);
      setFile(data.file);
      setStep('details');
      if (autofillOk) autofill(data.token);
    } catch {
      setError('You seem to be offline. Check your connection and try again.');
    }
    setUploading(false);
  }

  async function autofill(t: string) {
    setParsing(true);
    try {
      const res = await fetch('/api/jobs/apply/parse', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: t, autofillConsent: true }) });
      const data = await res.json().catch(() => ({}));
      const p = data.prefill ?? {};
      let n = 0;
      setD((x) => {
        const next = { ...x };
        for (const k of Object.keys(EMPTY) as (keyof Details)[]) {
          const v = p[k];
          if (v == null || v === '' || touched.current.has(k) || next[k]) continue;
          if (k !== 'fullName' && k !== 'email' && !shown(k)) continue;
          next[k] = String(v);
          n++;
        }
        return next;
      });
      if (Array.isArray(p.skills) && p.skills.length) setSkills((s) => (s.length ? s : p.skills.filter((x: string) => job.skills.includes(x))));
      setFilledCount(n);
    } catch { /* autofill is a convenience only */ }
    setParsing(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (preview) return;
    setError('');
    const local: Record<string, string> = {};
    if (d.fullName.trim().length < 2) local.fullName = 'Enter your full name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email.trim())) local.email = 'Enter a valid email address.';
    for (const f of Object.keys(form.fields) as ApplyFieldKey[]) {
      if (form.fields[f] === 'required' && !d[f].trim()) local[f] = 'Please fill this in.';
    }
    for (const q of job.screeningQuestions) if (q.required && !answers[q.id]?.trim()) local[`q_${q.id}`] = 'Please answer this question.';
    if (!agree) local.consent = 'Please agree to share your application.';
    if (Object.keys(local).length) {
      setErrors(local);
      document.getElementById(`${uid}-${Object.keys(local)[0]}`)?.focus();
      return;
    }
    setSubmitting(true);
    setErrorLink(null);
    try {
      const res = await fetch(`/api/jobs/${job.slug}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token, ...d, consent: true, talentPool: pool, confirmedSkills: form.askSkills ? skills : [],
          screeningAnswers: job.screeningQuestions.map((q) => ({ id: q.id, answer: answers[q.id] ?? '' })),
          attribution,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) { setTrackUrl(typeof data.trackUrl === 'string' ? data.trackUrl : null); setInAccount(data.inAccount === true); setStep('done'); document.getElementById('apply-account-card')?.setAttribute('hidden', ''); onDone?.(); }
      else {
        if (data.code === 'session') { setStep('upload'); setToken(''); setFile(null); }
        if (data.errors) setErrors(data.errors);
        // Already applied while signed in: point to the application instead of their inbox.
        if (data.code === 'duplicate' && typeof data.trackUrl === 'string' && variant === 'page') setErrorLink(data.trackUrl);
        setError(data.error || 'We couldn’t submit your application. Try again.');
      }
    } catch {
      setError('You seem to be offline. Check your connection and try again.');
    }
    setSubmitting(false);
  }

  // After sending, announce the confirmation (the step change already scrolls it into view).
  useEffect(() => {
    if (liveStep !== 'done' || preview) return;
    doneRef.current?.focus({ preventScroll: true });
  }, [liveStep, preview]);

  const id = (k: string) => `${uid}-${k}`;
  const label = 'block text-sm font-semibold mb-1.5';
  const help = 'mt-1 text-[0.8125rem]';
  const primaryBtn = 'inline-flex items-center justify-center gap-2 min-h-[48px] px-6 font-semibold text-[0.9375rem] disabled:opacity-60';
  const primaryStyle = { background: 'var(--af-accent)', color: 'var(--af-on-accent)', borderRadius: 'var(--af-btn-radius)' };

  const Input = ({ k, type = 'text', ...rest }: { k: keyof Details; type?: string } & React.InputHTMLAttributes<HTMLInputElement>) => (
    <input id={id(k)} type={type} value={d[k]} onChange={(e) => set(k, e.target.value)}
      aria-invalid={!!errors[k] || undefined} aria-describedby={errors[k] ? `${id(k)}-err` : undefined}
      className={field} style={fieldStyle} {...rest} />
  );
  // Name and email are always required, so only the employer's own fields carry a tag.
  const Tag = ({ k, note }: { k: ApplyFieldKey; note?: string }) => (form.fields[k] === 'optional'
    ? <span className="font-normal" style={{ color: 'var(--af-muted)' }}>{note ? `(${note}, optional)` : '(optional)'}</span>
    : note ? <span className="font-normal" style={{ color: 'var(--af-muted)' }}>({note})</span> : null);
  const Err = ({ k }: { k: string }) => (errors[k] ? <p id={`${id(k)}-err`} className={`${help} text-red-700 dark:text-red-400`}>{errors[k]}</p> : null);

  return (
    <div ref={topRef} className={`font-[inherit] ${variant === 'page' ? `scroll-mt-24 ${PAGE_VARS}` : 'scroll-mt-4'}`} style={{ color: 'var(--af-text)', ...style }}>
      {onBack && showBackLink && step !== 'done' && (
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 min-h-[40px] -ml-1 px-1 text-sm font-semibold mb-2" style={{ color: 'var(--af-muted)' }}>
          <ArrowLeft className="w-4 h-4" aria-hidden /> Back to jobs
        </button>
      )}

      {step === 'done' ? (
        <div role="status" className="text-center py-8">
          <CheckCircle2 className="w-12 h-12 mx-auto text-green-600" aria-hidden />
          <h2 ref={doneRef} tabIndex={-1} className="text-xl font-bold mt-3 focus:outline-none">Application sent</h2>
          <p className="mt-1.5 text-[0.9375rem]" style={{ color: 'var(--af-muted)' }}>
            {form.successMessage || `${job.company} has your application for ${job.title}.`}{inAccount ? ' It’s in My applications, and we’ve emailed you the details too.' : ' We emailed you a private link to track it.'}
          </p>
          {trackUrl && (
            <a href={trackUrl} className="mt-5 inline-flex items-center justify-center gap-2 min-h-[44px] px-5 text-sm font-semibold" style={primaryStyle}>
              Track your application <ArrowRight className="w-4 h-4" aria-hidden />
            </a>
          )}
          {afterApply && (afterApply.saveToAccount || afterApply.channel || afterApply.alert || afterApply.similar.length > 0) && (
            <div className="mt-8 pt-6 border-t text-left space-y-4" style={{ borderColor: 'var(--af-border)' }}>
              <h3 className="text-base font-bold">While you wait</h3>
              {afterApply.saveToAccount && (
                <CandidateSignIn returnTo="/my-applications" initialEmail={d.email} applyToken={token}
                  title="Keep track of this application" subtitle={`One tap: we email a 6-digit code to ${d.email}. Enter it and this application is saved in My applications, with your details ready for next time.`} />
              )}
              {afterApply.channel && <WhatsAppChannelCard from="apply" />}
              {afterApply.alert && (
                <JobAlertSignup category={afterApply.alert.category} city={afterApply.alert.city} remote={afterApply.alert.remote}
                  initialEmail={d.email} startOpen />
              )}
              {afterApply.similar.length > 0 && (
                <div>
                  <p className="text-sm font-semibold mb-2">{afterApply.sameRole ? 'Similar open jobs' : 'More open jobs'}</p>
                  <ul className="divide-y border rounded-[10px]" style={{ borderColor: 'var(--af-border)' }}>
                    {afterApply.similar.map((j) => (
                      <li key={j.slug} style={{ borderColor: 'var(--af-border)' }}>
                        <a href={`/jobs/${j.slug}`} className="flex items-center gap-3 px-3 min-h-[56px] hover:bg-black/[0.03] dark:hover:bg-white/[0.04]">
                          <span className="flex-1 min-w-0">
                            <span className="block text-sm font-semibold truncate">{j.title}</span>
                            <span className="block text-xs truncate" style={{ color: 'var(--af-muted)' }}>{j.company}{j.place ? ` · ${j.place}` : ''}</span>
                          </span>
                          <ArrowRight className="w-4 h-4 shrink-0" style={{ color: 'var(--af-muted)' }} aria-hidden />
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          {onBack && (
            <button type="button" onClick={onBack} className="mt-5 inline-flex items-center justify-center min-h-[44px] px-5 border text-sm font-semibold"
              style={{ borderColor: 'var(--af-border)', borderRadius: 'var(--af-btn-radius)' }}>
              See other jobs
            </button>
          )}
        </div>
      ) : (
        <>
          <p className="text-[0.8125rem] font-semibold uppercase tracking-wide" style={{ color: 'var(--af-muted)' }}>Apply to {job.company}</p>
          <h2 className="text-xl font-bold leading-tight mt-0.5">{job.title}</h2>
          {form.intro && <p className="mt-2 text-[0.9375rem] whitespace-pre-line" style={{ color: 'var(--af-muted)' }}>{form.intro}</p>}
          <ol className="flex items-center gap-2 mt-3 mb-5 text-[0.8125rem]" aria-label="Steps">
            {['Resume', 'Your details'].map((s, i) => {
              const done = i === 0 ? step === 'details' : false;
              const active = (i === 0 && step === 'upload') || (i === 1 && step === 'details');
              return (
                <li key={s} className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{ background: active || done ? 'var(--af-accent)' : 'var(--af-subtle)', color: active || done ? 'var(--af-on-accent)' : 'var(--af-muted)' }}>
                    {done ? <Check className="w-3.5 h-3.5" aria-hidden /> : i + 1}
                  </span>
                  <span className={active ? 'font-semibold' : ''} style={{ color: active ? 'var(--af-text)' : 'var(--af-muted)' }}>{s}</span>
                  {i === 0 && <span aria-hidden className="w-6 h-px" style={{ background: 'var(--af-border)' }} />}
                </li>
              );
            })}
          </ol>

          {step === 'upload' && (
            <div className="space-y-4">
              {signedInAs && (
                <p className="text-[0.8125rem]" style={{ color: 'var(--af-muted)' }}>
                  Signed in as <strong style={{ color: 'var(--af-text)' }}>{signedInAs}</strong>. This application will appear in <Link href="/my-applications" className="underline font-semibold">My applications</Link>{prefillFromLast ? ', and we’ve filled in your details from last time' : ''}.
                </p>
              )}
              {/* Layered notice: the key point up front, the full notice (the text recorded with the application) one tap away. */}
              <div className="text-[0.875rem] leading-relaxed p-3 border" style={{ borderColor: 'var(--af-border)', borderRadius: 'var(--af-radius)', background: 'var(--af-subtle)', color: 'var(--af-muted)' }}>
                <p>Your resume and details go to <strong>{job.company}</strong> for this role. A person makes every decision, and you can withdraw or delete your application at any time.</p>
                <details className="mt-1.5">
                  <summary className="cursor-pointer font-semibold underline underline-offset-2" style={{ color: 'var(--af-text, inherit)' }}>How we handle your data</summary>
                  <p className="mt-2">{job.consentText}</p>
                </details>
              </div>
              <label htmlFor={id('autofill')} className="flex items-start gap-3 cursor-pointer">
                <input id={id('autofill')} type="checkbox" checked={autofillOk} onChange={(e) => setAutofillOk(e.target.checked)}
                  className="mt-0.5 w-5 h-5 shrink-0" style={{ accentColor: 'var(--af-accent)' }} />
                <span className="text-[0.875rem]"><span className="font-semibold">Optional:</span> {AUTOFILL_CONSENT_TEXT}</span>
              </label>
              {HAS_CAPTCHA && !preview && <TurnstileWidget onSuccess={setCaptcha} onExpire={() => setCaptcha('')} onError={() => setCaptcha('')} />}
              {lastResume && !reuseGone && !preview && (
                <button type="button" onClick={reuse} disabled={uploading || (HAS_CAPTCHA && !captcha)}
                  className="w-full flex items-center gap-3 p-3 border-2 text-left disabled:opacity-60 disabled:cursor-not-allowed"
                  style={{ borderColor: 'var(--af-accent)', borderRadius: 'var(--af-radius)' }}>
                  {uploading ? <Loader2 className="w-5 h-5 shrink-0 animate-spin" aria-hidden style={{ color: 'var(--af-accent)' }} /> : <FileText className="w-5 h-5 shrink-0" aria-hidden style={{ color: 'var(--af-accent)' }} />}
                  <span className="flex-1 min-w-0">
                    <span className="block text-[0.9375rem] font-semibold">Use my last resume</span>
                    <span className="block text-[0.8125rem] truncate" style={{ color: 'var(--af-muted)' }}>{lastResume.label}</span>
                  </span>
                </button>
              )}
              <label htmlFor={id('file')}
                className={`flex flex-col items-center justify-center gap-2 text-center px-4 py-8 border-2 border-dashed cursor-pointer ${HAS_CAPTCHA && !captcha && !preview ? 'opacity-60 cursor-not-allowed' : ''}`}
                style={{ borderColor: 'var(--af-border)', borderRadius: 'var(--af-radius)' }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f && !preview) upload(f); }}>
                {uploading ? <Loader2 className="w-7 h-7 animate-spin" aria-hidden style={{ color: 'var(--af-accent)' }} /> : <UploadCloud className="w-7 h-7" aria-hidden style={{ color: 'var(--af-accent)' }} />}
                <span className="text-[0.9375rem] font-semibold">{uploading ? 'Uploading…' : lastResume && !reuseGone ? 'Or upload a new resume' : 'Upload your resume'}</span>
                <span className="text-[0.8125rem]" style={{ color: 'var(--af-muted)' }}>PDF or Word, up to 5 MB.</span>
                <input id={id('file')} type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  className="sr-only" disabled={uploading || !!preview || (HAS_CAPTCHA && !captcha)}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }} />
              </label>
              {HAS_CAPTCHA && !captcha && !preview && <p className="text-[0.8125rem]" style={{ color: 'var(--af-muted)' }}>Complete the security check above to upload.</p>}
            </div>
          )}

          {step === 'details' && (
            <form onSubmit={submit} noValidate className="space-y-5">
              {file && (
                <div className="flex items-center gap-3 p-3 border" style={{ borderColor: 'var(--af-border)', borderRadius: 'var(--af-radius)' }}>
                  <FileText className="w-5 h-5 shrink-0" aria-hidden style={{ color: 'var(--af-accent)' }} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold truncate">{file.name}</span>
                    <span className="block text-[0.8125rem]" style={{ color: 'var(--af-muted)' }}>
                      {parsing ? 'Reading your resume to fill the form…' : filledCount > 0 ? `We filled ${filledCount} field${filledCount === 1 ? '' : 's'} from your resume. Please check them.` : 'Attached. Fill in your details below.'}
                    </span>
                  </span>
                  {parsing ? <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden /> : filledCount > 0 ? <Sparkles className="w-4 h-4 shrink-0" aria-hidden style={{ color: 'var(--af-accent)' }} /> : null}
                  <button type="button" onClick={() => { setStep('upload'); setToken(''); setFile(null); }} aria-label="Replace resume"
                    className="w-9 h-9 flex items-center justify-center shrink-0" style={{ color: 'var(--af-muted)' }}><X className="w-4 h-4" aria-hidden /></button>
                </div>
              )}

              <fieldset className="grid sm:grid-cols-2 gap-4">
                <legend className="sr-only">Contact</legend>
                <div><label htmlFor={id('fullName')} className={label}>Full name</label>{Input({ k: 'fullName', autoComplete: 'name' })}<Err k="fullName" /></div>
                <div><label htmlFor={id('email')} className={label}>Email</label>{Input({ k: 'email', type: 'email', autoComplete: 'email', inputMode: 'email' })}<Err k="email" /></div>
                {shown('phone') && <div><label htmlFor={id('phone')} className={label}>Phone <Tag k="phone" /></label>{Input({ k: 'phone', type: 'tel', autoComplete: 'tel', inputMode: 'tel' })}<Err k="phone" /></div>}
                {shown('city') && <div><label htmlFor={id('city')} className={label}>City <Tag k="city" /></label>{Input({ k: 'city', autoComplete: 'address-level2' })}<Err k="city" /></div>}
              </fieldset>

              {(['currentTitle', 'currentCompany', 'experienceYears', 'noticePeriodDays', 'expectedCtcLakh'] as const).some(shown) && (
                <fieldset className="grid sm:grid-cols-2 gap-4">
                  <legend className="sr-only">Experience</legend>
                  {shown('currentTitle') && <div><label htmlFor={id('currentTitle')} className={label}>Current role <Tag k="currentTitle" /></label>{Input({ k: 'currentTitle', autoComplete: 'organization-title' })}<Err k="currentTitle" /></div>}
                  {shown('currentCompany') && <div><label htmlFor={id('currentCompany')} className={label}>Current company <Tag k="currentCompany" /></label>{Input({ k: 'currentCompany', autoComplete: 'organization' })}<Err k="currentCompany" /></div>}
                  {shown('experienceYears') && <div><label htmlFor={id('experienceYears')} className={label}>Years of experience <Tag k="experienceYears" /></label>{Input({ k: 'experienceYears', type: 'number', inputMode: 'numeric', min: 0, max: 60 })}<Err k="experienceYears" /></div>}
                  {shown('noticePeriodDays') && (
                    <div>
                      <label htmlFor={id('noticePeriodDays')} className={label}>Notice period <Tag k="noticePeriodDays" /></label>
                      <select id={id('noticePeriodDays')} value={d.noticePeriodDays} onChange={(e) => set('noticePeriodDays', e.target.value)} className={field} style={fieldStyle}
                        aria-invalid={!!errors.noticePeriodDays || undefined}>
                        <option value="">Select…</option>
                        {NOTICE.map((n) => <option key={n.value} value={n.value}>{n.label}</option>)}
                      </select>
                      <Err k="noticePeriodDays" />
                    </div>
                  )}
                  {shown('expectedCtcLakh') && (
                    <div className="sm:col-span-2">
                      <label htmlFor={id('expectedCtcLakh')} className={label}>Expected salary <Tag k="expectedCtcLakh" note="₹ lakh per year" /></label>
                      <div className="sm:max-w-[200px]">{Input({ k: 'expectedCtcLakh', type: 'number', inputMode: 'decimal', min: 0, step: '0.5', placeholder: 'e.g. 24' })}</div>
                      <Err k="expectedCtcLakh" />
                    </div>
                  )}
                </fieldset>
              )}

              {form.askSkills && job.skills.length > 0 && (
                <fieldset>
                  <legend className={label}>Which of these skills do you have?</legend>
                  <div className="flex flex-wrap gap-2">
                    {job.skills.map((s) => {
                      const on = skills.includes(s);
                      return (
                        <button key={s} type="button" aria-pressed={on} onClick={() => setSkills((x) => (on ? x.filter((y) => y !== s) : [...x, s]))}
                          className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 border text-sm font-medium"
                          style={{ borderRadius: '999px', borderColor: on ? 'var(--af-accent)' : 'var(--af-border)', background: on ? 'var(--af-accent)' : 'var(--af-surface)', color: on ? 'var(--af-on-accent)' : 'var(--af-text)' }}>
                          {on && <Check className="w-3.5 h-3.5" aria-hidden />} {s}
                        </button>
                      );
                    })}
                  </div>
                  <p className={help} style={{ color: 'var(--af-muted)' }}>Only tick what you can talk about in an interview.</p>
                </fieldset>
              )}

              {job.screeningQuestions.length > 0 && (
                <fieldset className="space-y-4">
                  <legend className="sr-only">Questions from {job.company}</legend>
                  {job.screeningQuestions.map((q) => (
                    <div key={q.id}>
                      {q.type === 'yesno' ? (
                        <fieldset>
                          <legend className={label}>{q.question}{!q.required && <span className="font-normal" style={{ color: 'var(--af-muted)' }}> (optional)</span>}</legend>
                          <div className="flex gap-2" id={id(`q_${q.id}`)} tabIndex={-1}>
                            {['yes', 'no'].map((v) => (
                              <label key={v} className="inline-flex items-center gap-2 min-h-[44px] px-4 border cursor-pointer text-sm font-medium"
                                style={{ borderRadius: 'var(--af-radius)', borderColor: answers[q.id] === v ? 'var(--af-accent)' : 'var(--af-border)' }}>
                                <input type="radio" name={id(`q_${q.id}`)} value={v} checked={answers[q.id] === v}
                                  onChange={() => { setAnswers((a) => ({ ...a, [q.id]: v })); setErrors((e) => ({ ...e, [`q_${q.id}`]: '' })); }}
                                  className="w-4 h-4" style={{ accentColor: 'var(--af-accent)' }} />
                                {v === 'yes' ? 'Yes' : 'No'}
                              </label>
                            ))}
                          </div>
                        </fieldset>
                      ) : q.type === 'choice' ? (
                        <>
                          <label htmlFor={id(`q_${q.id}`)} className={label}>{q.question}{!q.required && <span className="font-normal" style={{ color: 'var(--af-muted)' }}> (optional)</span>}</label>
                          <select id={id(`q_${q.id}`)} value={answers[q.id] ?? ''} className={field} style={fieldStyle} aria-invalid={!!errors[`q_${q.id}`] || undefined}
                            onChange={(e) => { setAnswers((a) => ({ ...a, [q.id]: e.target.value })); setErrors((x) => ({ ...x, [`q_${q.id}`]: '' })); }}>
                            <option value="">Select…</option>
                            {(q.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
                          </select>
                        </>
                      ) : (
                        <>
                          <label htmlFor={id(`q_${q.id}`)} className={label}>{q.question}{!q.required && <span className="font-normal" style={{ color: 'var(--af-muted)' }}> (optional)</span>}</label>
                          <textarea id={id(`q_${q.id}`)} rows={2} maxLength={1000} value={answers[q.id] ?? ''}
                            onChange={(e) => { setAnswers((a) => ({ ...a, [q.id]: e.target.value })); setErrors((x) => ({ ...x, [`q_${q.id}`]: '' })); }}
                            aria-invalid={!!errors[`q_${q.id}`] || undefined}
                            className={`${field} py-2.5 resize-y`} style={fieldStyle} />
                        </>
                      )}
                      <Err k={`q_${q.id}`} />
                    </div>
                  ))}
                </fieldset>
              )}

              {(['linkedinUrl', 'githubUrl', 'portfolioUrl'] as const).some(shown) && (
                <fieldset className="grid sm:grid-cols-3 gap-4">
                  <legend className={label}>Links</legend>
                  {shown('linkedinUrl') && <div><label htmlFor={id('linkedinUrl')} className="text-[0.8125rem] font-medium mb-1 block">LinkedIn <Tag k="linkedinUrl" /></label>{Input({ k: 'linkedinUrl', type: 'url', inputMode: 'url', placeholder: 'LinkedIn URL' })}<Err k="linkedinUrl" /></div>}
                  {shown('githubUrl') && <div><label htmlFor={id('githubUrl')} className="text-[0.8125rem] font-medium mb-1 block">GitHub <Tag k="githubUrl" /></label>{Input({ k: 'githubUrl', type: 'url', inputMode: 'url', placeholder: 'GitHub URL' })}<Err k="githubUrl" /></div>}
                  {shown('portfolioUrl') && <div><label htmlFor={id('portfolioUrl')} className="text-[0.8125rem] font-medium mb-1 block">Portfolio <Tag k="portfolioUrl" /></label>{Input({ k: 'portfolioUrl', type: 'url', inputMode: 'url', placeholder: 'Portfolio URL' })}<Err k="portfolioUrl" /></div>}
                </fieldset>
              )}

              {shown('coverLetter') && (
                <div>
                  <label htmlFor={id('coverLetter')} className={label}>Note to the hiring team <Tag k="coverLetter" /></label>
                  <textarea id={id('coverLetter')} rows={3} maxLength={3000} value={d.coverLetter} onChange={(e) => set('coverLetter', e.target.value)}
                    placeholder="Why this role? Anything they should know?" className={`${field} py-2.5 resize-y`} style={fieldStyle} aria-invalid={!!errors.coverLetter || undefined} />
                  <Err k="coverLetter" />
                </div>
              )}

              <div>
                <label className="flex items-start gap-3 cursor-pointer" htmlFor={id('consent')}>
                  <input id={id('consent')} type="checkbox" checked={agree} onChange={(e) => { setAgree(e.target.checked); setErrors((x) => ({ ...x, consent: '' })); }}
                    className="mt-0.5 w-5 h-5 shrink-0" style={{ accentColor: 'var(--af-accent)' }} aria-invalid={!!errors.consent || undefined} />
                  <span className="text-[0.875rem]">I agree to share my application with {job.company} for this role, as described above.</span>
                </label>
                <Err k="consent" />
                <label className="mt-3 flex items-start gap-3 cursor-pointer" htmlFor={id('pool')}>
                  <input id={id('pool')} type="checkbox" checked={pool} onChange={(e) => setPool(e.target.checked)}
                    className="mt-0.5 w-5 h-5 shrink-0" style={{ accentColor: 'var(--af-accent)' }} />
                  <span className="text-[0.875rem]">
                    Optional: {job.company} may contact me about other roles for the next 12 months.
                    <span className="block" style={{ color: 'var(--af-muted)' }}>You can turn this off any time from your application link.</span>
                  </span>
                </label>
              </div>

              {error && (
                <p role="alert" className="text-sm text-red-700 dark:text-red-400">
                  {error}{errorLink && <> <a href={errorLink} className="font-semibold underline">See it in My applications</a></>}
                </p>
              )}
              <button type="submit" disabled={submitting} className={`${primaryBtn} w-full sm:w-auto`} style={primaryStyle}>
                {submitting && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} {form.submitLabel}
              </button>
            </form>
          )}

          {step === 'upload' && error && <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-400">{error}</p>}
        </>
      )}
    </div>
  );
}
