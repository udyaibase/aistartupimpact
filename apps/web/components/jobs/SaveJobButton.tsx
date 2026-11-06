'use client';

import { useState } from 'react';
import { Bookmark } from 'lucide-react';
import { clsx } from 'clsx';

interface SaveJobButtonProps {
  slug: string;
  initialSaved?: boolean;
}

export default function SaveJobButton({ slug, initialSaved = false }: SaveJobButtonProps) {
  const [saved, setSaved] = useState(initialSaved);
  const [loading, setLoading] = useState(false);

  const handleToggle = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/jobs/${slug}/save`, { method: 'POST' });
      if (res.status === 401) {
        alert('Please log in to save jobs');
        return;
      }
      const data = await res.json();
      if (res.ok) setSaved(data.saved);
    } catch {}
    setLoading(false);
  };

  return (
    <button
      onClick={handleToggle}
      disabled={loading}
      className={clsx(
        'p-2 rounded-md border transition-colors disabled:opacity-50',
        saved
          ? 'bg-brand/10 border-brand/30 text-brand'
          : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-400 hover:text-brand hover:border-brand/30'
      )}
      title={saved ? 'Remove from saved' : 'Save job'}
    >
      <Bookmark className={clsx('w-4 h-4', saved && 'fill-current')} />
    </button>
  );
}
