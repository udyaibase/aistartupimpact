'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ShieldAlert, X } from 'lucide-react';

/** Shown once after someone is sent back from a section their role can't open, so the redirect isn't silent. */
export default function AccessNotice() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (params.get('error') !== 'unauthorized') return;
    setShow(true);
    router.replace(pathname || '/dashboard'); // drop ?error= so a refresh doesn't show it again
  }, [params, router, pathname]);

  if (!show) return null;
  return (
    <div role="alert" className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10 px-4 py-3">
      <ShieldAlert className="w-5 h-5 mt-0.5 text-amber-700 dark:text-amber-300 shrink-0" aria-hidden />
      <p className="text-sm text-amber-900 dark:text-amber-100">Your role doesn’t include that section, so you’re back on the dashboard. Ask a Super Admin if you need access.</p>
      <button type="button" onClick={() => setShow(false)} aria-label="Dismiss" className="ml-auto p-1 rounded-md text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-500/20">
        <X className="w-4 h-4" aria-hidden />
      </button>
    </div>
  );
}
