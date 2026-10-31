'use client';

import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Lock, type LucideIcon } from 'lucide-react';
import { useSidebar } from './SidebarContext';

export interface NavItem {
  label: string;
  href?: string;
  icon?: LucideIcon;
  exact?: boolean;
  locked?: boolean;
  badge?: string;
  count?: number;
  type?: 'divider';
}

interface SidebarNavProps {
  items: NavItem[];
  topSlot?: React.ReactNode;
}

function Tooltip({ label, children }: { label: string; children: React.ReactNode }) {
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
    <div ref={ref} onMouseEnter={handleEnter} onMouseLeave={() => setShow(false)}>
      {children}
      {show && createPortal(
        <div
          style={{ top: pos.top, left: pos.left, transform: 'translateY(-50%)' }}
          className="fixed px-2.5 py-1.5 rounded-lg bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-xs font-jakarta font-medium whitespace-nowrap z-[9999] shadow-lg pointer-events-none"
        >
          {label}
          <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-gray-900 dark:border-r-gray-100" />
        </div>,
        document.body
      )}
    </div>
  );
}

export default function SidebarNav({ items, topSlot }: SidebarNavProps) {
  const pathname = usePathname();
  const { collapsed } = useSidebar();

  const isActive = (href: string, exact?: boolean) => {
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(href + '/');
  };

  return (
    <nav className="py-2 px-3">
      {topSlot}

      {items.map((item, i) => {
        if (item.type === 'divider') {
          if (collapsed) return <div key={i} className="my-2 mx-3 border-t border-gray-100 dark:border-gray-800" />;
          return (
            <p key={i} className="text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 px-3 pt-5 pb-1.5 font-jakarta">
              {item.label}
            </p>
          );
        }

        const Icon = item.icon!;
        const active = isActive(item.href!, item.exact);

        if (item.locked) {
          const lockedContent = (
            <div
              className={`flex items-center ${collapsed ? 'justify-center' : 'justify-between'} px-3 py-2 rounded-lg text-[13px] font-jakarta font-medium text-gray-400 dark:text-gray-600 cursor-not-allowed opacity-60`}
            >
              <div className={`flex items-center ${collapsed ? '' : 'gap-2.5'}`}>
                <Icon className="text-gray-300 dark:text-gray-600 shrink-0 ${collapsed ? 'w-5 h-5' : 'w-[18px] h-[18px]'}" />
                {!collapsed && <span>{item.label}</span>}
              </div>
              {!collapsed && (
                <div className="flex items-center gap-1">
                  <Lock className="w-3 h-3" />
                  <span className="text-xs font-bold uppercase tracking-wide">Pro</span>
                </div>
              )}
            </div>
          );

          return collapsed ? (
            <Tooltip key={item.href} label={`${item.label} (Pro)`}>{lockedContent}</Tooltip>
          ) : (
            <div key={item.href} title="Premium feature — coming soon">{lockedContent}</div>
          );
        }

        const linkContent = (
          <Link
            href={item.href!}
            data-tour={`nav:${item.href}`}
            className={`flex items-center ${collapsed ? 'justify-center' : 'gap-2.5'} px-3 py-2 rounded-lg text-[13px] font-jakarta font-medium transition-all duration-150 ${
              active
                ? 'bg-brand/8 text-brand font-semibold'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-900'
            }`}
          >
            <Icon className={`shrink-0 ${collapsed ? 'w-5 h-5' : 'w-[18px] h-[18px]'} ${active ? 'text-brand' : 'text-gray-400 dark:text-gray-500'}`} />
            {!collapsed && (
              <span className="flex-1 flex items-center justify-between">
                <span>{item.label}</span>
                {item.count != null && item.count > 0 && (
                  <span className="text-[11px] font-semibold text-gray-400 font-jakarta tabular-nums">{item.count}</span>
                )}
                {item.badge && (
                  <span className="text-[10px] font-bold uppercase tracking-wide text-brand bg-brand/10 px-1.5 py-0.5 rounded font-jakarta">{item.badge}</span>
                )}
              </span>
            )}
          </Link>
        );

        return collapsed ? (
          <Tooltip key={item.href} label={item.label}>{linkContent}</Tooltip>
        ) : (
          <div key={item.href}>{linkContent}</div>
        );
      })}
    </nav>
  );
}
