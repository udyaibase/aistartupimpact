'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, Building2, Loader2 } from 'lucide-react';
import { getStartupsForSelectAction } from '@/app/(dashboard)/jobs-board/actions';

interface StartupOption {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  websiteUrl: string | null;
  headquartersCity: string | null;
}

interface StartupSearchComboboxProps {
  value: StartupOption | null;
  onChange: (startup: StartupOption | null) => void;
  initialStartupId?: string;
}

export default function StartupSearchCombobox({ value, onChange, initialStartupId }: StartupSearchComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<StartupOption[]>([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout>(undefined);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) {
      setOptions([]);
      return;
    }
    setLoading(true);
    try {
      const result = await getStartupsForSelectAction(q) as any;
      if (result.success && result.startups) {
        setOptions(result.startups);
      }
    } catch {
      setOptions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInputChange = (val: string) => {
    setQuery(val);
    setIsOpen(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(val), 300);
  };

  const select = (startup: StartupOption) => {
    onChange(startup);
    setQuery('');
    setIsOpen(false);
    setOptions([]);
  };

  const clear = () => {
    onChange(null);
    setQuery('');
    setOptions([]);
  };

  if (value) {
    return (
      <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
        {value.logoUrl ? (
          <img src={value.logoUrl} alt="" className="w-10 h-10 rounded-lg object-cover border border-gray-200 dark:border-gray-700" />
        ) : (
          <div className="w-10 h-10 rounded-lg bg-brand/10 flex items-center justify-center">
            <Building2 className="w-5 h-5 text-brand" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-navy dark:text-white font-sora truncate">{value.name}</p>
          <p className="text-xs text-gray-500 font-jakarta truncate">
            {value.headquartersCity && `${value.headquartersCity} · `}{value.websiteUrl || value.slug}
          </p>
        </div>
        <button
          type="button"
          onClick={clear}
          className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
        >
          <X className="w-4 h-4 text-gray-400" />
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => query.length >= 2 && setIsOpen(true)}
          placeholder="Search startups by name..."
          className="w-full pl-10 pr-10 py-2.5 text-sm border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand/30 focus:border-brand transition-colors"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand animate-spin" />
        )}
      </div>

      {isOpen && options.length > 0 && (
        <ul className="absolute z-50 w-full mt-1 max-h-60 overflow-y-auto bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg">
          {options.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => select(s)}
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
              >
                {s.logoUrl ? (
                  <img src={s.logoUrl} alt="" className="w-8 h-8 rounded-lg object-cover border border-gray-200 dark:border-gray-700 shrink-0" />
                ) : (
                  <div className="w-8 h-8 rounded-lg bg-gray-200 dark:bg-gray-700 flex items-center justify-center shrink-0">
                    <Building2 className="w-4 h-4 text-gray-400" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate font-jakarta">{s.name}</p>
                  <p className="text-xs text-gray-500 truncate">{s.headquartersCity || s.slug}</p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {isOpen && query.length >= 2 && !loading && options.length === 0 && (
        <div className="absolute z-50 w-full mt-1 p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg text-center">
          <p className="text-sm text-gray-500 font-jakarta">No startups found for &quot;{query}&quot;</p>
        </div>
      )}
    </div>
  );
}
