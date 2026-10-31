"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { Bell, HelpCircle, Search } from "lucide-react";
import { usePathname } from "next/navigation";
import { hasGuide, openGuide } from "./guide/GuideHost";
import ProfileDropdown from "@/components/ProfileDropdown";
import ThemeToggle from "@/components/ThemeToggle";
import CommandPalette from "./CommandPalette";

interface Props {
  organizer: { name: string; email: string; company?: string; avatar?: string };
}

export default function OrganizerHeader({ organizer }: Props) {
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
      <header className="h-14 bg-white dark:bg-gray-950 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between px-4 md:px-6 shrink-0">
        {/* Left: Mobile logo + Search trigger */}
        <div className="flex items-center gap-3">
          <Link href="/organizer" className="md:hidden flex items-center gap-2">
            <Image src="/logo-light.svg" alt="Udyaibase" width={24} height={24} sizes="24px" className="h-6 w-auto dark:hidden" />
            <Image src="/logo-dark.svg" alt="Udyaibase" width={24} height={24} sizes="24px" className="h-6 w-auto hidden dark:block" />
          </Link>
          <button
            onClick={() => setCommandOpen(true)}
            data-tour="search"
            className="hidden md:flex items-center gap-2 w-80 lg:w-96 pl-3 pr-3 py-1.5 rounded-md border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 text-sm font-jakarta text-gray-400 hover:border-gray-300 dark:hover:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
          >
            <Search className="w-4 h-4 text-gray-400 shrink-0" />
            <span className="flex-1 text-left">Search events, attendees...</span>
            <kbd className="text-[10px] font-jakarta font-medium text-gray-400 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-1.5 py-0.5">⌘K</kbd>
          </button>
          <button
            onClick={() => setCommandOpen(true)}
            className="md:hidden w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md"
          >
            <Search className="w-4 h-4" />
          </button>
        </div>

        {/* Right */}
        <div className="flex items-center gap-2">
          {hasGuide(pathname) && (
            <button
              onClick={openGuide}
              data-tour="guide"
              aria-label="Open the guide for this page"
              className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md text-sm font-jakarta font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <HelpCircle className="w-4 h-4" aria-hidden />
              <span className="hidden sm:inline">Guide</span>
            </button>
          )}
          <ThemeToggle />
          <button className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md relative">
            <Bell className="w-4 h-4" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-brand rounded-full" />
          </button>
          <ProfileDropdown user={{ name: organizer.name, email: organizer.email, avatar: organizer.avatar }} />
        </div>
      </header>

      <CommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} />
    </>
  );
}
