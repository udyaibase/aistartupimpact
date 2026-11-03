'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Building2, User, Search, Wrench } from 'lucide-react';

interface MentionResult {
  type: 'startup' | 'tool' | 'founder';
  id: string;
  name: string;
  slug: string;
  avatar?: string | null;
  subtitle: string;
}

interface MentionPopupProps {
  query: string;
  position: { x: number; y: number };
  onSelect: (mention: MentionResult) => void;
  onClose: () => void;
}

export default function MentionPopup({ query, position, onSelect, onClose }: MentionPopupProps) {
  const [results, setResults] = useState<MentionResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const popupRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout>(undefined);

  const fetchMentions = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/mentions?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setResults(data.results || []);
      setActiveIndex(0);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchMentions(query), 200);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, fetchMentions]);

  useEffect(() => {
    if (results.length === 0) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        setActiveIndex(i => Math.min(i + 1, results.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        setActiveIndex(i => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        onSelect(results[activeIndex]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [results, activeIndex, onSelect, onClose]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  if (query.length < 2 && !loading && results.length === 0) {
    return (
      <div
        ref={popupRef}
        className="absolute z-50 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl w-72"
        style={{ left: `${position.x}px`, top: `${position.y + 24}px` }}
      >
        <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
          <Search className="w-3.5 h-3.5 text-gray-400" />
          <span className="text-xs text-gray-400 font-jakarta">@{query || '...'}</span>
        </div>
        <div className="px-3 py-4 text-center">
          <span className="text-xs text-gray-400 font-jakarta">Type a startup or AI tool name</span>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={popupRef}
      className="absolute z-50 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl w-72 max-h-72 overflow-y-auto"
      style={{ left: `${position.x}px`, top: `${position.y + 24}px` }}
    >
      <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
        <Search className="w-3.5 h-3.5 text-gray-400" />
        <span className="text-xs text-gray-400 font-jakarta">@{query}</span>
      </div>

      {loading && (
        <div className="px-3 py-4 text-center">
          <span className="text-xs text-gray-400 font-jakarta">Searching...</span>
        </div>
      )}

      {!loading && results.length === 0 && query.length >= 2 && (
        <div className="px-3 py-4 text-center">
          <span className="text-xs text-gray-400 font-jakarta">No approved startups or tools match. Add it to the directory first.</span>
        </div>
      )}

      {!loading && results.length > 0 && (
        <div className="py-1">
          {results.map((r, i) => (
            <button
              key={`${r.type}-${r.id}`}
              onMouseDown={(e) => { e.preventDefault(); onSelect(r); }}
              onMouseEnter={() => setActiveIndex(i)}
              className={`w-full flex items-center gap-3 px-3 py-2 transition-colors ${
                i === activeIndex ? 'bg-brand/5 dark:bg-brand/10' : 'hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center shrink-0 overflow-hidden">
                {r.avatar ? (
                  <img src={r.avatar} alt="" className="w-full h-full object-cover" />
                ) : r.type === 'startup' ? (
                  <Building2 className="w-4 h-4 text-gray-400" />
                ) : r.type === 'tool' ? (
                  <Wrench className="w-4 h-4 text-gray-400" />
                ) : (
                  <User className="w-4 h-4 text-gray-400" />
                )}
              </div>
              <div className="text-left min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold text-navy dark:text-white font-jakarta truncate">{r.name}</span>
                  <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full shrink-0 ${
                    r.type === 'startup'
                      ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                      : r.type === 'tool'
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                      : 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400'
                  }`}>{r.type === 'startup' ? 'Startup' : r.type === 'tool' ? 'Tool' : 'Founder'}</span>
                </div>
                {r.subtitle && (
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 font-jakarta truncate">{r.subtitle}</p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
