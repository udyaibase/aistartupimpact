'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Search, MapPin, X, CheckCircle } from 'lucide-react';
import { CITY_DATABASE } from '@udyaibase/utils/src/cities';
import { DeleteButton } from '../india-ai/components/DeleteButton';
import { notify } from '@/components/Toast';

interface CitiesListProps {
  initialCities: any[];
}

export default function CitiesList({ initialCities }: CitiesListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [cities, setCities] = useState(initialCities);
  const [approvingId, setApprovingId] = useState<string | null>(null);

  async function approveCity(cityId: string) {
    setApprovingId(cityId);
    try {
      const res = await fetch(`/api/cities/${cityId}/approve`, { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        setCities(prev => prev.map(c => 
          c.id === cityId ? { ...c, source: 'standard', isActive: true } : c
        ));
      }
    } catch (err) {
      console.error('Failed to approve city:', err);
      notify("Something went wrong. Check your connection and try again.", 'error');
    } finally {
      setApprovingId(null);
    }
  }

  // 1. Filter cities based on search query
  const filteredCities = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return cities;

    return cities.filter(city => {
      const nameMatch = city.cityName.toLowerCase().includes(query);
      const stateMatch = city.state?.toLowerCase().includes(query) || false;
      const aliasMatch = city.aliases?.some((a: string) => a.toLowerCase().includes(query)) || false;
      const sourceMatch = city.source?.toLowerCase().includes(query) || false;
      
      // Look up country from static list
      const staticEntry = CITY_DATABASE.find(
        c => c.city.toLowerCase() === city.cityName.toLowerCase()
      );
      const country = staticEntry?.country || 'India';
      const countryMatch = country.toLowerCase().includes(query);

      return nameMatch || stateMatch || aliasMatch || countryMatch || sourceMatch;
    });
  }, [searchQuery, cities]);

  // 2. Group by country & sort alphabetically inside each country
  const groupedAndSorted = useMemo(() => {
    const groups: Record<string, any[]> = {};

    filteredCities.forEach(city => {
      // Find country from CITY_DATABASE or default to 'India'
      const staticEntry = CITY_DATABASE.find(
        c => c.city.toLowerCase() === city.cityName.toLowerCase()
      );
      const country = staticEntry?.country || 'India';

      if (!groups[country]) {
        groups[country] = [];
      }
      groups[country].push(city);
    });

    // Sort cities alphabetically in each group
    Object.keys(groups).forEach(country => {
      groups[country].sort((a, b) => a.cityName.localeCompare(b.cityName));
    });

    return groups;
  }, [filteredCities]);

  // 3. Sort countries (India first, others alphabetically)
  const sortedCountries = useMemo(() => {
    return Object.keys(groupedAndSorted).sort((a, b) => {
      if (a === 'India') return -1;
      if (b === 'India') return 1;
      return a.localeCompare(b);
    });
  }, [groupedAndSorted]);

  return (
    <div className="space-y-6">
      {/* Search Input Bar */}
      <div className="relative max-w-md">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
          <Search className="w-5 h-5" />
        </div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search cities by name, state, country, or aliases..."
          className="w-full pl-10 pr-10 py-2 border border-gray-300 dark:border-gray-750 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm font-jakarta"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {sortedCountries.length > 0 ? (
        <div className="space-y-8">
          {sortedCountries.map(country => {
            const countryCities = groupedAndSorted[country];
            return (
              <div key={country} className="space-y-3 font-jakarta">
                {/* Country Heading section */}
                <div className="flex items-center gap-2 px-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                    {country}
                  </span>
                  <span className="text-xs text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-700/50 px-2 py-0.5 rounded-full font-semibold">
                    {countryCities.length} {countryCities.length === 1 ? 'city' : 'cities'}
                  </span>
                  <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700/50 ml-2" />
                </div>

                {/* Cities Horizontal Rows List */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <div className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    {countryCities.map((city: any) => (
                      <div
                        key={city.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors gap-4"
                      >
                        {/* City name & state */}
                        <div className="flex items-center gap-3 min-w-[200px]">
                          <div className="p-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg text-blue-600 dark:text-blue-400">
                            <MapPin className="w-5 h-5" />
                          </div>
                          <div>
                            <h3 className="text-base font-bold text-gray-900 dark:text-white font-sora">
                              {city.cityName}
                            </h3>
                            {city.state && (
                              <p className="text-xs text-gray-500 dark:text-gray-400 font-jakarta mt-0.5">
                                {city.state}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Aliases, Coordinates, Status */}
                        <div className="flex-1 flex flex-wrap items-center gap-x-8 gap-y-2 text-sm text-gray-600 dark:text-gray-300 font-jakarta">
                          {city.aliases && city.aliases.length > 0 && (
                            <div className="min-w-[150px]">
                              <span className="text-xs text-gray-400 block font-semibold mb-0.5">Aliases:</span>
                              <span className="font-mono text-xs bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded text-gray-800 dark:text-gray-200">
                                {city.aliases.join(', ')}
                              </span>
                            </div>
                          )}

                          <div className="min-w-[120px]">
                            <span className="text-xs text-gray-400 block font-semibold mb-0.5">Coordinates:</span>
                            <span className="text-xs font-mono">
                              {city.latitude && Number(city.latitude) !== 0
                                ? `${Number(city.latitude).toFixed(4)}, ${Number(city.longitude).toFixed(4)}`
                                : 'N/A'}
                            </span>
                          </div>

                          <div>
                            <span className="text-xs text-gray-400 block font-semibold mb-0.5">Status:</span>
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                                  city.isActive
                                    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                    : 'bg-gray-100 text-gray-850 dark:bg-gray-700 dark:text-gray-400'
                                }`}
                              >
                                {city.isActive ? 'Active' : 'Inactive'}
                              </span>
                              {city.source === 'custom' && (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                                  Custom
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 self-end sm:self-auto">
                          {city.source === 'custom' && !city.isActive && (
                            <button
                              onClick={() => approveCity(city.id)}
                              disabled={approvingId === city.id}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-semibold hover:bg-green-700 transition-colors disabled:opacity-50"
                            >
                              <CheckCircle className="w-3.5 h-3.5" />
                              {approvingId === city.id ? 'Approving...' : 'Approve'}
                            </button>
                          )}
                          <Link
                            href={`/cities/${city.id}/edit`}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded-lg text-xs font-semibold text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                          >
                            Edit
                          </Link>
                          <DeleteButton
                            itemId={city.id}
                            itemName={city.cityName}
                            deleteEndpoint={`/api/cities/${city.id}/delete`}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-12 text-center">
          <Search className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2 font-sora">
            No matching cities found
          </h3>
          <p className="text-gray-500 dark:text-gray-400 text-sm font-jakarta">
            Try adjusting your search keywords to find the registered city
          </p>
        </div>
      )}
    </div>
  );
}
