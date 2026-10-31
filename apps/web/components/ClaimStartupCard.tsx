'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, CheckCircle, TrendingUp, Sparkles } from 'lucide-react';
import WorkspaceUnlockModal from '@/components/auth/WorkspaceUnlockModal';
import SignInModal from '@/components/auth/SignInModal';

interface ClaimStartupCardProps {
  startupId: string;
  startupSlug: string;
  isVerified?: boolean;
  isClaimed?: boolean;
  /** User id that claimed the startup; ownership is checked in the browser so the page stays cacheable. */
  claimedBy?: string | null;
}

export default function ClaimStartupCard({
  startupId,
  startupSlug,
  isVerified = false,
  isClaimed = false,
  claimedBy = null,
}: ClaimStartupCardProps) {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const isOwner = !!user && !!claimedBy && user.id === claimedBy;
  const [loading, setLoading] = useState(true);
  const [showUnlock, setShowUnlock] = useState(false);
  const [showSignIn, setShowSignIn] = useState(false);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        // Try legacy session first
        const res = await fetch('/api/user/session');
        if (res.ok) {
          const data = await res.json();
          if (data.user) { setUser(data.user); setLoading(false); return; }
        }
        // Try unified session
        const unifiedRes = await fetch('/api/auth/session');
        if (unifiedRes.ok) {
          const data = await unifiedRes.json();
          if (data.user) { setUser(data.user); setLoading(false); return; }
        }
      } catch {}
      setLoading(false);
    };
    fetchUser();
  }, []);

  // If claimed or verified, don't show the card at all
  if (isVerified || isClaimed) {
    return null;
  }

  const handleClaim = () => {
    if (!user) {
      setShowSignIn(true);
      return;
    }
    if (user.founderId) {
      // Already has founder workspace → go directly to claim
      router.push(`/founder/claim/${startupId}`);
      return;
    }
    // Signed in but no founder workspace → show unlock modal
    setShowUnlock(true);
  };

  // Default: Show claim prompt (only if not claimed)
  return (
    <>
      <div className="card p-5 border-2 border-brand/20 bg-gradient-to-br from-brand/5 via-purple-500/5 to-blue-500/5 dark:from-brand/10 dark:via-purple-500/10 dark:to-blue-500/10 relative overflow-hidden">
        {/* Decorative elements */}
        <div className="absolute top-0 right-0 w-20 h-20 bg-brand/10 rounded-full blur-2xl" />
        <div className="absolute bottom-0 left-0 w-16 h-16 bg-purple-500/10 rounded-full blur-xl" />
        
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="w-5 h-5 text-brand" />
            <h4 className="font-sora font-bold text-sm text-navy dark:text-white">
              Is This Your Startup?
            </h4>
          </div>
          
          <p className="text-xs text-gray-600 dark:text-gray-400 font-jakarta mb-4 leading-relaxed">
            Claim this listing to get a verified badge, manage your profile, access analytics, and connect with investors.
          </p>

          {/* Benefits list */}
          <div className="space-y-2 mb-4">
            <div className="flex items-start gap-2">
              <CheckCircle className="w-3.5 h-3.5 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
              <span className="text-xs text-gray-700 dark:text-gray-300 font-jakarta">
                Get verified badge instantly
              </span>
            </div>
            <div className="flex items-start gap-2">
              <TrendingUp className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
              <span className="text-xs text-gray-700 dark:text-gray-300 font-jakarta">
                Track views & engagement
              </span>
            </div>
            <div className="flex items-start gap-2">
              <Sparkles className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400 mt-0.5 shrink-0" />
              <span className="text-xs text-gray-700 dark:text-gray-300 font-jakarta">
                Update info anytime
              </span>
            </div>
          </div>

          <button
            onClick={handleClaim}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg bg-brand hover:bg-brand/90 text-white font-bold text-sm font-jakarta transition-all hover:shadow-lg hover:shadow-brand/30 hover:scale-[1.02] disabled:opacity-60"
          >
            <Shield className="w-4 h-4" />
            Claim This Startup
          </button>

          <p className="text-xs text-gray-500 dark:text-gray-500 font-jakarta mt-3 text-center">
            100% Free • Verified via DNS • Takes 5 minutes
          </p>
        </div>
      </div>

      <WorkspaceUnlockModal
        isOpen={showUnlock}
        onClose={() => setShowUnlock(false)}
        workspace="founder"
        isAuthenticated={!!user}
        onSignInRequired={() => { setShowUnlock(false); setShowSignIn(true); }}
      />

      <SignInModal
        isOpen={showSignIn}
        onClose={() => setShowSignIn(false)}
        defaultMode="signin"
        returnTo={`/founder/claim/${startupId}`}
      />
    </>
  );
}
