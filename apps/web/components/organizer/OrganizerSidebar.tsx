'use client';

import Link from 'next/link';
import { CreditCard,
  LayoutDashboard, CalendarDays, Plus, Users, BarChart3,
  Settings, Send, QrCode, HelpCircle, CodeXml,
} from 'lucide-react';
import CollapsibleSidebar from '@/components/ui/CollapsibleSidebar';
import SidebarNav, { type NavItem } from '@/components/ui/SidebarNav';
import { useSidebar } from '@/components/ui/SidebarContext';

interface Props {
  organizer: { name: string; email: string; company?: string };
  eventCount?: number;
}

const getNavItems = (eventCount?: number): NavItem[] => [
  { label: 'Home', href: '/organizer', icon: LayoutDashboard, exact: true },
  { label: 'Events', href: '/organizer/events', icon: CalendarDays, count: eventCount },
  { type: 'divider', label: 'Manage' },
  { label: 'Attendees', href: '/organizer/attendees', icon: Users },
  { label: 'Check-in & on-site', href: '/organizer/check-in', icon: QrCode },
  { label: 'Analytics', href: '/organizer/analytics', icon: BarChart3 },
  { label: 'Promote', href: '/organizer/promote', icon: Send },
  { label: 'Website widget', href: '/organizer/embed', icon: CodeXml },
  { type: 'divider', label: 'Workspace' },
  { label: 'Team', href: '/organizer/team', icon: Users },
  { label: 'Plans & billing', href: '/organizer/billing', icon: CreditCard },
  { label: 'Settings', href: '/organizer/settings', icon: Settings },
  { label: 'Help & support', href: '/organizer/support', icon: HelpCircle },
];

function NewEventButton() {
  const { collapsed } = useSidebar();

  if (collapsed) {
    return (
      <Link
        href="/organizer/events/create"
        className="w-10 h-10 rounded-xl bg-gray-900 dark:bg-white flex items-center justify-center hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors mx-auto"
      >
        <Plus className="w-5 h-5 text-white dark:text-gray-900" />
      </Link>
    );
  }

  return (
    <Link
      href="/organizer/events/create"
      className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-gray-900 dark:bg-white hover:bg-gray-800 dark:hover:bg-gray-100 text-white dark:text-gray-900 rounded-lg font-jakarta font-semibold text-sm transition-colors"
    >
      <Plus className="w-4 h-4" />
      New event
    </Link>
  );
}


export default function OrganizerSidebar({ organizer, eventCount }: Props) {
  const navItems = getNavItems(eventCount);
  return (
    <CollapsibleSidebar logoHref="/organizer">
      <div className="px-3 pt-3 pb-1">
        <NewEventButton />
      </div>
      <SidebarNav items={navItems} />
    </CollapsibleSidebar>
  );
}
