'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { ArrowLeft, Loader2, User } from 'lucide-react';
import { completeOnboardingAction } from './actions';

interface FounderUser {
  id: string;
  email: string;
  name: string;
  company: string | null;
  companyDomain: string | null;
  role: string | null;
  phone: string | null;
  linkedin: string | null;
  twitter: string | null;
  website: string | null;
  previousCompany: string | null;
  bio: string | null;
  avatar: string | null;
  onboardingStep: number;
}

type Form = {
  name: string; company: string; role: string; roleOther: string; previousCompany: string; phone: string;
  linkedin: string; twitter: string; website: string; bio: string; avatar: string;
};
type Errors = Partial<Record<keyof Form | 'form', string>>;

const ROLES = ['Founder', 'Co-founder', 'CEO', 'CTO', 'Product lead', 'Marketing lead'];
const DRAFT_KEY = 'founder_onboarding_draft_v2';
const BIO_MAX = 800;

const input = 'w-full min-h-[44px] px-3.5 rounded-[10px] border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-[15px] text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/15 dark:focus:ring-white/20 focus:border-gray-900 dark:focus:border-gray-300';
const label = 'block text-sm font-medium text-gray-900 dark:text-gray-100';
const hint = 'text-[13px] text-gray-600 dark:text-gray-400';
const optional = <span className="ml-1.5 text-[12px] font-normal text-gray-500 dark:text-gray-400">Optional</span>;

/** "linkedin.com/in/x" → "https://linkedin.com/in/x"; blank stays blank. */
const withScheme = (v: string) => { const t = v.trim(); return !t ? '' : /^https?:\/\//i.test(t) ? t : `https://${t}`; };

export default function OnboardingClient({ user, returnTo }: { user: FounderUser; returnTo?: string }) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const knownRole = !user.role || ROLES.includes(user.role);
  const [form, setForm] = useState<Form>({
    name: user.name || '', company: user.company || '', role: knownRole ? user.role || '' : 'Other', roleOther: knownRole ? '' : user.role || '',
    previousCompany: user.previousCompany || '', phone: user.phone || '', linkedin: user.linkedin || '', twitter: user.twitter || '',
    website: user.website || '', bio: user.bio || '', avatar: user.avatar || '',
  });
  const loaded = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Keep an unfinished profile across reloads (this browser only).
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
  useEffect(() => { headingRef.current?.focus(); }, [step]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => { setForm((f) => ({ ...f, [k]: v })); setErrors((e) => ({ ...e, [k]: undefined, form: undefined })); };
  const role = form.role === 'Other' ? form.roleOther.trim() : form.role;

  async function uploadAvatar(e: React.ChangeEvent<HTMLInputElement>) {
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
      if (!res.ok || !result.url) throw new Error(result.error || 'Upload failed');
      set('avatar', result.url);
    } catch (err) {
      setErrors((x) => ({ ...x, avatar: err instanceof Error && err.message !== 'Upload failed' ? err.message : 'Couldn’t upload that photo. Try again.' }));
    } finally {
      setUploading(false);
    }
  }

  function checkStep1(): boolean {
    const e: Errors = {};
    if (form.name.trim().length < 2) e.name = 'Enter your full name.';
    if (!role) e.role = form.role === 'Other' ? 'Type your role.' : 'Choose your role.';
    if (form.company.trim().length < 2) e.company = 'Enter your startup’s name.';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function finish(includeBackground: boolean) {
    if (!checkStep1()) { setStep(1); return; }
    setSaving(true);
    const result = await completeOnboardingAction({
      name: form.name.trim(), company: form.company.trim(), role, avatar: form.avatar || undefined,
      linkedin: withScheme(form.linkedin),
      // Blank sends '' (clears it); "Skip for now" leaves these out so anything saved earlier stays.
      ...(includeBackground ? {
        bio: form.bio.trim(), previousCompany: form.previousCompany.trim(), phone: form.phone.trim(),
        twitter: withScheme(form.twitter), website: withScheme(form.website),
      } : {}),
    }).catch(() => ({ success: false as const, error: 'You seem to be offline. Try again.' }));
    if (!result.success) {
      setErrors({ form: result.error || 'Couldn’t save your profile. Try again.' });
      setSaving(false);
      return;
    }
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* storage unavailable */ }
    router.push(returnTo || '/founder/dashboard?welcome=true');
  }

  const field = (k: keyof Form) => ({ 'aria-invalid': !!errors[k] || undefined, 'aria-describedby': errors[k] ? `ob-${k}-error` : undefined });
  const err = (k: keyof Form) => errors[k] && <p id={`ob-${k}-error`} className="text-[13px] text-red-700 dark:text-red-400">{errors[k]}</p>;

  return (
    <div className="min-h-[100dvh] bg-[#F7F7F8] dark:bg-gray-950 font-jakarta">
      <header className="border-b border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-950/80 backdrop-blur">
        <div className="mx-auto max-w-[640px] px-4 h-14 flex items-center justify-between gap-3">
          <span className="shrink-0 whitespace-nowrap font-sora font-bold text-[15px] tracking-tight text-gray-900 dark:text-white">Udyaibase<span className="hidden sm:inline font-normal text-gray-500 dark:text-gray-400"> · Founder portal</span></span>
          <span className="min-w-0 text-[13px] text-gray-600 dark:text-gray-400 truncate">Signed in as {user.email}</span>
        </div>
      </header>

      <main className="mx-auto max-w-[640px] px-4 py-8 sm:py-12">
        <div className="mb-6 space-y-3">
          <div className="flex items-center gap-3 text-[13px] text-gray-600 dark:text-gray-400">
            <span className="font-medium text-gray-900 dark:text-gray-100">Step {step} of 2</span>
            <span aria-hidden className="flex gap-1.5">
              <span className="h-1 w-10 rounded-full bg-gray-900 dark:bg-white" />
              <span className={`h-1 w-10 rounded-full ${step === 2 ? 'bg-gray-900 dark:bg-white' : 'bg-gray-300 dark:bg-gray-700'}`} />
            </span>
          </div>
          <h1 ref={headingRef} tabIndex={-1} className="font-sora font-bold text-2xl sm:text-[28px] leading-tight text-gray-900 dark:text-white focus:outline-none">
            {step === 1 ? 'Set up your founder profile' : 'Add your background'}
          </h1>
          <p className="text-[15px] text-gray-600 dark:text-gray-400 max-w-[52ch]">
            {step === 1
              ? 'This appears next to your startup and anything you publish on Udyaibase. You can change it any time under Profile.'
              : 'A short bio and a link or two help investors, candidates and other founders trust your listing. You can skip this and add it later.'}
          </p>
        </div>

        <form
          noValidate
          onSubmit={(e) => { e.preventDefault(); if (step === 1) { if (checkStep1()) setStep(2); } else void finish(true); }}
          className="rounded-[14px] border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 sm:p-7 space-y-5"
        >
          {errors.form && <p role="alert" className="rounded-[10px] border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 px-3.5 py-2.5 text-[14px] text-red-800 dark:text-red-300">{errors.form}</p>}

          {step === 1 ? (
            <>
              <div className="flex items-center gap-4">
                <div className="relative w-16 h-16 shrink-0 rounded-full overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                  {form.avatar
                    ? <Image src={form.avatar} alt="Your profile photo" width={64} height={64} unoptimized className="w-full h-full object-cover" />
                    : <User className="w-7 h-7 text-gray-400" aria-hidden />}
                  {uploading && <span className="absolute inset-0 bg-black/40 flex items-center justify-center"><Loader2 className="w-5 h-5 text-white animate-spin" aria-label="Uploading" /></span>}
                </div>
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <label htmlFor="ob-avatar" className="inline-flex items-center min-h-[36px] px-3 rounded-[8px] border border-gray-300 dark:border-gray-700 text-[13px] font-semibold text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer focus-within:ring-2 focus-within:ring-gray-900/15">
                      {form.avatar ? 'Change photo' : 'Upload photo'}
                      <input id="ob-avatar" type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadAvatar} className="sr-only" />
                    </label>
                    {form.avatar && <button type="button" onClick={() => set('avatar', '')} className="min-h-[36px] px-2 text-[13px] font-semibold text-gray-600 dark:text-gray-400 hover:underline">Remove</button>}
                  </div>
                  <p className={hint}>Optional. A clear headshot, JPG or PNG, up to 5 MB.</p>
                  {err('avatar')}
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="ob-name" className={label}>Full name</label>
                <input id="ob-name" value={form.name} onChange={(e) => set('name', e.target.value)} autoComplete="name" maxLength={100} placeholder="e.g. Priya Sharma" className={input} {...field('name')} />
                {err('name')}
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="ob-role" className={label}>Your role</label>
                  <select id="ob-role" value={form.role} onChange={(e) => set('role', e.target.value)} className={input} {...field('role')}>
                    <option value="">Choose…</option>
                    {ROLES.map((r) => <option key={r}>{r}</option>)}
                    <option value="Other">Other</option>
                  </select>
                  {form.role === 'Other' && (
                    <input aria-label="Your role" value={form.roleOther} onChange={(e) => set('roleOther', e.target.value)} maxLength={100} placeholder="e.g. Head of Research" className={`${input} mt-2`} />
                  )}
                  {err('role')}
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="ob-company" className={label}>Startup name</label>
                  <input id="ob-company" value={form.company} onChange={(e) => set('company', e.target.value)} autoComplete="organization" maxLength={100} placeholder="e.g. Krishi Mitra AI" className={input} {...field('company')} />
                  {err('company')}
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="ob-linkedin" className={label}>LinkedIn{optional}</label>
                <input id="ob-linkedin" value={form.linkedin} onChange={(e) => set('linkedin', e.target.value)} inputMode="url" autoComplete="url" maxLength={300} placeholder="linkedin.com/in/your-name" className={input} />
              </div>
            </>
          ) : (
            <>
              <div className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-3">
                  <label htmlFor="ob-bio" className={label}>Short bio{optional}</label>
                  <span className="text-[12px] tabular-nums text-gray-500 dark:text-gray-400">{form.bio.length}/{BIO_MAX}</span>
                </div>
                <textarea id="ob-bio" value={form.bio} onChange={(e) => set('bio', e.target.value.slice(0, BIO_MAX))} rows={4} maxLength={BIO_MAX}
                  placeholder="e.g. Building crop-disease detection for small farmers. Previously ML engineer at Flipkart; IIT Madras."
                  className={`${input} py-2.5 resize-y`} />
                <p className={hint}>Two sentences is plenty: what you’re building, and what you did before.</p>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="ob-prev" className={label}>Previous role{optional}</label>
                <input id="ob-prev" value={form.previousCompany} onChange={(e) => set('previousCompany', e.target.value)} maxLength={200} placeholder="e.g. ML engineer at Flipkart" className={input} />
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="ob-website" className={label}>Startup website{optional}</label>
                  <input id="ob-website" value={form.website} onChange={(e) => set('website', e.target.value)} inputMode="url" maxLength={300} placeholder="yourstartup.com" className={input} />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="ob-x" className={label}>X (Twitter){optional}</label>
                  <input id="ob-x" value={form.twitter} onChange={(e) => set('twitter', e.target.value)} inputMode="url" maxLength={300} placeholder="x.com/your-handle" className={input} />
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="ob-phone" className={label}>Phone{optional}</label>
                <input id="ob-phone" type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} autoComplete="tel" maxLength={20} placeholder="+91 98765 43210" className={input} />
                <p className={hint}>Only used by the Udyaibase team if we need to reach you about your listing.</p>
              </div>
            </>
          )}

          <div className="pt-2 flex flex-col-reverse sm:flex-row sm:items-center gap-3">
            {step === 2 && (
              <button type="button" onClick={() => setStep(1)} className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:underline">
                <ArrowLeft className="w-4 h-4" aria-hidden /> Back
              </button>
            )}
            <div className="sm:ml-auto flex flex-col-reverse sm:flex-row gap-3">
              {step === 2 && (
                <button type="button" disabled={saving} onClick={() => finish(false)} className="min-h-[44px] px-4 rounded-[10px] text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50">
                  Skip for now
                </button>
              )}
              <button type="submit" disabled={saving || uploading}
                className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 rounded-[10px] bg-gray-900 hover:bg-gray-800 dark:bg-white dark:hover:bg-gray-100 text-white dark:text-gray-900 text-sm font-semibold disabled:opacity-60">
                {saving && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
                {step === 1 ? 'Continue' : saving ? 'Saving…' : 'Finish setup'}
              </button>
            </div>
          </div>
        </form>

        <p className="mt-5 text-[13px] text-gray-600 dark:text-gray-400">
          Next, you can list your startup or claim one that’s already on Udyaibase.
        </p>
      </main>
    </div>
  );
}
