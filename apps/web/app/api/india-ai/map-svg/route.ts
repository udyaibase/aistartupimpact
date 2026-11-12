import { getMapData } from '@/lib/india-ai/map-data';
import { mapSvgMarkup } from '@/lib/india-ai/map-svg';

/**
 * The India AI heat map as a static SVG: shown instantly while the interactive map's code loads (and to anyone
 * without JavaScript). Rendered on request (never at build time, so a database hiccup can't fail a deploy) and
 * cached at the edge via s-maxage.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return new Response(mapSvgMarkup(await getMapData(), 800, 800), {
      headers: { 'content-type': 'image/svg+xml; charset=utf-8', 'cache-control': 'public, max-age=600, s-maxage=3600, stale-while-revalidate=86400' },
    });
  } catch (err) {
    console.error('[india-ai/map-svg] failed to load map data', err);
    return new Response('Map unavailable', { status: 503, headers: { 'cache-control': 'no-store' } });
  }
}
