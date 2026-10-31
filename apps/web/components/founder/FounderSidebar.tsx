'use client';

import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Rocket, Wrench, BarChart3, User, Users,
  Plus, Settings, HelpCircle, Briefcase,
} from 'lucide-react';
import CollapsibleSidebar from '@/components/ui/CollapsibleSidebar';
import SidebarNav, { type NavItem } from '@/components/ui/SidebarNav';
import { useSidebar } from '@/components/ui/SidebarContext';

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/founder/dashboard', icon: LayoutDashboard, exact: true },
  { type: 'divider', label: 'Listings' },
  { label: 'My Startups', href: '/founder/startups', icon: Rocket },
  { label: 'My Tools', href: '/founder/tools', icon: Wrench },
  { label: 'Hiring', href: '/founder/hiring', icon: Briefcase, badge: 'New' },
  { type: 'divider', label: 'Insights' },
  { label: 'Analytics', href: '/founder/analytics', icon: BarChart3 },
  { type: 'divider', label: 'Account' },
  { label: 'Team', href: '/founder/team', icon: Users },
  { label: 'Profile', href: '/founder/profile', icon: User },
  { label: 'Settings', href: '/founder/settings', icon: Settings },
  { label: 'Support', href: '/founder/support', icon: HelpCircle },
];

function CreateButton() {
  const pathname = usePathname();
  const { collapsed } = useSidebar();
  const isCreateActive = pathname.startsWith('/founder/content') || pathname.startsWith('/founder/milestones');

  const [show, setShow] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const handleEnter = () => {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setPos({ top: rect.top + rect.height / 2, left: rect.right + 8 });
    }
    setShow(true);
  };

  return (
    <div ref={ref} className={`${collapsed ? 'px-3 pt-3 pb-0.5 flex justify-center' : 'px-3 pt-3 pb-0.5'}`} onMouseEnter={collapsed ? handleEnter : undefined} onMouseLeave={() => setShow(false)}>
      <Link
        href="/founder/content"
        className={`flex items-center justify-center transition-all duration-200 ${
          collapsed
            ? `w-10 h-10 rounded-xl ${isCreateActive ? 'bg-brand text-white shadow-md shadow-brand/25' : 'bg-brand text-white hover:bg-brand-600 hover:shadow-md hover:shadow-brand/20'}`
            : `gap-1.5 w-full py-2 rounded-lg text-[13px] font-jakarta font-semibold ${isCreateActive ? 'bg-brand text-white shadow-sm shadow-brand/20' : 'bg-brand text-white hover:bg-brand-600 hover:shadow-sm hover:shadow-brand/15'}`
        }`}
      >
        <Plus className={`shrink-0 ${collapsed ? 'w-[18px] h-[18px]' : 'w-4 h-4'}`} strokeWidth={2.5} />
        {!collapsed && <span className="text-[13px] font-jakarta font-semibold">Create</span>}
      </Link>
      {collapsed && show && createPortal(
        <div
          style={{ top: pos.top, left: pos.left, transform: 'translateY(-50%)' }}
          className="fixed px-2.5 py-1.5 rounded-lg bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-xs font-jakarta font-medium whitespace-nowrap z-[9999] shadow-lg pointer-events-none"
        >
          Create
          <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-gray-900 dark:border-r-gray-100" />
        </div>,
        document.body
      )}
    </div>
  );
}

function UpgradeCard() {
  return (
    <Link href="/founder/settings" className="relative overflow-hidden rounded-lg bg-brand p-2.5 flex items-center gap-2.5 hover:opacity-95 transition-opacity block">
      <div className="absolute -top-3 -right-3 w-10 h-10 bg-white/10 rounded-full blur-lg" />
      <svg className="w-4 h-4 text-amber-300 shrink-0 relative" fill="currentColor" viewBox="0 0 20 20">
        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
      </svg>
      <div className="relative">
        <p className="text-xs font-sora font-bold text-white leading-tight">Upgrade to Pro</p>
        <p className="text-[10px] text-white/60 font-jakarta leading-tight">Featured listing & more</p>
      </div>
    </Link>
  );
}

function UpgradeIcon() {
  return (
    <Link href="/founder/settings" className="w-10 h-10 rounded-xl bg-brand flex items-center justify-center hover:opacity-90 transition-opacity">
      <span className="text-[10px] font-sora font-bold text-white uppercase tracking-wide">Pro</span>
    </Link>
  );
}

export default function FounderSidebar() {
  return (
    <CollapsibleSidebar logoHref="/founder/dashboard" bottomSlot={<UpgradeCard />} collapsedBottomSlot={<UpgradeIcon />}>
      <SidebarNav items={NAV_ITEMS} topSlot={<CreateButton />} />
    </CollapsibleSidebar>
  );
}
