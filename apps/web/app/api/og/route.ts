import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { getFounderSession } from '@/lib/founder-auth';
import { apiRateLimit, checkRateLimit } from '@/lib/rate-limit';
import { fetchPublicHtml } from '@/lib/embed/safe-fetch';

export const dynamic = 'force-dynamic';

/**
 * Reads a page's title, description and image to pre-fill a listing form. Signed-in founders only, rate limited,
 * and fetched through fetchPublicHtml: public https addresses only, every redirect re-checked, at most 200 KB read.
 * (It used to be open to anyone and checked only how the host name was spelled.)
 */
export async function POST(req: Request) {
  try {
    const session = await getFounderSession();
    if (!session) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
    const { success } = await checkRateLimit(apiRateLimit, `og:${session.userId}`);
    if (!success) return NextResponse.json({ error: 'Too many requests. Try again in a minute.' }, { status: 429 });

    const { url } = await req.json().catch(() => ({}));
    if (!url || typeof url !== 'string' || url.length > 2000) return NextResponse.json({ error: 'URL required' }, { status: 400 });

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
      if (parsedUrl.protocol === 'http:') parsedUrl.protocol = 'https:';
    } catch {
      return NextResponse.json({ error: 'Invalid or disallowed URL' }, { status: 400 });
    }

    const page = await fetchPublicHtml(parsedUrl, { timeoutMs: 5000, stopAt: '</head>' });
    if (!page.ok) {
      return NextResponse.json({ error: page.reason === 'unsafe' ? 'Invalid or disallowed URL' : 'Failed to fetch the URL' }, { status: page.reason === 'unsafe' ? 400 : 502 });
    }

    const $ = cheerio.load(page.html);
    const title = $('meta[property="og:title"]').attr('content') || $('title').text() || '';
    const description = $('meta[property="og:description"]').attr('content') || $('meta[name="description"]').attr('content') || '';
    const logo = $('meta[property="og:image"]').attr('content') || $('link[rel="icon"]').attr('href') || $('link[rel="shortcut icon"]').attr('href') || '';

    let finalLogo = '';
    if (logo) {
      try {
        const resolved = new URL(logo, page.finalUrl);
        if (resolved.protocol === 'https:') finalLogo = resolved.href;
      } catch { /* leave empty */ }
    }

    return NextResponse.json({ title: title.trim().slice(0, 300), description: description.trim().slice(0, 1000), logo: finalLogo });
  } catch (error) {
    console.error('OG Fetch Auto-fill error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Failed to extract metadata' }, { status: 500 });
  }
}
