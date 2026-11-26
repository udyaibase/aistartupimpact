'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CornerDownLeft, FileSearch, LayoutDashboard, Loader2, Search } from 'lucide-react';
import { navFor } from '@/components/nav/nav-config';
import { useAttention } from '@/components/nav/AttentionProvider';
import { useSidebar } from '@/app/(dashboard)/components/Sidebar';

interface Hit { kind: string; label: string; detail: string; href: string }
interface Row { label: string; href: string; group: string; icon: React.ComponentType<{ className?: string }>; words: string; waiting: number }

/** Every word typed must appear in the section's name, group or search words. Name matches come first. */
export function searchNav(rows: Row[], query: string): Row[] {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return rows;
  const scored = rows
    .map((r) => {
      const name = r.label.toLowerCase();
      const all = `${name} ${r.group.toLowerCase()} ${r.words}`;
      if (!terms.every((t) => all.includes(t))) return null;
      const score = (name.startsWith(terms[0]) ? 0 : name.includes(terms[0]) ? 1 : 2);
      return { r, score };
    })
    .filter(Boolean) as { r: Row; score: number }[];
  return scored.sort((a, b) => a.score - b.score).map((x) => x.r);
}

/**
 * Search the admin: Ctrl+K (Cmd+K on a Mac), type a few letters, Enter. It finds sections straight away and, from
 * two letters on, records too (a company, founder, article, startup, tool, event, ticket or website user) limited
 * to what the signed-in role can open. With nothing typed it lists the sections that have work waiting first.
 */
export default function CommandPalette({ role }: { role: string }) {
  const { paletteOpen, closePalette } = useSidebar();
  const { counts } = useAttention();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const [hits, setHits] = useState<Hit[]>([]);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const rows = useMemo<Row[]>(() => {
    const items = navFor(role).flatMap((g) => g.items.map((i) => ({ label: i.label, href: i.href, group: g.label, icon: i.icon, words: i.words ?? '', waiting: counts[i.href] ?? 0 })));
    const home: Row = { label: 'Dashboard', href: '/dashboard', group: 'Home', icon: LayoutDashboard, words: 'home overview needs attention', waiting: 0 };
    return [home, ...items];
  }, [role, counts]);

  const results = useMemo(() => {
    const found = searchNav(rows, query);
    // Nothing typed: what needs doing first, then everything in menu order.
    return query.trim() ? found : [...found.filter((r) => r.waiting > 0), ...found.filter((r) => r.waiting === 0)];
  }, [rows, query]);

  useEffect(() => {
    if (!paletteOpen) return;
    setQuery('');
    setIndex(0);
    const previous = document.activeElement as HTMLElement | null;
    inputRef.current?.focus();
    return () => previous?.focus?.();
  }, [paletteOpen]);
  useEffect(() => { setIndex(0); }, [query]);

  // Records: asked for a moment after typing stops; an answer for an older query is dropped.
  useEffect(() => {
    const q = query.trim();
    if (!paletteOpen || q.length < 2) { setHits([]); setSearching(false); return; }
    const controller = new AbortController();
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/search?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        const data = res.ok ? await res.json() : { hits: [] };
        setHits(Array.isArray(data.hits) ? data.hits : []);
        setSearching(false);
      } catch (e) {
        if ((e as Error).name !== 'AbortError') { setHits([]); setSearching(false); }
      }
    }, 220);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, paletteOpen]);
  useEffect(() => { listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }); }, [index]);

  if (!paletteOpen) return null;

  const go = (href: string) => { closePalette(); router.push(href); };
  const total = results.length + hits.length;
  const hrefAt = (i: number) => (i < results.length ? results[i]?.href : hits[i - results.length]?.href);
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); closePalette(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setIndex((i) => Math.min(i + 1, total - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIndex((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && hrefAt(index)) { e.preventDefault(); go(hrefAt(index)!); }
    else if (e.key === 'Tab') { e.preventDefault(); } // keep focus in the search box while it is open
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center px-4 pt-[12vh]" onKeyDown={onKeyDown}>
      <div className="absolute inset-0 bg-black/50" onClick={closePalette} aria-hidden />
      <div role="dialog" aria-modal="true" aria-label="Search the admin" className="relative w-full max-w-xl rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-4 border-b border-gray-200 dark:border-gray-800">
          <Search className="w-4 h-4 text-gray-500 shrink-0" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Go to a section, or find a company, person, article…"
            role="combobox"
            aria-expanded="true"
            aria-controls="admin-search-results"
            aria-activedescendant={index < total ? `admin-search-${index}` : undefined}
            aria-label="Search sections and records"
            autoComplete="off"
            spellCheck={false}
            className="w-full h-12 bg-transparent text-[15px] text-gray-900 dark:text-white placeholder:text-gray-500 focus:outline-none"
          />
          <kbd className="shrink-0 text-[11px] font-mono text-gray-500 border border-gray-200 dark:border-gray-700 rounded px-1.5 py-0.5">Esc</kbd>
        </div>
        <ul ref={listRef} id="admin-search-results" role="listbox" aria-label="Sections and records" className="max-h-[52vh] overflow-y-auto p-2">
          {total === 0 && !searching && <li role="presentation" className="px-3 py-6 text-sm text-center text-gray-600 dark:text-gray-400">Nothing matches “{query}”.</li>}
          {results.map((r, i) => {
            const Icon = r.icon;
            const selected = i === index;
            return (
              <li
                key={r.href}
                id={`admin-search-${i}`}
                role="option"
                aria-selected={selected}
                onMouseEnter={() => setIndex(i)}
                onClick={() => go(r.href)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer text-sm ${selected ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}
              >
                <Icon className="w-4 h-4 shrink-0 text-gray-500" />
                <span className="font-medium truncate">{r.label}</span>
                <span className="text-xs text-gray-500 truncate">{r.group}</span>
                {r.waiting > 0 && <span className="ml-auto shrink-0 rounded-full bg-amber-100 text-amber-900 dark:bg-amber-400/20 dark:text-amber-200 text-xs font-semibold px-2 py-0.5">{r.waiting} waiting</span>}
                {selected && <CornerDownLeft className={`w-3.5 h-3.5 text-gray-400 shrink-0 ${r.waiting > 0 ? '' : 'ml-auto'}`} aria-hidden />}
              </li>
            );
          })}
          {(hits.length > 0 || searching) && (
            <li role="presentation" className="flex items-center gap-2 px-3 pt-3 pb-1 text-xs font-semibold text-gray-600 dark:text-gray-400">
              Records {searching && <Loader2 className="w-3 h-3 animate-spin" aria-label="Searching" />}
            </li>
          )}
          {hits.map((h, n) => {
            const i = results.length + n;
            const selected = i === index;
            return (
              <li key={`${h.kind}-${h.href}-${n}`} id={`admin-search-${i}`} role="option" aria-selected={selected} onMouseEnter={() => setIndex(i)} onClick={() => go(h.href)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer text-sm ${selected ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}>
                <FileSearch className="w-4 h-4 shrink-0 text-gray-500" aria-hidden />
                <span className="min-w-0">
                  <span className="block font-medium truncate">{h.label}</span>
                  <span className="block text-xs text-gray-600 dark:text-gray-400 truncate">{h.kind}{h.detail ? ` · ${h.detail}` : ''}</span>
                </span>
                {selected && <CornerDownLeft className="w-3.5 h-3.5 text-gray-400 shrink-0 ml-auto" aria-hidden />}
              </li>
            );
          })}
        </ul>
        <p className="px-4 py-2 border-t border-gray-200 dark:border-gray-800 text-xs text-gray-500">↑ ↓ to move · Enter to open · Esc to close</p>
      </div>
    </div>
  );
}
