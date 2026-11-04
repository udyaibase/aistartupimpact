'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Rocket, Wrench, Plus, MoreHorizontal, X, Briefcase, BarChart3, Users, User, Settings, History, HelpCircle, CalendarDays, Megaphone } from 'lucide-react';
import type { FounderShell } from '@/lib/founder/portal';
import { WorkspaceAvatar, VerificationLine } from './FounderSidebar';

const TABS: { href: string; icon: typeof Rocket; label: string; exact?: boolean; highlight?: boolean }[] = [
  { href: '/founder/dashboard', icon: LayoutDashboard, label: 'Home', exact: true },
  { href: '/founder/startups', icon: Rocket, label: 'Startup' },
  { href: '/founder/content', icon: Plus, label: 'Create', highlight: true },
  { href: '/founder/tools', icon: Wrench, label: 'Tool' },
];

const MORE: { href: string; icon: typeof Rocket; label: string; desc: string }[] = [
  { href: '/founder/hiring', icon: Briefcase, label: 'Hiring', desc: 'Post jobs and manage applicants' },
  { href: '/founder/events', icon: CalendarDays, label: 'Events', desc: 'Host demo days, launches and meetups' },
  { href: '/founder/analytics', icon: BarChart3, label: 'Analytics', desc: 'Views, clicks and traffic sources' },
  { href: '/founder/team', icon: Users, label: 'Team', desc: 'Invite people to help manage your startup' },
  { href: '/founder/profile', icon: User, label: 'Profile', desc: 'Your public founder profile' },
  { href: '/founder/settings', icon: Settings, label: 'Settings', desc: 'Notifications, privacy and security' },
  { href: '/founder/activity', icon: History, label: 'Activity log', desc: 'Sign-ins and changes on your account' },
  { href: '/founder/support', icon: HelpCircle, label: 'Support', desc: 'Get help from our team' },
  { href: '/advertise', icon: Megaphone, label: 'Promote your startup or tool', desc: 'Homepage, newsletter and featured spots' },
];

/** Phone navigation: same tabs-and-More pattern as the employer and host portals. */
export default function FounderMobileNav({ shell }: { shell: FounderShell }) {
  const pathname = usePathname();
  const [sheet, setSheet] = useState(false);

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(href + '/');
  const moreActive = MORE.some((m) => isActive(m.href));

  useEffect(() => setSheet(false), [pathname]);

  useEffect(() => {
    if (!sheet) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSheet(false);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [sheet]);

  return (
    <>
      <nav
        aria-label="Primary"
        className="md:hidden fixed bottom-0 left-0 right-0 z-sticky bg-white/95 dark:bg-gray-950/95 backdrop-blur border-t border-gray-200 dark:border-gray-800"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="grid h-16 grid-cols-5">
          {TABS.map((item) => {
            const active = isActive(item.href, item.exact);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`relative flex flex-col items-center justify-center gap-1 transition-colors active:bg-gray-100 dark:active:bg-gray-900 ${
                  item.highlight || active ? 'text-brand' : 'text-gray-500 dark:text-gray-400'
                }`}
              >
                {active && !item.highlight && <span className="absolute top-0 left-4 right-4 h-[3px] bg-brand rounded-b" />}
                {item.highlight ? (
                  <span className="w-11 h-11 bg-brand rounded-full flex items-center justify-center -mt-5 shadow-lg shadow-brand/30 ring-4 ring-white dark:ring-gray-950">
                    <item.icon className="w-5 h-5 text-white" />
                  </span>
                ) : (
                  <item.icon className={`w-[22px] h-[22px] ${active ? 'stroke-[2.2]' : ''}`} />
                )}
                <span className="text-[11px] font-jakarta font-semibold leading-none">{item.label}</span>
              </Link>
            );
          })}
          <button
            onClick={() => setSheet(true)}
            aria-haspopup="dialog"
            aria-expanded={sheet}
            className={`relative flex flex-col items-center justify-center gap-1 active:bg-gray-100 dark:active:bg-gray-900 ${moreActive ? 'text-brand' : 'text-gray-500 dark:text-gray-400'}`}
          >
            {moreActive && <span className="absolute top-0 left-4 right-4 h-[3px] bg-brand rounded-b" />}
            <MoreHorizontal className="w-[22px] h-[22px]" />
            <span className="text-[11px] font-jakarta font-semibold leading-none">More</span>
          </button>
        </div>
      </nav>

      {sheet && (
        <div className="md:hidden fixed inset-0 z-modal" role="dialog" aria-modal="true" aria-label="More">
          <div className="absolute inset-0 bg-black/40 animate-fade-in" onClick={() => setSheet(false)} aria-hidden />
          <div
            className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto bg-white dark:bg-gray-950 rounded-t-[20px] shadow-2xl animate-slide-up"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}
          >
            <div className="sticky top-0 bg-white dark:bg-gray-950 pt-2.5 pb-1 flex flex-col items-center">
              <span aria-hidden className="w-10 h-1.5 rounded-full bg-gray-300 dark:bg-gray-700" />
              <div className="w-full flex items-center justify-between px-5 pt-2">
                <p className="portal-section-title">More</p>
                <button onClick={() => setSheet(false)} aria-label="Close" className="w-11 h-11 -mr-2 flex items-center justify-center rounded-full text-gray-500 active:bg-gray-100 dark:active:bg-gray-800">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="mx-4 mt-1 mb-3 flex items-center gap-3 p-3 rounded-[14px] border border-gray-200 dark:border-gray-800">
              <WorkspaceAvatar shell={shell} size={40} />
              <div className="min-w-0">
                <p className="text-[15px] font-semibold font-jakarta text-gray-900 dark:text-white truncate">{shell.workspaceName}</p>
                <VerificationLine shell={shell} />
              </div>
            </div>

            <ul className="px-2">
              {MORE.map((m) => {
                const active = isActive(m.href);
                return (
                  <li key={m.href}>
                    <Link
                      href={m.href}
                      aria-current={active ? 'page' : undefined}
                      className={`flex items-center gap-3.5 px-3 min-h-[60px] rounded-[12px] active:bg-gray-100 dark:active:bg-gray-900 ${active ? 'bg-brand/5' : ''}`}
                    >
                      <span className={`w-10 h-10 rounded-[10px] flex items-center justify-center shrink-0 ${active ? 'bg-brand text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`}>
                        <m.icon className="w-5 h-5" />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className={`block text-[15px] font-semibold font-jakarta ${active ? 'text-brand' : 'text-gray-900 dark:text-white'}`}>{m.label}</span>
                        <span className="block text-[13px] text-gray-500 font-jakarta truncate">{m.desc}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
