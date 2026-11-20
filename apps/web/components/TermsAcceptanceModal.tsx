'use client';

import { useState } from 'react';
import Link from 'next/link';

interface TermsAcceptanceModalProps {
  userName: string;
}

export default function TermsAcceptanceModal({ userName }: TermsAcceptanceModalProps) {
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleAccept = async () => {
    if (!agreed) return;

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/user/accept-terms', {
        method: 'POST',
      });

      if (res.ok) {
        // Stay where they were (an application, a saved list); sending them home lost their place.
        window.location.reload();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to accept terms');
        setLoading(false);
      }
    } catch (error) {
      console.error('Error accepting terms:', error);
      setError('Failed to accept terms. Please try again.');
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      import('@/lib/events/offline-checkin-store').then((m) => m.clearOfflineRosters()).catch(() => {}); // attendee lists saved for offline check-in
      await fetch('/api/user/auth/logout', { method: 'POST' });
    } catch {}
    document.cookie = 'user-token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    window.location.href = '/';
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-modal flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-lg border-l-4 border-red-600 shadow-xl max-w-2xl w-full p-6">

        <h2 className="text-lg font-bold text-red-600 mb-4">Important Update</h2>

        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-red-600 dark:text-red-400 text-sm">
            {error}
          </div>
        )}

        <label className="flex items-start gap-3 cursor-pointer mb-4">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-1 w-4 h-4 rounded border-2 border-gray-300 dark:border-gray-600 text-red-600 focus:ring-2 focus:ring-red-500 cursor-pointer shrink-0"
          />
          <span className="text-sm text-gray-700 dark:text-gray-300">
            I have read and am in agreement with{' '}
            <Link href="/privacy-policy" target="_blank" className="text-red-600 hover:underline font-semibold">
              Privacy Policy
            </Link>
            ,{' '}
            <Link href="/terms-and-conditions" target="_blank" className="text-red-600 hover:underline font-semibold">
              Terms and Conditions
            </Link>
            , and{' '}
            <Link href="/cookie-policy" target="_blank" className="text-red-600 hover:underline font-semibold">
              Cookie Policy
            </Link>
          </span>
        </label>

        <button
          onClick={handleAccept}
          disabled={!agreed || loading}
          className={`w-full py-3 rounded-lg font-semibold text-sm transition-colors ${
            agreed && !loading
              ? 'bg-red-600 hover:bg-red-700 text-white'
              : 'bg-gray-200 dark:bg-gray-800 text-gray-400 cursor-not-allowed'
          }`}
        >
          {loading ? 'Processing...' : 'I Understand'}
        </button>

        {error && (
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => window.location.reload()}
              className="flex-1 py-2 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Retry
            </button>
            <button
              onClick={handleSignOut}
              className="flex-1 py-2 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Sign Out
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
