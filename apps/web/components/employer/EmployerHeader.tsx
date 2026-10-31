'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeftRight, UserCheck, CreditCard,
  Bell, Search, Home, Briefcase, Users, Globe, BarChart3, Building2, Settings, HelpCircle, Plus, LogOut, ExternalLink,
} from 'lucide-react';
import { maskEmail } from '@/lib/mask';
import ThemeToggle from '@/components/ThemeToggle';
import CommandPalette, { type SearchResult } from '@/components/organizer/CommandPalette';
import type { EmployerShell } from '@/lib/employer/portal';
import { can, ROLE_LABEL, type Permission, WORKSPACE_WIDE_PAGES } from '@/lib/employer/roles';

interface Props {
  employer: { companyName: string; email: string; slug: string; plan: string };
  shell: EmployerShell;
}

const PAGE_PERM: Record<string, Permission> = {
  jobs: 'jobs.view', candidates: 'candidates.view', careers: 'widget.manage', insights: 'insights.view', company: 'company.manage', settings: 'account.manage', billing: 'account.manage', talent: 'candidates.view',
};

const PAGES: SearchResult[] = [
  { id: 'home', label: 'Home', description: 'Overview and setup', href: '/employer/dashboard', icon: <Home className="w-4 h-4" />, category: 'page' },
  { id: 'jobs', label: 'Jobs', description: 'Open, draft, paused and closed', href: '/employer/jobs', icon: <Briefcase className="w-4 h-4" />, category: 'page' },
  { id: 'candidates', label: 'Candidates', description: 'Review applications', href: '/employer/applications', icon: <Users className="w-4 h-4" />, category: 'page' },
  { id: 'talent', label: 'Talent pool', description: 'Past applicants open to other roles', href: '/employer/talent', icon: <UserCheck className="w-4 h-4" />, category: 'page' },
  { id: 'careers', label: 'Website widget', description: 'Show jobs on your website', href: '/employer/careers', icon: <Globe className="w-4 h-4" />, category: 'page' },
  { id: 'insights', label: 'Insights', description: 'Views and applications', href: '/employer/analytics', icon: <BarChart3 className="w-4 h-4" />, category: 'page' },
  { id: 'company', label: 'Company profile', description: 'Logo, description, startup claim', href: '/employer/company', icon: <Building2 className="w-4 h-4" />, category: 'page' },
  { id: 'team', label: 'Team', description: 'Invite recruiters and interviewers', href: '/employer/team', icon: <Users className="w-4 h-4" />, category: 'page' },
  { id: 'billing', label: 'Plans & billing', description: 'Plan, AI reviews and payments', href: '/employer/billing', icon: <CreditCard className="w-4 h-4" />, category: 'page' },
  { id: 'settings', label: 'Settings', description: 'Account and security', href: '/employer/settings', icon: <Settings className="w-4 h-4" />, category: 'page' },
  { id: 'help', label: 'Help', description: 'Guides and support', href: '/employer/support', icon: <HelpCircle className="w-4 h-4" />, category: 'page' },
];

const ACTIONS: SearchResult[] = [
  { id: 'post-job', label: 'Post a job', description: 'Paste a description and publish', href: '/employer/jobs/new', icon: <Plus className="w-4 h-4" />, category: 'action' },
];

let jobsCache: Promise<{ id: string; title: string; status: string }[]> | null = null;

async function searchJobs(q: string): Promise<SearchResult[]> {
  jobsCache ??= fetch('/api/employer/jobs').then((r) => r.json()).then((d) => d.jobs ?? []).catch(() => { jobsCache = null; return []; });
  const needle = q.toLowerCase();
  const STATUS: Record<string, string> = { OPEN: 'Open', DRAFT: 'Draft', PAUSED: 'Paused', CLOSED: 'Closed' };
  return (await jobsCache)
    .filter((j) => j.title.toLowerCase().includes(needle))
    .slice(0, 6)
    .map((j) => ({
      id: `job-${j.id}`, label: j.title, description: STATUS[j.status] ?? j.status, href: `/employer/jobs/${j.id}/edit`,
      icon: <Briefcase className="w-4 h-4" />, category: 'event' as const,
    }));
}

export default function EmployerHeader({ employer, shell }: Props) {
  const [commandOpen, setCommandOpen] = useState(false);
  const role = shell.role ?? 'OWNER';

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

  return (
    <>
      <header className="h-14 bg-white dark:bg-gray-950 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between px-4 md:px-6 shrink-0">
        {/* Left: Mobile logo + Search trigger */}
        <div className="flex items-center gap-3">
          <Link href={shell.jobScoped ? '/employer/applications' : '/employer/dashboard'} className="md:hidden flex items-center gap-2">
            <Image src="/logo-light.svg" alt="Udyaibase" width={24} height={24} sizes="24px" className="h-6 w-auto dark:hidden" />
            <Image src="/logo-dark.svg" alt="Udyaibase" width={24} height={24} sizes="24px" className="h-6 w-auto hidden dark:block" />
          </Link>
          <button
            onClick={() => setCommandOpen(true)}
            className="hidden md:flex items-center gap-2 w-80 lg:w-96 pl-3 pr-3 py-1.5 rounded-md border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 text-sm font-jakarta text-gray-400 hover:border-gray-300 dark:hover:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
          >
            <Search className="w-4 h-4 text-gray-400 shrink-0" />
            <span className="flex-1 text-left">Search jobs, pages...</span>
            <kbd className="text-[10px] font-jakarta font-medium text-gray-400 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-1.5 py-0.5">⌘K</kbd>
          </button>
          <button
            onClick={() => setCommandOpen(true)}
            aria-label="Search"
            className="md:hidden w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md"
          >
            <Search className="w-4 h-4" />
          </button>
        </div>

        {/* Right */}
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link
            href="/employer/applications?stage=new"
            aria-label={shell.newCandidates > 0 ? `${shell.newCandidates} new candidates` : 'Candidates'}
            className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md relative"
          >
            <Bell className="w-4 h-4" />
            {shell.newCandidates > 0 && <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-brand rounded-full" aria-hidden />}
          </Link>
          <AccountMenu employer={employer} shell={shell} />
        </div>
      </header>

      <CommandPalette
        open={commandOpen}
        onClose={() => setCommandOpen(false)}
        pages={PAGES.filter((p) => (!PAGE_PERM[p.id] || can(role, PAGE_PERM[p.id])) && !(shell.jobScoped && WORKSPACE_WIDE_PAGES.includes(p.href)))}
        actions={can(role, 'jobs.manage') ? ACTIONS : []}
        search={searchJobs}
        placeholder="Search pages, jobs, actions..."
        resultsLabel="Jobs"
      />
    </>
  );
}

/** Same look as the host portal's ProfileDropdown, with employer links. */
function AccountMenu({ employer, shell }: Props) {
  const role = shell.role ?? 'OWNER';
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    if (open) { document.addEventListener('mousedown', onClick); document.addEventListener('keydown', onKey); }
    return () => { document.removeEventListener('mousedown', onClick); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const logout = async () => {
    await fetch('/api/employer/auth/logout', { method: 'POST' }).catch(() => {});
    window.location.href = '/employer/login';
  };

  const toFounderPortal = async () => {
    const res = await fetch('/api/employer/switch-founder', { method: 'POST' }).catch(() => null);
    const d = await res?.json().catch(() => ({}));
    window.location.href = d?.redirect || '/founder/login';
  };

  const item = 'flex items-center gap-2.5 w-full text-left px-4 py-2 text-[13px] text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors';

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        aria-label="Account menu"
        aria-expanded={open}
        className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center overflow-hidden hover:ring-2 hover:ring-gray-200 dark:hover:ring-gray-700 transition-all"
      >
        {shell.logoUrl ? (
          <Image src={shell.logoUrl} alt="" className="w-full h-full object-cover" width={32} height={32} sizes="32px" />
        ) : (
          <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">{(shell.viewerName || shell.companyName).charAt(0).toUpperCase()}</span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-60 bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-gray-200 dark:border-gray-800 overflow-hidden z-overlay">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
            <p className="text-[13px] font-semibold text-gray-900 dark:text-white truncate">{shell.viewerName || shell.companyName}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{maskEmail(shell.viewerEmail ?? employer.email)}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{ROLE_LABEL[role]}{shell.viewerName ? ` · ${shell.companyName}` : ''}</p>
          </div>
          <div className="py-1">
            {can(role, 'company.manage') && <Link href="/employer/company" onClick={() => setOpen(false)} className={item}><Building2 className="w-4 h-4 text-gray-400" /> Company profile</Link>}
            <Link href="/employer/team" onClick={() => setOpen(false)} className={item}><Users className="w-4 h-4 text-gray-400" /> Team</Link>
            {can(role, 'account.manage') && <Link href="/employer/settings" onClick={() => setOpen(false)} className={item}><Settings className="w-4 h-4 text-gray-400" /> Settings</Link>}
          </div>
          <div className="py-1 border-t border-gray-100 dark:border-gray-800">
            {shell.startupProfilePath && (
              <a href={shell.startupProfilePath} target="_blank" rel="noopener" onClick={() => setOpen(false)} className={item}>
                <ExternalLink className="w-4 h-4 text-gray-400" /> View startup profile
              </a>
            )}
            {shell.founderPortal && (
              <button onClick={() => { setOpen(false); toFounderPortal(); }} className={item}><ArrowLeftRight className="w-4 h-4 text-gray-400" /> Founder portal</button>
            )}
            <Link href="/" onClick={() => setOpen(false)} className={item}><Home className="w-4 h-4 text-gray-400" /> Back to Home</Link>
          </div>
          <div className="py-1 border-t border-gray-100 dark:border-gray-800">
            <button onClick={() => { setOpen(false); logout(); }} className={item}>
              <LogOut className="w-4 h-4 text-gray-400" /> Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
