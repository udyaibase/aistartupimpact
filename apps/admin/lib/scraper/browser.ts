import puppeteer, { type Browser } from 'puppeteer-core';
import { BROWSER_UA, isPublicUrl } from './fetch';

/**
 * Headless Chromium for career pages that only show jobs after JavaScript runs. On Vercel (Linux) it uses
 * @sparticuz/chromium, which ships a serverless build of the browser; locally it uses the installed Chrome.
 * One browser serves a whole request (see withBrowser); every request the page makes is checked to be public.
 */

async function launch(): Promise<Browser> {
  if (process.platform === 'linux') {
    const chromium = (await import('@sparticuz/chromium')).default;
    return puppeteer.launch({
      executablePath: await chromium.executablePath(),
      args: chromium.args,
      headless: true,
      defaultViewport: { width: 1440, height: 900 },
    });
  }
  const executablePath = process.env.CHROME_PATH
    || (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe');
  return puppeteer.launch({
    executablePath,
    headless: true,
    defaultViewport: { width: 1440, height: 900 },
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--disable-extensions', '--no-first-run'],
  });
}

export type RenderPage = (url: string, opts?: { clickLoadMore?: boolean }) => Promise<string | null>;

/**
 * Runs `fn` with a page renderer that reuses one browser, started only if a page actually needs it, and always
 * closed afterwards.
 */
export async function withBrowser<T>(fn: (render: RenderPage) => Promise<T>): Promise<T> {
  let browser: Promise<Browser | null> | null = null;
  const getBrowser = () => (browser ??= launch().catch((err) => {
    console.error('[scraper] browser unavailable:', err instanceof Error ? err.message : err);
    return null;
  }));
  const hostChecks = new Map<string, Promise<boolean>>();
  const allowed = (url: string) => {
    let origin: string;
    try { origin = new URL(url).origin; } catch { return Promise.resolve(false); }
    if (!hostChecks.has(origin)) hostChecks.set(origin, isPublicUrl(url));
    return hostChecks.get(origin)!;
  };

  const render: RenderPage = async (url, opts = {}) => {
    if (!(await allowed(url))) return null;
    const b = await getBrowser();
    if (!b) return null;
    const page = await b.newPage();
    try {
      await page.setUserAgent(BROWSER_UA);
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        const type = req.resourceType();
        if (['image', 'font', 'media', 'stylesheet'].includes(type)) { req.abort().catch(() => {}); return; }
        // Main page, redirects and scripts' API calls alike: public addresses only.
        allowed(req.url()).then((ok) => (ok ? req.continue() : req.abort())).catch(() => {});
      });
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 25_000 });
      await page.waitForFunction(() => (document.body?.innerText.length ?? 0) > 500 || document.querySelectorAll('a').length > 5, { timeout: 8_000 }).catch(() => {});
      // Scroll to trigger lazy-loaded listings.
      await page.evaluate(async () => {
        for (let i = 0; i < 10; i++) {
          window.scrollBy(0, 600);
          await new Promise((r) => setTimeout(r, 150));
          if (window.innerHeight + window.scrollY >= document.body.scrollHeight) break;
        }
      }).catch(() => {});
      if (opts.clickLoadMore) {
        for (let i = 0; i < 3; i++) {
          const clicked = await page.evaluate(() => {
            const el = Array.from(document.querySelectorAll('button, a, [role="button"]'))
              .find((e) => /^(load more|show more|show all|see all|view all)( jobs| roles| openings| positions)?$/i.test((e.textContent || '').trim()));
            if (el) (el as HTMLElement).click();
            return !!el;
          }).catch(() => false);
          if (!clicked) break;
          await page.waitForNetworkIdle({ timeout: 4_000 }).catch(() => {});
        }
      }
      await page.waitForNetworkIdle({ timeout: 2_000 }).catch(() => {});
      return await page.content();
    } catch (err) {
      console.error('[scraper] render failed:', err instanceof Error ? err.message : err);
      return null;
    } finally {
      await page.close().catch(() => {});
    }
  };

  try {
    return await fn(render);
  } finally {
    // `browser` is set inside getBrowser, which TypeScript can't see from here.
    const started = browser as Promise<Browser | null> | null;
    const b = started ? await started : null;
    await b?.close().catch(() => {});
  }
}
