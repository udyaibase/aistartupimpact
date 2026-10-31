'use client';

import { useState } from 'react';
import {
  X, Loader2, Download, Check, Globe, CalendarDays, MapPin,
  Zap, ExternalLink, Filter, Search, ChevronDown, ChevronUp,
} from 'lucide-react';

interface FetchedEvent {
  title: string;
  url: string;
  date: string | null;
  endDate?: string | null;
  location: string | null;
  description: string | null;
  category: string | null;
  format: string | null;
  source: string;
  imageUrl?: string | null;
  organizer?: string | null;
  relevanceScore: number;
  suggestedCategory: string;
  suggestedFormat: string;
}

interface EventFetcherModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (events: FetchedEvent[]) => void;
}

const SOURCE_LABELS: Record<string, { label: string; color: string }> = {
  luma: { label: 'Luma', color: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400' },
  eventbrite: { label: 'Eventbrite', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
  meetup: { label: 'Meetup', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  devfolio: { label: 'Devfolio', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  unstop: { label: 'Unstop', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
};

const CATEGORY_LABELS: Record<string, string> = {
  CONFERENCE: 'Conference',
  HACKATHON: 'Hackathon',
  SUMMIT: 'Summit',
  WORKSHOP: 'Workshop',
  MEETUP: 'Meetup',
  DEMO_DAY: 'Demo Day',
  WEBINAR: 'Webinar',
  NETWORKING: 'Networking',
};

export default function EventFetcherModal({ isOpen, onClose, onImport }: EventFetcherModalProps) {
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<FetchedEvent[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [stats, setStats] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [minScore, setMinScore] = useState(10);
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const [enabledSources, setEnabledSources] = useState({
    luma: true,
    eventbrite: true,
    meetup: true,
    devfolio: true,
    unstop: true,
  });

  const handleFetch = async () => {
    setLoading(true);
    setError(null);
    setEvents([]);
    setSelected(new Set());
    setStats(null);

    try {
      const sources = Object.entries(enabledSources)
        .filter(([, enabled]) => enabled)
        .map(([name]) => name);

      const res = await fetch('/api/admin/fetch-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sources, minScore }),
      });

      const data = await res.json();
      if (data.success) {
        setEvents(data.data.events);
        setStats(data.data.stats);
      } else {
        setError(data.error || 'Failed to fetch events');
      }
    } catch (err: any) {
      setError(err.message || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  const toggleSelect = (url: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === filteredEvents.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredEvents.map(e => e.url)));
    }
  };

  const handleImport = () => {
    const selectedEvents = events.filter(e => selected.has(e.url));
    if (selectedEvents.length === 0) return;
    setImporting(true);
    onImport(selectedEvents);
  };

  const filteredEvents = events.filter(e => {
    if (sourceFilter !== 'all' && e.source !== sourceFilter) return false;
    if (categoryFilter !== 'all' && e.suggestedCategory !== categoryFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!e.title.toLowerCase().includes(q) && !(e.description || '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const uniqueSources = [...new Set(events.map(e => e.source))];
  const uniqueCategories = [...new Set(events.map(e => e.suggestedCategory))];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-start justify-center p-4 pt-8 overflow-y-auto">
      <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-5xl shadow-2xl border border-gray-200 dark:border-gray-800 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800 shrink-0">
          <div>
            <h2 className="font-sora font-bold text-lg text-navy dark:text-white flex items-center gap-2">
              <Zap className="w-5 h-5 text-brand" />
              Auto-Fetch AI & Tech Events
            </h2>
            <p className="text-xs text-gray-400 font-jakarta mt-0.5">
              Scrape events from Luma, Eventbrite, Meetup, Devfolio & Unstop
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Source Selection */}
          {events.length === 0 && !loading && (
            <div className="px-6 py-5 space-y-4">
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase mb-2 font-jakarta">Sources</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(enabledSources).map(([key, enabled]) => (
                    <label key={key} className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all text-xs font-jakarta font-medium ${
                      enabled ? 'border-brand bg-brand/5 text-brand' : 'border-gray-200 dark:border-gray-700 text-gray-500'
                    }`}>
                      <input
                        type="checkbox"
                        checked={enabled}
                        onChange={(e) => setEnabledSources(prev => ({ ...prev, [key]: e.target.checked }))}
                        className="w-3.5 h-3.5 rounded text-brand focus:ring-brand"
                      />
                      {SOURCE_LABELS[key]?.label || key}
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase font-jakarta">Min Relevance Score</label>
                  <input
                    type="number"
                    value={minScore}
                    onChange={(e) => setMinScore(Number(e.target.value))}
                    min={0}
                    max={100}
                    className="mt-1 w-24 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-jakarta"
                  />
                </div>
                <p className="text-xs text-gray-400 font-jakarta mt-5">
                  Higher = stricter AI/tech relevance filter. 0 = show all. 10 = recommended.
                </p>
              </div>

              <button
                onClick={handleFetch}
                disabled={!Object.values(enabledSources).some(Boolean)}
                className="w-full py-3 bg-brand hover:bg-brand/90 text-white font-bold text-sm rounded-xl flex items-center justify-center gap-2 disabled:opacity-40 transition-colors font-jakarta"
              >
                <Globe className="w-4 h-4" />
                Fetch Events from Selected Sources
              </button>
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="px-6 py-16 text-center">
              <Loader2 className="w-8 h-8 animate-spin text-brand mx-auto mb-3" />
              <p className="text-sm text-gray-500 font-jakarta">Scraping events from multiple sources...</p>
              <p className="text-xs text-gray-400 font-jakarta mt-1">This may take 30-60 seconds</p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="px-6 py-4">
              <div className="px-4 py-3 bg-red-50 dark:bg-red-900/20 text-sm text-red-600 dark:text-red-400 font-jakarta rounded-xl border border-red-100 dark:border-red-800">
                {error}
              </div>
            </div>
          )}

          {/* Results */}
          {events.length > 0 && !loading && (
            <div className="px-6 py-4 space-y-3">
              {/* Stats */}
              {stats && (
                <div className="flex items-center gap-4 flex-wrap text-xs font-jakarta text-gray-500">
                  <span>Scraped: <strong className="text-navy dark:text-white">{stats.totalScraped}</strong></span>
                  <span>Relevant: <strong className="text-green-600">{stats.afterScoring}</strong></span>
                  {Object.entries(stats.bySource as Record<string, number>).map(([src, count]) => (
                    <span key={src} className={`px-1.5 py-0.5 rounded ${SOURCE_LABELS[src]?.color || 'bg-gray-100 text-gray-600'}`}>
                      {SOURCE_LABELS[src]?.label || src}: {count}
                    </span>
                  ))}
                </div>
              )}

              {/* Filters */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search events..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 font-jakarta"
                  />
                </div>
                <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}
                  className="px-3 py-2 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 font-jakarta">
                  <option value="all">All Sources</option>
                  {uniqueSources.map(s => <option key={s} value={s}>{SOURCE_LABELS[s]?.label || s}</option>)}
                </select>
                <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}
                  className="px-3 py-2 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 font-jakarta">
                  <option value="all">All Categories</option>
                  {uniqueCategories.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c] || c}</option>)}
                </select>
              </div>

              {/* Select all */}
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs font-jakarta text-gray-500 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selected.size === filteredEvents.length && filteredEvents.length > 0}
                    onChange={toggleSelectAll}
                    className="w-3.5 h-3.5 rounded text-brand focus:ring-brand"
                  />
                  Select all ({filteredEvents.length})
                </label>
                <span className="text-xs text-brand font-bold font-jakarta">{selected.size} selected</span>
              </div>

              {/* Event list */}
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {filteredEvents.map((event) => {
                  const isExpanded = expandedId === event.url;
                  return (
                    <div key={event.url} className={`border rounded-xl transition-all ${
                      selected.has(event.url)
                        ? 'border-brand bg-brand/5'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}>
                      <div className="flex items-start gap-3 p-3">
                        <input
                          type="checkbox"
                          checked={selected.has(event.url)}
                          onChange={() => toggleSelect(event.url)}
                          className="w-4 h-4 rounded text-brand focus:ring-brand mt-0.5 shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <h4 className="font-sora font-semibold text-sm text-navy dark:text-white line-clamp-1">{event.title}</h4>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${SOURCE_LABELS[event.source]?.color || 'bg-gray-100 text-gray-600'}`}>
                                {SOURCE_LABELS[event.source]?.label || event.source}
                              </span>
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500">
                                {CATEGORY_LABELS[event.suggestedCategory] || event.suggestedCategory}
                              </span>
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                event.relevanceScore >= 30 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                  : event.relevanceScore >= 15 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                                  : 'bg-gray-100 text-gray-500'
                              }`}>
                                Score: {event.relevanceScore}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-xs text-gray-400 font-jakarta">
                            {event.date && (
                              <span className="flex items-center gap-1">
                                <CalendarDays className="w-3 h-3" />
                                {new Date(event.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                              </span>
                            )}
                            {event.location && (
                              <span className="flex items-center gap-1">
                                <MapPin className="w-3 h-3" />
                                {event.location.length > 40 ? event.location.slice(0, 40) + '...' : event.location}
                              </span>
                            )}
                            {event.organizer && (
                              <span className="text-gray-400">{event.organizer}</span>
                            )}
                            <a href={event.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-0.5 text-brand hover:underline">
                              <ExternalLink className="w-3 h-3" /> View
                            </a>
                          </div>
                        </div>
                        <button onClick={() => setExpandedId(isExpanded ? null : event.url)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded shrink-0">
                          {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                        </button>
                      </div>
                      {isExpanded && event.description && (
                        <div className="px-10 pb-3">
                          <p className="text-xs text-gray-500 dark:text-gray-400 font-jakarta line-clamp-4">{event.description}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {events.length > 0 && !loading && (
          <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between shrink-0">
            <button onClick={() => { setEvents([]); setStats(null); setSelected(new Set()); }}
              className="px-4 py-2.5 text-sm font-medium border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 font-jakarta">
              Re-fetch
            </button>
            <button
              onClick={handleImport}
              disabled={selected.size === 0 || importing}
              className="px-6 py-2.5 bg-brand hover:bg-brand/90 text-white font-bold text-sm rounded-xl flex items-center gap-2 disabled:opacity-40 transition-colors font-jakarta"
            >
              {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Import {selected.size} Event{selected.size !== 1 ? 's' : ''} as Draft
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
