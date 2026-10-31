'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { ArrowLeft, Check, CheckCircle2, FileText, Loader2, Sparkles, UploadCloud, X } from 'lucide-react';
import TurnstileWidget from '@/components/shared/TurnstileWidget';

const HAS_CAPTCHA = !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

export interface ApplyJob {
  slug: string;
  title: string;
  company: string;
  skills: string[];
  screeningQuestions: { id: string; question: string; type: 'text' | 'yesno'; required: boolean }[];
  consentText: string;
}

export interface ApplyAttribution {
  source?: string;
  widgetId?: string;
  ref?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
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
  job, attribution, variant = 'page', style, onBack, onDone,
}: {
  job: ApplyJob;
  attribution: ApplyAttribution;
  variant?: 'page' | 'embed';
  style?: React.CSSProperties;
  onBack?: () => void;
  onDone?: () => void;
}) {
  const uid = useId();
  const [step, setStep] = useState<'upload' | 'details' | 'done'>('upload');
  const [captcha, setCaptcha] = useState('');
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<{ name: string; sizeBytes: number } | null>(null);
  const [token, setToken] = useState('');
  const [pool, setPool] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [filledCount, setFilledCount] = useState(0);
  const [d, setD] = useState<Details>(EMPTY);
  const [skills, setSkills] = useState<string[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [agree, setAgree] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
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
      autofill(data.token);
    } catch {
      setError('You seem to be offline. Check your connection and try again.');
    }
    setUploading(false);
  }

  async function autofill(t: string) {
    setParsing(true);
    try {
      const res = await fetch('/api/jobs/apply/parse', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: t }) });
      const data = await res.json().catch(() => ({}));
      const p = data.prefill ?? {};
      let n = 0;
      setD((x) => {
        const next = { ...x };
        for (const k of Object.keys(EMPTY) as (keyof Details)[]) {
          const v = p[k];
          if (v == null || v === '' || touched.current.has(k) || next[k]) continue;
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
    setError('');
    const local: Record<string, string> = {};
    if (d.fullName.trim().length < 2) local.fullName = 'Enter your full name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email.trim())) local.email = 'Enter a valid email address.';
    for (const q of job.screeningQuestions) if (q.required && !answers[q.id]?.trim()) local[`q_${q.id}`] = 'Please answer this question.';
    if (!agree) local.consent = 'Please agree to share your application.';
    if (Object.keys(local).length) {
      setErrors(local);
      document.getElementById(`${uid}-${Object.keys(local)[0]}`)?.focus();
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/jobs/${job.slug}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token, ...d, consent: true, talentPool: pool, confirmedSkills: skills,
          screeningAnswers: job.screeningQuestions.map((q) => ({ id: q.id, answer: answers[q.id] ?? '' })),
          attribution,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) { setStep('done'); onDone?.(); }
      else {
        if (data.code === 'session') { setStep('upload'); setToken(''); setFile(null); }
        if (data.errors) setErrors(data.errors);
        setError(data.error || 'We couldn’t submit your application. Try again.');
      }
    } catch {
      setError('You seem to be offline. Check your connection and try again.');
    }
    setSubmitting(false);
  }

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
  const Err = ({ k }: { k: string }) => (errors[k] ? <p id={`${id(k)}-err`} className={`${help} text-red-700`}>{errors[k]}</p> : null);

  return (
    <div ref={topRef} className={`font-[inherit] scroll-mt-4 ${variant === 'page' ? PAGE_VARS : ''}`} style={{ color: 'var(--af-text)', ...style }}>
      {onBack && step !== 'done' && (
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 min-h-[40px] -ml-1 px-1 text-sm font-semibold mb-2" style={{ color: 'var(--af-muted)' }}>
          <ArrowLeft className="w-4 h-4" aria-hidden /> Back to jobs
        </button>
      )}

      {step === 'done' ? (
        <div role="status" className="text-center py-8">
          <CheckCircle2 className="w-12 h-12 mx-auto text-green-600" aria-hidden />
          <h2 className="text-xl font-bold mt-3">Application sent</h2>
          <p className="mt-1.5 text-[0.9375rem]" style={{ color: 'var(--af-muted)' }}>
            {job.company} has your application for {job.title}. We emailed you a private link to track it.
          </p>
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
              <p className="text-[0.875rem] leading-relaxed p-3 border" style={{ borderColor: 'var(--af-border)', borderRadius: 'var(--af-radius)', background: 'var(--af-subtle)', color: 'var(--af-muted)' }}>
                {job.consentText}
              </p>
              {HAS_CAPTCHA && <TurnstileWidget onSuccess={setCaptcha} onExpire={() => setCaptcha('')} onError={() => setCaptcha('')} />}
              <label htmlFor={id('file')}
                className={`flex flex-col items-center justify-center gap-2 text-center px-4 py-8 border-2 border-dashed cursor-pointer ${HAS_CAPTCHA && !captcha ? 'opacity-60 cursor-not-allowed' : ''}`}
                style={{ borderColor: 'var(--af-border)', borderRadius: 'var(--af-radius)' }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) upload(f); }}>
                {uploading ? <Loader2 className="w-7 h-7 animate-spin" aria-hidden style={{ color: 'var(--af-accent)' }} /> : <UploadCloud className="w-7 h-7" aria-hidden style={{ color: 'var(--af-accent)' }} />}
                <span className="text-[0.9375rem] font-semibold">{uploading ? 'Uploading…' : 'Upload your resume'}</span>
                <span className="text-[0.8125rem]" style={{ color: 'var(--af-muted)' }}>PDF or Word, up to 5 MB. We&apos;ll use it to fill in the form.</span>
                <input id={id('file')} type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  className="sr-only" disabled={uploading || (HAS_CAPTCHA && !captcha)}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }} />
              </label>
              {HAS_CAPTCHA && !captcha && <p className="text-[0.8125rem]" style={{ color: 'var(--af-muted)' }}>Complete the security check above to upload.</p>}
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
                      {parsing ? 'Reading your resume to fill the form…' : filledCount > 0 ? `We filled ${filledCount} field${filledCount === 1 ? '' : 's'} from your resume. Please check them.` : 'Fill in your details below.'}
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
                <div><label htmlFor={id('phone')} className={label}>Phone <span className="font-normal" style={{ color: 'var(--af-muted)' }}>(optional)</span></label>{Input({ k: 'phone', type: 'tel', autoComplete: 'tel', inputMode: 'tel' })}</div>
                <div><label htmlFor={id('city')} className={label}>City <span className="font-normal" style={{ color: 'var(--af-muted)' }}>(optional)</span></label>{Input({ k: 'city', autoComplete: 'address-level2' })}</div>
              </fieldset>

              <fieldset className="grid sm:grid-cols-2 gap-4">
                <legend className="sr-only">Experience</legend>
                <div><label htmlFor={id('currentTitle')} className={label}>Current role <span className="font-normal" style={{ color: 'var(--af-muted)' }}>(optional)</span></label>{Input({ k: 'currentTitle', autoComplete: 'organization-title' })}</div>
                <div><label htmlFor={id('currentCompany')} className={label}>Current company <span className="font-normal" style={{ color: 'var(--af-muted)' }}>(optional)</span></label>{Input({ k: 'currentCompany', autoComplete: 'organization' })}</div>
                <div><label htmlFor={id('experienceYears')} className={label}>Years of experience</label>{Input({ k: 'experienceYears', type: 'number', inputMode: 'numeric', min: 0, max: 60 })}</div>
                <div>
                  <label htmlFor={id('noticePeriodDays')} className={label}>Notice period</label>
                  <select id={id('noticePeriodDays')} value={d.noticePeriodDays} onChange={(e) => set('noticePeriodDays', e.target.value)} className={field} style={fieldStyle}>
                    <option value="">Select…</option>
                    {NOTICE.map((n) => <option key={n.value} value={n.value}>{n.label}</option>)}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor={id('expectedCtcLakh')} className={label}>Expected salary <span className="font-normal" style={{ color: 'var(--af-muted)' }}>(₹ lakh per year, optional)</span></label>
                  <div className="sm:max-w-[200px]">{Input({ k: 'expectedCtcLakh', type: 'number', inputMode: 'decimal', min: 0, step: '0.5', placeholder: 'e.g. 24' })}</div>
                </div>
              </fieldset>

              {job.skills.length > 0 && (
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

              <fieldset className="grid sm:grid-cols-3 gap-4">
                <legend className={label}>Links <span className="font-normal" style={{ color: 'var(--af-muted)' }}>(optional)</span></legend>
                <div><label htmlFor={id('linkedinUrl')} className="sr-only">LinkedIn</label>{Input({ k: 'linkedinUrl', type: 'url', inputMode: 'url', placeholder: 'LinkedIn URL' })}</div>
                <div><label htmlFor={id('githubUrl')} className="sr-only">GitHub</label>{Input({ k: 'githubUrl', type: 'url', inputMode: 'url', placeholder: 'GitHub URL' })}</div>
                <div><label htmlFor={id('portfolioUrl')} className="sr-only">Portfolio</label>{Input({ k: 'portfolioUrl', type: 'url', inputMode: 'url', placeholder: 'Portfolio URL' })}</div>
              </fieldset>

              <div>
                <label htmlFor={id('coverLetter')} className={label}>Note to the hiring team <span className="font-normal" style={{ color: 'var(--af-muted)' }}>(optional)</span></label>
                <textarea id={id('coverLetter')} rows={3} maxLength={3000} value={d.coverLetter} onChange={(e) => set('coverLetter', e.target.value)}
                  placeholder="Why this role? Anything they should know?" className={`${field} py-2.5 resize-y`} style={fieldStyle} />
              </div>

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

              {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
              <button type="submit" disabled={submitting} className={`${primaryBtn} w-full sm:w-auto`} style={primaryStyle}>
                {submitting && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />} Submit application
              </button>
            </form>
          )}

          {step === 'upload' && error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
        </>
      )}
    </div>
  );
}
