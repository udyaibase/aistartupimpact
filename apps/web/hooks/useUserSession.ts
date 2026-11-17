'use client';

import { useEffect, useState } from 'react';

export interface UserSession {
  id: string;
  email: string;
  name: string;
  avatar: string | null;
  slug: string;
  bio: string | null;
  twitter: string | null;
  linkedin: string | null;
}

interface UseUserSessionReturn {
  user: UserSession | null;
  loading: boolean;
  signIn: (returnTo?: string) => void;
  signOut: () => Promise<void>;
}

/**
 * Client-side hook to access user session
 * Use this in Client Components
 */
export function useUserSession(): UseUserSessionReturn {
  const [user, setUser] = useState<UserSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSession();
  }, []);

  const fetchSession = async () => {
    try {
      const response = await fetch('/api/user/session');
      const data = await response.json();
      setUser(data.user || null);
    } catch (error) {
      console.error('Failed to fetch session:', error);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const signIn = (returnTo?: string) => {
    const url = `/api/user/auth/google?returnTo=${encodeURIComponent(returnTo || '/profile')}`;
    window.location.href = url;
  };

  const signOut = async () => {
    try {
      import('@/lib/events/offline-checkin-store').then((m) => m.clearOfflineRosters()).catch(() => {}); // attendee lists saved for offline check-in
      await fetch('/api/user/auth/logout', { method: 'POST' });
      setUser(null);
      window.location.href = '/';
    } catch (error) {
      console.error('Sign out failed:', error);
    }
  };

  return { user, loading, signIn, signOut };
}
