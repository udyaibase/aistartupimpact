import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import { withBrowser } from '@/lib/scraper/browser';
import { isPublicUrl, isWebUrl } from '@/lib/scraper/fetch';
import { scrapeDetail, scrapeList } from '@/lib/scraper';

/**
 * Admin career-page import. POST { url } lists a careers page's jobs; POST { url, mode: 'detail' } reads one job.
 * How it works: lib/scraper.
 */

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const { error } = await requireApiAuth();
  if (error) return error;

  const body = await req.json().catch(() => null);
  const url = typeof body?.url === 'string' ? body.url.trim() : '';
  if (!url || url.length > 2000 || !isWebUrl(url)) return NextResponse.json({ error: 'Enter a full web address (https://…).' }, { status: 400 });
  if (!(await isPublicUrl(url))) return NextResponse.json({ error: 'That address isn’t a public website.' }, { status: 400 });

  try {
    if (body.mode === 'detail') {
      const r = await withBrowser((render) => scrapeDetail(url, render));
      return r.ok
        ? NextResponse.json({ success: true, job: r.job, partial: r.partial, skipped: r.skipped, source: r.source })
        : NextResponse.json({ error: r.error }, { status: 422 });
    }
    const r = await withBrowser((render) => scrapeList(url, render));
    return r.ok
      ? NextResponse.json({ success: true, jobs: r.jobs, url: r.url, ats: r.ats, source: r.source, truncated: r.truncated ?? false })
      : NextResponse.json({ error: r.error }, { status: 422 });
  } catch (err) {
    console.error('[scrape-careers]', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Scraping failed. Try again, or paste the job board link directly.' }, { status: 500 });
  }
}
