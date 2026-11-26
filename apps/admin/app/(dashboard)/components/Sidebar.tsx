'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronsLeft, ChevronsRight, Inbox, LayoutDashboard, LogOut, Pin, PinOff, Search, X } from 'lucide-react';
import { activeHref, navFor, type NavItem } from '@/components/nav/nav-config';
import { useAttention } from '@/components/nav/AttentionProvider';

/**
 * Admin menu state, kept in this browser: which groups are open, which sections are pinned, and whether the menu
 * is narrow (icons only). Read after the page loads, so the first paint is always the same on server and browser.
 */
const KEYS = { open: 'admin-nav-open', pins: 'admin-nav-pins', narrow: 'admin-nav-narrow' };

interface SidebarState {
  /** Phone drawer. */
  isOpen: boolean;
  toggle: () => void;
  close: () => void;
  narrow: boolean;
  toggleNarrow: () => void;
  pins: string[];
  togglePin: (href: string) => void;
  paletteOpen: boolean;
  openPalette: () => void;
  closePalette: () => void;
}

const SidebarContext = createContext<SidebarState>({
  isOpen: false, toggle: () => {}, close: () => {}, narrow: false, toggleNarrow: () => {}, pins: [], togglePin: () => {},
  paletteOpen: false, openPalette: () => {}, closePalette: () => {},
});

export function useSidebar() {
  return useContext(SidebarContext);
}

function readList(key: string): string[] | null {
  try {
    const v = JSON.parse(window.localStorage.getItem(key) ?? 'null');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : null;
  } catch { return null; }
}
function save(key: string, value: unknown) {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* private window: keep it for this visit only */ }
}

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const [pins, setPins] = useState<string[]>([]);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => { setIsOpen(false); setPaletteOpen(false); }, [pathname]);
  useEffect(() => {
    setPins(readList(KEYS.pins) ?? []);
    try { setNarrow(window.localStorage.getItem(KEYS.narrow) === '1'); } catch { /* default wide */ }
  }, []);

  // Ctrl+K / Cmd+K opens search from anywhere, including while typing in a form.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaletteOpen((v) => !v); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const value: SidebarState = {
    isOpen,
    toggle: () => setIsOpen((v) => !v),
    close: () => setIsOpen(false),
    narrow,
    toggleNarrow: () => setNarrow((v) => { try { window.localStorage.setItem(KEYS.narrow, v ? '0' : '1'); } catch { /* ignore */ } return !v; }),
    pins,
    togglePin: (href) => setPins((p) => { const next = p.includes(href) ? p.filter((h) => h !== href) : [...p, href]; save(KEYS.pins, next); return next; }),
    paletteOpen,
    openPalette: () => setPaletteOpen(true),
    closePalette: () => setPaletteOpen(false),
  };
  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}

const Count = ({ n, narrow }: { n: number; narrow?: boolean }) => (
  <span
    aria-label={`${n} waiting`}
    className={narrow
      ? 'absolute -top-0.5 -right-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-amber-400 text-gray-900 text-[11px] font-bold leading-none tabular-nums'
      : 'ml-auto shrink-0 inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full bg-amber-400/90 text-gray-900 text-[11px] font-bold leading-none tabular-nums'}
  >
    {n > 99 ? '99+' : n}
  </span>
);

export function AdminSidebar({ session }: { session: any }) {
  const pathname = usePathname();
  const { isOpen, close, narrow, toggleNarrow, pins, togglePin, openPalette } = useSidebar();
  const { counts, total } = useAttention();
  const role: string = session?.user?.role || '';
  const userName = session?.user?.name || 'Admin';
  const userAvatar = session?.user?.image || session?.user?.avatar;

  const groups = useMemo(() => navFor(role), [role]);
  const current = activeHref(pathname);
  const activeGroup = groups.find((g) => g.items.some((i) => i.href === current))?.id;

  // Open groups: what was left open last time, plus always the group of the page being viewed.
  const [open, setOpen] = useState<string[]>([]);
  useEffect(() => { setOpen(readList(KEYS.open) ?? ['content', 'review']); }, []);
  const isGroupOpen = (id: string) => open.includes(id) || id === activeGroup;
  const toggleGroup = useCallback((id: string) => {
    setOpen((o) => { const next = o.includes(id) ? o.filter((x) => x !== id) : [...o, id]; save(KEYS.open, next); return next; });
  }, []);

  const pinned = pins.map((href) => groups.flatMap((g) => g.items).find((i) => i.href === href)).filter(Boolean) as NavItem[];
  // The narrow menu only applies on wide screens; the phone drawer is always full width.
  const rail = narrow && !isOpen;

  const itemClass = (active: boolean) => `group/item relative flex items-center gap-3 rounded-lg text-sm font-jakarta font-medium transition-colors ${rail ? 'justify-center h-10 w-10 mx-auto' : 'px-3 py-2'} ${active ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'}`;

  const renderItem = (item: NavItem, opts: { pinnedRow?: boolean } = {}) => {
    const active = item.href === current;
    const n = counts[item.href] ?? 0;
    const Icon = item.icon;
    const isPinned = pins.includes(item.href);
    return (
      <li key={`${opts.pinnedRow ? 'pin:' : ''}${item.href}`} className="relative group/row">
        <Link href={item.href} title={rail ? item.label : undefined} aria-current={active ? 'page' : undefined} className={itemClass(active)}>
          {active && !rail && <span aria-hidden className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-brand" />}
          <Icon className="w-[18px] h-[18px] shrink-0" aria-hidden />
          {rail ? <span className="sr-only">{item.label}</span> : <span className="truncate">{item.label}</span>}
          {n > 0 && <Count n={n} narrow={rail} />}
        </Link>
        {!rail && (
          <button
            type="button"
            onClick={() => togglePin(item.href)}
            aria-label={isPinned ? `Unpin ${item.label}` : `Pin ${item.label} to the top`}
            aria-pressed={isPinned}
            className={`absolute top-1/2 -translate-y-1/2 p-1.5 rounded-md text-gray-500 hover:text-white hover:bg-white/10 focus-visible:opacity-100 ${n > 0 ? 'right-9' : 'right-1.5'} ${isPinned && opts.pinnedRow ? 'opacity-100' : 'opacity-0 group-hover/row:opacity-100'}`}
          >
            {isPinned ? <PinOff className="w-3.5 h-3.5" aria-hidden /> : <Pin className="w-3.5 h-3.5" aria-hidden />}
          </button>
        )}
      </li>
    );
  };

  return (
    <>
      {isOpen && <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={close} />}

      <aside
        aria-label="Admin menu"
        className={`on-dark fixed inset-y-0 left-0 z-50 ${rail ? 'lg:w-16' : ''} w-64 bg-navy dark:bg-gray-900 text-white flex flex-col shrink-0 border-r border-white/5 dark:border-gray-800 transform transition-[transform,width] duration-200 ease-in-out lg:relative lg:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className={`h-16 flex items-center border-b border-white/10 dark:border-gray-800 ${rail ? 'justify-center px-2' : 'justify-between px-5'}`}>
          <Link href="/dashboard" className="flex items-center gap-2" aria-label="Udyaibase admin home">
            <span className="font-sora font-extrabold text-lg"><span className="text-[#F0555A]">U</span><span className="text-white">B</span></span>
            {!rail && <span className="text-gray-400 text-xs font-jakarta">Admin</span>}
          </Link>
          <button onClick={close} aria-label="Close menu" className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors lg:hidden">
            <X className="w-5 h-5" aria-hidden />
          </button>
        </div>

        <div className={rail ? 'px-2 pt-3' : 'px-3 pt-3'}>
          <button
            type="button"
            onClick={openPalette}
            title={rail ? 'Search (Ctrl+K)' : undefined}
            className={`flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 text-sm text-gray-400 hover:text-white hover:border-white/20 transition-colors ${rail ? 'justify-center h-10 w-10 mx-auto' : 'w-full px-3 py-2'}`}
          >
            <Search className="w-4 h-4 shrink-0" aria-hidden />
            {rail ? <span className="sr-only">Search</span> : <><span>Search</span><kbd className="ml-auto text-[11px] font-mono text-gray-500 border border-white/10 rounded px-1.5 py-0.5">Ctrl K</kbd></>}
          </button>
        </div>

        <nav className={`flex-1 overflow-y-auto py-3 ${rail ? 'px-2' : 'px-3'}`}>
          <ul className="space-y-0.5">
            <li>
              <Link href="/dashboard" title={rail ? 'Dashboard' : undefined} aria-current={pathname === '/dashboard' ? 'page' : undefined} className={itemClass(pathname === '/dashboard')}>
                <LayoutDashboard className="w-[18px] h-[18px] shrink-0" aria-hidden />
                {rail ? <span className="sr-only">Dashboard</span> : <span>Dashboard</span>}
              </Link>
            </li>
            <li>
              <Link href="/dashboard#needs-attention" title={rail ? `Needs attention (${total})` : undefined} className={itemClass(false)}>
                <Inbox className="w-[18px] h-[18px] shrink-0" aria-hidden />
                {rail ? <span className="sr-only">Needs attention</span> : <span>Needs attention</span>}
                {total > 0 && <Count n={total} narrow={rail} />}
              </Link>
            </li>
          </ul>

          {pinned.length > 0 && (
            <div className="mt-3">
              {!rail && <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-500">Pinned</p>}
              {rail && <div aria-hidden className="mx-3 my-2 border-t border-white/10" />}
              <ul className="space-y-0.5">{pinned.map((i) => renderItem(i, { pinnedRow: true }))}</ul>
            </div>
          )}

          {groups.map((g) => {
            const groupCount = g.items.reduce((n, i) => n + (counts[i.href] ?? 0), 0);
            const expanded = rail || isGroupOpen(g.id);
            return (
              <div key={g.id} className="mt-3">
                {rail ? (
                  <div aria-hidden className="mx-3 my-2 border-t border-white/10" />
                ) : (
                  <button
                    type="button"
                    onClick={() => toggleGroup(g.id)}
                    aria-expanded={expanded}
                    aria-controls={`nav-${g.id}`}
                    className="w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-[11px] font-semibold uppercase tracking-wider text-gray-500 hover:text-gray-300 transition-colors"
                  >
                    <span>{g.label}</span>
                    {!expanded && groupCount > 0 && <span aria-label={`${groupCount} waiting`} className="w-1.5 h-1.5 rounded-full bg-amber-400" />}
                    <ChevronDown className={`ml-auto w-3.5 h-3.5 transition-transform ${expanded ? '' : '-rotate-90'}`} aria-hidden />
                  </button>
                )}
                {expanded && (
                  <ul id={`nav-${g.id}`} className="space-y-0.5">
                    {g.items.map((i) => renderItem(i))}
                  </ul>
                )}
              </div>
            );
          })}
        </nav>

        <div className={`border-t border-white/10 dark:border-gray-800 ${rail ? 'p-2 space-y-1' : 'p-3'}`}>
          <div className={`flex items-center ${rail ? 'flex-col gap-1' : 'gap-3'}`}>
            <div className="w-8 h-8 rounded-full bg-white/10 flex shrink-0 items-center justify-center text-white text-sm font-bold overflow-hidden" title={rail ? userName : undefined}>
              {userAvatar
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={userAvatar} alt="" className="w-full h-full object-cover" />
                : userName.substring(0, 2).toUpperCase()}
            </div>
            {!rail && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{userName}</p>
                <p className="text-xs text-gray-400 truncate">{role.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}</p>
              </div>
            )}
            <button
              type="button"
              onClick={toggleNarrow}
              aria-label={narrow ? 'Widen the menu' : 'Narrow the menu to icons'}
              aria-pressed={narrow}
              className="hidden lg:inline-flex p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            >
              {narrow ? <ChevronsRight className="w-4 h-4" aria-hidden /> : <ChevronsLeft className="w-4 h-4" aria-hidden />}
            </button>
            <Link href="/api/auth/signout" aria-label="Sign out" title="Sign out" className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
              <LogOut className="w-4 h-4" aria-hidden />
            </Link>
          </div>
        </div>
      </aside>
    </>
  );
}
