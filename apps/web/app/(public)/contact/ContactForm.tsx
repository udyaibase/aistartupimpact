'use client';

import { useState, useRef } from 'react';
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import TurnstileWidget from '@/components/shared/TurnstileWidget';

const CATEGORIES = [
  { value: '', label: 'Select a category' },
  { value: 'OTHER', label: 'General Inquiry' },
  { value: 'LISTING', label: 'Startup / Tool Listing' },
  { value: 'EVENT', label: 'Events' },
  { value: 'JOB_BOARD', label: 'Job Board' },
  { value: 'BUG_REPORT', label: 'Bug Report' },
  { value: 'FEATURE_REQUEST', label: 'Feature Request' },
  { value: 'ACCOUNT', label: 'Account Issue' },
  { value: 'BILLING', label: 'Advertising & Billing' },
];

interface FormErrors {
  name?: string;
  email?: string;
  category?: string;
  subject?: string;
  message?: string;
}

export default function ContactForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [category, setCategory] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [ticketNumber, setTicketNumber] = useState('');
  const [serverError, setServerError] = useState('');
  const turnstileToken = useRef('');
  const [checkRound, setCheckRound] = useState(0); // a check works once: remount the widget after each send

  function validate(): boolean {
    const newErrors: FormErrors = {};
    if (!name.trim() || name.trim().length < 2) newErrors.name = 'Please enter your name (at least 2 characters)';
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) newErrors.email = 'Please enter a valid email address';
    if (!category) newErrors.category = 'Please select a category';
    if (!subject.trim() || subject.trim().length < 3) newErrors.subject = 'Subject must be at least 3 characters';
    if (!message.trim() || message.trim().length < 10) newErrors.message = 'Message must be at least 10 characters';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setStatus('submitting');
    setServerError('');

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          category,
          subject: subject.trim(),
          message: message.trim(),
          turnstileToken: turnstileToken.current,
        }),
      });
      turnstileToken.current = ''; setCheckRound((r) => r + 1);

      const data = await res.json();

      if (!res.ok) {
        setServerError(data.error || 'Something went wrong. Please try again.');
        setStatus('error');
        return;
      }

      setTicketNumber(data.ticketNumber);
      setStatus('success');
    } catch {
      setServerError('Network error. Please check your connection and try again.');
      setStatus('error');
    }
  }

  if (status === 'success') {
    return (
      <div className="card p-6 sm:p-10 text-center">
        <div className="w-14 h-14 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-7 h-7 text-green-600 dark:text-green-400" />
        </div>
        <h2 className="font-sora font-bold text-xl text-navy dark:text-white mb-2">Message Sent</h2>
        <p className="text-gray-600 dark:text-gray-400 font-jakarta text-sm mb-1">
          Your ticket number is <span className="font-mono font-bold text-brand">{ticketNumber}</span>
        </p>
        <p className="text-gray-500 dark:text-gray-500 font-jakarta text-sm mb-6">
          We&apos;ve sent a confirmation to <strong>{email}</strong>. Our team typically responds within 24–48 hours.
        </p>
        <button
          onClick={() => {
            setStatus('idle');
            setName('');
            setEmail('');
            setCategory('');
            setSubject('');
            setMessage('');
            setErrors({});
            setTicketNumber('');
          }}
          className="btn-brand"
        >
          Send Another Message
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="card p-5 sm:p-8">
      {serverError && (
        <div className="mb-5 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
          <p className="text-sm text-red-600 dark:text-red-400 font-jakarta">{serverError}</p>
        </div>
      )}

      <div className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="contact-name" className="text-xs font-bold text-gray-500 dark:text-gray-400 font-jakarta uppercase tracking-wider mb-1.5 block">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              id="contact-name"
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); if (errors.name) setErrors(prev => ({ ...prev, name: undefined })); }}
              placeholder="Your full name"
              autoComplete="name"
              className={`input-field ${errors.name ? 'border-red-400 dark:border-red-600' : ''}`}
            />
            {errors.name && <p className="text-xs text-red-500 mt-1 font-jakarta">{errors.name}</p>}
          </div>
          <div>
            <label htmlFor="contact-email" className="text-xs font-bold text-gray-500 dark:text-gray-400 font-jakarta uppercase tracking-wider mb-1.5 block">
              Email <span className="text-red-500">*</span>
            </label>
            <input
              id="contact-email"
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); if (errors.email) setErrors(prev => ({ ...prev, email: undefined })); }}
              placeholder="your@email.com"
              autoComplete="email"
              className={`input-field ${errors.email ? 'border-red-400 dark:border-red-600' : ''}`}
            />
            {errors.email && <p className="text-xs text-red-500 mt-1 font-jakarta">{errors.email}</p>}
          </div>
        </div>

        <div>
          <label htmlFor="contact-category" className="text-xs font-bold text-gray-500 dark:text-gray-400 font-jakarta uppercase tracking-wider mb-1.5 block">
            Category <span className="text-red-500">*</span>
          </label>
          <select
            id="contact-category"
            value={category}
            onChange={(e) => { setCategory(e.target.value); if (errors.category) setErrors(prev => ({ ...prev, category: undefined })); }}
            className={`input-field ${errors.category ? 'border-red-400 dark:border-red-600' : ''} ${!category ? 'text-gray-400' : ''}`}
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value} disabled={c.value === ''}>
                {c.label}
              </option>
            ))}
          </select>
          {errors.category && <p className="text-xs text-red-500 mt-1 font-jakarta">{errors.category}</p>}
        </div>

        <div>
          <label htmlFor="contact-subject" className="text-xs font-bold text-gray-500 dark:text-gray-400 font-jakarta uppercase tracking-wider mb-1.5 block">
            Subject <span className="text-red-500">*</span>
          </label>
          <input
            id="contact-subject"
            type="text"
            value={subject}
            onChange={(e) => { setSubject(e.target.value); if (errors.subject) setErrors(prev => ({ ...prev, subject: undefined })); }}
            placeholder="Brief description of your inquiry"
            className={`input-field ${errors.subject ? 'border-red-400 dark:border-red-600' : ''}`}
          />
          {errors.subject && <p className="text-xs text-red-500 mt-1 font-jakarta">{errors.subject}</p>}
        </div>

        <div>
          <label htmlFor="contact-message" className="text-xs font-bold text-gray-500 dark:text-gray-400 font-jakarta uppercase tracking-wider mb-1.5 block">
            Message <span className="text-red-500">*</span>
          </label>
          <textarea
            id="contact-message"
            rows={5}
            value={message}
            onChange={(e) => { setMessage(e.target.value); if (errors.message) setErrors(prev => ({ ...prev, message: undefined })); }}
            placeholder="Please describe your inquiry in detail..."
            className={`input-field resize-none ${errors.message ? 'border-red-400 dark:border-red-600' : ''}`}
          />
          <div className="flex items-center justify-between mt-1">
            {errors.message ? (
              <p className="text-xs text-red-500 font-jakarta">{errors.message}</p>
            ) : (
              <span />
            )}
            <span className={`text-xs font-jakarta ${message.length > 4800 ? 'text-amber-500' : 'text-gray-400'}`}>
              {message.length}/5000
            </span>
          </div>
        </div>

        <TurnstileWidget
          key={checkRound}
          onSuccess={(token) => { turnstileToken.current = token; }}
          onExpire={() => { turnstileToken.current = ''; }}
        />

        <div className="pt-1">
          <button
            type="submit"
            disabled={status === 'submitting'}
            className="btn-brand w-full sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {status === 'submitting' ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Sending...
              </>
            ) : (
              'Send Message'
            )}
          </button>
          <p className="text-xs text-gray-400 dark:text-gray-500 font-jakarta mt-3">
            By submitting, you agree to our{' '}
            <a href="/privacy" className="text-brand hover:underline">Privacy Policy</a>.
            We&apos;ll only use your email to respond to this inquiry.
          </p>
        </div>
      </div>
    </form>
  );
}
