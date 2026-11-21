'use client';

import Image from 'next/image';
import Link from 'next/link';
import {
  LayoutDashboard, Rocket, Wrench, BarChart3, User, Users,
  Plus, Settings, History, HelpCircle, Briefcase, BadgeCheck, AlertTriangle, CalendarDays, Megaphone, FileText, ArrowRight,
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
  { label: 'Content', href: '/founder/content', icon: FileText },
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

/**
 * The promote background: black all through, with the brand colour glowing in from the four corners (stronger at
 * top-left and bottom-right). Sized in px so the short sidebar row and the tall card both keep a black middle.
 */
const brand = (pct: number) => `color-mix(in srgb, var(--brand-color, #FF3131) ${pct}%, transparent)`;
function promoBg(small = false): React.CSSProperties {
  const [a, b, c, d] = small ? [56, 38, 36, 26] : [90, 70, 60, 46];
  return {
    backgroundColor: '#000',
    backgroundImage: [
      `radial-gradient(${a}px ${b}px at 0% 0%, ${brand(70)}, transparent)`,
      `radial-gradient(${a}px ${b}px at 100% 100%, ${brand(70)}, transparent)`,
      `radial-gradient(${c}px ${d}px at 100% 0%, ${brand(38)}, transparent)`,
      `radial-gradient(${c}px ${d}px at 0% 100%, ${brand(38)}, transparent)`,
      'linear-gradient(135deg, #18181b 0%, #070708 50%, #000 100%)',
    ].join(', '),
  };
}
const PROMO_BG = promoBg();
const PROMO_BG_SMALL = promoBg(true);

/**
 * The "promote" card: a dark, premium card (black gradient, brand colour in the corners and a faint grid) so it reads as an
 * offer rather than another red button. Same look in light and dark themes. Shared with the phone "More" sheet.
 */
export function PromoteCard({ size = 'sm' }: { size?: 'sm' | 'lg' }) {
  const lg = size === 'lg';
  // Sidebar: one compact row, so it doesn't crowd the menu above it.
  if (!lg) {
    return (
      <Link
        href="/advertise"
        style={PROMO_BG_SMALL}
        className="group relative flex items-center gap-2.5 overflow-hidden rounded-[12px] border border-white/10 p-2.5 text-white shadow-[0_8px_22px_-14px_rgba(0,0,0,0.7)] transition-colors duration-200 hover:border-white/25"
      >
        <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-white/10 ring-1 ring-inset ring-white/15">
          <Megaphone className="h-4 w-4" aria-hidden />
        </span>
        <span className="relative min-w-0 flex-1">
          <span className="block text-[12px] font-sora font-semibold leading-tight">Promote your startup or tool</span>
          <span className="block text-[10.5px] text-white/60 font-jakarta leading-tight mt-0.5">Homepage, newsletter &amp; featured spots</span>
        </span>
        <ArrowRight className="relative h-3.5 w-3.5 shrink-0 text-white/70 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-white" aria-hidden />
      </Link>
    );
  }
  return (
    <Link
      href="/advertise"
      style={PROMO_BG}
      className={`group relative block overflow-hidden rounded-[14px] border border-white/10 text-white shadow-[0_10px_28px_-14px_rgba(0,0,0,0.7)] transition-[border-color,transform] duration-200 hover:border-white/25 active:scale-[0.99] ${lg ? 'p-4' : 'p-3.5'}`}
    >
      {/* A faint grid, decoration. The corners carry the brand colour, the rest is black. */}
      <span aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.06] [background-image:linear-gradient(rgba(255,255,255,0.9)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.9)_1px,transparent_1px)] [background-size:14px_14px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />

      <span className="relative flex items-center gap-2">
        <span className={`flex shrink-0 items-center justify-center rounded-[9px] bg-white/10 ring-1 ring-inset ring-white/15 ${lg ? 'h-9 w-9' : 'h-8 w-8'}`}>
          <Megaphone className={lg ? 'h-[18px] w-[18px]' : 'h-4 w-4'} aria-hidden />
        </span>
        <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/55 font-jakarta">Promote</span>
      </span>

      <span className={`relative mt-3 block font-sora font-semibold leading-snug ${lg ? 'text-[15px]' : 'text-[13px]'}`}>Promote your startup or tool</span>
      <span className={`relative mt-0.5 block text-white/60 font-jakarta leading-snug ${lg ? 'text-[13px]' : 'text-[11px]'}`}>Homepage, newsletter &amp; featured spots</span>

      <span className={`relative mt-3 inline-flex items-center gap-1 font-semibold font-jakarta text-white ${lg ? 'text-sm' : 'text-xs'}`}>
        See options
        <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
      </span>
    </Link>
  );
}

function PromoteIcon() {
  return (
    <Link href="/advertise" title="Promote your startup or tool" aria-label="Promote your startup or tool" style={PROMO_BG_SMALL}
      className="relative w-10 h-10 overflow-hidden rounded-xl border border-white/10 flex items-center justify-center hover:border-white/25 transition-colors">
      <Megaphone className="relative w-[18px] h-[18px] text-white" aria-hidden />
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
