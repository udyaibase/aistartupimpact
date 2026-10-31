'use client';

import React, { createContext, useContext, useEffect, useLayoutEffect, useState } from 'react';

export interface UserSession {
  id: string;
  email: string;
  name: string;
  avatar: string | null;
  slug: string;
  bio: string | null;
  twitter: string | null;
  linkedin: string | null;
  termsAcceptedAt: string | null;
  termsVersion: string | null;
  founderId?: string | null;
  organizerId?: string | null;
}

interface UserContextType {
  user: UserSession | null;
  loading: boolean;
  /**
   * Last known sign-in state from this browser (null until read). Public pages are cached and the server
   * never reads cookies, so the navbar uses this to avoid a "Sign in" flash while the session loads.
   */
  likelySignedIn: boolean | null;
  signIn: (returnTo?: string) => void;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

const SESSION_HINT = 'udb:signed-in';

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [likelySignedIn, setLikelySignedIn] = useState<boolean | null>(null);

  // Before paint, so a returning signed-in user never sees "Sign in" flash.
  useLayoutEffect(() => {
    try { setLikelySignedIn(localStorage.getItem(SESSION_HINT) === '1'); } catch { setLikelySignedIn(false); }
  }, []);

  const fetchSession = async () => {
    try {
      const response = await fetch('/api/user/session');
      const data = await response.json();
      setUser(data.user || null);
      try {
        if (data.user) localStorage.setItem(SESSION_HINT, '1'); else localStorage.removeItem(SESSION_HINT);
      } catch { /* storage blocked: the hint is only cosmetic */ }
    } catch (error) {
      console.error('Failed to fetch session:', error);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSession();
  }, []);

  const signIn = (returnTo?: string) => {
    const url = `/api/user/auth/google?returnTo=${encodeURIComponent(returnTo || '/profile')}`;
    window.location.href = url;
  };

  const signOut = async () => {
    try {
      await fetch('/api/user/auth/logout', { method: 'POST' });
      setUser(null);
      try { localStorage.removeItem(SESSION_HINT); } catch { /* cosmetic */ }
      window.location.href = '/';
    } catch (error) {
      console.error('Sign out failed:', error);
    }
  };

  const refreshSession = async () => {
    await fetchSession();
  };

  return (
    <UserContext.Provider value={{ user, loading, likelySignedIn, signIn, signOut, refreshSession }}>
      {children}
    </UserContext.Provider>
  );
}

const fallbackContext: UserContextType = {
  user: null,
  loading: false,
  likelySignedIn: false,
  signIn: () => { window.location.href = '/api/user/auth/google?returnTo=' + encodeURIComponent(window.location.pathname); },
  signOut: async () => {},
  refreshSession: async () => {},
};

export function useUser() {
  const context = useContext(UserContext);
  if (context === undefined) {
    return fallbackContext;
  }
  return context;
}
