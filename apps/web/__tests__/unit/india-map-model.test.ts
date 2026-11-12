import { describe, it, expect } from 'vitest';
import { CLUSTER_BELOW_ZOOM, fitGeometry, formatMetric, HEAT_COLORS, heatBins, heatColor, labelledIds, toPoints } from '@/components/india-ai/map-model';

const city = (id: string, cityName: string, lon: number, lat: number, startups: number) =>
  ({ id, cityName, longitude: lon, latitude: lat, metrics: { startups, fundingPaise: startups * 1e9, jobs: 0, events: 0 } });

const cities = [
  city('del', 'Delhi', 77.2, 28.6, 20),
  city('ggn', 'Gurugram', 77.0, 28.5, 50),
  city('noi', 'Noida', 77.4, 28.5, 30),
  city('blr', 'Bengaluru', 77.6, 12.9, 190),
  city('jai', 'Jaipur', 75.8, 26.9, 4),
];

describe('metro clusters', () => {
  it('merges metro cities at country zoom, with summed metrics and a startup-weighted centre', () => {
    const pts = toPoints(cities, 1);
    const ncr = pts.find((p) => p.id === 'metro:delhi-ncr')!;
    expect(ncr.name).toBe('Delhi NCR');
    expect(ncr.cluster).toBe(true);
    expect(ncr.metrics.startups).toBe(100);
    expect(ncr.cities).toHaveLength(3);
    expect(ncr.coordinates[0]).toBeCloseTo((77.2 * 20 + 77.0 * 50 + 77.4 * 30) / 100, 5);
    expect(pts.map((p) => p.id).sort()).toEqual(['blr', 'jai', 'metro:delhi-ncr']);
  });

  it('splits them once zoomed in', () => {
    expect(toPoints(cities, CLUSTER_BELOW_ZOOM).map((p) => p.id).sort()).toEqual(['blr', 'del', 'ggn', 'jai', 'noi']);
  });
});

describe('labels', () => {
  it('labels only the biggest points at country zoom', () => {
    const many = Array.from({ length: 20 }, (_, i) => city(`c${i}`, `City ${i}`, 70 + i, 20, i + 1));
    const ids = labelledIds(toPoints(many, 1), 'startups', 1);
    expect(ids.size).toBe(8);
    expect(ids.has('c19')).toBe(true); // the biggest
    expect(ids.has('c0')).toBe(false); // the smallest
    expect(labelledIds(toPoints(many, 6), 'startups', 6).size).toBe(20);
  });
});

describe('heat map', () => {
  it('uses log-scale bins so mid-size states are not all the same colour', () => {
    const bins = heatBins([0, 2, 10, 40, 300]);
    expect(bins).toHaveLength(5);
    expect(bins[bins.length - 1]).toBe(300);
    expect(heatColor(0, bins)).toBe(HEAT_COLORS[0]);
    expect(heatColor(300, bins)).toBe(HEAT_COLORS[5]);
    // 10 and 40 land in different bins (a linear scale would put both in the lowest).
    expect(heatColor(10, bins)).not.toBe(heatColor(40, bins));
  });
  it('handles no data', () => {
    expect(heatBins([0, 0])).toEqual([]);
    expect(heatColor(5, [])).toBe(HEAT_COLORS[0]);
  });
});

describe('formatting and geometry', () => {
  it('formats each metric', () => {
    expect(formatMetric(1, 'startups')).toBe('1 startup');
    expect(formatMetric(18, 'startups')).toBe('18 startups');
    expect(formatMetric(1_480_00_00_000_00, 'funding')).toBe('₹1,480 Cr'); // ₹1,480 crore = 1.48e12 paise
    expect(formatMetric(1, 'jobs')).toBe('1 open job');
  });
  it('fits a state to its largest polygon, ignoring small islands', () => {
    const square = (x: number, y: number, s: number) => [[x, y], [x + s, y], [x + s, y + s], [x, y + s], [x, y]] as [number, number][];
    const fit = fitGeometry({ type: 'MultiPolygon', coordinates: [[square(74, 12, 4)], [square(92, 10, 0.2)]] });
    expect(fit.center).toEqual([76, 14]);
    expect(fit.zoom).toBeGreaterThan(4);
  });
});

import { buildCityRows, type MapData } from '@/components/india-ai/map-model';

describe('buildCityRows', () => {
  const data: MapData = {
    cities: [{ id: 'blr', cityName: 'Bengaluru', slug: 'bengaluru', state: 'KARNATAKA', latitude: 12.9, longitude: 77.6, topSectors: [], totalFunding: '0', totalStartups: 2, aliases: ['bangalore'] }],
    startups: [
      { id: 'a', name: 'A', slug: 'a', logoUrl: null, tagline: '', stage: 'Seed', totalFundingInr: '0', sector: 'FinTech', foundedYear: 2016, headquartersCity: 'Bangalore' },
      { id: 'b', name: 'B', slug: 'b', logoUrl: null, tagline: '', stage: 'Seed', totalFundingInr: '0', sector: 'HealthTech', foundedYear: 2022, headquartersCity: 'Bengaluru' },
    ],
    jobsByCity: [{ city: 'bangalore', n: 3 }, { city: 'bengaluru', n: 2 }],
    eventPlaces: ['nimhans convention centre, bengaluru'],
    rounds: [{ c: 'bengaluru', p: 1e9, y: 2017 }, { c: 'bengaluru', p: 3e9, y: 2023 }],
  };
  it('counts metrics today, merging spellings', () => {
    const [blr] = buildCityRows(data);
    expect(blr.metrics).toEqual({ startups: 2, fundingPaise: 4e9, jobs: 5, events: 1 });
  });
  it('rewinds startups and funding for the time-lapse; jobs and events stay live', () => {
    const [blr] = buildCityRows(data, { year: 2018 });
    expect(blr.metrics).toEqual({ startups: 1, fundingPaise: 1e9, jobs: 5, events: 1 });
  });
  it('applies sector filters', () => {
    expect(buildCityRows(data, { filters: { sector: 'HealthTech' } })[0].metrics.startups).toBe(1);
  });
});
