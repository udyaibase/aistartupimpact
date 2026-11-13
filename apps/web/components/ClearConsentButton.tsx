'use client';

import { useState } from 'react';
import { Cookie } from 'lucide-react';
import Link from 'next/link';

export default function ClearConsentButton() {
  const [show, setShow] = useState(false);

  const clearConsent = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('ub_consent_v1');
      window.location.reload();
    }
  };

  const clearNewsletter = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('ub_newsletter_popup_seen');
      localStorage.removeItem('ub_newsletter_subscribed');
      window.location.reload();
    }
  };

  // Only show in development
  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setShow(!show)}
        className="fixed bottom-20 lg:bottom-4 right-4 z-toast w-12 h-12 bg-orange-500 hover:bg-orange-600 text-white rounded-full shadow-lg flex items-center justify-center transition-all"
        title="Cookie Consent Tools"
        aria-label="Cookie consent tools"
      >
        <Cookie className="w-5 h-5" aria-hidden />
      </button>

      {/* Popup menu */}
      {show && (
        <div className="fixed bottom-36 lg:bottom-20 right-4 z-toast bg-white dark:bg-gray-800 rounded-lg shadow-xl p-4 w-64 border border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-3">
            Cookie Tools (Dev Only)
          </h3>
          
          <div className="space-y-2">
            <button
              onClick={clearConsent}
              className="w-full px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-sm font-medium transition-colors"
            >
              Clear Consent & Reload
            </button>

            <button
              onClick={clearNewsletter}
              className="w-full px-3 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded text-sm font-medium transition-colors"
            >
              Reset Newsletter Popup
            </button>

            <Link
              href="/?test-cookie-banner=true"
              className="block w-full px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded text-sm font-medium text-center transition-colors"
            >
              Force Show Banner
            </Link>

            <Link
              href="/test-cookies"
              className="block w-full px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium text-center transition-colors"
            >
              Test Page
            </Link>

            <button
              onClick={() => setShow(false)}
              className="w-full px-3 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 rounded text-sm font-medium transition-colors"
            >
              Close
            </button>
          </div>

          <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
            This button only appears in development mode
          </p>
        </div>
      )}
    </>
  );
}
