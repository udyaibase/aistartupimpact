'use client';

import Image from 'next/image';
import Link from 'next/link';
import { UserCheck, CreditCard,
  Home, Briefcase, Users, Globe, BarChart3, Building2, Settings, HelpCircle, Plus, BadgeCheck, AlertTriangle, UserPlus,
} from 'lucide-react';
import { can, WORKSPACE_WIDE_PAGES, type Permission } from '@/lib/employer/roles';
import type { EmployerRole } from '@/lib/employer-auth';
import CollapsibleSidebar from '@/components/ui/CollapsibleSidebar';
import SidebarNav, { type NavItem } from '@/components/ui/SidebarNav';
import { useSidebar } from '@/components/ui/SidebarContext';
import type { EmployerShell } from '@/lib/employer/portal';

export function employerNav(newCandidates: number, role: EmployerRole = 'OWNER', jobScoped = false): NavItem[] {
  const items: (NavItem & { perm?: Permission })[] = [
    { label: 'Home', href: '/employer/dashboard', icon: Home, exact: true },
    { type: 'divider', label: 'Hiring' },
    { label: 'Jobs', href: '/employer/jobs', icon: Briefcase, perm: 'jobs.view' },
    { label: 'Candidates', href: '/employer/applications', icon: Users, badge: newCandidates > 0 ? `${newCandidates} new` : undefined, perm: 'candidates.view' },
    { label: 'Talent pool', href: '/employer/talent', icon: UserCheck, perm: 'candidates.view' },
    { label: 'Website widget', href: '/employer/careers', icon: Globe, perm: 'widget.manage' },
    { label: 'Insights', href: '/employer/analytics', icon: BarChart3, perm: 'insights.view' },
    { type: 'divider', label: 'Company' },
    { label: 'Company profile', href: '/employer/company', icon: Building2, perm: 'company.manage' },
    { label: 'Team', href: '/employer/team', icon: UserPlus },
    { label: 'Plans & billing', href: '/employer/billing', icon: CreditCard, perm: 'account.manage' },
    { label: 'Settings', href: '/employer/settings', icon: Settings, perm: 'account.manage' },
    { label: 'Help', href: '/employer/support', icon: HelpCircle },
  ];
  return items
    .filter((i) => (!i.perm || can(role, i.perm)) && !(jobScoped && 'href' in i && WORKSPACE_WIDE_PAGES.includes(i.href as string)))
    .map(({ perm: _perm, ...i }) => i);
}

export function CompanyAvatar({ shell, size = 36 }: { shell: EmployerShell; size?: number }) {
  return (
    <span
      className="rounded-[10px] bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center overflow-hidden shrink-0 font-sora font-bold text-gray-700 dark:text-gray-200"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      aria-hidden
    >
      {shell.logoUrl
        ? <Image src={shell.logoUrl} alt="" width={size} height={size} sizes={`${size}px`} className="w-full h-full object-cover" />
        : shell.companyName.charAt(0).toUpperCase()}
    </span>
  );
}

export function VerificationLine({ shell }: { shell: EmployerShell }) {
  if (shell.claimVerified) {
    return (
      <span className="flex items-center gap-1 text-xs text-green-700 dark:text-green-400">
        <BadgeCheck className="w-3.5 h-3.5 shrink-0" aria-hidden /> Verified startup
      </span>
    );
  }
  return (
    <Link href="/employer/company" className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400 hover:underline">
      <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden />
      {shell.claimLegacy ? 'Re-verify your startup' : 'Not verified yet'}
    </Link>
  );
}

function CompanyCard({ shell }: { shell: EmployerShell }) {
  const { collapsed } = useSidebar();
  const canPost = can(shell.role ?? 'OWNER', 'jobs.manage');
  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-2 px-2 pt-3 pb-1">
        <Link href="/employer/company" title={shell.companyName}><CompanyAvatar shell={shell} /></Link>
        {canPost && <Link href="/employer/jobs/new" aria-label="Post a job" title="Post a job"
          className="w-10 h-10 rounded-xl bg-gray-900 dark:bg-white hover:bg-gray-800 dark:hover:bg-gray-100 text-white dark:text-gray-900 flex items-center justify-center transition-colors">
          <Plus className="w-5 h-5" aria-hidden />
        </Link>}
      </div>
    );
  }
  return (
    <div className="px-3 pt-3 pb-1 space-y-3">
      <div className="flex items-center gap-2.5 p-2.5 rounded-[12px] border border-gray-200 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-900/60">
        <CompanyAvatar shell={shell} />
        <div className="min-w-0">
          <p className="text-[13px] font-semibold font-jakarta text-gray-900 dark:text-white truncate">{shell.companyName}</p>
          <VerificationLine shell={shell} />
        </div>
      </div>
      {canPost && (
        <Link href="/employer/jobs/new" data-tour="employer:post-job"
          className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-gray-900 dark:bg-white hover:bg-gray-800 dark:hover:bg-gray-100 text-white dark:text-gray-900 rounded-lg font-jakarta font-semibold text-sm transition-colors">
          <Plus className="w-4 h-4" aria-hidden /> Post a job
        </Link>
      )}
    </div>
  );
}

export default function EmployerSidebar({ shell }: { shell: EmployerShell }) {
  return (
    <CollapsibleSidebar logoHref={shell.jobScoped ? '/employer/applications' : '/employer/dashboard'}>
      <CompanyCard shell={shell} />
      <SidebarNav items={employerNav(shell.newCandidates, shell.role, shell.jobScoped)} />
    </CollapsibleSidebar>
  );
}
