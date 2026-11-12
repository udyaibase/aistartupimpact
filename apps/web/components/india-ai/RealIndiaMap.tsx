'use client';

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { ComposableMap, Geographies, Geography, Marker, ZoomableGroup } from 'react-simple-maps';
import { MapPin, Filter, X, Building2, Tag, DollarSign, Calendar, Info, Plus, Minus, RotateCcw, Briefcase, Trophy, Play, Pause, Search, Maximize2, Minimize2, Map as MapIcon, List, Radio, Rocket, TrendingUp } from 'lucide-react';
import indiaStates from './india-states.geo.json';
import Image from 'next/image';
import {
  buildCityRows, CLUSTER_BELOW_ZOOM, easeInOutCubic, fitGeometry, formatMetric, HEAT_COLORS, hasHistory, heatBins, heatColor,
  activeCityIds, labelledIds, METRICS, metricValue, rupees, stateSlug, TIMELAPSE_FROM, toPoints,
  type CityMetrics, type CityRow, type MapData, type MapPoint, type MapStartup, type Metric,
} from './map-model';

interface RealIndiaMapProps {
  data: MapData;
}

// State outlines, simplified for display and bundled with this component (see india-states.geo.json).
const INDIA_GEO_JSON = indiaStates as unknown as Record<string, unknown>;

const STAGES = ['All Stages', 'Bootstrapped', 'Pre-seed', 'Seed', 'Pre-Series A', 'Series A', 'Series B', 'Series C', 'Growth'];
const YEARS = ['All Years', '2024-2026', '2021-2023', '2018-2020', 'Before 2018'];

const INITIAL_CENTER: [number, number] = [78.9629, 20.5937];
const MIN_ZOOM = 0.8;
const MAX_ZOOM = 8;

/** Normalise state names between the outline data (UPPERCASE) and city data (Title Case). */
function normalizeStateName(name: string): string {
  return name.trim().toLowerCase().replace(/&/g, 'and').replace(/\s+/g, ' ');
}

const titleCase = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\bAnd\b/g, '&');

// The states and territories drawn on the map. A city is plotted only if its state is one of these: cities abroad
// (San Francisco, Dhaka, Colombo, …) or with bad coordinates (Tampa stored at +82° instead of −82°) showed as stray
// dots on the map's edge or inside the wrong state.
const STATE_FEATURES = (indiaStates as { features: { properties: { STNAME: string }; geometry: any }[] }).features;
const MAP_STATES = new Set(STATE_FEATURES.map((f) => normalizeStateName(f.properties.STNAME)));
const STATE_FIT = new Map(STATE_FEATURES.map((f) => [normalizeStateName(f.properties.STNAME), fitGeometry(f.geometry)]));
const STATE_BY_SLUG = new Map(STATE_FEATURES.map((f) => [stateSlug(f.properties.STNAME), f.properties.STNAME]));

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export default function RealIndiaMap({ data: rawData }: RealIndiaMapProps) {
  // Only cities inside the drawn states (abroad or mis-geocoded cities would be stray dots).
  const data = useMemo(() => ({ ...rawData, cities: rawData.cities.filter((c) => c.state && MAP_STATES.has(normalizeStateName(c.state))) }), [rawData]);
  const [metric, setMetric] = useState<Metric>('startups');
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [selectedCity, setSelectedCity] = useState<CityRow | null>(null);
  /** A startup picked in search: shown first in its city's list. */
  const [pinnedStartup, setPinnedStartup] = useState<string | null>(null);
  const [hover, setHover] = useState<{ kind: 'point'; point: MapPoint<CityRow> } | { kind: 'state'; name: string } | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [showFilters, setShowFilters] = useState(false);
  const [position, setPosition] = useState<{ coordinates: [number, number]; zoom: number }>({ coordinates: INITIAL_CENTER, zoom: 1 });
  const mapRef = useRef<HTMLDivElement>(null);
  // Touch screens never send "mouse left", so a tapped card would stay stuck over the map; there the sidebar
  // (shown on tap) carries the same details.
  const [canHover, setCanHover] = useState(false);
  useEffect(() => { setCanHover(window.matchMedia?.('(hover: hover) and (pointer: fine)').matches ?? false); }, []);
  const anim = useRef<number | null>(null);

  // Time-lapse: null = today; a year shows startups founded and funding raised up to then.
  const nowYear = new Date().getFullYear();
  const [year, setYear] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const timelapse = hasHistory(metric);
  useEffect(() => { if (!timelapse) { setYear(null); setPlaying(false); } }, [timelapse]);
  useEffect(() => {
    if (!playing) return;
    const t = setTimeout(() => {
      setYear((y) => {
        const next = (y ?? TIMELAPSE_FROM - 1) + 1;
        if (next >= nowYear) { setPlaying(false); return null; }
        return next;
      });
    }, year == null ? 300 : 750);
    return () => clearTimeout(t);
  }, [playing, year, nowYear]);
  const play = () => {
    if (anim.current) cancelAnimationFrame(anim.current);
    setSelectedCity(null); setSelectedState(null); setPosition({ coordinates: INITIAL_CENTER, zoom: 1 });
    setYear(TIMELAPSE_FROM); setPlaying(true);
  };

  // Filters (they narrow the startups behind the Startups and Funding views).
  const [sectorFilter, setSectorFilter] = useState('All Sectors');
  const [stageFilter, setStageFilter] = useState('All Stages');
  const [yearFilter, setYearFilter] = useState('All Years');
  const activeFiltersCount = [sectorFilter, stageFilter, yearFilter].filter((f) => !f.startsWith('All')).length;
  const sectors = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of data.startups) if (s.sector && s.sector !== 'Other') counts.set(s.sector, (counts.get(s.sector) ?? 0) + 1);
    return ['All Sectors', ...[...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k)];
  }, [data.startups]);
  const filters = useMemo(() => ({ sector: sectorFilter, stage: stageFilter, years: yearFilter }), [sectorFilter, stageFilter, yearFilter]);

  // Every city with its metrics (shared with the rankings page via buildCityRows). Dot sizes, labels, the
  // heat map and the sidebar all read these rows, so a dot's number and what clicking it shows always agree.
  const rows: CityRow[] = useMemo(() => buildCityRows(data, { filters, year }), [data, filters, year]);
  // Today's rows fix the scale during the time-lapse, so dots and colours visibly grow year by year.
  const todayRows: CityRow[] = useMemo(() => (year == null ? rows : buildCityRows(data, { filters })), [data, filters, year, rows]);

  const points = useMemo(() => toPoints(rows, position.zoom).filter((p) => metricValue(p.metrics, metric) > 0), [rows, position.zoom, metric]);
  const labelled = useMemo(() => labelledIds(points, metric, position.zoom), [points, metric, position.zoom]);
  const maxValue = useMemo(() => Math.max(1, ...toPoints(todayRows, position.zoom).map((p) => metricValue(p.metrics, metric))), [todayRows, position.zoom, metric]);
  const markerSize = (v: number) => 3 + Math.sqrt(v / maxValue) * 11;

  // State totals for the heat map and leaderboard.
  const stateTotals = useMemo(() => {
    const m = new Map<string, CityMetrics>();
    for (const r of rows) {
      const k = normalizeStateName(r.state);
      const t = m.get(k) ?? { startups: 0, fundingPaise: 0, jobs: 0, events: 0 };
      m.set(k, { startups: t.startups + r.metrics.startups, fundingPaise: t.fundingPaise + r.metrics.fundingPaise, jobs: t.jobs + r.metrics.jobs, events: t.events + r.metrics.events });
    }
    return m;
  }, [rows]);
  const bins = useMemo(() => {
    const totals = new Map<string, number>();
    for (const r of todayRows) totals.set(normalizeStateName(r.state), (totals.get(normalizeStateName(r.state)) ?? 0) + metricValue(r.metrics, metric));
    return heatBins([...totals.values()]);
  }, [todayRows, metric]);
  const national = useMemo(() => [...stateTotals.values()].reduce<CityMetrics>((a, t) => ({
    startups: a.startups + t.startups, fundingPaise: a.fundingPaise + t.fundingPaise, jobs: a.jobs + t.jobs, events: a.events + t.events,
  }), { startups: 0, fundingPaise: 0, jobs: 0, events: 0 }), [stateTotals]);

  // ── Selection ──
  const stateCities = useMemo(() => (selectedState ? rows.filter((c) => normalizeStateName(c.state) === normalizeStateName(selectedState)) : []), [selectedState, rows]);
  const sidebarCities = selectedCity ? [selectedCity] : stateCities;
  const sidebarStartups = useMemo(
    () => sidebarCities.flatMap((c) => c.startups)
      .sort((a, b) => Number(b.totalFundingInr || 0) - Number(a.totalFundingInr || 0))
      .sort((a, b) => Number(b.id === pinnedStartup) - Number(a.id === pinnedStartup)), // a startup picked in search comes first
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sidebarCities, pinnedStartup],
  );
  const sidebarMetrics = sidebarCities.reduce<CityMetrics>((a, c) => ({
    startups: a.startups + c.metrics.startups, fundingPaise: a.fundingPaise + c.metrics.fundingPaise, jobs: a.jobs + c.metrics.jobs, events: a.events + c.metrics.events,
  }), { startups: 0, fundingPaise: 0, jobs: 0, events: 0 });

  // ── Camera ──
  const flyTo = useCallback((center: [number, number], zoom: number) => {
    const target = { coordinates: center, zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom)) };
    if (anim.current) cancelAnimationFrame(anim.current);
    if (reducedMotion()) { setPosition(target); return; }
    const from = position;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 650);
      const e = easeInOutCubic(t);
      setPosition({
        coordinates: [from.coordinates[0] + (target.coordinates[0] - from.coordinates[0]) * e, from.coordinates[1] + (target.coordinates[1] - from.coordinates[1]) * e],
        zoom: from.zoom + (target.zoom - from.zoom) * e,
      });
      anim.current = t < 1 ? requestAnimationFrame(step) : null;
    };
    anim.current = requestAnimationFrame(step);
  }, [position]);
  useEffect(() => () => { if (anim.current) cancelAnimationFrame(anim.current); }, []);

  const zoomBy = (factor: number) => flyTo(position.coordinates, position.zoom * factor);
  const resetView = () => { flyTo(INITIAL_CENTER, 1); };
  const moved = Math.abs(position.zoom - 1) > 0.01 || Math.abs(position.coordinates[0] - INITIAL_CENTER[0]) > 0.01 || Math.abs(position.coordinates[1] - INITIAL_CENTER[1]) > 0.01;

  function selectState(stateName: string) {
    const k = normalizeStateName(stateName);
    if (selectedState && normalizeStateName(selectedState) === k && !selectedCity) {
      setSelectedState(null);
      flyTo(INITIAL_CENTER, 1);
      return;
    }
    setSelectedState(stateName);
    setSelectedCity(null);
    const fit = STATE_FIT.get(k);
    if (fit) flyTo(fit.center, fit.zoom);
  }

  function selectPoint(p: MapPoint<CityRow>) {
    if (p.cluster) {
      // A metro: fly in far enough that its cities separate.
      flyTo(p.coordinates, Math.max(CLUSTER_BELOW_ZOOM + 0.6, position.zoom));
      setSelectedState(p.cities[0].state);
      setSelectedCity(null);
      return;
    }
    const c = p.cities[0];
    setSelectedCity(c);
    setSelectedState(c.state);
    flyTo(p.coordinates, Math.max(3.2, position.zoom));
  }

  const clearSelection = () => { setSelectedState(null); setSelectedCity(null); flyTo(INITIAL_CENTER, 1); };

  // ── Live activity: ticker + pulsing cities ──
  const activity = useMemo(() => data.activity ?? [], [data.activity]);
  const pulsing = useMemo(() => activeCityIds(rows, activity), [rows, activity]);
  const [tick, setTick] = useState(0);
  const [tickerPaused, setTickerPaused] = useState(false);
  useEffect(() => {
    if (activity.length < 2 || tickerPaused || reducedMotion()) return;
    const t = setInterval(() => setTick((i) => (i + 1) % activity.length), 4500);
    return () => clearInterval(t);
  }, [activity.length, tickerPaused]);

  // ── Sector chips (same state as the Sector filter) ──
  const topSectors = useMemo(() => {
    const counts = new Map<string, number>();
    for (const st of data.startups) if (st.sector && st.sector !== 'Other') counts.set(st.sector, (counts.get(st.sector) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [data.startups]);

  // ── Search: cities, states and startups → fly there ──
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const out: { kind: 'city' | 'state' | 'startup'; label: string; sub: string; run: () => void }[] = [];
    for (const c of rows) if (c.cityName.toLowerCase().includes(q) || c.aliases?.some((a) => a.toLowerCase().includes(q))) {
      out.push({ kind: 'city', label: c.cityName, sub: titleCase(c.state), run: () => selectPoint({ id: c.id, name: c.cityName, coordinates: [c.longitude, c.latitude], metrics: c.metrics, cities: [c], cluster: false }) });
    }
    for (const [slug, name] of STATE_BY_SLUG) if (name.toLowerCase().includes(q) && stateTotals.has(normalizeStateName(name))) {
      out.push({ kind: 'state', label: titleCase(name), sub: 'State', run: () => selectState(name) });
      void slug;
    }
    for (const st of data.startups) {
      if (out.length >= 10) break;
      if (!st.name.toLowerCase().includes(q)) continue;
      const c = rows.find((r) => r.startups.some((x) => x.id === st.id)) ?? rows.find((r) => r.slug && st.headquartersCity && r.cityName.toLowerCase() === st.headquartersCity.toLowerCase());
      if (!c) continue;
      out.push({ kind: 'startup', label: st.name, sub: c.cityName, run: () => { setPinnedStartup(st.id); selectPoint({ id: c.id, name: c.cityName, coordinates: [c.longitude, c.latitude], metrics: c.metrics, cities: [c], cluster: false }); } });
    }
    return out.slice(0, 10);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, rows, data.startups, stateTotals]);
  const pick = (r: { run: () => void }) => { r.run(); setQuery(''); setSearchOpen(false); setMode('map'); };

  // ── Map / list view, and full screen ──
  const [mode, setMode] = useState<'map' | 'list'>('map');
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    if (!fullscreen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFullscreen(false); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [fullscreen]);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvas, setCanvas] = useState({ w: 800, h: 800 });
  useEffect(() => {
    if (!fullscreen || !canvasRef.current) { setCanvas({ w: 800, h: 800 }); return; }
    const el = canvasRef.current;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      if (width < 10 || height < 10) return;
      // Keep the short side at 800 units (what the projection scale is tuned for) and extend the long side.
      setCanvas(width >= height ? { w: Math.round((800 * width) / height), h: 800 } : { w: 800, h: Math.round((800 * height) / width) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fullscreen, mode]);
  const listRows = useMemo(() => rows.filter((c) => c.metrics.startups + c.metrics.jobs + c.metrics.events > 0)
    .sort((a, b) => metricValue(b.metrics, metric) - metricValue(a.metrics, metric) || b.metrics.startups - a.metrics.startups), [rows, metric]);

  const trackCursor = (e: React.MouseEvent) => {
    const r = mapRef.current?.getBoundingClientRect();
    if (r) setCursor({ x: e.clientX - r.left, y: e.clientY - r.top });
  };

  // Leaderboards for the default sidebar.
  const topStates = useMemo(() => [...stateTotals.entries()]
    .map(([k, t]) => ({ key: k, name: titleCase(k), value: metricValue(t, metric) }))
    .filter((s) => s.value > 0).sort((a, b) => b.value - a.value).slice(0, 6), [stateTotals, metric]);
  const topCities = useMemo(() => toPoints(rows, 1)
    .map((p) => ({ p, value: metricValue(p.metrics, metric) }))
    .filter((x) => x.value > 0).sort((a, b) => b.value - a.value).slice(0, 6), [rows, metric]);

  const metricHelp = metric === 'jobs' ? 'Open on-site and hybrid jobs' : metric === 'events' ? 'Upcoming in-person events' : metric === 'funding' ? 'Total funding raised by startups headquartered there' : 'AI startups headquartered there';

  return (
    <div className="relative">
      {/* Metric switch + filters */}
      <div className="mb-4 sm:mb-6 flex flex-wrap items-center gap-2 sm:gap-3">
        <div role="tablist" aria-label="Map shows" className="inline-flex rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-1 shadow-sm overflow-x-auto max-w-full">
          {METRICS.map((m) => (
            <button key={m.key} role="tab" aria-selected={metric === m.key} onClick={() => setMetric(m.key)}
              className={`px-3 sm:px-4 py-1.5 rounded-lg text-xs sm:text-sm font-semibold font-jakarta whitespace-nowrap transition-colors ${metric === m.key ? 'bg-brand text-white shadow' : 'text-gray-600 dark:text-gray-300 hover:text-navy dark:hover:text-white'}`}>
              {m.label}
            </button>
          ))}
        </div>
        <button onClick={() => setShowFilters(!showFilters)}
          className={`inline-flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${showFilters || activeFiltersCount > 0 ? 'bg-brand text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>
          <Filter className="w-4 h-4" aria-hidden /> Filters
          {activeFiltersCount > 0 && <span className="px-1.5 py-0.5 bg-white/20 rounded text-xs">{activeFiltersCount}</span>}
        </button>
        {activeFiltersCount > 0 && (
          <button onClick={() => { setSectorFilter('All Sectors'); setStageFilter('All Stages'); setYearFilter('All Years'); }} className="text-sm text-gray-600 dark:text-gray-400 hover:text-brand transition-colors">
            Clear filters
          </button>
        )}
        {/* Search: a city, state or startup */}
        <div className="relative w-full sm:w-auto sm:ml-auto order-last sm:order-none">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" aria-hidden />
          <input value={query} onChange={(e) => { setQuery(e.target.value); setSearchOpen(true); }} onFocus={() => setSearchOpen(true)}
            onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
            onKeyDown={(e) => { if (e.key === 'Enter' && results[0]) pick(results[0]); if (e.key === 'Escape') setSearchOpen(false); }}
            placeholder="Find a city or startup" aria-label="Find a city, state or startup on the map" role="combobox" aria-expanded={searchOpen && results.length > 0} aria-controls="map-search-results"
            className="w-full sm:w-56 pl-9 pr-3 py-2 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-sm text-navy dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand" />
          {searchOpen && results.length > 0 && (
            <ul id="map-search-results" role="listbox" className="absolute left-0 right-0 sm:right-auto z-30 mt-1 sm:w-72 max-h-80 overflow-auto rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-2xl py-1">
              {results.map((r) => (
                <li key={`${r.kind}-${r.label}-${r.sub}`} role="option" aria-selected={false}>
                  <button onMouseDown={(e) => e.preventDefault()} onClick={() => pick(r)} className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800">
                    <span className={`text-[10px] font-bold uppercase rounded px-1.5 py-0.5 ${r.kind === 'startup' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'}`}>{r.kind}</span>
                    <span className="text-sm font-semibold text-navy dark:text-white truncate">{r.label}</span>
                    <span className="ml-auto text-xs text-gray-400 shrink-0">{r.sub}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-0.5" role="group" aria-label="View">
          <button onClick={() => setMode('map')} aria-pressed={mode === 'map'} className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold ${mode === 'map' ? 'bg-gray-100 dark:bg-gray-800 text-navy dark:text-white' : 'text-gray-500'}`}><MapIcon className="w-3.5 h-3.5" aria-hidden /> Map</button>
          <button onClick={() => setMode('list')} aria-pressed={mode === 'list'} className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold ${mode === 'list' ? 'bg-gray-100 dark:bg-gray-800 text-navy dark:text-white' : 'text-gray-500'}`}><List className="w-3.5 h-3.5" aria-hidden /> List</button>
        </div>
      </div>

      {/* Live activity ticker */}
      {activity.length > 0 && (
        <div className="mb-3 flex items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-2 overflow-hidden"
          onMouseEnter={() => setTickerPaused(true)} onMouseLeave={() => setTickerPaused(false)} aria-live="polite">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-red-500 shrink-0">
            <span className="relative flex w-2 h-2"><span className="absolute inline-flex w-full h-full rounded-full bg-red-500 opacity-60 animate-ping motion-reduce:animate-none" /><span className="relative inline-flex w-2 h-2 rounded-full bg-red-500" /></span>
            Live
          </span>
          {(() => {
            const a = activity[tick % activity.length];
            return (
              <a key={tick} href={a.href} className="flex-1 min-w-0 truncate text-sm font-jakarta text-gray-700 dark:text-gray-200 hover:text-brand animate-fade-in">
                {(() => { const Icon = a.kind === 'round' ? TrendingUp : a.kind === 'job' ? Briefcase : Rocket; return <Icon className={`inline w-3.5 h-3.5 mr-1.5 -mt-0.5 ${a.kind === 'round' ? 'text-emerald-500' : a.kind === 'job' ? 'text-blue-500' : 'text-brand'}`} aria-hidden />; })()}{a.text}
                <span className="ml-2 text-xs text-gray-400">{new Date(a.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })}</span>
              </a>
            );
          })()}
          <Radio className="w-4 h-4 text-gray-300 shrink-0 hidden sm:block" aria-hidden />
        </div>
      )}

      {/* Sector chips: recolour the map by sector (same as the Sector filter) */}
      {topSectors.length > 0 && (metric === 'startups' || metric === 'funding') && (
        <div className="mb-3 flex gap-2 overflow-x-auto pb-1 -mx-1 px-1" role="group" aria-label="Sector">
          {[['All Sectors', data.startups.length] as [string, number], ...topSectors].map(([name, n]) => (
            <button key={name} onClick={() => setSectorFilter(name)} aria-pressed={sectorFilter === name}
              className={`shrink-0 px-3 py-1.5 rounded-md text-xs font-semibold font-jakarta border transition-colors ${sectorFilter === name ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-transparent' : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-800 hover:border-gray-400'}`}>
              {name === 'All Sectors' ? 'All sectors' : name} <span className="opacity-60">{n}</span>
            </button>
          ))}
        </div>
      )}

      {/* Time-lapse (startups founded / funding raised over the years) */}
      {timelapse && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-2">
          <button onClick={() => (playing ? setPlaying(false) : play())} aria-label={playing ? 'Pause time-lapse' : 'Play time-lapse'}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand text-white px-3 py-1.5 text-xs sm:text-sm font-semibold shrink-0">
            {playing ? <Pause className="w-3.5 h-3.5" aria-hidden /> : <Play className="w-3.5 h-3.5" aria-hidden />}
            <span className="hidden sm:inline">{playing ? 'Pause' : `Watch ${TIMELAPSE_FROM}–${nowYear}`}</span>
          </button>
          <input type="range" min={TIMELAPSE_FROM} max={nowYear} step={1} value={year ?? nowYear}
            onChange={(e) => { setPlaying(false); const v = Number(e.target.value); setYear(v >= nowYear ? null : v); }}
            aria-label="Year" className="flex-1 accent-[var(--brand-color)]" />
          <span className="font-sora font-bold text-sm text-navy dark:text-white w-14 text-right">{year ?? 'Today'}</span>
        </div>
      )}

      {showFilters && (
        <div className="mb-6 card p-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
          {([['Sector', Tag, sectorFilter, setSectorFilter, sectors], ['Stage', DollarSign, stageFilter, setStageFilter, STAGES], ['Year founded', Calendar, yearFilter, setYearFilter, YEARS]] as const).map(([label, Icon, value, set, options]) => (
            <div key={label}>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2"><Icon className="w-4 h-4" aria-hidden /> {label}</label>
              <select value={value} onChange={(e) => set(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand">
                {options.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          ))}
          <p className="sm:col-span-3 text-xs text-gray-500 dark:text-gray-400">Filters apply to the Startups and Funding views.</p>
        </div>
      )}

      <div className={fullscreen ? 'fixed inset-0 z-[400] bg-slate-950 p-2 sm:p-4 flex flex-col lg:flex-row gap-4' : 'grid grid-cols-1 lg:grid-cols-3 gap-6'}
        role={fullscreen ? 'dialog' : undefined} aria-modal={fullscreen || undefined} aria-label={fullscreen ? 'India AI map, full screen' : undefined}>
        {/* Map (or the accessible list of the same data) */}
        <div className={fullscreen ? 'flex-1 min-h-0 min-w-0' : 'lg:col-span-2'}>
          {mode === 'list' && !fullscreen ? (
            <div className="card overflow-hidden">
              <div className="overflow-x-auto max-h-[640px]">
                <table className="w-full min-w-[560px] text-sm font-jakarta">
                  <caption className="sr-only">AI startups, funding, open jobs and upcoming events by city, sorted by {METRICS.find((m) => m.key === metric)!.label}</caption>
                  <thead className="bg-gray-50 dark:bg-gray-800/60 sticky top-0">
                    <tr>{['#', 'City', 'Startups', 'Raised', 'Open jobs', 'Events'].map((h) => <th key={h} scope="col" className="px-3 py-2.5 text-left text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">{h}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {listRows.map((c, i) => (
                      <tr key={c.id} className="hover:bg-gray-50/60 dark:hover:bg-gray-800/30">
                        <td className="px-3 py-2 text-gray-400 font-bold">{i + 1}</td>
                        <th scope="row" className="px-3 py-2 text-left font-normal">
                          <button onClick={() => { setMode('map'); selectPoint({ id: c.id, name: c.cityName, coordinates: [c.longitude, c.latitude], metrics: c.metrics, cities: [c], cluster: false }); }} className="font-sora font-bold text-navy dark:text-white hover:text-brand">{c.cityName}</button>
                          <span className="block text-xs text-gray-500">{titleCase(c.state)}</span>
                        </th>
                        <td className="px-3 py-2 font-semibold">{c.metrics.startups}</td>
                        <td className="px-3 py-2">{c.metrics.fundingPaise > 0 ? rupees(c.metrics.fundingPaise) : '—'}</td>
                        <td className="px-3 py-2">{c.metrics.jobs || '—'}</td>
                        <td className="px-3 py-2">{c.metrics.events || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
          <div ref={mapRef} onMouseMove={trackCursor} onMouseLeave={() => setHover(null)}
            className={`card p-3 sm:p-4 bg-gradient-to-br from-slate-950 via-blue-950 to-indigo-950 overflow-hidden relative shadow-2xl border border-blue-900/30 ${fullscreen ? 'h-full flex flex-col' : ''}`}>
            <div className="absolute inset-0 bg-gradient-to-t from-blue-500/10 to-transparent pointer-events-none" />
            {/* Year overlay during the time-lapse */}
            {timelapse && year != null && (
              <div className="pointer-events-none absolute top-3 left-4 z-10 font-sora font-extrabold text-4xl sm:text-6xl text-white/90 tracking-tight drop-shadow-lg" aria-live="polite">
                {year}
                <span className="block text-xs sm:text-sm font-jakarta font-semibold text-cyan-300 tracking-normal">
                  {metric === 'funding' ? `${rupees(rows.reduce((n, r) => n + r.metrics.fundingPaise, 0))} raised so far` : `${rows.reduce((n, r) => n + r.metrics.startups, 0).toLocaleString('en-IN')} AI startups founded`}
                </span>
              </div>
            )}

            {/* Zoom controls */}
            <div className="absolute top-3 right-3 z-10 flex flex-col overflow-hidden rounded-xl border border-white/15 bg-slate-900/80 backdrop-blur shadow-lg" role="group" aria-label="Map zoom">
              <button type="button" onClick={() => zoomBy(1.5)} disabled={position.zoom >= MAX_ZOOM - 0.01} aria-label="Zoom in" title="Zoom in"
                className="w-9 h-9 flex items-center justify-center text-white hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                <Plus className="w-4 h-4" aria-hidden />
              </button>
              <button type="button" onClick={() => zoomBy(1 / 1.5)} disabled={position.zoom <= MIN_ZOOM + 0.01} aria-label="Zoom out" title="Zoom out"
                className="w-9 h-9 flex items-center justify-center text-white border-t border-white/10 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                <Minus className="w-4 h-4" aria-hidden />
              </button>
              <button type="button" onClick={() => setFullscreen((f) => !f)} aria-label={fullscreen ? 'Exit full screen' : 'Full screen'} title={fullscreen ? 'Exit full screen (Esc)' : 'Full screen'}
                className="w-9 h-9 flex items-center justify-center text-white border-t border-white/10 hover:bg-white/10 transition-colors">
                {fullscreen ? <Minimize2 className="w-4 h-4" aria-hidden /> : <Maximize2 className="w-4 h-4" aria-hidden />}
              </button>
              <button type="button" onClick={resetView} disabled={!moved} aria-label="Reset map view" title="Reset view"
                className="w-9 h-9 flex items-center justify-center text-white border-t border-white/10 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                <RotateCcw className="w-4 h-4" aria-hidden />
              </button>
            </div>

            <div ref={canvasRef} className={fullscreen ? 'relative flex-1 min-h-0 -mx-3 sm:-mx-4 -mt-3 sm:-mt-4 [&>svg]:absolute [&>svg]:inset-0 [&>svg]:w-full [&>svg]:h-full' : 'w-full aspect-square max-h-[600px] flex items-center justify-center'}>
              <ComposableMap projection="geoMercator" projectionConfig={{ scale: 1050, center: [82.8, 22.5] }} width={canvas.w} height={canvas.h} className={fullscreen ? '' : 'w-full h-auto'}>
                <ZoomableGroup zoom={position.zoom} center={position.coordinates}
                  onMoveEnd={(p: { coordinates: [number, number]; zoom: number }) => { if (!anim.current) setPosition(p); }}
                  minZoom={MIN_ZOOM} maxZoom={MAX_ZOOM}>
                  <Geographies geography={INDIA_GEO_JSON}>
                    {({ geographies }) => geographies.map((geo, i) => {
                      const stateName: string = geo.properties?.STNAME || '';
                      const k = normalizeStateName(stateName);
                      const selected = !!selectedState && normalizeStateName(selectedState) === k;
                      const value = metricValue(stateTotals.get(k) ?? { startups: 0, fundingPaise: 0, jobs: 0, events: 0 }, metric);
                      const fill = heatColor(value, bins);
                      return (
                        <Geography key={geo.rsmKey || `geo-${i}`} geography={geo}
                          onClick={() => selectState(stateName)}
                          onMouseEnter={() => setHover({ kind: 'state', name: stateName })}
                          onMouseLeave={() => setHover((h) => (h?.kind === 'state' ? null : h))}
                          style={{
                            default: { fill, stroke: selected ? '#e0f2fe' : 'rgba(148,197,253,0.35)', strokeWidth: selected ? 2 : 0.6, outline: 'none', cursor: 'pointer', transition: 'fill 300ms ease' },
                            hover: { fill, stroke: '#e0f2fe', strokeWidth: 1.6, outline: 'none', cursor: 'pointer', filter: 'brightness(1.25)' },
                            pressed: { fill, stroke: '#ffffff', strokeWidth: 2, outline: 'none' },
                          }}
                        />
                      );
                    })}
                  </Geographies>

                  {points.map((p) => {
                    const v = metricValue(p.metrics, metric);
                    const r = markerSize(v);
                    const isSelected = !p.cluster && selectedCity?.id === p.id;
                    const isHovered = hover?.kind === 'point' && hover.point.id === p.id;
                    const showLabel = isSelected || isHovered || labelled.has(p.id);
                    return (
                      <Marker key={p.id} coordinates={p.coordinates}
                        onMouseEnter={() => setHover({ kind: 'point', point: p })}
                        onMouseLeave={() => setHover((h) => (h?.kind === 'point' && h.point.id === p.id ? null : h))}
                        onClick={() => selectPoint(p)}>
                        <g style={{ cursor: 'pointer', outline: 'none' }} transform={`scale(${1 / position.zoom})`} role="button" tabIndex={0}
                          aria-label={`${p.name}: ${formatMetric(v, metric)}${p.cities.some((c) => pulsing.has(c.id)) ? ', new activity this fortnight' : ''}`}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectPoint(p); } }}
                          onFocus={() => setHover({ kind: 'point', point: p })} onBlur={() => setHover(null)}>
                          {isSelected && <circle r={r + 10} fill="rgba(34, 211, 238, 0.18)" className="animate-ping" />}
                          {/* Pulse: new startups, rounds or jobs here in the last two weeks */}
                          {!isSelected && p.cities.some((c) => pulsing.has(c.id)) && !reducedMotion() && (
                            <circle r={r} fill="none" stroke="#f472b6" strokeWidth={2}>
                              <animate attributeName="r" from={r} to={r + 14} dur="2s" repeatCount="indefinite" />
                              <animate attributeName="opacity" from="0.9" to="0" dur="2s" repeatCount="indefinite" />
                            </circle>
                          )}
                          <circle r={isSelected || isHovered ? r + 2 : r}
                            fill={p.cluster ? '#f59e0b' : isSelected ? '#22d3ee' : isHovered ? '#67e8f9' : '#38bdf8'}
                            fillOpacity={0.92} stroke="white" strokeWidth={isSelected || isHovered ? 2.5 : 1.4}
                            style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.45))', transition: 'r 200ms ease' }} />
                          {showLabel && (
                            <>
                              <text textAnchor="middle" y={r + 13} style={{ fontSize: isSelected || isHovered ? '11.5px' : '10.5px', fontWeight: 700, fill: 'white', paintOrder: 'stroke', stroke: 'rgba(2,6,23,0.85)', strokeWidth: 3, pointerEvents: 'none' }}>
                                {p.name}
                              </text>
                              <text textAnchor="middle" y={r + 25} style={{ fontSize: '9.5px', fontWeight: 700, fill: '#67e8f9', paintOrder: 'stroke', stroke: 'rgba(2,6,23,0.85)', strokeWidth: 3, pointerEvents: 'none' }}>
                                {formatMetric(v, metric)}
                              </text>
                            </>
                          )}
                        </g>
                      </Marker>
                    );
                  })}
                </ZoomableGroup>
              </ComposableMap>
            </div>

            {/* Hover card */}
            {hover && canHover && (() => {
              const byFunding = (list: MapStartup[]) => [...list].sort((a, b) => Number(b.totalFundingInr || 0) - Number(a.totalFundingInr || 0)).slice(0, 2);
              const card = hover.kind === 'point'
                ? { title: hover.point.name, tag: hover.point.cluster ? `Metro · ${hover.point.cities.length} cities` : titleCase(hover.point.cities[0].state), m: hover.point.metrics, top: byFunding(hover.point.cities.flatMap((c) => c.startups)) }
                : { title: titleCase(hover.name), tag: 'State', m: stateTotals.get(normalizeStateName(hover.name)) ?? { startups: 0, fundingPaise: 0, jobs: 0, events: 0 }, top: byFunding(rows.filter((c) => normalizeStateName(c.state) === normalizeStateName(hover.name)).flatMap((c) => c.startups)) };
              const stats: { key: Metric; label: string; value: string }[] = [
                { key: 'startups', label: 'Startups', value: card.m.startups.toLocaleString('en-IN') },
                { key: 'funding', label: 'Raised', value: card.m.fundingPaise > 0 ? rupees(card.m.fundingPaise) : '—' },
                { key: 'jobs', label: 'Open jobs', value: card.m.jobs.toLocaleString('en-IN') },
                { key: 'events', label: 'Events', value: card.m.events.toLocaleString('en-IN') },
              ];
              const lead = stats.find((x) => x.key === metric)!;
              const w = mapRef.current?.clientWidth ?? 600;
              const left = Math.min(Math.max(cursor.x + 16, 8), w - 248);
              const top = Math.max(cursor.y - 12, 8);
              return (
                <div className="pointer-events-none absolute z-20 w-[240px] rounded-lg bg-white text-slate-900 shadow-[0_12px_32px_-8px_rgba(2,6,23,0.6)] ring-1 ring-black/5 overflow-hidden" style={{ left, top }}>
                  <div className="px-3 pt-2.5 pb-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-sora font-bold text-[13px] leading-tight truncate">{card.title}</p>
                      <span className="shrink-0 max-w-[55%] truncate rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">{card.tag}</span>
                    </div>
                    <p className="mt-1.5 flex items-baseline gap-1.5">
                      <span className="font-sora text-xl font-extrabold leading-none text-brand">{lead.value}</span>
                      <span className="text-[11px] font-medium text-slate-500">{lead.label.toLowerCase()}</span>
                    </p>
                  </div>
                  <div className="grid grid-cols-3 divide-x divide-slate-100 border-t border-slate-100 bg-slate-50/70">
                    {stats.filter((x) => x.key !== metric).map((x) => (
                      <div key={x.key} className="px-2 py-1.5 text-center">
                        <p className="text-[12px] font-bold leading-tight truncate">{x.value}</p>
                        <p className="text-[9.5px] text-slate-500 leading-tight">{x.label}</p>
                      </div>
                    ))}
                  </div>
                  {card.top.length > 0 && (
                    <div className="border-t border-slate-100 px-3 py-2 space-y-1.5">
                      {card.top.map((st) => (
                        <div key={st.id} className="flex items-center gap-2 min-w-0">
                          <span className="w-5 h-5 rounded border border-slate-200 bg-white flex items-center justify-center overflow-hidden shrink-0">
                            {st.logoUrl
                              // eslint-disable-next-line @next/next/no-img-element -- logos come from many hosts
                              ? <img src={st.logoUrl} alt="" className="w-4 h-4 object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                              : <span className="text-[9px] font-bold text-slate-600">{st.name.charAt(0)}</span>}
                          </span>
                          <span className="text-[12px] font-semibold truncate">{st.name}</span>
                          {st.stage && <span className="ml-auto shrink-0 text-[10px] text-slate-500">{st.stage}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="border-t border-slate-100 px-3 py-1.5 text-[10.5px] font-semibold text-brand">{hover.kind === 'point' && hover.point.cluster ? 'Click to zoom in' : 'Click to explore'} →</p>
                </div>
              );
            })()}

            {/* Legend */}
            <div className="mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs text-slate-300">
              <div className="flex items-center gap-2" aria-label={`${METRICS.find((m) => m.key === metric)!.label} by state`}>
                <span className="text-slate-400">Fewer</span>
                <div className="flex">{HEAT_COLORS.slice(1).map((c) => <span key={c} className="w-6 h-2.5 first:rounded-l last:rounded-r" style={{ background: c }} />)}</div>
                <span className="text-slate-400">More</span>
                <span className="ml-1 text-slate-500 hidden sm:inline">· {metricHelp}</span>
              </div>
              <span className="flex items-center gap-3 text-slate-400">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500 border border-white" /> Metro area</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full border-2 border-pink-400" /> New this fortnight</span>
                <span className="flex items-center gap-1.5"><Info className="w-3.5 h-3.5" aria-hidden /> Hover or click a state or city</span>
              </span>
            </div>
          </div>
          )}
        </div>

        {/* Sidebar */}
        <div className={fullscreen
          ? (selectedState || selectedCity
              ? 'fixed z-[410] inset-x-2 bottom-2 max-h-[45vh] overflow-y-auto rounded-lg shadow-2xl lg:static lg:inset-auto lg:z-auto lg:w-[360px] lg:shrink-0 lg:max-h-none lg:shadow-none lg:flex lg:flex-col [&_.sticky]:static lg:[&>.card]:flex-1'
              : 'hidden lg:flex lg:flex-col w-[340px] shrink-0 overflow-y-auto rounded-lg [&_.sticky]:static [&>.card]:flex-1')
          : 'lg:col-span-1'}>
          {(selectedState || selectedCity) ? (
            <div className="card p-5 sm:p-6 sticky top-24 relative">
              <button onClick={clearSelection} aria-label="Close" className="absolute top-4 right-4 p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
                <X className="w-5 h-5" aria-hidden />
              </button>
              <div className="mb-4 pr-8">
                <div className="flex items-center gap-2 mb-1">
                  <MapPin className="w-5 h-5 text-brand" aria-hidden />
                  <h3 className="font-sora font-bold text-xl text-navy dark:text-white">{selectedCity ? selectedCity.cityName : titleCase(selectedState!)}</h3>
                </div>
                {selectedCity && <p className="text-sm text-gray-500 dark:text-gray-400">{selectedCity.state}</p>}
              </div>

              <dl className="grid grid-cols-2 gap-2 mb-4">
                {[['Startups', sidebarMetrics.startups.toLocaleString('en-IN')], ['Raised', rupees(sidebarMetrics.fundingPaise)], ['Open jobs', String(sidebarMetrics.jobs)], ['Upcoming events', String(sidebarMetrics.events)]].map(([k, v]) => (
                  <div key={k} className="rounded-lg bg-gray-50 dark:bg-gray-800/60 p-2.5">
                    <dt className="text-[11px] text-gray-500 dark:text-gray-400">{k}</dt>
                    <dd className="font-sora font-bold text-base text-navy dark:text-white">{v}</dd>
                  </div>
                ))}
              </dl>
              {(sidebarMetrics.jobs > 0 || sidebarMetrics.events > 0) && selectedCity && (
                <div className="mb-4 flex gap-2 text-xs font-semibold">
                  {sidebarMetrics.jobs > 0 && <a href={`/jobs?location=${encodeURIComponent(selectedCity.cityName)}`} className="inline-flex items-center gap-1 text-brand hover:underline"><Briefcase className="w-3.5 h-3.5" aria-hidden /> See jobs</a>}
                  {sidebarMetrics.events > 0 && <a href={`/events?location=${encodeURIComponent(selectedCity.cityName)}`} className="inline-flex items-center gap-1 text-brand hover:underline"><Calendar className="w-3.5 h-3.5" aria-hidden /> See events</a>}
                </div>
              )}

              {!selectedCity && stateCities.filter((c) => c.metrics.startups > 0).length > 1 && (
                <div className="mb-4 flex flex-wrap gap-1.5">
                  {stateCities.filter((c) => c.metrics.startups > 0).sort((a, b) => b.metrics.startups - a.metrics.startups).map((c) => (
                    <button key={c.id} onClick={() => selectPoint({ id: c.id, name: c.cityName, coordinates: [c.longitude, c.latitude], metrics: c.metrics, cities: [c], cluster: false })}
                      className="px-2.5 py-1 text-xs font-semibold rounded-md bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800/40 transition-colors">
                      {c.cityName} ({c.metrics.startups})
                    </button>
                  ))}
                </div>
              )}

              <div className={`space-y-2.5 ${fullscreen ? '' : 'max-h-[460px] overflow-y-auto'}`}>
                {sidebarStartups.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">No startups here match the current filters</p>
                ) : sidebarStartups.slice(0, 15).map((s) => (
                  <a key={s.id} href={`/startups/${s.slug}`} className="block p-3 bg-gray-50 dark:bg-gray-800 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded bg-white dark:bg-gray-700 flex items-center justify-center flex-shrink-0 border border-gray-200 dark:border-gray-600">
                        {s.logoUrl ? <Image src={s.logoUrl} alt={`${s.name} logo`} width={28} height={28} sizes="28px" className="object-contain" /> : <Building2 className="w-4 h-4 text-gray-400" aria-hidden />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h5 className="font-semibold text-sm text-navy dark:text-white line-clamp-1">{s.name}</h5>
                        <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-1 mt-0.5">{s.tagline}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-200 rounded font-medium">{s.stage.replace(/_/g, ' ')}</span>
                          {Number(s.totalFundingInr) > 0 && <span className="text-xs font-semibold text-green-600 dark:text-green-400">{rupees(Number(s.totalFundingInr))}</span>}
                        </div>
                      </div>
                    </div>
                  </a>
                ))}
                {sidebarStartups.length > 15 && <p className="text-xs text-center text-gray-400 pt-2">+{sidebarStartups.length - 15} more startups</p>}
              </div>
            </div>
          ) : (
            // Default: a national leaderboard for the current metric, so the panel is never empty.
            <div className="card p-5 sm:p-6 sticky top-24">
              <div className="flex items-center gap-2 mb-1">
                <Trophy className="w-5 h-5 text-brand" aria-hidden />
                <h3 className="font-sora font-bold text-lg text-navy dark:text-white">India&apos;s AI leaderboard</h3>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">{metricHelp}. Click any row or the map. <a href="/india-ai/top-cities" className="font-semibold text-brand hover:underline whitespace-nowrap">Full rankings →</a></p>
              <dl className="grid grid-cols-2 gap-2 mb-5">
                {[['Startups', national.startups.toLocaleString('en-IN')], ['Raised', rupees(national.fundingPaise)], ['Open jobs', String(national.jobs)], ['Upcoming events', String(national.events)]].map(([k, v]) => (
                  <div key={k} className="rounded-lg bg-gray-50 dark:bg-gray-800/60 p-2.5">
                    <dt className="text-[11px] text-gray-500 dark:text-gray-400">{k}</dt>
                    <dd className="font-sora font-bold text-base text-navy dark:text-white">{v}</dd>
                  </div>
                ))}
              </dl>
              {[['Top states', topStates.map((s) => ({ key: s.key, label: s.name, value: s.value, onClick: () => selectState(s.key) }))],
                ['Top cities', topCities.map(({ p, value }) => ({ key: p.id, label: p.name, value, onClick: () => selectPoint(p) }))]].map(([title, items]) => (
                (items as { key: string; label: string; value: number; onClick: () => void }[]).length > 0 && (
                  <div key={title as string} className="mb-4 last:mb-0">
                    <h4 className="font-sora font-bold text-xs uppercase tracking-wider text-gray-400 mb-2">{title as string}</h4>
                    <ol className="space-y-1">
                      {(items as { key: string; label: string; value: number; onClick: () => void }[]).map((it, i, arr) => (
                        <li key={it.key}>
                          <button onClick={it.onClick} className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-800 text-left">
                            <span className="w-5 text-xs font-bold text-gray-400">{i + 1}</span>
                            <span className="flex-1 min-w-0">
                              <span className="block text-sm font-semibold text-navy dark:text-white truncate">{it.label}</span>
                              <span className="mt-1 block h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                                <span className="block h-full rounded-full bg-gradient-to-r from-blue-600 to-cyan-400" style={{ width: `${Math.max(4, (it.value / arr[0].value) * 100)}%` }} />
                              </span>
                            </span>
                            <span className="text-xs font-semibold text-gray-600 dark:text-gray-300 shrink-0">{metric === 'funding' ? rupees(it.value) : it.value.toLocaleString('en-IN')}</span>
                          </button>
                        </li>
                      ))}
                    </ol>
                  </div>
                )
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
