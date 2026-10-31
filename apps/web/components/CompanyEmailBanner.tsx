'use client';

import { useState, useEffect } from 'react';
import { ShieldAlert, X, ArrowRight } from 'lucide-react';
import Link from 'next/link';

interface CompanyEmailBannerProps {
  userType: 'founder' | 'organizer';
}

const DISMISS_KEY_PREFIX = 'company-email-banner-dismissed-';
const DISMISS_DAYS = 7;

export default function CompanyEmailBanner({ userType }: CompanyEmailBannerProps) {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const dismissedAt = localStorage.getItem(DISMISS_KEY_PREFIX + userType);
      if (dismissedAt) {
        const elapsed = Date.now() - parseInt(dismissedAt, 10);
        if (elapsed < DISMISS_DAYS * 24 * 60 * 60 * 1000) {
          setLoading(false);
          return;
        }
      }
    } catch {}

    fetch(`/api/${userType}/company-email/status`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success && !data.companyEmailVerified) {
          setVisible(true);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userType]);

  if (loading || !visible) return null;

  const settingsPath = userType === 'founder' ? '/founder/settings' : '/organizer/settings';

  return (
    <div className="mb-4 rounded-md border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 flex items-center gap-3 flex-wrap">
      <ShieldAlert className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
      <p className="text-sm text-amber-800 dark:text-amber-200 flex-1">
        <span className="font-semibold">Verify your company email</span> to earn a Verified badge on your profile and build trust with the community.
      </p>
      <Link
        href={settingsPath}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold transition-colors shrink-0"
      >
        Verify Now <ArrowRight className="w-3.5 h-3.5" />
      </Link>
      <button
        onClick={() => {
          setVisible(false);
          try { localStorage.setItem(DISMISS_KEY_PREFIX + userType, Date.now().toString()); } catch {}
        }}
        className="p-1 rounded hover:bg-amber-200/50 dark:hover:bg-amber-800/30 transition-colors shrink-0"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4 text-amber-600 dark:text-amber-400" />
      </button>
    </div>
  );
}
