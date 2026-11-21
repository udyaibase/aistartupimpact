'use client';

import { useState, useEffect } from 'react';
import { Bookmark } from 'lucide-react';
import { useUser } from './UserProvider';
import SignInModal from '@/components/auth/SignInModal';

// Saves used to live only in this browser (localStorage 'saved-stories'), so they never showed
// on the profile. On first load after sign-in we move them onto the account, then clear them.
const LEGACY_KEY = 'saved-stories';
let legacyMigration: Promise<void> | null = null;

function migrateLegacySaves(): Promise<void> {
  if (legacyMigration) return legacyMigration;
  legacyMigration = (async () => {
    let slugs: string[] = [];
    try {
      const parsed = JSON.parse(localStorage.getItem(LEGACY_KEY) || '[]');
      if (Array.isArray(parsed)) slugs = parsed.filter((s): s is string => typeof s === 'string');
    } catch { return; }
    if (slugs.length === 0) return;
    try {
      const res = await fetch('/api/bookmarks/stories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storySlugs: slugs.slice(0, 50) }),
      });
      if (res.ok) localStorage.removeItem(LEGACY_KEY);
    } catch { /* try again on a later visit */ }
  })();
  return legacyMigration;
}

export default function StorySaveButton({ slug }: { slug: string }) {
  const { user } = useUser();
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showSignIn, setShowSignIn] = useState(false);

  useEffect(() => {
    if (!user) { setSaved(false); return; }
    const controller = new AbortController();
    (async () => {
      await migrateLegacySaves();
      try {
        const res = await fetch(`/api/bookmarks/check?storySlugs=${encodeURIComponent(slug)}`, { signal: controller.signal });
        if (!res.ok) return;
        const data = await res.json();
        setSaved(!!data?.saved?.[`story-${slug}`]);
      } catch { /* aborted or offline: saved state is only a hint */ }
    })();
    return () => controller.abort();
  }, [user, slug]);

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!user) { setShowSignIn(true); return; }
    if (busy) return;

    const was = saved;
    setSaved(!was);
    setBusy(true);
    try {
      const res = was
        ? await fetch(`/api/bookmarks/stories?storySlug=${encodeURIComponent(slug)}`, { method: 'DELETE' })
        : await fetch('/api/bookmarks/stories', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ storySlug: slug }),
          });
      if (!res.ok) setSaved(was);
    } catch {
      setSaved(was);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        onClick={handleClick}
        disabled={busy}
        type="button"
        className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-60"
        aria-label={saved ? 'Unsave story' : 'Save story'}
        aria-pressed={saved}
        title={saved ? 'Saved to your profile' : 'Save'}
      >
        <Bookmark className={`w-5 h-5 transition-colors ${saved ? 'fill-blue-500 text-blue-500' : 'text-gray-500'}`} aria-hidden />
      </button>
      <SignInModal
        isOpen={showSignIn}
        onClose={() => setShowSignIn(false)}
        defaultMode="signin"
      />
    </>
  );
}
