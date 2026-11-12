import { geoMercator, geoPath } from 'd3-geo';
import indiaStates from '@/components/india-ai/india-states.geo.json';
import { buildCityRows, heatBins, heatColor, toPoints, type MapData } from '@/components/india-ai/map-model';

const norm = (s: string) => s.trim().toLowerCase().replace(/&/g, 'and').replace(/\s+/g, ' ');

/**
 * The startups heat map as a static SVG, drawn with the same projection, colours and bins as the live map. Shown
 * while the interactive map's code loads.
 */
export function mapSvgMarkup(data: MapData, w: number, h: number): string {
  const rows = buildCityRows(data);
  const features = (indiaStates as unknown as { features: { properties: { STNAME: string } }[] }).features;
  const projection = geoMercator().fitSize([w, h], indiaStates as never);
  const path = geoPath(projection);
  // Whole pixels are invisible at this size and keep the SVG small: round, then drop points that collapse onto
  // the previous one (L12,34L12,34 → L12,34).
  const round = (d: string) => d.replace(/-?\d+\.?\d*/g, (n) => String(Math.round(Number(n)))).replace(/(L-?\d+,-?\d+)(?:\1)+/g, '$1');

  const stateValue = new Map<string, number>();
  for (const c of rows) stateValue.set(norm(c.state), (stateValue.get(norm(c.state)) ?? 0) + c.metrics.startups);
  const bins = heatBins([...stateValue.values()]);

  const shapes = features.map((f) => {
    const raw = path(f as never);
    if (!raw) return '';
    return `<path d="${round(raw)}" fill="${heatColor(stateValue.get(norm(f.properties.STNAME)) ?? 0, bins)}" stroke="rgba(148,197,253,0.4)" stroke-width="0.7"/>`;
  }).join('');

  const points = toPoints(rows, 1).filter((p) => p.metrics.startups > 0);
  const max = Math.max(1, ...points.map((p) => p.metrics.startups));
  const dots = points.sort((a, b) => a.metrics.startups - b.metrics.startups).map((p) => {
    const xy = projection(p.coordinates);
    if (!xy) return '';
    const radius = 3 + Math.sqrt(p.metrics.startups / max) * 13;
    return `<circle cx="${xy[0].toFixed(1)}" cy="${xy[1].toFixed(1)}" r="${radius.toFixed(1)}" fill="${p.cluster ? '#f59e0b' : '#38bdf8'}" fill-opacity="0.92" stroke="#ffffff" stroke-width="1.4"/>`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="Map of India showing AI startups by state">${shapes}${dots}</svg>`;
}
