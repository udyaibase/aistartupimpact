'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, X, Repeat2 } from 'lucide-react';
import { getToolAlternativesAction, addToolAlternativeAction, removeToolAlternativeAction, searchToolsForAlternativeAction } from '@/app/(dashboard)/tools-dir/tool-content-actions';

interface AlternativeToolsManagerProps {
  toolId: string;
}

export default function AlternativeToolsManager({ toolId }: AlternativeToolsManagerProps) {
  const [alternatives, setAlternatives] = useState<any[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    loadAlternatives();
  }, [toolId]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const loadAlternatives = async () => {
    const data = await getToolAlternativesAction(toolId);
    setAlternatives(data as any[]);
  };

  const handleSearch = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.length < 2) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      const res = await searchToolsForAlternativeAction(value, toolId);
      setResults(res as any[]);
    }, 300);
  };

  const handleAdd = async (alt: any) => {
    await addToolAlternativeAction(toolId, alt.id);
    await loadAlternatives();
    setQuery('');
    setResults([]);
    setIsOpen(false);
  };

  const handleRemove = async (alternativeId: string) => {
    await removeToolAlternativeAction(toolId, alternativeId);
    await loadAlternatives();
  };

  return (
    <div ref={containerRef} className="relative">
      <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 flex items-center gap-1.5 font-jakarta">
        <Repeat2 className="w-3.5 h-3.5" />
        Alternative Tools ({alternatives.length}/10)
      </label>

      {/* Current alternatives */}
      {alternatives.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {alternatives.map((alt: any) => (
            <div key={alt.id} className="flex items-center gap-2 px-2.5 py-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
              {alt.logoUrl && <img src={alt.logoUrl} alt="" className="w-5 h-5 rounded object-contain" />}
              <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{alt.name}</span>
              <button type="button" onClick={() => handleRemove(alt.alternativeId)} className="text-gray-400 hover:text-red-500">
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Search to add */}
      {alternatives.length < 10 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => { handleSearch(e.target.value); setIsOpen(true); }}
            onFocus={() => setIsOpen(true)}
            placeholder="Search tools to add as alternative..."
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-jakarta focus:ring-2 focus:ring-brand focus:border-transparent"
          />
          {isOpen && query.length >= 2 && (
            <div className="absolute z-40 top-full left-0 right-0 mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-[200px] overflow-y-auto">
              {results.length === 0 ? (
                <div className="px-4 py-3 text-xs text-gray-400 text-center">No tools found</div>
              ) : (
                results.map((r: any) => (
                  <button key={r.id} type="button" onClick={() => handleAdd(r)} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800 text-left">
                    {r.logoUrl && <img src={r.logoUrl} alt="" className="w-6 h-6 rounded object-contain" />}
                    <div>
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{r.name}</p>
                      <p className="text-[10px] text-gray-400">{r.pricingModel}</p>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
