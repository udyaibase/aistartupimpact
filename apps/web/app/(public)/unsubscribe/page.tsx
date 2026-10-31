'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Mail, CheckCircle, Loader2, AlertCircle } from 'lucide-react';

function UnsubscribeContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get('email');
  const token = searchParams.get('token');
  const campaignId = searchParams.get('c');

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [feedback, setFeedback] = useState('');

  const handleUnsubscribe = async () => {
    if (!email && !token) {
      setError('Email address is required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/newsletter/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, token, campaignId, reason, feedback }),
      });

      const data = await response.json();

      if (data.success) {
        setSuccess(true);
      } else {
        setError(data.error || 'Failed to unsubscribe');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  if (!email) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-8 max-w-md w-full text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h1 className="font-sora font-bold text-xl text-navy dark:text-white mb-2">Invalid Link</h1>
          <p className="text-gray-600 dark:text-gray-400 text-sm font-jakarta">
            This unsubscribe link is invalid or expired.
          </p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-8 max-w-md w-full text-center">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h1 className="font-sora font-bold text-2xl text-navy dark:text-white mb-3">
            You've Been Unsubscribed
          </h1>
          <p className="text-gray-600 dark:text-gray-400 text-sm font-jakarta mb-6">
            We've removed <span className="font-semibold text-navy dark:text-white">{email}</span> from our mailing list.
            You won't receive any more newsletters from us.
          </p>
          <p className="text-xs text-gray-500 font-jakarta">
            Changed your mind? You can always resubscribe from our homepage.
          </p>
          <Link
            href="/"
            className="mt-6 inline-block px-6 py-2.5 bg-brand hover:bg-brand-dark text-white rounded-xl font-semibold text-sm transition-colors"
          >
            Back to Homepage
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-8 max-w-md w-full">
        <div className="text-center mb-6">
          <Mail className="w-12 h-12 text-brand mx-auto mb-4" />
          <h1 className="font-sora font-bold text-2xl text-navy dark:text-white mb-2">
            Unsubscribe from Newsletter
          </h1>
          <p className="text-gray-600 dark:text-gray-400 text-sm font-jakarta">
            We're sorry to see you go. You're about to unsubscribe:
          </p>
          <p className="font-semibold text-navy dark:text-white mt-2 font-jakarta">{email}</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-sm text-red-600 dark:text-red-400 font-jakarta">{error}</p>
          </div>
        )}

        <div className="space-y-4 mb-6">
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 font-jakarta">
              Why are you unsubscribing? (Optional)
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-navy dark:text-white text-sm font-jakarta focus:outline-none focus:ring-2 focus:ring-brand"
            >
              <option value="">Select a reason...</option>
              <option value="too_frequent">Emails are too frequent</option>
              <option value="not_relevant">Content is not relevant</option>
              <option value="never_signed_up">I never signed up</option>
              <option value="spam">This is spam</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 font-jakarta">
              Additional feedback (Optional)
            </label>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows={3}
              placeholder="Help us improve..."
              className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-navy dark:text-white text-sm font-jakarta focus:outline-none focus:ring-2 focus:ring-brand resize-none"
            />
          </div>
        </div>

        <button
          onClick={handleUnsubscribe}
          disabled={loading}
          className="w-full px-6 py-3 bg-red-500 hover:bg-red-600 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Unsubscribing...
            </>
          ) : (
            'Confirm Unsubscribe'
          )}
        </button>

        <p className="text-xs text-gray-500 dark:text-gray-400 text-center mt-4 font-jakarta">
          You can resubscribe anytime from our homepage.
        </p>
      </div>
    </div>
  );
}

export default function UnsubscribePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-brand" />
      </div>
    }>
      <UnsubscribeContent />
    </Suspense>
  );
}
