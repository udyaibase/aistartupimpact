'use client';

import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import Link from 'next/link';
import { PanelLeftClose, PanelLeft } from 'lucide-react';
import { useSidebar } from './SidebarContext';
import type { ReactNode } from 'react';

interface CollapsibleSidebarProps {
  logoHref: string;
  children: ReactNode;
  bottomSlot?: ReactNode;
  collapsedBottomSlot?: ReactNode;
}

export default function CollapsibleSidebar({ logoHref, children, bottomSlot, collapsedBottomSlot }: CollapsibleSidebarProps) {
  const { collapsed, toggle } = useSidebar();
  const [showTip, setShowTip] = useState(false);
  const toggleRef = useRef<HTMLDivElement>(null);
  const [tipPos, setTipPos] = useState({ top: 0, left: 0 });

  const handleToggleEnter = () => {
    if (toggleRef.current) {
      const rect = toggleRef.current.getBoundingClientRect();
      setTipPos({ top: rect.top + rect.height / 2, left: rect.right + 8 });
    }
    setShowTip(true);
  };

  return (
    <aside
      className={`h-screen bg-white dark:bg-gray-950 border-r border-gray-100 dark:border-gray-800 flex flex-col shrink-0 transition-[width] duration-200 ease-in-out ${
        collapsed ? 'w-[68px]' : 'w-[240px]'
      }`}
    >
      {/* Logo: same height as the portal header (h-14) so the two borders line up. */}
      <div className={`h-14 shrink-0 flex items-center border-b border-gray-100 dark:border-gray-800 ${collapsed ? 'justify-center px-2' : 'px-4'}`}>
        <Link href={logoHref} className="flex items-center gap-2 overflow-hidden">
          <Image src="/logo-light.svg" alt={collapsed ? 'Udyaibase' : ''} width={56} height={56} sizes="56px" className="h-12 w-auto shrink-0 dark:hidden" />
          <Image src="/logo-dark.svg" alt={collapsed ? 'Udyaibase' : ''} width={56} height={56} sizes="56px" className="h-12 w-auto shrink-0 hidden dark:block" />
          {!collapsed && (
            <>
              {/* Wordmark: each A is the font’s own V flipped vertically (not rotated, which would move the letter spacing to its left), so it matches the other letters' height and weight
                  (Greek Λ isn't in Sora and falls back to another font). Screen readers get the plain name. */}
              <span aria-hidden="true" className="font-sora font-semibold text-[17px] leading-none tracking-[0.14em] text-black dark:text-white whitespace-nowrap">
                UDY<span className="relative -top-[0.05em] inline-block -scale-y-100">V</span>IB<span className="relative -top-[0.05em] inline-block -scale-y-100">V</span>SE
              </span>
              <span className="sr-only">Udyaibase</span>
            </>
          )}
        </Link>
      </div>

      {/* Nav content from each portal */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {children}
      </div>

      {/* Bottom slot (upgrade card etc.) */}
      {bottomSlot && (
        <div className="border-t border-gray-100 dark:border-gray-800 p-3">
          {collapsed ? (
            <div className="flex justify-center">
              {collapsedBottomSlot}
            </div>
          ) : bottomSlot}
        </div>
      )}

      {/* Collapse toggle */}
      <div
        ref={toggleRef}
        className={`border-t border-gray-100 dark:border-gray-800 p-2 ${collapsed ? 'flex justify-center' : ''}`}
        onMouseEnter={collapsed ? handleToggleEnter : undefined}
        onMouseLeave={() => setShowTip(false)}
      >
        <button
          onClick={toggle}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] font-jakarta font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors w-full ${
            collapsed ? 'justify-center' : ''
          }`}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <PanelLeft className="w-5 h-5 shrink-0" />
          ) : (
            <>
              <PanelLeftClose className="w-[18px] h-[18px] shrink-0" />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>

      {collapsed && showTip && createPortal(
        <div
          style={{ top: tipPos.top, left: tipPos.left, transform: 'translateY(-50%)' }}
          className="fixed px-2.5 py-1.5 rounded-lg bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-xs font-jakarta font-medium whitespace-nowrap z-[9999] shadow-lg pointer-events-none"
        >
          Expand
          <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-gray-900 dark:border-r-gray-100" />
        </div>,
        document.body
      )}
    </aside>
  );
}
