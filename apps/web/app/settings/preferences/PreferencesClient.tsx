'use client';

import { useState, useEffect, useCallback } from 'react';
import { updatePreferences } from './actions';
import {
  Search, Rocket, Briefcase, Lightbulb, GraduationCap, TrendingUp,
  MapPin, Loader2, X, Check
} from 'lucide-react';

const INTENTS = [
  { value: 'exploring_tools', label: 'Explore AI Tools', icon: Search },
  { value: 'following_startups', label: 'Follow Startups', icon: Rocket },
  { value: 'looking_for_jobs', label: 'Find Jobs', icon: Briefcase },
  { value: 'founder_builder', label: 'Build & Launch', icon: Lightbulb },
  { value: 'learning_ai', label: 'Learn AI', icon: GraduationCap },
  { value: 'investor_vc', label: 'Invest & Evaluate', icon: TrendingUp },
] as const;

type Category = { id: string; name: string; slug: string; icon: string | null };
type CityResult = { id: string; name: string; state: string | null; country: string };

export default function PreferencesClient({
  categories,
  initialPrefs,
}: {
  categories: Category[];
  initialPrefs: { primaryIntent: string | null; categoryIds: string[]; cityId: string | null; cityName: string | null } | null;
}) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');

  const [primaryIntent, setPrimaryIntent] = useState<string | null>(initialPrefs?.primaryIntent || null);
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(
    new Set(initialPrefs?.categoryIds || [])
  );
  const [cityId, setCityId] = useState<string | null>(initialPrefs?.cityId || null);
  const [cityName, setCityName] = useState(initialPrefs?.cityName || '');
  const [cityQuery, setCityQuery] = useState('');
  const [cityResults, setCityResults] = useState<CityResult[]>([]);
  const [searchingCity, setSearchingCity] = useState(false);

  const toggleCategory = useCallback((id: string) => {
    setSelectedCategories(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setSaved(false);
  }, []);

  useEffect(() => {
    if (cityQuery.length < 2) { setCityResults([]); return; }
    const timeout = setTimeout(async () => {
      setSearchingCity(true);
      try {
        const res = await fetch(`/api/cities/search?q=${encodeURIComponent(cityQuery)}`);
        if (res.ok) setCityResults(await res.json());
      } catch {}
      setSearchingCity(false);
    }, 300);
    return () => clearTimeout(timeout);
  }, [cityQuery]);

  const handleSave = async () => {
    setSaving(true);
    setSaveError('');
    const result = await updatePreferences({
      primaryIntent,
      categoryIds: Array.from(selectedCategories),
      cityId,
    }).catch(() => ({ success: false }));
    setSaving(false);
    if (!result.success) {
      setSaveError('Couldn’t save your preferences. Please try again.');
    } else {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
  };

  return (
    <div className="space-y-8">
      {/* Intent */}
      <section>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-3">What brings you here?</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {INTENTS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => { setPrimaryIntent(value); setSaved(false); }}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                primaryIntent === value
                  ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300'
                  : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-blue-400'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </button>
          ))}
        </div>
      </section>

      {/* Interests */}
      <section>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">Interests</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">Pick topics to personalize your feed</p>
        <div className="flex flex-wrap gap-2">
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => toggleCategory(cat.id)}
              className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-all ${
                selectedCategories.has(cat.id)
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
        {selectedCategories.size > 0 && (
          <p className="text-xs text-slate-400 mt-2">{selectedCategories.size} selected</p>
        )}
      </section>

      {/* City */}
      <section>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">Location</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">For nearby events and jobs</p>
        <div className="relative max-w-sm">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          {cityName ? (
            <div className="flex items-center justify-between pl-9 pr-3 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg">
              <span className="text-sm text-slate-900 dark:text-white">{cityName}</span>
              <button onClick={() => { setCityId(null); setCityName(''); setCityQuery(''); setSaved(false); }} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <input
              type="text"
              value={cityQuery}
              onChange={e => { setCityQuery(e.target.value); setCityId(null); setSaved(false); }}
              placeholder="Search your city..."
              className="w-full pl-9 pr-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoComplete="off"
            />
          )}

          {cityResults.length > 0 && !cityId && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto">
              {cityResults.map(city => (
                <button
                  key={city.id}
                  onClick={() => {
                    setCityId(city.id);
                    setCityName(`${city.name}${city.state ? `, ${city.state}` : ''}, ${city.country}`);
                    setCityQuery('');
                    setCityResults([]);
                    setSaved(false);
                  }}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-900 dark:text-white"
                >
                  {city.name}
                  {city.state && <span className="text-slate-400">, {city.state}</span>}
                  <span className="text-slate-400">, {city.country}</span>
                </button>
              ))}
            </div>
          )}

          {searchingCity && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
            </div>
          )}
        </div>
      </section>

      {/* Save */}
      <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <><Check className="w-4 h-4" /> Saved</> : 'Save preferences'}
        </button>
        {saveError && <p role="alert" className="text-sm text-red-600 dark:text-red-400 mt-2">{saveError}</p>}
      </div>
    </div>
  );
}
