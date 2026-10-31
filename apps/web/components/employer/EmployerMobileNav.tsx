'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { UserCheck, CreditCard,
  Home, Briefcase, Users, Plus, MoreHorizontal, X, Globe, BarChart3, Building2, Settings, HelpCircle, UserPlus,
} from 'lucide-react';
import { can, type Permission, WORKSPACE_WIDE_PAGES } from '@/lib/employer/roles';
import type { EmployerShell } from '@/lib/employer/portal';
import { CompanyAvatar, VerificationLine } from './EmployerSidebar';

const ALL_TABS: { href: string; icon: typeof Home; label: string; exact?: boolean; highlight?: boolean; perm?: Permission }[] = [
  { href: '/employer/dashboard', icon: Home, label: 'Home', exact: true },
  { href: '/employer/jobs', icon: Briefcase, label: 'Jobs', perm: 'jobs.view' },
  { href: '/employer/jobs/new', icon: Plus, label: 'Post', highlight: true, exact: true, perm: 'jobs.manage' },
  { href: '/employer/applications', icon: Users, label: 'Candidates', perm: 'candidates.view' },
];

const ALL_MORE: { href: string; icon: typeof Home; label: string; desc: string; perm?: Permission }[] = [
  { href: '/employer/talent', icon: UserCheck, label: 'Talent pool', desc: 'Past applicants open to other roles', perm: 'candidates.view' },
  { href: '/employer/careers', icon: Globe, label: 'Website widget', desc: 'Show your open roles on your website', perm: 'widget.manage' },
  { href: '/employer/analytics', icon: BarChart3, label: 'Insights', desc: 'Views, applications and sources', perm: 'insights.view' },
  { href: '/employer/company', icon: Building2, label: 'Company profile', desc: 'Logo, description, startup claim', perm: 'company.manage' },
  { href: '/employer/team', icon: UserPlus, label: 'Team', desc: 'Invite recruiters and interviewers' },
  { href: '/employer/billing', icon: CreditCard, label: 'Plans & billing', desc: 'Plan, AI reviews and payments', perm: 'account.manage' },
  { href: '/employer/settings', icon: Settings, label: 'Settings', desc: 'Account, notifications, security', perm: 'account.manage' },
  { href: '/employer/support', icon: HelpCircle, label: 'Help', desc: 'Guides and contact' },
];

export default function EmployerMobileNav({ shell }: { shell: EmployerShell }) {
  const pathname = usePathname();
  const [sheet, setSheet] = useState(false);
  const role = shell.role ?? 'OWNER';
  const visible = (t: { href: string; perm?: Permission }) => (!t.perm || can(role, t.perm)) && !(shell.jobScoped && WORKSPACE_WIDE_PAGES.includes(t.href));
  const TABS = ALL_TABS.filter(visible);
  const MORE = ALL_MORE.filter(visible);

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || (pathname.startsWith(href + '/') && pathname !== '/employer/jobs/new');
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
        <div className={`grid h-16 ${TABS.length === 4 ? 'grid-cols-5' : 'grid-cols-4'}`}>
          {TABS.map((item) => {
            const active = isActive(item.href, item.exact);
            const showBadge = item.href === '/employer/applications' && shell.newCandidates > 0;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                aria-label={showBadge ? `${item.label}, ${shell.newCandidates} new` : undefined}
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
                  <span className="relative">
                    <item.icon className={`w-[22px] h-[22px] ${active ? 'stroke-[2.2]' : ''}`} />
                    {showBadge && (
                      <span aria-hidden className="absolute -top-1.5 -right-2.5 min-w-[18px] h-[18px] px-1 rounded-full bg-brand text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white dark:ring-gray-950">
                        {shell.newCandidates > 99 ? '99+' : shell.newCandidates}
                      </span>
                    )}
                  </span>
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
              <CompanyAvatar shell={shell} size={40} />
              <div className="min-w-0">
                <p className="text-[15px] font-semibold font-jakarta text-gray-900 dark:text-white truncate">{shell.companyName}</p>
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
