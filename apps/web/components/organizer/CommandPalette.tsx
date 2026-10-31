"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { CreditCard,
  Search, LayoutDashboard, CalendarDays, Users, BarChart3,
  Settings, Send, QrCode, HelpCircle, Plus, X, ArrowRight,
  Clock, Zap,
} from "lucide-react";

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  /** Defaults to the organizer portal; the employer portal passes its own. */
  pages?: SearchResult[];
  actions?: SearchResult[];
  search?: (q: string) => Promise<SearchResult[]>;
  placeholder?: string;
  resultsLabel?: string;
}

export interface SearchResult {
  id: string;
  label: string;
  description?: string;
  href: string;
  icon: React.ReactNode;
  category: "page" | "action" | "event";
}

const PAGES: SearchResult[] = [
  { id: "home", label: "Home", description: "Overview & stats", href: "/organizer", icon: <LayoutDashboard className="w-4 h-4" />, category: "page" },
  { id: "events", label: "Events", description: "Manage your events", href: "/organizer/events", icon: <CalendarDays className="w-4 h-4" />, category: "page" },
  { id: "attendees", label: "Attendees", description: "View attendee list", href: "/organizer/attendees", icon: <Users className="w-4 h-4" />, category: "page" },
  { id: "checkin", label: "Check-in & on-site", description: "On-site management", href: "/organizer/check-in", icon: <QrCode className="w-4 h-4" />, category: "page" },
  { id: "analytics", label: "Analytics", description: "Event performance", href: "/organizer/analytics", icon: <BarChart3 className="w-4 h-4" />, category: "page" },
  { id: "promote", label: "Promote", description: "Email your event to nearby subscribers", href: "/organizer/promote", icon: <Send className="w-4 h-4" />, category: "page" },
  { id: "team", label: "Team", description: "Manage team members", href: "/organizer/team", icon: <Users className="w-4 h-4" />, category: "page" },
  { id: "billing", label: "Plans & billing", description: "Plan, Event Boosts and payments", href: "/organizer/billing", icon: <CreditCard className="w-4 h-4" />, category: "page" },
  { id: "settings", label: "Settings", description: "Account settings", href: "/organizer/settings", icon: <Settings className="w-4 h-4" />, category: "page" },
  { id: "support", label: "Help & support", description: "Get help", href: "/organizer/support", icon: <HelpCircle className="w-4 h-4" />, category: "page" },
];

const ACTIONS: SearchResult[] = [
  { id: "create-event", label: "Create new event", description: "Start a new event", href: "/organizer/events/create", icon: <Plus className="w-4 h-4" />, category: "action" },
];

async function searchOrganizerEvents(q: string): Promise<SearchResult[]> {
  const data = await fetch(`/api/organizer/events?search=${encodeURIComponent(q)}&limit=5`).then((r) => r.json());
  return (data.events ?? []).map((e: { id: string; name: string; date?: string }) => ({
    id: `event-${e.id}`,
    label: e.name,
    description: e.date ? new Date(e.date).toLocaleDateString() : undefined,
    href: `/organizer/events/${e.id}`,
    icon: <CalendarDays className="w-4 h-4" />,
    category: "event" as const,
  }));
}

export default function CommandPalette({
  open, onClose, pages = PAGES, actions = ACTIONS, search = searchOrganizerEvents,
  placeholder = "Search pages, events, actions...", resultsLabel = "Events",
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [events, setEvents] = useState<SearchResult[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const debounceRef = useRef<NodeJS.Timeout>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      setEvents([]);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const searchEvents = useCallback((q: string) => {
    if (q.length < 2) {
      setEvents([]);
      return;
    }
    setLoadingEvents(true);
    search(q)
      .then(setEvents)
      .catch(() => setEvents([]))
      .finally(() => setLoadingEvents(false));
  }, [search]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchEvents(query), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, searchEvents]);

  const q = query.toLowerCase().trim();
  const filteredPages = q
    ? pages.filter(p => p.label.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q))
    : pages;
  const filteredActions = q
    ? actions.filter(a => a.label.toLowerCase().includes(q) || a.description?.toLowerCase().includes(q))
    : actions;

  const allResults = [...filteredActions, ...filteredPages, ...events];

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const navigate = (href: string) => {
    onClose();
    router.push(href);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex(i => Math.min(i + 1, allResults.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex(i => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && allResults[activeIndex]) {
      e.preventDefault();
      navigate(allResults[activeIndex].href);
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  useEffect(() => {
    const el = listRef.current?.children[activeIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  if (!open) return null;

  const groupedResults: { label: string; items: SearchResult[] }[] = [];
  if (filteredActions.length) groupedResults.push({ label: "Actions", items: filteredActions });
  if (filteredPages.length) groupedResults.push({ label: "Pages", items: filteredPages });
  if (events.length) groupedResults.push({ label: resultsLabel, items: events });

  let globalIndex = 0;

  return (
    <div className="fixed inset-0 z-[100]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative flex items-start justify-center pt-[15vh]">
        <div
          className="w-full max-w-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-2xl overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          {/* Search input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-800">
            <Search className="w-5 h-5 text-gray-400 shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              className="flex-1 bg-transparent text-sm font-jakarta text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none"
            />
            {query && (
              <button onClick={() => setQuery("")} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            )}
            <kbd className="text-[10px] font-jakarta font-medium text-gray-400 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-1.5 py-0.5">ESC</kbd>
          </div>

          {/* Results */}
          <div ref={listRef} className="max-h-[360px] overflow-y-auto py-2">
            {allResults.length === 0 && query.length > 0 && !loadingEvents && (
              <div className="px-4 py-8 text-center">
                <p className="text-sm text-gray-500 font-jakarta">No results for &ldquo;{query}&rdquo;</p>
              </div>
            )}

            {loadingEvents && events.length === 0 && query.length >= 2 && (
              <div className="px-4 py-2">
                <p className="text-xs text-gray-400 font-jakarta">Searching {resultsLabel.toLowerCase()}...</p>
              </div>
            )}

            {groupedResults.map(group => (
              <div key={group.label}>
                <p className="px-4 pt-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-gray-400 font-jakarta">
                  {group.label}
                </p>
                {group.items.map(item => {
                  const idx = globalIndex++;
                  return (
                    <button
                      key={item.id}
                      onClick={() => navigate(item.href)}
                      onMouseEnter={() => setActiveIndex(idx)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                        idx === activeIndex
                          ? "bg-brand/8 text-brand"
                          : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                      }`}
                    >
                      <span className={`shrink-0 ${idx === activeIndex ? "text-brand" : "text-gray-400"}`}>
                        {item.icon}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium font-jakarta truncate">{item.label}</p>
                        {item.description && (
                          <p className="text-xs text-gray-400 font-jakarta truncate">{item.description}</p>
                        )}
                      </div>
                      {idx === activeIndex && (
                        <ArrowRight className="w-3.5 h-3.5 shrink-0 text-brand" />
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="px-4 py-2.5 border-t border-gray-100 dark:border-gray-800 flex items-center gap-4 text-[11px] text-gray-400 font-jakarta">
            <span className="flex items-center gap-1">
              <kbd className="bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-1 py-0.5 text-[10px]">↑↓</kbd>
              Navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-1 py-0.5 text-[10px]">↵</kbd>
              Open
            </span>
            <span className="flex items-center gap-1">
              <kbd className="bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-1 py-0.5 text-[10px]">esc</kbd>
              Close
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
