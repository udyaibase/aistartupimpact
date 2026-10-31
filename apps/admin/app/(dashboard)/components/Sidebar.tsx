'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Receipt, LogOut, Menu, X } from 'lucide-react';
import { useState, useEffect, createContext, useContext } from 'react';
import {
  LayoutDashboard,
  FileText,
  Image,
  Wrench,
  Building2,
  IndianRupee,
  Mail,
  Megaphone,
  Users,
  BarChart3,
  Settings,
  Radio,
  Layers,
  MessageSquare,
  UserCog,
  Shield,
  Sparkles,
  MapPin,
  Newspaper,
  GraduationCap,
  Star,
  CalendarDays,
  Flag,
  Activity,
  Briefcase,
  LifeBuoy,
  Package,
  CreditCard,
  ClipboardList,
} from 'lucide-react';

const SidebarContext = createContext<{
  isOpen: boolean;
  toggle: () => void;
  close: () => void;
}>({ isOpen: false, toggle: () => {}, close: () => {} });

export function useSidebar() {
  return useContext(SidebarContext);
}

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  return (
    <SidebarContext.Provider
      value={{
        isOpen,
        toggle: () => setIsOpen(v => !v),
        close: () => setIsOpen(false),
      }}
    >
      {children}
    </SidebarContext.Provider>
  );
}

const sidebarItems = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, roles: 'all' },

  { type: 'divider' as const, label: 'Content', roles: ['SUPER_ADMIN', 'EDITOR_IN_CHIEF', 'SENIOR_WRITER', 'WRITER', 'CONTRIBUTOR'] },
  { label: 'Articles', href: '/articles', icon: FileText, roles: ['SUPER_ADMIN', 'EDITOR_IN_CHIEF', 'SENIOR_WRITER', 'WRITER', 'CONTRIBUTOR'] },
  { label: 'Hero Slots', href: '/hero-slots', icon: Layers, roles: ['SUPER_ADMIN', 'EDITOR_IN_CHIEF'] },
  { label: 'Media Library', href: '/media', icon: Image, roles: ['SUPER_ADMIN', 'EDITOR_IN_CHIEF', 'SENIOR_WRITER', 'WRITER'] },
  { label: 'Tickers', href: '/tickers', icon: Radio, roles: ['SUPER_ADMIN', 'EDITOR_IN_CHIEF'] },

  { type: 'divider' as const, label: 'Directories', roles: ['SUPER_ADMIN', 'EDITOR_IN_CHIEF', 'SENIOR_WRITER'] },
  { label: 'AI Tools', href: '/tools-dir', icon: Wrench, roles: ['SUPER_ADMIN', 'EDITOR_IN_CHIEF', 'SENIOR_WRITER'] },
  { label: 'Tool Reviews', href: '/tool-reviews', icon: MessageSquare, roles: ['SUPER_ADMIN', 'EDITOR_IN_CHIEF', 'SENIOR_WRITER'] },
  { label: 'Startups', href: '/startups-dir', icon: Building2, roles: ['SUPER_ADMIN', 'EDITOR_IN_CHIEF', 'SENIOR_WRITER'] },
  { label: 'Startup Reviews', href: '/startup-reviews', icon: Star, roles: ['SUPER_ADMIN', 'EDITOR_IN_CHIEF', 'SENIOR_WRITER'] },
  { label: 'Funding Digests', href: '/funding-dir', icon: IndianRupee, roles: ['SUPER_ADMIN', 'EDITOR_IN_CHIEF', 'SENIOR_WRITER'] },

  { type: 'divider' as const, label: 'India AI', roles: ['SUPER_ADMIN', 'EDITOR_IN_CHIEF', 'SENIOR_WRITER'] },
  { label: 'Stats & Cities', href: '/india-ai/stats', icon: MapPin, roles: ['SUPER_ADMIN', 'EDITOR_IN_CHIEF', 'SENIOR_WRITER'] },
  { label: 'Gov Schemes', href: '/india-ai/schemes', icon: FileText, roles: ['SUPER_ADMIN', 'EDITOR_IN_CHIEF', 'SENIOR_WRITER'] },
  { label: 'Policy Updates', href: '/india-ai/policy', icon: Newspaper, roles: ['SUPER_ADMIN', 'EDITOR_IN_CHIEF', 'SENIOR_WRITER'] },
  { label: 'AI Researchers', href: '/india-ai/researchers', icon: GraduationCap, roles: ['SUPER_ADMIN', 'EDITOR_IN_CHIEF', 'SENIOR_WRITER'] },
  { label: 'Indian AI Tools', href: '/india-ai/tools', icon: Wrench, roles: ['SUPER_ADMIN', 'EDITOR_IN_CHIEF', 'SENIOR_WRITER'] },
  { label: 'Featured Founders', href: '/india-ai/founders', icon: Star, roles: ['SUPER_ADMIN', 'EDITOR_IN_CHIEF', 'SENIOR_WRITER'] },

  { type: 'divider' as const, label: 'Events', roles: ['SUPER_ADMIN', 'EDITOR_IN_CHIEF', 'EVENT_ORGANIZER'] },
  { label: 'Events', href: '/events', icon: CalendarDays, roles: ['SUPER_ADMIN', 'EDITOR_IN_CHIEF', 'EVENT_ORGANIZER'] },
  { label: 'Event Subscribers', href: '/events/subscribers', icon: Users, roles: ['SUPER_ADMIN', 'EDITOR_IN_CHIEF'] },

  { type: 'divider' as const, label: 'Careers', roles: ['SUPER_ADMIN', 'EDITOR_IN_CHIEF'] },
  { label: 'Applications', href: '/applications', icon: ClipboardList, roles: ['SUPER_ADMIN', 'EDITOR_IN_CHIEF'] },

  { type: 'divider' as const, label: 'Job Board', roles: ['SUPER_ADMIN', 'EDITOR_IN_CHIEF'] },
  { label: 'Job Listings', href: '/jobs-board', icon: Briefcase, roles: ['SUPER_ADMIN', 'EDITOR_IN_CHIEF'] },
  { label: 'Employers', href: '/employers', icon: Building2, roles: ['SUPER_ADMIN', 'EDITOR_IN_CHIEF'] },
  { label: 'Billing', href: '/billing', icon: Receipt, roles: ['SUPER_ADMIN'] },
  { label: 'Monitoring', href: '/monitoring', icon: Activity, roles: ['SUPER_ADMIN'] },
  { label: 'Plans', href: '/plans', icon: CreditCard, roles: ['SUPER_ADMIN'] },
  { label: 'Premium Promotions', href: '/promotions', icon: Megaphone, roles: ['SUPER_ADMIN', 'EDITOR_IN_CHIEF'] },

  { type: 'divider' as const, label: 'Marketing', roles: ['SUPER_ADMIN', 'EDITOR_IN_CHIEF', 'AD_MANAGER'] },
  { label: 'Subscribers', href: '/subscribers', icon: Users, roles: ['SUPER_ADMIN', 'EDITOR_IN_CHIEF', 'AD_MANAGER'] },
  { label: 'Newsletter', href: '/newsletter-admin', icon: Mail, roles: ['SUPER_ADMIN', 'EDITOR_IN_CHIEF'] },
  { label: 'Highlights', href: '/newsletter-highlights', icon: Sparkles, roles: ['SUPER_ADMIN', 'EDITOR_IN_CHIEF'] },
  { label: 'Testimonials', href: '/testimonials', icon: MessageSquare, roles: ['SUPER_ADMIN', 'EDITOR_IN_CHIEF', 'AD_MANAGER'] },
  { label: 'Announcements', href: '/announcements', icon: Megaphone, roles: ['SUPER_ADMIN', 'EDITOR_IN_CHIEF'] },
  { label: 'Placements', href: '/placements', icon: Megaphone, roles: ['SUPER_ADMIN', 'EDITOR_IN_CHIEF', 'AD_MANAGER'] },
  { label: 'Sponsors', href: '/sponsors', icon: Building2, roles: ['SUPER_ADMIN', 'EDITOR_IN_CHIEF', 'AD_MANAGER'] },
  { label: 'Adv Packages', href: '/advertise', icon: Package, roles: ['SUPER_ADMIN', 'EDITOR_IN_CHIEF', 'AD_MANAGER'] },
  { label: 'Adv Payments', href: '/advertise/payments', icon: CreditCard, roles: ['SUPER_ADMIN', 'EDITOR_IN_CHIEF', 'AD_MANAGER'] },

  { type: 'divider' as const, label: 'Analytics', roles: ['SUPER_ADMIN', 'EDITOR_IN_CHIEF', 'SENIOR_WRITER', 'AD_MANAGER'] },
  { label: 'Analytics', href: '/analytics', icon: BarChart3, roles: ['SUPER_ADMIN', 'EDITOR_IN_CHIEF', 'SENIOR_WRITER', 'AD_MANAGER'] },
  { label: 'Tool Analytics', href: '/tool-analytics', icon: Sparkles, roles: ['SUPER_ADMIN', 'EDITOR_IN_CHIEF', 'SENIOR_WRITER', 'AD_MANAGER'] },

  { type: 'divider' as const, label: 'Founder Content', roles: ['SUPER_ADMIN', 'EDITOR_IN_CHIEF'] },
  { label: 'Content Review', href: '/content-review', icon: FileText, roles: ['SUPER_ADMIN', 'EDITOR_IN_CHIEF'] },
  { label: 'Milestones', href: '/milestones', icon: Flag, roles: ['SUPER_ADMIN', 'EDITOR_IN_CHIEF'] },

  { type: 'divider' as const, label: 'Users', roles: ['SUPER_ADMIN', 'EDITOR_IN_CHIEF'] },
  { label: 'People', href: '/people', icon: Users, roles: ['SUPER_ADMIN', 'EDITOR_IN_CHIEF'] },
  { label: 'Founders', href: '/founders', icon: UserCog, roles: ['SUPER_ADMIN', 'EDITOR_IN_CHIEF'] },
  { label: 'Web Users', href: '/web-users', icon: Users, roles: ['SUPER_ADMIN'] },

  { type: 'divider' as const, label: 'System', roles: ['SUPER_ADMIN'] },
  { label: 'Team Activity', href: '/activity', icon: Activity, roles: ['SUPER_ADMIN', 'EDITOR_IN_CHIEF'] },
  { label: 'Cities', href: '/cities', icon: MapPin, roles: ['SUPER_ADMIN', 'EDITOR_IN_CHIEF'] },
  { label: 'Admin Users', href: '/users', icon: Shield, roles: ['SUPER_ADMIN'] },
  { label: 'Consent Logs', href: '/consent-logs', icon: Shield, roles: ['SUPER_ADMIN'] },
  { label: 'Support Tickets', href: '/support', icon: LifeBuoy, roles: ['SUPER_ADMIN', 'EDITOR_IN_CHIEF'] },
  { label: 'Reports', href: '/reports', icon: Flag, roles: ['SUPER_ADMIN', 'EDITOR_IN_CHIEF'] },
  { label: 'Settings', href: '/settings', icon: Settings, roles: ['SUPER_ADMIN'] },
  { label: 'Dev Tools', href: '/dev-tools', icon: Wrench, roles: ['SUPER_ADMIN'] },
];

export function AdminSidebar({ session }: { session: any }) {
  const pathname = usePathname();
  const { isOpen, close } = useSidebar();
  const userName = session?.user?.name || "Admin User";
  const userRole = session?.user?.role?.replace(/_/g, ' ') || "SUPER ADMIN";
  const userRoleRaw = session?.user?.role || "SUPER_ADMIN";
  const userInitials = userName.substring(0, 2).toUpperCase();
  const userAvatar = session?.user?.image || session?.user?.avatar;

  const visibleItems = sidebarItems.filter((item: any) => {
    if (item.roles === 'all') return true;
    if (Array.isArray(item.roles)) return item.roles.includes(userRoleRaw);
    return true;
  });

  const filteredItems = visibleItems.filter((item: any, index: number) => {
    if ('type' in item && item.type === 'divider') {
      for (let i = index + 1; i < visibleItems.length; i++) {
        if ('type' in visibleItems[i] && (visibleItems[i] as any).type === 'divider') return false;
        if (!('type' in visibleItems[i])) return true;
      }
      return false;
    }
    return true;
  });

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={close}
        />
      )}

      <aside
        className={`
          fixed inset-y-0 left-0 z-50 w-64 bg-navy dark:bg-gray-900 text-white flex flex-col shrink-0 border-r border-white/5 dark:border-gray-800
          transform transition-transform duration-200 ease-in-out
          lg:relative lg:translate-x-0
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <div className="h-16 flex items-center justify-between px-6 border-b border-white/10 dark:border-gray-800">
          <Link href="/dashboard" className="flex items-center gap-2">
            <span className="font-sora font-extrabold text-lg">
              <span className="text-brand">U</span>
              <span className="text-white">B</span>
            </span>
            <span className="text-gray-400 text-xs font-jakarta">Admin</span>
          </Link>
          <button
            onClick={close}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors lg:hidden"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {filteredItems.map((item: any, i: number) => {
            if ('type' in item && item.type === 'divider') {
              return (
                <div key={i} className="pt-4 pb-2">
                  <span className="px-3 text-[10px] font-semibold uppercase tracking-widest text-gray-500">
                    {item.label}
                  </span>
                </div>
              );
            }

            const hasChildInSidebar = sidebarItems.some((other: any) => other.href && other.href !== item.href && other.href.startsWith(item.href + '/'));
            const isActive = hasChildInSidebar ? pathname === item.href : (pathname === item.href || pathname?.startsWith(item.href + '/'));
            const Icon = 'icon' in item ? item.icon : null;

            return (
              <Link
                key={item.label}
                href={item.href || '#'}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-jakarta font-medium transition-all duration-200 group ${isActive
                  ? 'bg-brand text-white'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`}
              >
                {Icon && <Icon className="w-4.5 h-4.5 shrink-0" />}
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/10 dark:border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-8 h-8 rounded-full bg-brand/20 flex shrink-0 items-center justify-center text-brand text-sm font-bold overflow-hidden">
              {userAvatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={userAvatar}
                  alt={userName}
                  className="w-full h-full object-cover"
                />
              ) : (
                userInitials
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{userName}</p>
              <p className="text-xs text-gray-500 truncate">{userRole}</p>
            </div>
          </div>
          <Link href="/api/auth/signout" className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
            <LogOut className="w-4 h-4" />
          </Link>
        </div>
      </aside>
    </>
  );
}
