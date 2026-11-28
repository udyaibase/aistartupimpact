'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, X, Link2, Building2 } from 'lucide-react';
import { searchStartupsForLinkAction, linkToolToStartupAction, getLinkedStartupAction } from '@/app/(dashboard)/tools-dir/tool-content-actions';

interface StartupLinkerProps {
  toolId: string;
}

interface LinkedStartup {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  stage: string;
  headquartersCity: string | null;
  totalFundingInr: string | null;
  employeeCount: number | null;
  foundedYear: number | null;
}

export default function StartupLinker({ toolId }: StartupLinkerProps) {
  const [linked, setLinked] = useState<LinkedStartup | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    getLinkedStartupAction(toolId).then((s) => setLinked(s as LinkedStartup | null));
  }, [toolId]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleSearch = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.length < 2) { setResults([]); return; }

    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      const res = await searchStartupsForLinkAction(value);
      setResults(res as any[]);
      setSearching(false);
    }, 300);
  };

  const handleLink = async (startup: any) => {
    await linkToolToStartupAction(toolId, startup.id);
    setLinked(startup);
    setQuery('');
    setResults([]);
    setIsOpen(false);
  };

  const handleUnlink = async () => {
    await linkToolToStartupAction(toolId, null);
    setLinked(null);
  };

  return (
    <div ref={containerRef} className="relative">
      <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 flex items-center gap-1.5 font-jakarta">
        <Link2 className="w-3.5 h-3.5" />
        Link to Startup
      </label>

      {/* Currently linked */}
      {linked ? (
        <div className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <div className="w-8 h-8 rounded-lg bg-white dark:bg-gray-700 flex items-center justify-center shrink-0 overflow-hidden border border-gray-200 dark:border-gray-600">
            {linked.logoUrl ? (
              <img src={linked.logoUrl} alt="" className="w-6 h-6 object-contain" />
            ) : (
              <Building2 className="w-4 h-4 text-gray-400" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{linked.name}</p>
            <p className="text-[10px] text-gray-400 font-jakarta">{linked.stage?.replace(/_/g, ' ')} {linked.headquartersCity && `· ${linked.headquartersCity}`}</p>
          </div>
          <button
            type="button"
            onClick={handleUnlink}
            className="text-xs text-red-500 hover:text-red-600 font-semibold px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20"
          >
            Unlink
          </button>
        </div>
      ) : (
        <>
          {/* Search input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => { handleSearch(e.target.value); setIsOpen(true); }}
              onFocus={() => setIsOpen(true)}
              placeholder="Search startup by name..."
              className="w-full pl-9 pr-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-jakarta text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-brand focus:border-transparent"
            />
          </div>

          {/* Results dropdown */}
          {isOpen && (query.length >= 2) && (
            <div className="absolute z-40 top-full left-0 right-0 mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-[200px] overflow-y-auto">
              {searching ? (
                <div className="px-4 py-3 text-xs text-gray-400 text-center">Searching...</div>
              ) : results.length === 0 ? (
                <div className="px-4 py-3 text-xs text-gray-400 text-center">No startups found</div>
              ) : (
                results.map((s: any) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => handleLink(s)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
                  >
                    <div className="w-7 h-7 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center shrink-0 overflow-hidden">
                      {s.logoUrl ? (
                        <img src={s.logoUrl} alt="" className="w-5 h-5 object-contain" />
                      ) : (
                        <Building2 className="w-3.5 h-3.5 text-gray-400" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{s.name}</p>
                      <p className="text-[10px] text-gray-400">{s.stage?.replace(/_/g, ' ')} {s.headquartersCity && `· ${s.headquartersCity}`}</p>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
