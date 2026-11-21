'use client';

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Search, LayoutDashboard, Rocket, Wrench, Briefcase, BarChart3, Users, User, Settings, History, HelpCircle, Plus, FileText, CalendarDays, Megaphone } from 'lucide-react';
import NotificationDropdown from './NotificationDropdown';
import ProfileDropdown from '@/components/ProfileDropdown';
import ThemeToggle from '@/components/ThemeToggle';
import CommandPalette, { type SearchResult } from '@/components/organizer/CommandPalette';
import type { FounderShell } from '@/lib/founder/portal';

interface Props {
  session: { userId: string; email: string; name: string; avatar?: string };
  shell: FounderShell;
}

const PAGES: SearchResult[] = [
  { id: 'home', label: 'Home', description: 'Overview and setup', href: '/founder/dashboard', icon: <LayoutDashboard className="w-4 h-4" />, category: 'page' },
  { id: 'startups', label: 'Your startup', description: 'Your startup listing', href: '/founder/startups', icon: <Rocket className="w-4 h-4" />, category: 'page' },
  { id: 'tools', label: 'Your AI tool', description: 'Your AI tool listing', href: '/founder/tools', icon: <Wrench className="w-4 h-4" />, category: 'page' },
  { id: 'hiring', label: 'Hiring', description: 'Post jobs and manage applicants', href: '/founder/hiring', icon: <Briefcase className="w-4 h-4" />, category: 'page' },
  { id: 'events', label: 'Events', description: 'Host demo days, launches and meetups', href: '/founder/events', icon: <CalendarDays className="w-4 h-4" />, category: 'page' },
  { id: 'analytics', label: 'Analytics', description: 'Views, clicks and traffic sources', href: '/founder/analytics', icon: <BarChart3 className="w-4 h-4" />, category: 'page' },
  { id: 'team', label: 'Team', description: 'Invite people to help manage your startup', href: '/founder/team', icon: <Users className="w-4 h-4" />, category: 'page' },
  { id: 'profile', label: 'Profile', description: 'Your public founder profile', href: '/founder/profile', icon: <User className="w-4 h-4" />, category: 'page' },
  { id: 'settings', label: 'Settings', description: 'Notifications, privacy and security', href: '/founder/settings', icon: <Settings className="w-4 h-4" />, category: 'page' },
  { id: 'activity', label: 'Activity log', description: 'Sign-ins and changes on your account', href: '/founder/activity', icon: <History className="w-4 h-4" />, category: 'page' },
  { id: 'support', label: 'Support', description: 'Get help from our team', href: '/founder/support', icon: <HelpCircle className="w-4 h-4" />, category: 'page' },
];

const ACTIONS: SearchResult[] = [
  { id: 'create', label: 'Create', description: 'Share a story, update or milestone', href: '/founder/content', icon: <FileText className="w-4 h-4" />, category: 'action' },
  { id: 'new-startup', label: 'Submit a startup', description: 'List your startup in the directory', href: '/founder/startups/new', icon: <Plus className="w-4 h-4" />, category: 'action' },
  { id: 'promote', label: 'Promote your startup or tool', description: 'Homepage, newsletter and featured spots', href: '/advertise', icon: <Megaphone className="w-4 h-4" />, category: 'action' },
  { id: 'new-tool', label: 'Submit an AI tool', description: 'List your tool in the directory', href: '/founder/tools/new', icon: <Plus className="w-4 h-4" />, category: 'action' },
];

export default function FounderHeader({ session, shell }: Props) {
  const [commandOpen, setCommandOpen] = useState(false);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      setCommandOpen((prev) => !prev);
    }
  }, []);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const searchListings = useCallback(async (q: string): Promise<SearchResult[]> => {
    const needle = q.toLowerCase();
    return shell.listings
      .filter((l) => l.name.toLowerCase().includes(needle))
      .slice(0, 6)
      .map((l) => ({
        id: `${l.type}-${l.id}`, label: l.name, description: l.type === 'startup' ? 'Startup' : 'AI tool',
        href: `/founder/${l.type === 'startup' ? 'startups' : 'tools'}/${l.slug}`,
        icon: l.type === 'startup' ? <Rocket className="w-4 h-4" /> : <Wrench className="w-4 h-4" />, category: 'event' as const,
      }));
  }, [shell.listings]);

  return (
    <>
      {/* Phones: logo on the left, actions on the right (like a native app bar), clear of the notch in the installed app.
          Computers: the search bar on the left; the brand is in the sidebar. */}
      <header className="relative z-sticky shrink-0 bg-white/95 dark:bg-gray-950/95 backdrop-blur-md border-b border-gray-100 dark:border-gray-800 pt-[env(safe-area-inset-top)]">
        <div className="h-14 flex items-center justify-between gap-2 px-4 md:px-6">
          <Link href="/founder/dashboard" aria-label="Udyaibase founder home" className="md:hidden flex items-center shrink-0 rounded-[10px] active:opacity-70">
            <Image src="/logo-light.svg" alt="" width={48} height={48} sizes="48px" priority className="h-12 w-12 shrink-0 dark:hidden" />
            <Image src="/logo-dark.svg" alt="" width={48} height={48} sizes="48px" priority className="h-12 w-12 shrink-0 hidden dark:block" />
          </Link>
          <button
            onClick={() => setCommandOpen(true)}
            className="hidden md:flex items-center gap-2 w-80 lg:w-96 h-9 px-3 rounded-[10px] border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 text-sm font-jakarta text-gray-400 hover:border-gray-300 dark:hover:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
          >
            <Search className="w-4 h-4 text-gray-400 shrink-0" aria-hidden />
            <span className="flex-1 text-left">Search listings, pages...</span>
            <kbd className="text-[10px] font-jakarta font-medium text-gray-400 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-1.5 py-0.5">⌘K</kbd>
          </button>

          {/* Right: actions */}
          <div className="portal-header-actions flex items-center gap-0.5 sm:gap-1.5 shrink-0">
            <button
              onClick={() => setCommandOpen(true)}
              aria-label="Search listings and pages"
              className="md:hidden w-10 h-10 flex items-center justify-center rounded-full text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 active:bg-gray-200 dark:active:bg-gray-700 transition-colors"
            >
              <Search className="w-5 h-5" aria-hidden />
            </button>
            <ThemeToggle />
            <NotificationDropdown />
            <div className="ml-1"><ProfileDropdown user={{ name: session.name, email: session.email, avatar: session.avatar }} /></div>
          </div>
        </div>
      </header>

      <CommandPalette
        open={commandOpen}
        onClose={() => setCommandOpen(false)}
        pages={PAGES}
        actions={ACTIONS}
        search={searchListings}
        placeholder="Search pages, listings, actions..."
        resultsLabel="Your listings"
      />
    </>
  );
}
