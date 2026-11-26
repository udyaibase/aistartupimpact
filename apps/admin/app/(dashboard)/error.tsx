'use client';

import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useEffect } from 'react';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Dashboard error:', error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center py-20 px-4">
      <div className="w-14 h-14 rounded-2xl bg-red-50 dark:bg-red-950/50 flex items-center justify-center mb-4">
        <AlertTriangle className="w-7 h-7 text-red-500" />
      </div>
      <h2 className="text-xl font-sora font-bold text-navy dark:text-white mb-2">
        Something went wrong
      </h2>
      <p className="text-gray-500 dark:text-gray-400 text-sm font-jakarta text-center max-w-md mb-6">
        This page couldn’t load. Nothing you entered elsewhere is lost. Try again; if it keeps happening, send the
        reference below to the team.
      </p>
      {error.digest && <p className="text-xs font-mono text-gray-500 dark:text-gray-400 mb-6 -mt-3">Reference: {error.digest}</p>}
      <button
        onClick={reset}
        className="btn-brand flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium"
      >
        <RefreshCw className="w-4 h-4" />
        Try again
      </button>
    </div>
  );
}
