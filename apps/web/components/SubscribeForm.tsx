'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, CheckCircle, CheckCircle2, Mail, ArrowRight } from 'lucide-react';


type AllowedSource = 'footer' | 'sidebar' | 'newsletter' | 'website' | 'jobs-alert' | 'jobs-bottom' | 'events-alert';

interface SubscribeFormProps {
  buttonText?: string;
  source?: AllowedSource;
  className?: string;
}

// Local part, then one or more domain labels, then a letters-only ending of at least 2 (so "gmail.c" fails).
const EMAIL_REGEX = /^[A-Za-z0-9._%+-]+@(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,}$/;

// Big providers only use these domains, so e.g. "gmail.co" or "gmail.cm" is a typo, not an address.
const PROVIDER_DOMAINS: Record<string, string[]> = {
  gmail: ['gmail.com'],
  googlemail: ['googlemail.com'],
  yahoo: ['yahoo.com', 'yahoo.co.in', 'yahoo.in', 'yahoo.co.uk'],
  hotmail: ['hotmail.com', 'hotmail.co.uk'],
  outlook: ['outlook.com', 'outlook.in'],
  icloud: ['icloud.com'],
  rediffmail: ['rediffmail.com'],
};

function isCompleteEmail(value: string): boolean {
  const email = value.trim();
  if (!EMAIL_REGEX.test(email)) return false;
  const domain = email.slice(email.indexOf('@') + 1).toLowerCase();
  const known = PROVIDER_DOMAINS[domain.split('.')[0]];
  return !known || known.includes(domain);
}
const ALLOWED_SOURCES: AllowedSource[] = ['footer', 'sidebar', 'newsletter', 'website', 'jobs-alert', 'jobs-bottom', 'events-alert'];

// Internal Next.js API route — no external backend needed
const SUBSCRIBE_URL = '/api/newsletter/subscribe';

export default function SubscribeForm({ buttonText = 'Subscribe', source = 'website', className = '' }: SubscribeFormProps) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  // Sanitize source — only allow known values
  const safeSource: AllowedSource = ALLOWED_SOURCES.includes(source) ? source : 'website';

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();

    // Client-side email validation
    if (!isCompleteEmail(email)) {
      setStatus('error');
      setMessage('Please enter a valid email address.');
      return;
    }

    setLoading(true);
    setStatus('idle');
    try {
      const res = await fetch(SUBSCRIBE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), source: safeSource }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setStatus('success');
        setMessage(data.message || 'Successfully subscribed!');
        setEmail('');
      } else {
        setStatus('error');
        // Show the specific error message from the API (e.g., "already subscribed")
        setMessage(data.error || 'Failed to subscribe. Please try again.');
      }
    } catch {
      setStatus('error');
      setMessage('An error occurred. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  // The footer form sits on a black bar in both themes.
  const onDark = source === 'footer';
  // Footer: the field turns green and Subscribe activates once the email is complete. While typing it waits
  // for a short pause so it never flashes green mid-word; a paste or autofill (several characters at once) shows
  // right away. Becoming invalid is always immediate.
  const [isValid, setIsValid] = useState(false);
  const prevLength = useRef(0);
  useEffect(() => {
    const jumped = email.length - prevLength.current > 3;
    prevLength.current = email.length;
    if (!isCompleteEmail(email)) { setIsValid(false); return; }
    if (jumped) { setIsValid(true); return; }
    const timer = setTimeout(() => setIsValid(true), 400);
    return () => clearTimeout(timer);
  }, [email]);

  if (status === 'success') {
    return (
      <div className={`flex flex-col items-center justify-center p-4 border rounded-xl ${onDark ? 'bg-green-900/20 border-green-900' : 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-900'} ${className}`}>
        <CheckCircle className="w-6 h-6 text-green-500 mb-2" />
        <p className={`text-sm font-jakarta text-center font-medium ${onDark ? 'text-green-400' : 'text-green-700 dark:text-green-400'}`}>
          {message}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubscribe} className={`w-full ${className}`}>
      {/* Footer: one joined field (icon + input + button) on the dark newsletter bar */}
      <div className={onDark
        ? `flex items-center gap-2 w-full rounded-xl border bg-white/[0.04] pl-4 pr-1.5 py-1.5 transition-[border-color,box-shadow] duration-300 motion-reduce:transition-none ${isValid
          ? 'border-emerald-500/70 ring-4 ring-emerald-500/15 shadow-[0_0_28px_-8px_rgba(16,185,129,0.55)]'
          : 'border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] focus-within:border-white/30 focus-within:ring-4 focus-within:ring-white/5'}`
        : `flex flex-col ${source === 'jobs-alert' || source === 'events-alert' ? 'sm:flex-row' : ''} gap-3 w-full`}>
        {onDark && (
          <span className="relative w-4 h-4 shrink-0" aria-hidden="true">
            <Mail className={`absolute inset-0 w-4 h-4 text-gray-500 transition-all duration-300 motion-reduce:transition-none ${isValid ? 'opacity-0 scale-50' : 'opacity-100 scale-100'}`} />
            <CheckCircle2 className={`absolute inset-0 w-4 h-4 text-emerald-400 transition-all duration-300 motion-reduce:transition-none ${isValid ? 'opacity-100 scale-100' : 'opacity-0 scale-50'}`} />
          </span>
        )}
        <input
          type="email"
          aria-label="Email address"
          placeholder="your@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={loading}
          className={`flex-1 px-4 rounded-lg font-jakarta text-sm disabled:opacity-50 focus:outline-none ${onDark ? 'min-w-0 px-1 py-2.5 bg-transparent border-0 text-white placeholder:text-white/40' : source === 'jobs-alert' || source === 'events-alert' ? 'py-2.5 bg-gray-800 dark:bg-gray-800 border border-gray-700 text-white placeholder:text-gray-400 focus:border-gray-500' :'py-3 min-h-[44px] bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-navy dark:text-white placeholder:text-gray-400 focus:border-brand'}`}
        />
        <button
          type="submit"
          disabled={loading || (onDark ? !isValid : !email)}
          className={onDark
            ? `group !rounded-lg whitespace-nowrap text-sm font-semibold flex items-center justify-center gap-1.5 sm:min-w-[118px] px-4 sm:px-5 py-2.5 transition-all duration-300 motion-reduce:transition-none ${isValid
              ? 'btn-brand shadow-[0_6px_20px_-6px_rgba(239,68,68,0.6)]'
              : 'bg-[color:color-mix(in_srgb,var(--brand-color)_28%,transparent)] text-white/60 cursor-not-allowed'}`
            : `${source === 'sidebar' ? 'btn-brand-outline' : 'btn-brand'} whitespace-nowrap text-sm flex items-center justify-center gap-2 min-w-[120px] disabled:opacity-50`}
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
            <>
              {buttonText}
              {onDark && <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />}
            </>
          )}
        </button>
      </div>
      {source !== 'jobs-alert' && source !== 'events-alert' && (
        <p className={`text-xs mt-2.5 font-jakarta text-center sm:text-left leading-relaxed ${onDark ? 'text-gray-500' : 'text-gray-500 dark:text-gray-400'}`}>
          By subscribing, you agree to receive the Udyaibase newsletter. You can{' '}
          <a href="/privacy" className={`underline ${onDark ? 'hover:text-gray-300' : 'hover:text-gray-700 dark:hover:text-gray-300'}`}>unsubscribe</a> at any time.
        </p>
      )}
      {status === 'error' && (
        <p className="text-xs text-red-500 mt-1 font-jakarta text-center sm:text-left">{message}</p>
      )}
    </form>
  );
}
