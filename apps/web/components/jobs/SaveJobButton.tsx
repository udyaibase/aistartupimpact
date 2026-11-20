'use client';

import { useEffect, useState } from 'react';
import { Bookmark } from 'lucide-react';
import { clsx } from 'clsx';
import { useUser } from '@/components/UserProvider';

interface SaveJobButtonProps {
  slug: string;
  initialSaved?: boolean;
}

/**
 * Save or unsave a job, on the job page. Says what it does (it used to be an unlabelled icon), shows whether the
 * job is already saved, and sends a signed-out visitor to sign in and back instead of a browser alert.
 */
export default function SaveJobButton({ slug, initialSaved = false }: SaveJobButtonProps) {
  const { user, signIn } = useUser();
  const [saved, setSaved] = useState(initialSaved);
  const [loading, setLoading] = useState(false);

  // The page is cached for everyone, so whether this person saved the job is asked for once they're known.
  useEffect(() => {
    if (!user) return;
    let alive = true;
    fetch(`/api/bookmarks/check?jobSlugs=${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d?.saved) setSaved(!!d.saved[`job-${slug}`]); })
      .catch(() => {});
    return () => { alive = false; };
  }, [user, slug]);

  const handleToggle = async () => {
    if (!user) { signIn(window.location.pathname + window.location.search); return; }
    setLoading(true);
    const before = saved;
    setSaved(!before);
    try {
      const res = await fetch(`/api/jobs/${slug}/save`, { method: 'POST' });
      if (res.status === 401) { setSaved(before); signIn(window.location.pathname + window.location.search); return; }
      const data = await res.json().catch(() => ({}));
      setSaved(res.ok ? !!data.saved : before);
    } catch {
      setSaved(before);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={loading}
      aria-pressed={saved}
      className={clsx(
        'inline-flex items-center gap-1.5 min-h-[44px] px-3.5 rounded-md border text-sm font-semibold font-jakarta transition-colors disabled:opacity-50',
        saved
          ? 'bg-brand/10 border-brand/30 text-brand'
          : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:text-brand hover:border-brand/30'
      )}
    >
      <Bookmark className={clsx('w-4 h-4', saved && 'fill-current')} aria-hidden />
      {saved ? 'Saved' : 'Save'}
    </button>
  );
}
