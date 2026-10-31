'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import {
  Search, X, Menu, Moon, Sun, Monitor,
  Home, Newspaper, BookOpen, Wrench, Flag, Building2, TrendingUp, Users, Star,
  Briefcase, CalendarDays, Globe, Mail, Info, ChevronRight, Rocket, LogOut, User, Bookmark, LayoutDashboard,
} from 'lucide-react';
import { useTheme } from '@/components/ThemeProvider';
import { useUser } from '@/components/UserProvider';
import SearchOverlay from './SearchOverlay';
import SignInModal from '@/components/auth/SignInModal';
import ProfileDropdown from '@/components/ProfileDropdown';
import Logo from '@/components/Logo';
import MagneticSubscribeButton from '@/components/MagneticSubscribeButton';

const mainNav = [
  // { label: 'News', href: '/news' }, // temporarily hidden
  { label: 'Founder Stories', href: '/stories' },
  { label: 'AI Tools', href: '/tools' },
  { label: 'AI Startups', href: '/startups' },
  { label: 'AI Jobs', href: '/jobs' },
  { label: 'Events', href: '/events' },
  { label: 'Funding', href: '/funding' },
  { label: 'India AI', href: '/india-ai' },
];

const mobileNav = [
  { label: 'Home', href: '/', icon: Home },
  { label: 'Stories', href: '/stories', icon: BookOpen },
  { label: 'Tools', href: '/tools', icon: Wrench },
  { label: 'Startups', href: '/startups', icon: Building2 },
  { label: 'Funding', href: '/funding', icon: TrendingUp },
];

const mobileMenuNav = [
  { label: 'Home', href: '/', icon: Home },
  { label: 'Founder Stories', href: '/stories', icon: BookOpen },
  { label: 'AI Tools', href: '/tools', icon: Wrench },
  { label: 'AI Startups', href: '/startups', icon: Building2 },
  { label: 'AI Jobs', href: '/jobs', icon: Briefcase },
  { label: 'Events', href: '/events', icon: CalendarDays },
  { label: 'Funding', href: '/funding', icon: TrendingUp },
  { label: 'India AI', href: '/india-ai', icon: Globe },
];

const mobileMenuSecondary = [
  { label: 'Submit Your Startup', href: '/submit-startup', icon: Rocket },
  { label: 'Submit AI Tool', href: '/submit-tool', icon: Wrench },
  { label: 'Newsletter', href: '/newsletter', icon: Mail },
  { label: 'About Us', href: '/about', icon: Info },
  { label: 'Contact', href: '/contact', icon: Mail },
];

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [signInModalOpen, setSignInModalOpen] = useState(false);

  const { user, loading, likelySignedIn, refreshSession } = useUser();
  // Pages are cached for everyone, so sign-in state is only known in the browser: until the session
  // loads, trust this browser's last known state; before even that is read, show neither.
  const showProfile = user || (loading && likelySignedIn === true);
  const showSignIn = !user && (!loading || likelySignedIn === false);

  const pathname = usePathname();
  const router = useRouter();
  const { theme, mode, setMode } = useTheme();
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const themeMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!themeMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (themeMenuRef.current && !themeMenuRef.current.contains(e.target as Node)) {
        setThemeMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [themeMenuOpen]);

  const handleLogout = async () => {
    try {
      await Promise.allSettled([
        fetch('/api/user/auth/logout', { method: 'POST' }),
        fetch('/api/auth/logout', { method: 'POST' }),
      ]);
      window.location.href = '/';
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  // Close menus on route change
  useEffect(() => {
    setMobileOpen(false);
    setSearchOpen(false);
  }, [pathname]);

  // Lock body scroll when mobile menu or search open
  useEffect(() => {
    document.body.style.overflow = mobileOpen || searchOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen, searchOpen]);

  return (
    <>
      {/* Search Overlay */}
      <SearchOverlay isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
      
      {/* Sign In Modal */}
      <SignInModal isOpen={signInModalOpen} onClose={() => { setSignInModalOpen(false); refreshSession(); }} />

      {/* ─── Fixed Header ──────────────────────────── */}
      <header
        className={`fixed top-[36px] left-0 right-0 z-sticky transition-all duration-300 pt-[env(safe-area-inset-top)] ${scrolled
          ? 'bg-white/95 dark:bg-gray-950/95 backdrop-blur-md shadow-sm border-b border-gray-100 dark:border-gray-800'
          : 'bg-white dark:bg-gray-950 border-b border-transparent'
          }`}
      >
        {/* Accent line */}
        <div className="h-[3px] bg-brand w-full" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 sm:h-16">
            {/* Logo */}
            <Link href="/" className="flex items-center shrink-0 [&_img]:!h-[52px] sm:[&_img]:!h-[72px] [&_img]:w-auto">
              <Logo height={72} priority />
            </Link>

            {/* Desktop Nav — hidden on mobile */}
            <nav className="hidden lg:flex items-center gap-1">
              {mainNav.map((item) => {
                const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    className={`px-3 py-2 text-sm font-jakarta font-medium rounded-lg transition-colors ${isActive
                      ? 'text-brand'
                      : 'text-gray-600 dark:text-gray-400 hover:text-navy dark:hover:text-white'
                      }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            {/* Right Actions */}
            <div className="flex items-center gap-2">
              {/* Search */}
              <button
                onClick={() => setSearchOpen(true)}
                className="p-2.5 min-w-[44px] min-h-[44px] rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                aria-label="Search"
              >
                <Search className="w-5 h-5 text-gray-500 dark:text-gray-400" />
              </button>

              {/* Theme Toggle */}
              <div className="relative" ref={themeMenuRef}>
                <button
                  onClick={() => setThemeMenuOpen((v) => !v)}
                  className="p-2.5 min-w-[44px] min-h-[44px] rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  aria-label="Toggle theme"
                >
                  {mode === 'dark' ? (
                    <Moon className="w-5 h-5 text-indigo-400" />
                  ) : mode === 'light' ? (
                    <Sun className="w-5 h-5 text-yellow-500" />
                  ) : (
                    <Monitor className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                  )}
                </button>
                {themeMenuOpen && (
                  <div className="absolute right-0 top-full mt-2 z-overlay w-36 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg overflow-hidden font-jakarta text-sm">
                    {([
                      { value: 'light' as const, label: 'Light', icon: Sun, iconClass: 'text-yellow-500' },
                      { value: 'dark' as const, label: 'Dark', icon: Moon, iconClass: 'text-indigo-400' },
                      { value: 'system' as const, label: 'System', icon: Monitor, iconClass: 'text-gray-500 dark:text-gray-400' },
                    ]).map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => { setMode(opt.value); setThemeMenuOpen(false); }}
                        className={`w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${mode === opt.value ? 'text-brand font-semibold' : 'text-gray-700 dark:text-gray-300'}`}
                      >
                        <opt.icon className={`w-4 h-4 ${mode === opt.value ? 'text-brand' : opt.iconClass}`} />
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* User Profile or Sign In: decided in the browser (see showProfile above) */}
              {showProfile ? (
                <div className="hidden md:block">
                  {user ? (
                    <ProfileDropdown user={user} onLogout={handleLogout} />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse" />
                  )}
                </div>
              ) : showSignIn ? (
                <button
                  onClick={() => setSignInModalOpen(true)}
                  className="hidden md:inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg font-bold text-sm bg-black dark:bg-white text-white dark:text-black hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors shadow-md"
                >
                  Sign In
                </button>
              ) : null}

              {/* Subscribe CTA — hidden on small mobile */}
              <MagneticSubscribeButton />

              {/* Mobile hamburger — visible below lg */}
              <button
                onClick={() => setMobileOpen(true)}
                className="p-2.5 min-w-[44px] min-h-[44px] rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors lg:hidden"
                aria-label="Menu"
              >
                <Menu className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ─── Mobile Side Drawer ─────────────────── */}
      <div
        className={`fixed inset-0 z-overlay lg:hidden transition-opacity duration-300 ${mobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setMobileOpen(false)}
      >
        <div className="absolute inset-0 bg-black/40" />
      </div>
      <aside
        className={`fixed top-0 right-0 bottom-0 z-overlay w-[78%] max-w-[320px] bg-white dark:bg-gray-950 lg:hidden transform transition-transform duration-300 ease-out ${mobileOpen ? 'translate-x-0' : 'translate-x-full'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between px-4 h-14 border-b border-gray-100 dark:border-gray-800 shrink-0">
            {showProfile && user ? (
              <Link href="/profile" onClick={() => setMobileOpen(false)} className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center overflow-hidden shrink-0">
                  {user.avatar ? (
                    <Image src={user.avatar} alt={user.name || 'User'} className="w-full h-full object-cover" width={32} height={32} sizes="32px" />
                  ) : (
                    <span className="text-xs font-bold text-gray-600 dark:text-gray-300">{(user.name || 'U').charAt(0)}</span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-[13px] text-gray-900 dark:text-white truncate leading-tight">{user.name}</p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate leading-tight">{user.email}</p>
                </div>
              </Link>
            ) : (
              <span className="font-sora font-bold text-sm text-gray-900 dark:text-white">Menu</span>
            )}
            <button
              onClick={() => setMobileOpen(false)}
              aria-label="Close menu"
              className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <X className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            </button>
          </div>

          {/* Scrollable content */}
          <nav className="flex-1 overflow-y-auto overscroll-contain py-2">
            {/* Main Navigation */}
            <div className="px-2">
              {mobileMenuNav.map((item) => {
                const isActive = item.href === '/' ? pathname === '/' : pathname === item.href || pathname?.startsWith(item.href + '/');
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-jakarta font-medium transition-colors ${isActive
                      ? 'bg-brand/8 text-brand'
                      : 'text-gray-700 dark:text-gray-300 active:bg-gray-100 dark:active:bg-gray-800'
                    }`}
                  >
                    <item.icon className={`w-[18px] h-[18px] shrink-0 ${isActive ? 'text-brand' : 'text-gray-400 dark:text-gray-500'}`} />
                    {item.label}
                  </Link>
                );
              })}
            </div>

            {/* Divider */}
            <div className="my-2 mx-4 border-t border-gray-100 dark:border-gray-800" />

            {/* Secondary links */}
            <div className="px-2">
              <p className="px-3 py-1.5 text-[10px] font-jakarta font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">More</p>
              {mobileMenuSecondary.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-jakarta font-medium text-gray-600 dark:text-gray-400 active:bg-gray-100 dark:active:bg-gray-800 transition-colors"
                >
                  <item.icon className="w-[18px] h-[18px] shrink-0 text-gray-400 dark:text-gray-500" />
                  {item.label}
                </Link>
              ))}
            </div>

            {/* User account links when signed in */}
            {showProfile && user && (
              <>
                <div className="my-2 mx-4 border-t border-gray-100 dark:border-gray-800" />
                <div className="px-2">
                  <p className="px-3 py-1.5 text-[10px] font-jakarta font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Account</p>
                  <Link href="/profile" onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-jakarta font-medium text-gray-600 dark:text-gray-400 active:bg-gray-100 dark:active:bg-gray-800 transition-colors">
                    <User className="w-[18px] h-[18px] shrink-0 text-gray-400 dark:text-gray-500" />
                    Profile
                  </Link>
                  <Link href="/profile#saved" onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-jakarta font-medium text-gray-600 dark:text-gray-400 active:bg-gray-100 dark:active:bg-gray-800 transition-colors">
                    <Bookmark className="w-[18px] h-[18px] shrink-0 text-gray-400 dark:text-gray-500" />
                    Saved
                  </Link>
                  <Link href="/events/my-events" onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-jakarta font-medium text-gray-600 dark:text-gray-400 active:bg-gray-100 dark:active:bg-gray-800 transition-colors">
                    <CalendarDays className="w-[18px] h-[18px] shrink-0 text-gray-400 dark:text-gray-500" />
                    My Events
                  </Link>
                  {user.founderId && (
                    <Link href="/founder/dashboard" onClick={() => setMobileOpen(false)}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-jakarta font-medium text-gray-600 dark:text-gray-400 active:bg-gray-100 dark:active:bg-gray-800 transition-colors">
                      <LayoutDashboard className="w-[18px] h-[18px] shrink-0 text-gray-400 dark:text-gray-500" />
                      Founder Dashboard
                    </Link>
                  )}
                  {user.organizerId && (
                    <Link href="/organizer" onClick={() => setMobileOpen(false)}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-jakarta font-medium text-gray-600 dark:text-gray-400 active:bg-gray-100 dark:active:bg-gray-800 transition-colors">
                      <LayoutDashboard className="w-[18px] h-[18px] shrink-0 text-gray-400 dark:text-gray-500" />
                      Organizer Dashboard
                    </Link>
                  )}
                </div>
              </>
            )}
          </nav>

          {/* Footer actions — pinned at bottom */}
          <div className="shrink-0 border-t border-gray-100 dark:border-gray-800 px-3 py-3 space-y-2">
            {showProfile && user ? (
              <button
                onClick={() => { handleLogout(); setMobileOpen(false); }}
                className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-lg text-[13px] font-jakarta font-medium text-gray-500 dark:text-gray-400 active:bg-gray-100 dark:active:bg-gray-800 transition-colors"
              >
                <LogOut className="w-[18px] h-[18px]" />
                Sign out
              </button>
            ) : showSignIn ? (
              <button
                onClick={() => { setMobileOpen(false); setSignInModalOpen(true); }}
                className="flex items-center justify-center w-full py-2.5 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-bold text-[13px] font-jakarta active:scale-[0.98] transition-transform"
              >
                Sign In
              </button>
            ) : null}
          </div>
        </div>
      </aside>

      {/* ─── Mobile Bottom Tab Bar ──────────────────── */}
      <nav className="fixed bottom-0 left-0 right-0 z-sticky bg-white/95 dark:bg-gray-950/95 backdrop-blur-md border-t border-gray-100 dark:border-gray-800 lg:hidden pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-stretch justify-around h-16">
          {mobileNav.map((item) => {
            const isActive = item.href === '/' ? pathname === '/' : pathname?.startsWith(item.href);
            return (
              <Link
                key={item.label}
                href={item.href}
                className={`relative flex flex-col items-center justify-center gap-1 px-4 min-w-[60px] min-h-[44px] active:scale-90 transition-transform ${isActive
                  ? 'text-brand'
                  : 'text-gray-400 dark:text-gray-500'
                }`}
              >
                {isActive && (
                  <span className="absolute top-0 left-0 right-0 h-[4px] bg-brand rounded-b-sm" />
                )}
                <item.icon className={`w-5 h-5 ${isActive ? 'stroke-[2.5]' : ''}`} />
                <span className="text-xs font-semibold font-jakarta">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
