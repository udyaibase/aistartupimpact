'use client';

import Image from 'next/image';
import Link from 'next/link';
import {
  LayoutDashboard, Rocket, Wrench, BarChart3, User, Users,
  Plus, Settings, History, HelpCircle, Briefcase, BadgeCheck, AlertTriangle, CalendarDays, Megaphone,
} from 'lucide-react';
import CollapsibleSidebar from '@/components/ui/CollapsibleSidebar';
import SidebarNav, { type NavItem } from '@/components/ui/SidebarNav';
import { useSidebar } from '@/components/ui/SidebarContext';
import type { FounderShell } from '@/lib/founder/portal';

const NAV_ITEMS: NavItem[] = [
  { label: 'Home', href: '/founder/dashboard', icon: LayoutDashboard, exact: true },
  { type: 'divider', label: 'Listings' },
  { label: 'Startup', href: '/founder/startups', icon: Rocket },
  { label: 'AI Tool', href: '/founder/tools', icon: Wrench },
  { label: 'Hiring', href: '/founder/hiring', icon: Briefcase, badge: 'New' },
  { label: 'Events', href: '/founder/events', icon: CalendarDays },
  { type: 'divider', label: 'Insights' },
  { label: 'Analytics', href: '/founder/analytics', icon: BarChart3 },
  { type: 'divider', label: 'Account' },
  { label: 'Team', href: '/founder/team', icon: Users },
  { label: 'Profile', href: '/founder/profile', icon: User },
  { label: 'Settings', href: '/founder/settings', icon: Settings },
  { label: 'Activity log', href: '/founder/activity', icon: History },
  { label: 'Support', href: '/founder/support', icon: HelpCircle },
];

export function WorkspaceAvatar({ shell, size = 36 }: { shell: FounderShell; size?: number }) {
  return (
    <span
      className="rounded-[10px] bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center overflow-hidden shrink-0 font-semibold text-gray-600 dark:text-gray-300"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      aria-hidden
    >
      {shell.logoUrl
        ? <Image src={shell.logoUrl} alt="" width={size} height={size} sizes={`${size}px`} className="w-full h-full object-cover" />
        : shell.workspaceName.charAt(0).toUpperCase()}
    </span>
  );
}

export function VerificationLine({ shell }: { shell: FounderShell }) {
  if (shell.verified) {
    return (
      <span className="flex items-center gap-1 text-xs text-green-700 dark:text-green-400">
        <BadgeCheck className="w-3.5 h-3.5 shrink-0" aria-hidden /> Verified startup
      </span>
    );
  }
  return (
    <Link href={shell.startupSlug ? '/founder/startups' : '/founder/startups/new'} className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400 hover:underline">
      <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden />
      {shell.startupSlug ? 'Not verified yet' : 'List your startup'}
    </Link>
  );
}

function WorkspaceCard({ shell }: { shell: FounderShell }) {
  const { collapsed } = useSidebar();
  const home = shell.startupSlug ? `/founder/startups/${shell.startupSlug}` : '/founder/startups';
  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-2 px-2 pt-3 pb-1">
        <Link href={home} title={shell.workspaceName}><WorkspaceAvatar shell={shell} /></Link>
        <Link href="/founder/content" aria-label="Create" title="Create"
          className="w-10 h-10 rounded-xl bg-gray-900 dark:bg-white hover:bg-gray-800 dark:hover:bg-gray-100 text-white dark:text-gray-900 flex items-center justify-center transition-colors">
          <Plus className="w-5 h-5" aria-hidden />
        </Link>
      </div>
    );
  }
  return (
    <div className="px-3 pt-3 pb-1 space-y-3">
      <div className="flex items-center gap-2.5 p-2.5 rounded-[12px] border border-gray-200 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-900/60">
        <WorkspaceAvatar shell={shell} />
        <div className="min-w-0">
          <p className="text-[13px] font-semibold font-jakarta text-gray-900 dark:text-white truncate">{shell.workspaceName}</p>
          <VerificationLine shell={shell} />
        </div>
      </div>
      <Link href="/founder/content"
        className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-gray-900 dark:bg-white hover:bg-gray-800 dark:hover:bg-gray-100 text-white dark:text-gray-900 rounded-lg font-jakarta font-semibold text-sm transition-colors">
        <Plus className="w-4 h-4" aria-hidden /> Create
      </Link>
    </div>
  );
}

function PromoteCard() {
  return (
    <Link href="/advertise" className="relative overflow-hidden rounded-lg bg-brand p-2.5 flex items-center gap-2.5 hover:opacity-90 transition-opacity">
      <div className="absolute -top-3 -right-3 w-10 h-10 bg-white/10 rounded-full blur-lg" />
      <Megaphone className="w-4 h-4 text-amber-300 shrink-0 relative" aria-hidden />
      <div className="relative min-w-0">
        <p className="text-xs font-sora font-bold text-white leading-tight">Promote your startup or tool</p>
        <p className="text-[10px] text-white/70 font-jakarta leading-tight">Homepage, newsletter &amp; featured spots</p>
      </div>
    </Link>
  );
}

function PromoteIcon() {
  return (
    <Link href="/advertise" title="Promote your startup or tool" aria-label="Promote your startup or tool" className="w-10 h-10 rounded-xl bg-brand flex items-center justify-center hover:opacity-90 transition-opacity">
      <Megaphone className="w-[18px] h-[18px] text-white" aria-hidden />
    </Link>
  );
}

export default function FounderSidebar({ shell }: { shell: FounderShell }) {
  return (
    <CollapsibleSidebar logoHref="/founder/dashboard" bottomSlot={<PromoteCard />} collapsedBottomSlot={<PromoteIcon />}>
      <WorkspaceCard shell={shell} />
      <SidebarNav items={NAV_ITEMS} />
    </CollapsibleSidebar>
  );
}
