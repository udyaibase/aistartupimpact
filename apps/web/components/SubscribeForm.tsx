'use client';

import { useState } from 'react';
import { Loader2, CheckCircle } from 'lucide-react';


type AllowedSource = 'footer' | 'sidebar' | 'newsletter' | 'website' | 'jobs-alert' | 'jobs-bottom' | 'events-alert';

interface SubscribeFormProps {
  buttonText?: string;
  source?: AllowedSource;
  className?: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
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
    if (!email || !EMAIL_REGEX.test(email)) {
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

  if (status === 'success') {
    return (
      <div className={`flex flex-col items-center justify-center p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-900 rounded-xl ${className}`}>
        <CheckCircle className="w-6 h-6 text-green-500 mb-2" />
        <p className="text-sm font-jakarta text-green-700 dark:text-green-400 text-center font-medium">
          {message}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubscribe} className={`w-full ${className}`}>
      <div className={`flex flex-col ${source === 'footer' || source === 'jobs-alert' || source === 'events-alert' ? 'sm:flex-row' : ''} gap-3 w-full`}>
        <input
          type="email"
          placeholder="your@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={loading}
          className={`flex-1 px-4 rounded-lg font-jakarta text-sm disabled:opacity-50 focus:outline-none ${source === 'jobs-alert' || source === 'events-alert' ? 'py-2.5 bg-gray-800 dark:bg-gray-800 border border-gray-700 text-white placeholder:text-gray-400 focus:border-gray-500' : 'py-3 min-h-[44px] bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-navy dark:text-white placeholder:text-gray-400 focus:border-brand'}`}
        />
        <button
          type="submit"
          disabled={loading || !email}
          className={`${source === 'sidebar' ? 'btn-brand-outline' : 'btn-brand'} whitespace-nowrap text-sm flex items-center justify-center gap-2 min-w-[120px] disabled:opacity-50`}
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : buttonText}
        </button>
      </div>
      {source !== 'jobs-alert' && source !== 'events-alert' && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 font-jakarta text-center sm:text-left leading-relaxed">
          By subscribing, you agree to receive the Udyaibase newsletter. You can{' '}
          <a href="/privacy" className="underline hover:text-gray-700 dark:hover:text-gray-300">unsubscribe</a> at any time.
        </p>
      )}
      {status === 'error' && (
        <p className="text-xs text-red-500 mt-1 font-jakarta text-center sm:text-left">{message}</p>
      )}
    </form>
  );
}
