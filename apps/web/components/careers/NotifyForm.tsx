'use client';

import { useId, useState } from 'react';
import { notifyConsentText } from '@/lib/jobs/careers-notify-text';
import { useHumanCheck } from '@/components/shared/useHumanCheck';

/**
 * "Get notified when {company} is hiring". Double opt-in: the server emails a confirmation link.
 * Colours come from the same CSS variables as the careers page, so it fits the widget and the hosted page.
 */
export default function NotifyForm({ companySlug, companyName, source, preview = false, compact = false }: {
  companySlug: string;
  companyName: string;
  source: 'widget' | 'page';
  /** Employer's live preview: never sends anything. */
  preview?: boolean;
  /** One line under a short heading (when roles are open), instead of the full card. */
  compact?: boolean;
}) {
  const uid = useId();
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'done'>('idle');
  const [error, setError] = useState('');
  const human = useHumanCheck({ lazy: true, className: 'mt-3' });
  const [field, setField] = useState<'' | 'email' | 'consent'>('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setField('');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setField('email'); setError('Enter a valid email address.'); return; }
    if (!consent) { setField('consent'); setError('Tick the box to agree to these emails.'); return; }
    if (preview) { setState('done'); return; }
    if (!human.ready) { human.arm(); setError('Complete the quick security check, then send.'); return; }
    setState('sending');
    try {
      const res = await fetch('/api/jobs/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company: companySlug, email: email.trim(), consent, website, source, turnstileToken: human.token }),
      });
      human.reset(); // a check works once
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setState('idle'); setField(d.field ?? ''); setError(d.error || 'Something went wrong. Please try again.'); return; }
      setState('done');
    } catch {
      setState('idle');
      setError('Couldn’t connect. Check your internet and try again.');
    }
  }

  const box = { borderColor: 'var(--w-border)', background: 'var(--w-surface)', borderRadius: 'var(--r-card)' };
  const input = {
    borderColor: field === 'email' ? '#dc2626' : 'var(--w-border)', background: 'var(--w-surface)', color: 'var(--w-text)',
    borderRadius: 'var(--r-control, 10px)',
  };

  if (state === 'done') {
    return (
      <div role="status" className={`border ${compact ? 'p-4' : 'p-5 sm:p-6'}`} style={box}>
        <p className="font-semibold">Check your inbox</p>
        <p className="mt-1 text-sm" style={{ color: 'var(--w-muted)' }}>
          {preview ? 'Preview only: nothing was sent.' : `We’ve sent a link to ${email.trim()}. Confirm it and we’ll email you when ${companyName} posts a new role.`}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className={`border ${compact ? 'p-4' : 'p-5 sm:p-6'}`} style={box} aria-labelledby={`${uid}-title`}>
      <p id={`${uid}-title`} className="font-semibold">{`Get notified when ${companyName} is hiring`}</p>
      {!compact && <p className="mt-1 text-sm" style={{ color: 'var(--w-muted)' }}>Leave your email and we’ll tell you when a new role opens. No other emails.</p>}
      <div className="mt-3 flex flex-col sm:flex-row gap-2">
        <label htmlFor={`${uid}-email`} className="sr-only">Email address</label>
        <input id={`${uid}-email`} type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => { setEmail(e.target.value); if (!preview) human.arm(); }} onFocus={() => { if (!preview) human.arm(); }}
          placeholder="you@example.com" aria-invalid={field === 'email'} aria-describedby={error ? `${uid}-err` : undefined}
          className="embed-focus flex-1 min-w-0 min-h-[44px] px-3 border text-[0.9375rem] focus:outline-none focus:ring-2 focus:ring-[color:var(--embed-accent)]/30" style={input} />
        <button type="submit" disabled={state === 'sending'}
          className="embed-focus min-h-[44px] px-5 font-semibold text-sm disabled:opacity-60"
          style={{ background: 'var(--embed-accent)', color: 'var(--embed-on-accent, #fff)', borderRadius: 'var(--r-button, 10px)' }}>
          {state === 'sending' ? 'Sending…' : 'Notify me'}
        </button>
      </div>
      {/* Hidden from people; bots that fill every field are ignored. */}
      <input type="text" name="website" value={website} onChange={(e) => setWebsite(e.target.value)} tabIndex={-1} autoComplete="off" aria-hidden className="absolute -left-[9999px] w-px h-px opacity-0" />
      <label className="mt-3 flex items-start gap-2 text-sm cursor-pointer" style={{ color: 'var(--w-muted)' }}>
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} aria-invalid={field === 'consent'}
          className="mt-0.5 w-4 h-4 shrink-0" style={{ accentColor: 'var(--embed-accent)' }} />
        <span>{notifyConsentText(companyName)}</span>
      </label>
      {error && <p id={`${uid}-err`} role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
      {human.widget}
    </form>
  );
}
