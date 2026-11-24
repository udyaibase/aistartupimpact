'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { ArrowLeft, Building2, Loader2 } from 'lucide-react';
import { completeOrganizerOnboarding } from './actions';

interface OrganizerUser {
  id: string;
  email: string;
  name: string;
  company: string | null;
  phone: string | null;
  avatar: string | null;
  bio: string | null;
  website: string | null;
  linkedin: string | null;
  onboardingStep: number;
}

type Form = { name: string; company: string; avatar: string; bio: string; website: string; linkedin: string; phone: string };
type Errors = Partial<Record<keyof Form | 'form', string>>;

const DRAFT_KEY = 'organizer_onboarding_draft_v2';
const BIO_MAX = 800;

const input = 'w-full min-h-[44px] px-3.5 rounded-[10px] border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-[15px] text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/15 dark:focus:ring-white/20 focus:border-gray-900 dark:focus:border-gray-300';
const label = 'block text-sm font-medium text-gray-900 dark:text-gray-100';
const hint = 'text-[13px] text-gray-600 dark:text-gray-400';
const optional = <span className="ml-1.5 text-[12px] font-normal text-gray-500 dark:text-gray-400">Optional</span>;
const primaryBtn = 'inline-flex items-center justify-center gap-2 min-h-[44px] px-5 rounded-[10px] bg-gray-900 hover:bg-gray-800 dark:bg-white dark:hover:bg-gray-100 text-white dark:text-gray-900 text-sm font-semibold disabled:opacity-60 w-full sm:w-auto';

/** "lu.ma/x" → "https://lu.ma/x"; blank stays blank. */
const withScheme = (v: string) => { const t = v.trim(); return !t ? '' : /^https?:\/\//i.test(t) ? t : `https://${t}`; };

export default function OnboardingClient({ user, returnTo }: { user: OrganizerUser; returnTo?: string }) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [form, setForm] = useState<Form>({
    name: user.name || '', company: user.company || '', avatar: user.avatar || '', bio: user.bio || '',
    website: user.website || '', linkedin: user.linkedin || '', phone: user.phone || '',
  });
  const loaded = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Keep an unfinished setup across reloads (this browser only).
  useEffect(() => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) setForm((f) => ({ ...f, ...JSON.parse(saved) }));
    } catch { /* storage unavailable */ }
    loaded.current = true;
  }, []);
  useEffect(() => {
    if (!loaded.current) return;
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(form)); } catch { /* storage unavailable */ }
  }, [form]);
  useEffect(() => { headingRef.current?.focus(); window.scrollTo({ top: 0 }); }, [step]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => { setForm((f) => ({ ...f, [k]: v })); setErrors((e) => ({ ...e, [k]: undefined, form: undefined })); };

  async function uploadLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { setErrors((x) => ({ ...x, avatar: 'Use a JPG, PNG or WebP image.' })); return; }
    if (file.size > 5 * 1024 * 1024) { setErrors((x) => ({ ...x, avatar: 'Use an image under 5 MB.' })); return; }
    setUploading(true);
    try {
      const data = new FormData();
      data.append('file', file);
      const res = await fetch('/api/media/upload', { method: 'POST', body: data });
      const result = await res.json().catch(() => ({}));
      if (!res.ok || !result.url) throw new Error(result.error || '');
      set('avatar', result.url);
    } catch (err) {
      setErrors((x) => ({ ...x, avatar: err instanceof Error && err.message ? err.message : 'Couldn’t upload that image. Try again.' }));
    } finally {
      setUploading(false);
    }
  }

  function checkStep1(): boolean {
    const e: Errors = {};
    if (form.company.trim().length < 2) e.company = 'Enter the name attendees will see as the host.';
    if (form.name.trim().length < 2) e.name = 'Enter your full name.';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function finish(includeDetails: boolean) {
    if (!checkStep1()) { setStep(1); return; }
    setSaving(true);
    const result = await completeOrganizerOnboarding({
      name: form.name.trim(), company: form.company.trim(), avatar: form.avatar,
      // "Skip for now" leaves these out so anything saved earlier stays.
      ...(includeDetails ? { bio: form.bio.trim(), website: withScheme(form.website), linkedin: withScheme(form.linkedin), phone: form.phone.trim() } : {}),
    }).catch(() => ({ success: false as const, error: 'You seem to be offline. Try again.' }));
    if (!result.success) {
      const msg = result.error || 'Couldn’t save your workspace. Try again.';
      // Link problems belong to step 2's fields.
      if (/website/i.test(msg)) { setErrors({ website: msg }); setStep(2); }
      else if (/linkedin/i.test(msg)) { setErrors({ linkedin: msg }); setStep(2); }
      else setErrors({ form: msg });
      setSaving(false);
      return;
    }
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* storage unavailable */ }
    router.push(returnTo || '/organizer');
    router.refresh();
  }

  const field = (k: keyof Form) => ({ 'aria-invalid': !!errors[k] || undefined, 'aria-describedby': errors[k] ? `oo-${k}-error` : undefined });
  const err = (k: keyof Form) => errors[k] && <p id={`oo-${k}-error`} className="text-[13px] text-red-700 dark:text-red-400">{errors[k]}</p>;

  return (
    <div className="min-h-[100dvh] bg-[#F7F7F8] dark:bg-gray-950 font-jakarta">
      {/* Back · progress · signed-in account */}
      <div className="sticky top-0 z-10 bg-[#F7F7F8]/90 dark:bg-gray-950/90 backdrop-blur pt-[env(safe-area-inset-top)]">
        <div className="mx-auto max-w-[640px] px-2 sm:px-4 h-14 flex items-center gap-2 sm:gap-3">
          <button type="button" onClick={() => setStep(1)} aria-label="Back" className={`w-10 h-10 shrink-0 flex items-center justify-center rounded-full text-gray-700 dark:text-gray-300 hover:bg-gray-200/70 dark:hover:bg-gray-800 ${step === 1 ? 'invisible' : ''}`}>
            <ArrowLeft className="w-5 h-5" aria-hidden />
          </button>
          <div className="flex-1 flex gap-1.5" role="progressbar" aria-label={`Step ${step} of 2`} aria-valuemin={1} aria-valuemax={2} aria-valuenow={step}>
            {[1, 2].map((i) => (
              <span key={i} className="h-1.5 flex-1 rounded-full bg-gray-200 dark:bg-gray-800 overflow-hidden">
                <span className={`block h-full rounded-full bg-gray-900 dark:bg-white transition-[width] duration-300 ${i <= step ? 'w-full' : 'w-0'}`} />
              </span>
            ))}
          </div>
          <span className="shrink-0 max-w-[40%] truncate px-2 text-[13px] text-gray-500 dark:text-gray-400" title={user.email}>{user.email}</span>
        </div>
      </div>

      <main className="mx-auto max-w-[640px] px-4 pt-4 sm:pt-8 pb-[calc(2.5rem+env(safe-area-inset-bottom))]">
        <p className="mb-1.5 text-[13px] font-medium text-gray-500 dark:text-gray-400">Step {step} of 2 · Organizer workspace</p>
        <h1 ref={headingRef} tabIndex={-1} className="font-sora font-bold text-[22px] sm:text-[28px] leading-tight text-gray-900 dark:text-white focus:outline-none">
          {step === 1 ? 'Set up your organizer profile' : 'Tell attendees about you'}
        </h1>
        <p className="mt-1.5 mb-5 sm:mb-7 text-[14px] sm:text-[15px] text-gray-600 dark:text-gray-400 max-w-[54ch]">
          {step === 1
            ? 'This is the host name and logo shown on your event pages and tickets. You can change it later in Settings.'
            : 'A short description and a link help people trust your events. You can skip this and add it later.'}
        </p>

        <form
          noValidate
          onSubmit={(e) => { e.preventDefault(); if (step === 1) { if (checkStep1()) setStep(2); } else void finish(true); }}
          className="rounded-[14px] border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 sm:p-7 space-y-5"
        >
          {errors.form && <p role="alert" className="rounded-[10px] border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 px-3.5 py-2.5 text-[14px] text-red-800 dark:text-red-300">{errors.form}</p>}

          {step === 1 ? (
            <>
              <div className="flex items-center gap-4">
                <div className="relative w-16 h-16 shrink-0 rounded-[12px] overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                  {form.avatar
                    ? <Image src={form.avatar} alt="Your logo" width={64} height={64} unoptimized className="w-full h-full object-cover" />
                    : <Building2 className="w-7 h-7 text-gray-400" aria-hidden />}
                  {uploading && <span className="absolute inset-0 bg-black/40 flex items-center justify-center"><Loader2 className="w-5 h-5 text-white animate-spin" aria-label="Uploading" /></span>}
                </div>
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <label htmlFor="oo-logo" className="inline-flex items-center min-h-[36px] px-3 rounded-[8px] border border-gray-300 dark:border-gray-700 text-[13px] font-semibold text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer focus-within:ring-2 focus-within:ring-gray-900/15">
                      {form.avatar ? 'Change logo' : 'Upload logo'}
                      <input id="oo-logo" type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadLogo} className="sr-only" />
                    </label>
                    {form.avatar && <button type="button" onClick={() => set('avatar', '')} className="min-h-[36px] px-2 text-[13px] font-semibold text-gray-600 dark:text-gray-400 hover:underline">Remove</button>}
                  </div>
                  <p className={hint}>Optional. Your logo or a photo, square works best, up to 5 MB.</p>
                  {err('avatar')}
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="oo-company" className={label}>Organization or community name</label>
                <input id="oo-company" value={form.company} onChange={(e) => set('company', e.target.value)} autoComplete="organization" maxLength={100} placeholder="e.g. Bengaluru AI Meetup" className={input} {...field('company')} />
                <p className={hint}>Shown as the host on your events. Hosting on your own? Use your name.</p>
                {err('company')}
              </div>

              <div className="space-y-1.5">
                <label htmlFor="oo-name" className={label}>Your full name</label>
                <input id="oo-name" value={form.name} onChange={(e) => set('name', e.target.value)} autoComplete="name" maxLength={100} placeholder="e.g. Priya Sharma" className={input} {...field('name')} />
                {err('name')}
              </div>
            </>
          ) : (
            <>
              <div className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-3">
                  <label htmlFor="oo-bio" className={label}>About{optional}</label>
                  <span className="text-[12px] tabular-nums text-gray-500 dark:text-gray-400">{form.bio.length}/{BIO_MAX}</span>
                </div>
                <textarea id="oo-bio" value={form.bio} onChange={(e) => set('bio', e.target.value.slice(0, BIO_MAX))} rows={4} maxLength={BIO_MAX}
                  placeholder="e.g. A monthly meetup for people building with AI in Bengaluru. Talks, demos and hiring."
                  className={`${input} py-2.5 resize-y`} />
                <p className={hint}>One or two sentences: who you are and what your events are about.</p>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="oo-website" className={label}>Website{optional}</label>
                  <input id="oo-website" value={form.website} onChange={(e) => set('website', e.target.value)} inputMode="url" autoComplete="url" maxLength={300} placeholder="yourcommunity.org" className={input} {...field('website')} />
                  {err('website')}
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="oo-linkedin" className={label}>LinkedIn{optional}</label>
                  <input id="oo-linkedin" value={form.linkedin} onChange={(e) => set('linkedin', e.target.value)} inputMode="url" maxLength={300} placeholder="linkedin.com/company/…" className={input} {...field('linkedin')} />
                  {err('linkedin')}
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="oo-phone" className={label}>Phone{optional}</label>
                <input id="oo-phone" type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} autoComplete="tel" maxLength={20} placeholder="+91 98765 43210" className={input} />
                <p className={hint}>Not shown publicly. Only used by the Udyaibase team about your events.</p>
              </div>
            </>
          )}

          <div className="pt-1 flex flex-col sm:flex-row sm:items-center gap-3">
            {step === 2 && (
              <button type="button" disabled={saving} onClick={() => finish(false)} className="order-2 sm:order-1 min-h-[44px] px-4 rounded-[10px] text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50">
                Skip for now
              </button>
            )}
            <button type="submit" disabled={saving || uploading} className={`order-1 sm:order-2 sm:ml-auto ${primaryBtn}`}>
              {saving && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
              {step === 1 ? 'Continue' : saving ? 'Saving…' : 'Finish setup'}
            </button>
          </div>
        </form>

        <p className="mt-5 text-[13px] text-gray-600 dark:text-gray-400">Next, you can create your first event.</p>
      </main>
    </div>
  );
}
