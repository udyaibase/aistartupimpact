'use client';

import { usePathname } from 'next/navigation';
import { ChevronRight, Menu, Moon, Sun } from 'lucide-react';
import { useTheme } from '@/components/ThemeProvider';
import { useSidebar } from './Sidebar';

const segmentLabels: Record<string, string> = {
  dashboard: 'Dashboard',
  articles: 'Articles',
  'startups-dir': 'Startups',
  'tools-dir': 'AI Tools',
  'jobs-board': 'Job Board',
  employers: 'Employers',
  plans: 'Plans',
  promotions: 'Premium Promotions',
  subscribers: 'Subscribers',
  'newsletter-admin': 'Newsletter',
  'newsletter-highlights': 'Highlights',
  events: 'Events',
  people: 'People',
  users: 'Users',
  analytics: 'Analytics',
  settings: 'Settings',
  'dev-tools': 'Dev Tools',
  'hero-slots': 'Hero Slots',
  tickers: 'Tickers',
  media: 'Media Library',
  sponsors: 'Sponsors',
  placements: 'Placements',
  testimonials: 'Testimonials',
  founders: 'Founders',
  'web-users': 'Web Users',
  'india-ai': 'India AI',
  'funding-dir': 'Funding Digests',
  'funding-rounds': 'Funding Rounds',
  'tool-reviews': 'Tool Reviews',
  'startup-reviews': 'Startup Reviews',
  'tool-analytics': 'Tool Analytics',
  'consent-logs': 'Consent Logs',
  activity: 'Team Activity',
  cities: 'Cities',
  reports: 'Reports',
  new: 'New',
  edit: 'Edit',
  manage: 'Manage',
  stats: 'Stats',
  schemes: 'Schemes',
  policy: 'Policy',
  researchers: 'Researchers',
  tools: 'Tools',
};

export function AdminHeader() {
  const pathname = usePathname();
  const { theme, toggle } = useTheme();
  const { toggle: toggleSidebar } = useSidebar();

  const segments = (pathname || '')
    .split('/')
    .filter(Boolean)
    .map(seg => segmentLabels[seg] || seg.charAt(0).toUpperCase() + seg.slice(1));

  return (
    <header className="h-16 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between px-4 sm:px-6 shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <button
          onClick={toggleSidebar}
          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors lg:hidden"
          aria-label="Toggle sidebar"
        >
          <Menu className="w-5 h-5 text-gray-500 dark:text-gray-400" />
        </button>

        <nav className="flex items-center gap-2 text-sm font-jakarta min-w-0 overflow-hidden">
          <span className="text-gray-400 dark:text-gray-500 shrink-0">Admin</span>
          {segments.map((seg, i) => (
            <span key={i} className="flex items-center gap-2 shrink-0">
              <ChevronRight className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600" />
              <span
                className={
                  i === segments.length - 1
                    ? 'text-navy dark:text-white font-medium truncate'
                    : 'text-gray-400 dark:text-gray-500 hidden sm:inline'
                }
              >
                {seg}
              </span>
            </span>
          ))}
        </nav>
      </div>

      <div className="flex items-center gap-1 sm:gap-3 shrink-0">
        <button
          onClick={toggle}
          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? (
            <Sun className="w-5 h-5 text-yellow-500" />
          ) : (
            <Moon className="w-5 h-5 text-gray-500" />
          )}
        </button>
      </div>
    </header>
  );
}
