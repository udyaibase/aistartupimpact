"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { maskEmail } from "@/lib/mask";

interface ProfileDropdownProps {
  user?: { name?: string; email?: string; avatar?: string | null; founderId?: string | null; organizerId?: string | null; hasEmployer?: boolean } | null;
  onLogout?: () => void;
}

export default function ProfileDropdown({ user, onLogout }: ProfileDropdownProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const handleLogout = async () => {
    try {
      import('@/lib/events/offline-checkin-store').then((m) => m.clearOfflineRosters()).catch(() => {}); // attendee lists saved for offline check-in
      await Promise.allSettled([
        fetch("/api/user/auth/logout", { method: "POST" }),
        fetch("/api/auth/logout", { method: "POST" }),
        // In the organizer portal, also end the organizer session on the server (and its workspace choice).
        ...(pathname?.startsWith("/organizer") ? [fetch("/api/organizer/auth/logout", { method: "POST" })] : []),
      ]);
      if (onLogout) {
        onLogout();
      } else {
        window.location.href = "/";
      }
    } catch {}
  };

  const handleLogoutEverywhere = async () => {
    if (!window.confirm('Sign out on every device? You’ll need to sign in again everywhere, including here.')) return;
    try {
      import('@/lib/events/offline-checkin-store').then((m) => m.clearOfflineRosters()).catch(() => {});
      const res = await fetch("/api/user/auth/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ everywhere: true }) });
      if (!res.ok) { window.alert('Couldn’t sign out everywhere. Please try again.'); return; }
      await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
      if (pathname?.startsWith("/organizer")) await fetch("/api/organizer/auth/logout", { method: "POST" }).catch(() => {});
      if (onLogout) onLogout();
      else window.location.href = "/";
    } catch {
      window.alert('Couldn’t sign out everywhere. Please try again.');
    }
  };

  if (!user) return null;

  const initials = (user.name || "U").charAt(0).toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center overflow-hidden hover:ring-2 hover:ring-gray-200 dark:hover:ring-gray-700 transition-all"
        aria-label="Account menu"
      >
        {user.avatar ? (
          <Image src={user.avatar} alt="" className="w-full h-full object-cover" width={32} height={32} sizes="32px" />
        ) : (
          <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">{initials}</span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-60 bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-gray-200 dark:border-gray-800 overflow-hidden z-overlay">
          {/* User info */}
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
            <p className="text-[13px] font-semibold text-gray-900 dark:text-white truncate">{user.name}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{user.email ? maskEmail(user.email) : ''}</p>
          </div>

          <div className="py-1">
            {pathname?.startsWith('/organizer') ? (
              /* Organizer accounts are separate from the main site's: their profile is the organization page and settings. */
              <>
                <DropdownItem href="/organizer/settings" icon="user" onClick={() => setOpen(false)}>Profile &amp; settings</DropdownItem>
              </>
            ) : (
              <>
                <DropdownItem href={pathname?.startsWith('/founder') ? '/founder/profile' : '/profile'} icon="user" onClick={() => setOpen(false)}>Profile</DropdownItem>
                <DropdownItem href="/profile?tab=saved" icon="bookmark" onClick={() => setOpen(false)}>Saved</DropdownItem>
                <DropdownItem href="/my-applications" icon="briefcase" onClick={() => setOpen(false)}>My Applications</DropdownItem>
                <DropdownItem href="/events/my-events" icon="calendar" onClick={() => setOpen(false)}>My Events</DropdownItem>
              </>
            )}
          </div>

          {/* Workspace switching */}
          <div className="py-1 border-t border-gray-100 dark:border-gray-800">
            {user.founderId && !pathname?.startsWith('/founder') && (
              <DropdownItem href="/founder/dashboard" icon="rocket" onClick={() => setOpen(false)}>Founder Dashboard</DropdownItem>
            )}
            {user.organizerId && !pathname?.startsWith('/organizer') && (
              <DropdownItem href="/organizer" icon="layout" onClick={() => setOpen(false)}>Organizer Dashboard</DropdownItem>
            )}
            {user.hasEmployer && !pathname?.startsWith('/employer') && (
              <DropdownItem href="/employer" icon="briefcase" onClick={() => setOpen(false)}>Hiring portal</DropdownItem>
            )}
            {(pathname?.startsWith('/founder') || pathname?.startsWith('/organizer')) && (
              <DropdownItem href="/" icon="home" onClick={() => setOpen(false)}>Back to Home</DropdownItem>
            )}
          </div>

          <div className="py-1 border-t border-gray-100 dark:border-gray-800">
            <button
              onClick={() => { setOpen(false); handleLogout(); }}
              className="flex items-center gap-2.5 w-full text-left px-4 py-2 text-[13px] text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3-3h-9m9 0-3-3m3 3-3 3" /></svg>
              Sign out
            </button>
            <button
              onClick={() => { setOpen(false); handleLogoutEverywhere(); }}
              className="flex items-center gap-2.5 w-full text-left px-4 py-2 text-[13px] text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25m18 0A2.25 2.25 0 0 0 18.75 3H5.25A2.25 2.25 0 0 0 3 5.25m18 0V12a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 12V5.25" /></svg>
              Sign out everywhere
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function DropdownItem({ href, icon, onClick, children }: { href: string; icon: string; onClick?: () => void; children: React.ReactNode }) {
  const icons: Record<string, React.ReactNode> = {
    user: <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" /></svg>,
    bookmark: <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" /></svg>,
    briefcase: <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 0 0 .75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 0 0-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0 1 12 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 0 1-.673-.38m0 0A2.18 2.18 0 0 1 3 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 0 1 3.413-.387m7.5 0V5.25A2.25 2.25 0 0 0 13.5 3h-3a2.25 2.25 0 0 0-2.25 2.25v.894m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>,
    calendar: <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" /></svg>,
    rocket: <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 0 1-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 0 0 6.16-12.12A14.98 14.98 0 0 0 9.631 8.41m5.96 5.96a14.926 14.926 0 0 1-5.841 2.58m-.119-8.54a6 6 0 0 0-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 0 0-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 0 1-2.448-2.448 14.9 14.9 0 0 1 .06-.312m-2.24 2.39a4.493 4.493 0 0 0-1.757 4.306 4.493 4.493 0 0 0 4.306-1.758M16.5 9a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z" /></svg>,
    layout: <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" /></svg>,
    home: <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" /></svg>,
  };

  return (
    <Link
      href={href}
      onClick={onClick}
      className="flex items-center gap-2.5 px-4 py-2 text-[13px] text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
    >
      {icons[icon]}
      {children}
    </Link>
  );
}
