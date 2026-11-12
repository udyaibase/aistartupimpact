import { standardizeCityName } from '@udyaibase/utils/src/cities';
/**
 * Pure data model for the India AI ecosystem map: per-city metrics, metro clusters, label priority,
 * heat-map bins and state bounds. No React, so it is unit-tested and the component only renders.
 */

export type Metric = 'startups' | 'funding' | 'jobs' | 'events';

export const METRICS: { key: Metric; label: string; short: string }[] = [
  { key: 'startups', label: 'Startups', short: 'startups' },
  { key: 'funding', label: 'Funding ₹', short: 'raised' },
  { key: 'jobs', label: 'Jobs', short: 'open jobs' },
  { key: 'events', label: 'Events', short: 'upcoming events' },
];

export interface CityMetrics {
  startups: number;
  /** Sum of the city's startups' total funding, in paise. */
  fundingPaise: number;
  jobs: number;
  events: number;
}

export const metricValue = (m: CityMetrics, metric: Metric) =>
  metric === 'startups' ? m.startups : metric === 'funding' ? m.fundingPaise : metric === 'jobs' ? m.jobs : m.events;

/** "₹1,480 Cr", "₹75 L" from paise. */
export function rupees(paise: number): string {
  const crore = paise / 100 / 1e7;
  if (crore >= 1) return `₹${crore >= 100 ? Math.round(crore).toLocaleString('en-IN') : (Math.round(crore * 10) / 10).toString()} Cr`;
  const lakh = paise / 100 / 1e5;
  return lakh >= 1 ? `₹${Math.round(lakh)} L` : paise > 0 ? `₹${Math.round(paise / 100).toLocaleString('en-IN')}` : '₹0';
}

export function formatMetric(value: number, metric: Metric): string {
  if (metric === 'funding') return rupees(value);
  const unit = METRICS.find((m) => m.key === metric)!.short;
  return `${value.toLocaleString('en-IN')} ${value === 1 ? unit.replace(/s$/, '') : unit}`;
}

// ── Metro clusters ───────────────────────────────────────────────────────────

/** Cities close enough that their dots and labels collide at country zoom; shown as one marker until zoomed in. */
export const METROS: { id: string; name: string; members: string[] }[] = [
  { id: 'delhi-ncr', name: 'Delhi NCR', members: ['delhi', 'new delhi', 'gurugram', 'gurgaon', 'noida', 'greater noida', 'ghaziabad', 'faridabad'] },
  { id: 'mumbai-metro', name: 'Mumbai Metro', members: ['mumbai', 'navi mumbai', 'thane', 'vashi', 'kalyan', 'panvel'] },
  { id: 'ahmedabad-gandhinagar', name: 'Ahmedabad–Gandhinagar', members: ['ahmedabad', 'gandhinagar'] },
  { id: 'pune-metro', name: 'Pune', members: ['pune', 'pimpri-chinchwad', 'pimpri chinchwad'] },
  { id: 'hyderabad-metro', name: 'Hyderabad', members: ['hyderabad', 'secunderabad'] },
  { id: 'kolkata-metro', name: 'Kolkata', members: ['kolkata', 'howrah'] },
  { id: 'chennai-metro', name: 'Chennai', members: ['chennai', 'tambaram'] },
];
/** Below this zoom, metro members merge into one marker. */
export const CLUSTER_BELOW_ZOOM = 2.4;

export interface MapPoint<C> {
  id: string;
  name: string;
  coordinates: [number, number];
  metrics: CityMetrics;
  /** The cities behind this point (one for a city, several for a metro cluster). */
  cities: C[];
  cluster: boolean;
}

/** Cities → points to draw. Below CLUSTER_BELOW_ZOOM, cities of the same metro merge (startup-weighted centre). */
export function toPoints<C extends { id: string; cityName: string; longitude: number; latitude: number; metrics: CityMetrics }>(
  cities: C[], zoom: number,
): MapPoint<C>[] {
  const single = (c: C): MapPoint<C> => ({ id: c.id, name: c.cityName, coordinates: [c.longitude, c.latitude], metrics: c.metrics, cities: [c], cluster: false });
  if (zoom >= CLUSTER_BELOW_ZOOM) return cities.map(single);
  const byMetro = new Map<string, C[]>();
  const out: MapPoint<C>[] = [];
  for (const c of cities) {
    const metro = METROS.find((m) => m.members.includes(c.cityName.trim().toLowerCase()));
    if (metro) byMetro.set(metro.id, [...(byMetro.get(metro.id) ?? []), c]);
    else out.push(single(c));
  }
  for (const [id, members] of byMetro) {
    if (members.length === 1) { out.push(single(members[0])); continue; }
    const weight = (c: C) => Math.max(1, c.metrics.startups);
    const w = members.reduce((n, c) => n + weight(c), 0);
    out.push({
      id: `metro:${id}`,
      name: METROS.find((m) => m.id === id)!.name,
      coordinates: [members.reduce((n, c) => n + c.longitude * weight(c), 0) / w, members.reduce((n, c) => n + c.latitude * weight(c), 0) / w],
      metrics: members.reduce<CityMetrics>((acc, c) => ({
        startups: acc.startups + c.metrics.startups, fundingPaise: acc.fundingPaise + c.metrics.fundingPaise,
        jobs: acc.jobs + c.metrics.jobs, events: acc.events + c.metrics.events,
      }), { startups: 0, fundingPaise: 0, jobs: 0, events: 0 }),
      cities: members,
      cluster: true,
    });
  }
  return out;
}

/** How many of the biggest points get a label at this zoom (the rest show a dot; hover shows the card). */
export const labelBudget = (zoom: number) => (zoom < 1.5 ? 8 : zoom < 3 ? 16 : zoom < 5 ? 30 : Infinity);

/** Ids of the points that get a label: the top `labelBudget(zoom)` by the current metric. */
export function labelledIds<C>(points: MapPoint<C>[], metric: Metric, zoom: number): Set<string> {
  const ranked = points.filter((p) => metricValue(p.metrics, metric) > 0).sort((a, b) => metricValue(b.metrics, metric) - metricValue(a.metrics, metric));
  return new Set(ranked.slice(0, labelBudget(zoom)).map((p) => p.id));
}

// ── Heat map ─────────────────────────────────────────────────────────────────

/** Dark (few) → bright (most). Index 0 is "none". Readable on the navy map in light and dark mode. */
export const HEAT_COLORS = ['#13214a', '#1e3a8a', '#1d4ed8', '#2563eb', '#0ea5e9', '#22d3ee'];

/**
 * Five bins on a log scale, because AI activity is very skewed (Karnataka dwarfs most states): a linear scale
 * would paint everything except the top state the same colour. Returns the upper bound of each bin.
 */
export function heatBins(values: number[]): number[] {
  const max = Math.max(0, ...values);
  if (max <= 0) return [];
  const steps = 5;
  const logMax = Math.log10(max + 1);
  return Array.from({ length: steps }, (_, i) => Math.round(10 ** ((logMax * (i + 1)) / steps) - 1));
}

/** Colour for a value given heatBins(); 0 → "none". */
export function heatColor(value: number, bins: number[]): string {
  if (value <= 0 || !bins.length) return HEAT_COLORS[0];
  const i = bins.findIndex((b) => value <= b);
  return HEAT_COLORS[(i === -1 ? bins.length - 1 : i) + 1];
}

// ── Geometry ─────────────────────────────────────────────────────────────────

type Ring = [number, number][];
type Geometry = { type: 'Polygon'; coordinates: Ring[] } | { type: 'MultiPolygon'; coordinates: Ring[][] };

/** Centre and a zoom that fits a state's outline (its largest polygon, so islands don't pull the view out). */
export function fitGeometry(geometry: Geometry): { center: [number, number]; zoom: number } {
  const polys: Ring[][] = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  const area = (ring: Ring) => {
    let a = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
    return Math.abs(a / 2);
  };
  const main = polys.reduce((best, p) => (area(p[0]) > area(best[0]) ? p : best), polys[0]);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of main[0]) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  const span = Math.max(maxX - minX, (maxY - minY) * 1.1);
  // At zoom 1 the map shows roughly 30° across; fit the state with a little margin.
  const zoom = Math.min(6, Math.max(1.2, 24 / Math.max(span, 0.5)));
  return { center: [(minX + maxX) / 2, (minY + maxY) / 2], zoom };
}

/** Ease for fly-to animations. */
export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

// ── Data ─────────────────────────────────────────────────────────────────────


export interface MapCity {
  id: string; cityName: string; slug: string; state: string; latitude: number; longitude: number;
  topSectors: string[]; totalFunding: string; totalStartups: number; aliases?: string[];
}
export interface MapStartup {
  id: string; name: string; slug: string; logoUrl: string | null; tagline: string; stage: string;
  /** Paise, as text (bigint). */
  totalFundingInr: string; sector: string; foundedYear: number | null; headquartersCity: string;
}
export interface MapData {
  cities: MapCity[];
  startups: MapStartup[];
  /** Open on-site/hybrid jobs per city (lower-cased as entered). */
  jobsByCity: { city: string; n: number }[];
  /** Lower-cased venue + address of upcoming in-person events. */
  eventPlaces: string[];
  /** Indian funding rounds: standardised city (lower-case), paise, year announced. */
  rounds: { c: string; p: number; y: number }[];
  /** Recent activity for the live ticker and pulsing cities, newest first. */
  activity?: Activity[];
}

export interface Activity {
  kind: 'startup' | 'round' | 'job';
  /** "Qure.ai raised ₹540 Cr (Series D)". */
  text: string;
  href: string;
  /** Lower-cased city as entered (matched like startups). */
  city: string;
  /** ISO date. */
  at: string;
}

/** Ids of cities with activity in the last `days` days (they pulse on the map). */
export function activeCityIds(cities: Pick<MapCity, 'id' | 'cityName' | 'aliases'>[], activity: Activity[] = [], days = 14, now = Date.now()): Set<string> {
  const recent = activity.filter((a) => now - new Date(a.at).getTime() <= days * 864e5);
  return new Set(cities.filter((c) => recent.some((a) => matchesCity(a.city, c))).map((c) => c.id));
}
export interface MapFilters { sector?: string; stage?: string; years?: string }
export type CityRow = MapCity & { metrics: CityMetrics; startups: MapStartup[] };

const std = (s: string) => standardizeCityName(s).trim().toLowerCase();
const cityKeys = (c: Pick<MapCity, 'cityName' | 'aliases'>) => new Set([c.cityName, ...(c.aliases ?? [])].map(std));

export function matchesCity(startupCity: string | null | undefined, city: Pick<MapCity, 'cityName' | 'aliases'>) {
  if (!startupCity) return false;
  const raw = startupCity.trim().toLowerCase();
  if (std(startupCity) === std(city.cityName) || raw === city.cityName.trim().toLowerCase()) return true;
  return !!city.aliases?.some((a) => a.trim().toLowerCase() === raw || std(a) === std(startupCity));
}

function passesFilters(s: MapStartup, f: MapFilters) {
  if (f.sector && f.sector !== 'All Sectors' && s.sector !== f.sector) return false;
  if (f.stage && f.stage !== 'All Stages' && s.stage !== f.stage) return false;
  const y = s.foundedYear ?? 0;
  if (f.years === '2024-2026' && (y < 2024 || y > 2026)) return false;
  if (f.years === '2021-2023' && (y < 2021 || y > 2023)) return false;
  if (f.years === '2018-2020' && (y < 2018 || y > 2020)) return false;
  if (f.years === 'Before 2018' && (!y || y >= 2018)) return false;
  return true;
}

/**
 * Every city with its metrics, optionally "as of" a year (time-lapse): startups founded by then and funding raised
 * by then. Jobs and events are live counts and don't change with the year. Used by the map, share images and
 * rankings, so they always agree.
 */
export function buildCityRows(data: MapData, opts: { filters?: MapFilters; year?: number | null } = {}): CityRow[] {
  const year = opts.year ?? null;
  const startups = data.startups.filter((s) => passesFilters(s, opts.filters ?? {}) && (year == null || (s.foundedYear != null && s.foundedYear <= year)));
  const jobs = new Map<string, number>();
  for (const j of data.jobsByCity) jobs.set(std(j.city), (jobs.get(std(j.city)) ?? 0) + j.n);
  const words = (c: MapCity) => [c.cityName, ...(c.aliases ?? [])].map((n) => n.trim().toLowerCase()).filter((n) => n.length > 2);
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const eventCity = data.eventPlaces.map((place) => data.cities.find((c) => words(c).some((n) => new RegExp(`\\b${esc(n)}\\b`).test(place)))?.id ?? null);
  return data.cities.map((c) => {
    const keys = cityKeys(c);
    const own = startups.filter((s) => matchesCity(s.headquartersCity, c));
    let j = 0;
    keys.forEach((k) => { j += jobs.get(k) ?? 0; });
    const fundingPaise = data.rounds.reduce((n, r) => (keys.has(r.c) && (year == null || r.y <= year) ? n + r.p : n), 0);
    return { ...c, startups: own, metrics: { startups: own.length, fundingPaise, jobs: j, events: eventCity.filter((id) => id === c.id).length } };
  });
}

// ── Time-lapse ───────────────────────────────────────────────────────────────

export const TIMELAPSE_FROM = 2012;
/** Only these metrics have history; jobs and events are live counts. */
export const hasHistory = (m: Metric) => m === 'startups' || m === 'funding';

/** URL-safe slug for a state ("karnataka", "tamil-nadu"); used by the map search. */
export const stateSlug = (state: string) => state.trim().toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
