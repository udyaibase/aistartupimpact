'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Crown } from 'lucide-react';
import FounderProfileModal from './FounderProfileModal';
import SignInModal from '@/components/auth/SignInModal';
import { useUser } from '@/components/UserProvider';

interface Founder {
  name: string;
  role: string;
  prev?: string;
  bio?: string;
  avatar?: string;
  linkedin?: string;
  twitter?: string;
  website?: string;
}

interface FoundersSectionProps {
  founders: Founder[];
  startupName?: string;
}

export default function FoundersSection({ founders, startupName }: FoundersSectionProps) {
  // Read in the browser so the startup page can be cached for everyone.
  const isSignedIn = !!useUser().user;
  const [selectedFounder, setSelectedFounder] = useState<Founder | null>(null);
  const [showSignIn, setShowSignIn] = useState(false);

  const handleFounderClick = (founder: Founder) => {
    if (!isSignedIn) {
      setShowSignIn(true);
      return;
    }
    setSelectedFounder(founder);
  };

  const handleLinkedInClick = (e: React.MouseEvent, founder: Founder) => {
    e.stopPropagation();
    if (!isSignedIn) {
      e.preventDefault();
      setShowSignIn(true);
      return;
    }
  };

  return (
    <>
      <div className="card p-5 sm:p-6">
        <h2 className="section-title mb-4">Founders & CEOs</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {founders.map((founder) => (
            <div
              key={founder.name}
              onClick={() => handleFounderClick(founder)}
              className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm hover:shadow-md transition-all cursor-pointer text-left group"
            >
              <div className="w-12 h-12 rounded-lg bg-brand/10 dark:bg-brand/20 flex items-center justify-center text-brand font-bold font-sora text-lg shrink-0 overflow-hidden group-hover:scale-105 transition-transform">
                {founder.avatar ? (
                  <Image
                    src={founder.avatar}
                    alt={founder.name}
                    className="w-full h-full object-cover"
                    width={48}
                    height={48}
                    sizes="48px"
                  />
                ) : (
                  <span>{founder.name.charAt(0).toUpperCase()}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-sora font-bold text-xs sm:text-sm text-navy dark:text-white block group-hover:text-brand transition-colors truncate">
                    {founder.name}
                  </span>
                  {founder.linkedin && (
                    <a
                      href={isSignedIn ? founder.linkedin : '#'}
                      target={isSignedIn ? '_blank' : undefined}
                      rel={isSignedIn ? 'noopener noreferrer' : undefined}
                      className={`hover:scale-110 transition-transform shrink-0 relative z-10 ${isSignedIn ? 'text-[#0A66C2]' : 'text-gray-400 dark:text-gray-500'}`}
                      onClick={(e) => handleLinkedInClick(e, founder)}
                      title={isSignedIn ? `${founder.name}'s LinkedIn` : 'Sign in to view LinkedIn'}
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                      </svg>
                    </a>
                  )}
                  {!isSignedIn && (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 shrink-0" title="Sign in to unlock">
                      <Crown className="w-2.5 h-2.5 text-amber-600 dark:text-amber-400" />
                    </span>
                  )}
                </div>
                <span className="text-xs text-gray-500 dark:text-gray-400 font-jakarta block truncate mt-0.5">
                  {founder.role}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Founder Profile Modal — only for signed-in users */}
      {isSignedIn && selectedFounder && (
        <FounderProfileModal
          founder={selectedFounder}
          isOpen={!!selectedFounder}
          onClose={() => setSelectedFounder(null)}
          startupName={startupName}
        />
      )}

      {/* Sign In Modal for gated content */}
      <SignInModal
        isOpen={showSignIn}
        onClose={() => setShowSignIn(false)}
        defaultMode="signin"
      />
    </>
  );
}
