"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { HelpCircle, Search } from "lucide-react";
import { usePathname } from "next/navigation";
import { hasGuide, openGuide } from "./guide/GuideHost";
import ProfileDropdown from "@/components/ProfileDropdown";
import ThemeToggle from "@/components/ThemeToggle";
import CommandPalette, { ORGANIZER_ACTIONS, ORGANIZER_PAGES } from "./CommandPalette";
import { canOpen, OWNER_ACCESS, type NavAccess } from "@/lib/organizer-auth/nav";

interface Props {
  organizer: { name: string; email: string; company?: string; avatar?: string };
  access?: NavAccess;
}

export default function OrganizerHeader({ organizer, access = OWNER_ACCESS }: Props) {
  const [commandOpen, setCommandOpen] = useState(false);
  const pathname = usePathname();

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      setCommandOpen(prev => !prev);
    }
  }, []);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <>
      {/* Phones: brand on the left, actions on the right (like a native app bar), clear of the notch in the installed app.
          Computers: the search bar on the left; the brand is in the sidebar. */}
      <header className="relative z-sticky shrink-0 bg-white/95 dark:bg-gray-950/95 backdrop-blur-md border-b border-gray-100 dark:border-gray-800 pt-[env(safe-area-inset-top)]">
        <div className="h-14 flex items-center justify-between gap-2 px-4 md:px-6">
          <Link href="/organizer" aria-label="Udyaibase organizer home" className="md:hidden flex items-center shrink-0 rounded-[10px] active:opacity-70">
            <Image src="/logo-light.svg" alt="" width={48} height={48} sizes="48px" priority className="h-12 w-12 shrink-0 dark:hidden" />
            <Image src="/logo-dark.svg" alt="" width={48} height={48} sizes="48px" priority className="h-12 w-12 shrink-0 hidden dark:block" />
          </Link>

          <button
            onClick={() => setCommandOpen(true)}
            data-tour="search"
            className="hidden md:flex items-center gap-2 w-80 lg:w-96 h-9 px-3 rounded-[10px] border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 text-sm font-jakarta text-gray-400 hover:border-gray-300 dark:hover:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
          >
            <Search className="w-4 h-4 text-gray-400 shrink-0" aria-hidden />
            <span className="flex-1 text-left">Search events, attendees...</span>
            <kbd className="text-[10px] font-jakarta font-medium text-gray-400 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-1.5 py-0.5">⌘K</kbd>
          </button>

          {/* Right: actions */}
          <div className="flex items-center gap-0.5 sm:gap-1.5 shrink-0">
            <button
              onClick={() => setCommandOpen(true)}
              aria-label="Search events, attendees and pages"
              className="md:hidden w-10 h-10 flex items-center justify-center rounded-full text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 active:bg-gray-200 dark:active:bg-gray-700 transition-colors"
            >
              <Search className="w-5 h-5" aria-hidden />
            </button>
            {hasGuide(pathname) && (
              <button
                onClick={openGuide}
                data-tour="guide"
                aria-label="Open the guide for this page"
                className="inline-flex items-center justify-center gap-1.5 w-10 h-10 sm:w-auto sm:h-9 sm:px-2.5 rounded-full sm:rounded-[10px] text-sm font-jakarta font-medium text-gray-700 sm:text-gray-600 dark:text-gray-200 sm:dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 active:bg-gray-200 dark:active:bg-gray-700 transition-colors"
              >
                <HelpCircle className="w-5 h-5 sm:w-4 sm:h-4" aria-hidden />
                <span className="hidden sm:inline">Guide</span>
              </button>
            )}
            <div className="organizer-header-theme"><ThemeToggle /></div>
            <div className="ml-1"><ProfileDropdown user={{ name: organizer.name, email: organizer.email, avatar: organizer.avatar }} /></div>
          </div>
        </div>
      </header>

      <CommandPalette open={commandOpen} onClose={() => setCommandOpen(false)}
        pages={ORGANIZER_PAGES.filter((p) => canOpen(p.href, access))}
        actions={ORGANIZER_ACTIONS.filter((a) => canOpen(a.href, access))} />
    </>
  );
}
