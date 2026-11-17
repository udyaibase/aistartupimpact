'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { completeOnboarding, skipOnboarding } from './actions';
import {
  Search, Rocket, Briefcase, Lightbulb, GraduationCap, TrendingUp,
  MapPin, ChevronRight, Loader2, X
} from 'lucide-react';

const INTENTS = [
  { value: 'exploring_tools', label: 'Explore AI Tools', description: 'Discover and compare AI tools', icon: Search },
  { value: 'following_startups', label: 'Follow Startups', description: 'Track AI startups and founders', icon: Rocket },
  { value: 'looking_for_jobs', label: 'Find Jobs', description: 'Browse AI startup jobs and internships', icon: Briefcase },
  { value: 'founder_builder', label: 'Build & Launch', description: 'I\'m building an AI product', icon: Lightbulb },
  { value: 'learning_ai', label: 'Learn AI', description: 'Stay updated on AI trends', icon: GraduationCap },
  { value: 'investor_vc', label: 'Invest & Evaluate', description: 'Evaluate AI startups and deals', icon: TrendingUp },
] as const;

type Category = { id: string; name: string; slug: string; icon: string | null };
type CityResult = { id: string; name: string; state: string | null; country: string };

export default function OnboardingClient({
  categories,
  returnTo,
  userName,
}: {
  categories: Category[];
  returnTo: string;
  userName: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  const [primaryIntent, setPrimaryIntent] = useState<string | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [cityId, setCityId] = useState<string | null>(null);
  const [cityQuery, setCityQuery] = useState('');
  const [cityResults, setCityResults] = useState<CityResult[]>([]);
  const [cityName, setCityName] = useState('');
  const [searchingCity, setSearchingCity] = useState(false);
  /** What the last finished search found: nothing matched, or the search itself failed. */
  const [cityNotice, setCityNotice] = useState<'' | 'none' | 'error'>('');
  /** Why Finish or Skip didn't go through (shown above the buttons). */
  const [finishError, setFinishError] = useState('');
  const [showCityDropdown, setShowCityDropdown] = useState(false);

  const firstName = userName.split(' ')[0];

  const handleIntentSelect = useCallback((intent: string) => {
    setPrimaryIntent(intent);
    setTimeout(() => setStep(2), 300);
  }, []);

  const toggleCategory = useCallback((id: string) => {
    setSelectedCategories(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  useEffect(() => {
    setCityNotice('');
    if (cityQuery.trim().length < 2) {
      setCityResults([]);
      setShowCityDropdown(false);
      setSearchingCity(false);
      return;
    }
    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      setSearchingCity(true);
      try {
        const res = await fetch(`/api/cities/search?q=${encodeURIComponent(cityQuery)}`, {
          signal: controller.signal,
        });
        const data = res.ok ? await res.json() : null;
        if (!Array.isArray(data)) throw new Error('search failed');
        setCityResults(data);
        setShowCityDropdown(data.length > 0);
        setCityNotice(data.length ? '' : 'none');
        setSearchingCity(false);
      } catch (e) {
        // A newer keystroke cancelled this search; that search reports its own result.
        if ((e as Error).name === 'AbortError') return;
        setCityResults([]);
        setShowCityDropdown(false);
        setCityNotice('error');
        setSearchingCity(false);
      }
    }, 300);
    return () => { clearTimeout(timeout); controller.abort(); };
  }, [cityQuery]);

  const handleFinish = async () => {
    setLoading(true);
    setFinishError('');
    try {
      const result = await completeOnboarding({
        primaryIntent: primaryIntent || undefined,
        categoryIds: selectedCategories.size > 0 ? Array.from(selectedCategories) : undefined,
        cityId: cityId || undefined,
      });
      if ('success' in result) {
        router.push(returnTo);
        router.refresh();
        return;
      }
      setFinishError(result.error);
    } catch {
      setFinishError('Couldn’t reach the server. Check your connection and try again.');
    }
    setLoading(false);
  };

  const handleSkip = async () => {
    setLoading(true);
    setFinishError('');
    try {
      const result = await skipOnboarding();
      if ('success' in result) {
        router.push(returnTo);
        router.refresh();
        return;
      }
      setFinishError(result.error);
    } catch {
      setFinishError('Couldn’t reach the server. Check your connection and try again.');
    }
    setLoading(false);
  };

  const handleSkipStep = () => {
    if (step < 3) setStep(step + 1);
    else handleFinish();
  };

  return (
    <div className="w-full max-w-lg">
      {/* Progress dots */}
      <div className="flex items-center justify-center gap-2 mb-8">
        {[1, 2, 3].map(s => (
          <div
            key={s}
            className={`h-2 rounded-full transition-all duration-300 ${
              s === step ? 'w-8 bg-brand' : s < step ? 'w-2 bg-brand/60' : 'w-2 bg-slate-300 dark:bg-slate-600'
            }`}
          />
        ))}
      </div>

      {/* Step 1: Intent */}
      {step === 1 && (
        <div className="animate-in fade-in slide-in-from-right-4 duration-300">
          <h1 className="text-2xl font-bold text-center text-slate-900 dark:text-white mb-2">
            Hey {firstName}, what brings you here?
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-center mb-8 text-sm">
            This helps us personalize your experience
          </p>

          <div className="grid grid-cols-2 gap-3">
            {INTENTS.map(({ value, label, description, icon: Icon }) => (
              <button
                key={value}
                onClick={() => handleIntentSelect(value)}
                className={`flex flex-col items-start gap-2 p-4 rounded-xl border-2 text-left transition-all duration-200 hover:border-brand/70 hover:shadow-md ${
                  primaryIntent === value
                    ? 'border-brand bg-brand/5 dark:bg-brand/10 shadow-md'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'
                }`}
              >
                <Icon className="w-5 h-5 text-brand" />
                <div>
                  <div className="font-semibold text-sm text-slate-900 dark:text-white">{label}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{description}</div>
                </div>
              </button>
            ))}
          </div>

          <button
            onClick={handleSkip}
            disabled={loading}
            className="mt-6 w-full text-center text-sm text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
          >
            Skip for now
          </button>
          {finishError && (
            <p role="alert" className="mt-3 text-center text-sm text-red-600 dark:text-red-400">{finishError}</p>
          )}
        </div>
      )}

      {/* Step 2: Interests */}
      {step === 2 && (
        <div className="animate-in fade-in slide-in-from-right-4 duration-300">
          <h1 className="text-2xl font-bold text-center text-slate-900 dark:text-white mb-2">
            Pick your interests
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-center mb-8 text-sm">
            Select 3–8 topics you care about
          </p>

          <div className="flex flex-wrap gap-2 justify-center">
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => toggleCategory(cat.id)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                  selectedCategories.has(cat.id)
                    ? 'bg-brand text-white shadow-md'
                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-brand/60'
                }`}
              >
                {cat.icon && <span className="mr-1">{cat.icon}</span>}
                {cat.name}
              </button>
            ))}
          </div>

          {selectedCategories.size > 0 && (
            <p className="text-center text-xs text-slate-400 mt-3">
              {selectedCategories.size} selected
            </p>
          )}

          <div className="mt-8 flex gap-3">
            <button
              onClick={handleSkipStep}
              className="flex-1 py-3 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
            >
              Skip
            </button>
            <button
              onClick={() => setStep(3)}
              className="flex-1 py-3 bg-brand text-white rounded-xl font-medium text-sm hover:bg-brand/90 transition-colors flex items-center justify-center gap-1"
            >
              Continue <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Location */}
      {step === 3 && (
        <div className="animate-in fade-in slide-in-from-right-4 duration-300">
          <h1 className="text-2xl font-bold text-center text-slate-900 dark:text-white mb-2">
            Where are you based?
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-center mb-8 text-sm">
            Used only for nearby events &amp; jobs. We store only city, never precise location.
          </p>

          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            {cityName ? (
              <div className="flex items-center justify-between pl-10 pr-3 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl">
                <span className="text-slate-900 dark:text-white font-medium text-sm">{cityName}</span>
                <button
                  onClick={() => { setCityId(null); setCityName(''); setCityQuery(''); }}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <input
                type="text"
                value={cityQuery}
                onChange={e => { setCityQuery(e.target.value); setCityId(null); }}
                placeholder="Search your city..."
                className="w-full pl-10 pr-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
                autoComplete="off"
              />
            )}

            {showCityDropdown && cityResults.length > 0 && !cityId && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg z-50 max-h-48 overflow-y-auto">
                {cityResults.map(city => (
                  <button
                    key={city.id}
                    onClick={() => {
                      setCityId(city.id);
                      setCityName(`${city.name}${city.state ? `, ${city.state}` : ''}, ${city.country}`);
                      setCityQuery('');
                      setCityResults([]);
                      setShowCityDropdown(false);
                    }}
                    className="w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-900 dark:text-white first:rounded-t-xl last:rounded-b-xl"
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
          {!cityId && !searchingCity && cityNotice && (
            <p role="status" className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              {cityNotice === 'none'
                ? `No city matches “${cityQuery.trim()}”. Try another spelling (for example Bengaluru or Bangalore), or skip this step.`
                : 'City search isn’t working right now. Try again in a moment, or skip this step.'}
            </p>
          )}

          {finishError && (
            <p role="alert" className="mt-6 text-sm text-red-600 dark:text-red-400">{finishError}</p>
          )}
          <div className="mt-8 flex gap-3">
            <button
              onClick={() => handleFinish()}
              disabled={loading}
              className="flex-1 py-3 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
            >
              Skip
            </button>
            <button
              onClick={handleFinish}
              disabled={loading}
              className="flex-1 py-3 bg-brand text-white rounded-xl font-medium text-sm hover:bg-brand/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Finish'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
