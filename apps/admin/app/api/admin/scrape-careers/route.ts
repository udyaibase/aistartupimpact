import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import * as cheerio from 'cheerio';
import puppeteer from 'puppeteer-core';
import { monitoredOpenAI } from '@/lib/ops-ai';

export const maxDuration = 120;

const ALLOWED_SCHEMES = new Set(['http:', 'https:']);

const BLOCKED_HOSTS = [
  'localhost', '127.0.0.1', '0.0.0.0', '[::1]',
  '169.254.', '10.', '172.16.', '172.17.', '172.18.', '172.19.',
  '172.20.', '172.21.', '172.22.', '172.23.', '172.24.', '172.25.',
  '172.26.', '172.27.', '172.28.', '172.29.', '172.30.', '172.31.',
  '192.168.', 'fd', 'fc', 'fe80:', '::ffff:127.', '::ffff:10.',
  '::ffff:192.168.', '::ffff:172.16.',
];

function sanitizeForLog(s: string): string {
  return s.replace(/[\r\n\t]/g, '').slice(0, 200);
}

function isBlockedUrl(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    if (!ALLOWED_SCHEMES.has(parsed.protocol)) return true;
    const host = parsed.hostname.toLowerCase();
    if (host.endsWith('.localhost') || host.endsWith('.local')) return true;
    return BLOCKED_HOSTS.some(h => host === h || host.startsWith(h));
  } catch {
    return true;
  }
}

function getChromePath(): string {
  if (process.platform === 'darwin') return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  if (process.platform === 'win32') return 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  return '/usr/bin/google-chrome-stable';
}

// ─── Puppeteer Browser Pool ────────────────────────────────────────────────

async function launchBrowser() {
  return puppeteer.launch({
    executablePath: getChromePath(),
    headless: true,
    args: [
      '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
      '--disable-gpu', '--disable-extensions', '--disable-background-networking',
      '--disable-default-apps', '--no-first-run',
    ],
  });
}

// ─── Page Fetching ──────────────────────────────────────────────────────────

async function fetchPageWithBrowser(url: string, options?: {
  waitForSelector?: string;
  scrollToBottom?: boolean;
  clickLoadMore?: boolean;
}): Promise<string | null> {
  let browser = null;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1440, height: 900 });

    // Block images/fonts/media to speed up loading
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const type = req.resourceType();
      if (['image', 'font', 'media', 'stylesheet'].includes(type)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    // Wait for meaningful content to appear
    await page.waitForFunction(
      () => {
        const bodyText = document.body?.innerText || '';
        const links = document.querySelectorAll('a');
        return bodyText.length > 500 || links.length > 5;
      },
      { timeout: 10000 }
    ).catch(() => {});

    // If custom selector, wait for it
    if (options?.waitForSelector) {
      await page.waitForSelector(options.waitForSelector, { timeout: 8000 }).catch(() => {});
    }

    // Scroll to bottom to trigger lazy-loaded content
    if (options?.scrollToBottom !== false) {
      await page.evaluate(async () => {
        const distance = 500;
        const delay = 200;
        const maxScrolls = 10;
        for (let i = 0; i < maxScrolls; i++) {
          window.scrollBy(0, distance);
          await new Promise(r => setTimeout(r, delay));
          if ((window.innerHeight + window.scrollY) >= document.body.scrollHeight) break;
        }
        window.scrollTo(0, 0);
      });
      // Wait for any lazy content to render
      await page.waitForNetworkIdle({ timeout: 3000 }).catch(() => {});
    }

    // Try clicking "Load More" / "Show All" buttons
    if (options?.clickLoadMore) {
      const loadMoreClicked = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button, a, [role="button"]'));
        const loadMore = buttons.find(el => {
          const text = (el.textContent || '').trim().toLowerCase();
          return /load more|show all|see all|view all|show more/i.test(text);
        });
        if (loadMore) {
          (loadMore as HTMLElement).click();
          return true;
        }
        return false;
      });
      if (loadMoreClicked) {
        await page.waitForNetworkIdle({ timeout: 5000 }).catch(() => {});
      }
    }

    return await page.content();
  } catch (err) {
    console.error('[scraper] Browser fetch failed:', err);
    return null;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

async function fetchPageSimple(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// ─── ATS Detection ─────────────────────────────────────────────────────────

interface AtsInfo {
  platform: string;
  boardUrl: string;
}

function detectAtsEmbed(html: string): AtsInfo | null {
  const $ = cheerio.load(html);

  // Greenhouse
  if ($('#grnhse_app').length > 0 || $('[id*="greenhouse"]').length > 0) {
    const ghScript = $('script[src*="boards.greenhouse.io"]').attr('src');
    if (ghScript) {
      const match = ghScript.match(/boards\.greenhouse\.io\/embed\/job_board.*for=([^&"]+)/);
      if (match) return { platform: 'greenhouse', boardUrl: `https://boards.greenhouse.io/${match[1]}` };
    }
  }
  const ghEmbed = html.match(/boards\.greenhouse\.io\/(?:embed\/job_board\?.*?for=|)([a-z0-9_-]+)/i);
  if (ghEmbed) return { platform: 'greenhouse', boardUrl: `https://boards.greenhouse.io/${ghEmbed[1]}` };

  // Lever
  const leverMatch = html.match(/jobs\.lever\.co\/([a-z0-9_-]+)/i);
  if (leverMatch) return { platform: 'lever', boardUrl: `https://jobs.lever.co/${leverMatch[1]}` };

  // Ashby
  const ashbyMatch = html.match(/jobs\.ashbyhq\.com\/([a-z0-9_-]+)/i);
  if (ashbyMatch) return { platform: 'ashby', boardUrl: `https://jobs.ashbyhq.com/${ashbyMatch[1]}` };

  // BambooHR
  const bambooMatch = html.match(/([a-z0-9_-]+)\.bamboohr\.com\/(?:careers|jobs)/i);
  if (bambooMatch) return { platform: 'bamboohr', boardUrl: `https://${bambooMatch[1]}.bamboohr.com/careers` };

  // Workable
  const workableMatch = html.match(/apply\.workable\.com\/([a-z0-9_-]+)/i);
  if (workableMatch) return { platform: 'workable', boardUrl: `https://apply.workable.com/${workableMatch[1]}` };

  // Jobvite
  const jobvite = $('[data-careersite]').attr('data-careersite');
  if (jobvite) return { platform: 'jobvite', boardUrl: `https://jobs.jobvite.com/${jobvite}` };

  // SmartRecruiters
  const smartMatch = html.match(/jobs\.smartrecruiters\.com\/([a-z0-9_-]+)/i);
  if (smartMatch) return { platform: 'smartrecruiters', boardUrl: `https://jobs.smartrecruiters.com/${smartMatch[1]}` };

  // Wellfound (AngelList)
  const wellfoundMatch = html.match(/wellfound\.com\/company\/([a-z0-9_-]+)\/jobs/i);
  if (wellfoundMatch) return { platform: 'wellfound', boardUrl: `https://wellfound.com/company/${wellfoundMatch[1]}/jobs` };

  // Freshteam
  const freshMatch = html.match(/([a-z0-9_-]+)\.freshteam\.com/i);
  if (freshMatch) return { platform: 'freshteam', boardUrl: `https://${freshMatch[1]}.freshteam.com/jobs` };

  // Rippling
  const ripplingMatch = html.match(/ats\.rippling\.com\/([a-z0-9_-]+)/i);
  if (ripplingMatch) return { platform: 'rippling', boardUrl: `https://ats.rippling.com/${ripplingMatch[1]}` };

  // Recruitee
  const recruiteeMatch = html.match(/([a-z0-9_-]+)\.recruitee\.com/i);
  if (recruiteeMatch) return { platform: 'recruitee', boardUrl: `https://${recruiteeMatch[1]}.recruitee.com` };

  // Breezy HR
  const breezyMatch = html.match(/([a-z0-9_-]+)\.breezy\.hr/i);
  if (breezyMatch) return { platform: 'breezy', boardUrl: `https://${breezyMatch[1]}.breezy.hr` };

  // Keka HR — embedded via srcdoc iframe, script reference, or apply links
  const kekaMatch = html.match(/([a-z0-9_-]+)\.keka\.com\/careers/i);
  if (kekaMatch) {
    const subdomain = kekaMatch[1];
    const identifierMatch = html.match(/identifier:\s*["']([a-f0-9-]+)["']/i)
      || html.match(/embedjobs\/(?:js\/|default\/active\/|)([a-f0-9-]+)/i);
    const domain = `https://${subdomain}.keka.com/careers/`;
    const identifier = identifierMatch ? identifierMatch[1] : null;
    if (identifier) {
      return { platform: 'keka', boardUrl: `${domain}api/embedjobs/default/active/${identifier}` };
    }
    // No identifier found in HTML — store subdomain so caller can resolve it
    return { platform: 'keka', boardUrl: `keka://${subdomain}` };
  }

  return null;
}

// Detect ATS platform from any URL
function detectAtsPlatform(url: string): string | null {
  if (/boards\.greenhouse\.io|greenhouse\.io/i.test(url)) return 'greenhouse';
  if (/jobs\.lever\.co/i.test(url)) return 'lever';
  if (/jobs\.ashbyhq\.com/i.test(url)) return 'ashby';
  if (/bamboohr\.com/i.test(url)) return 'bamboohr';
  if (/apply\.workable\.com/i.test(url)) return 'workable';
  if (/jobs\.smartrecruiters\.com/i.test(url)) return 'smartrecruiters';
  if (/wellfound\.com/i.test(url)) return 'wellfound';
  if (/freshteam\.com/i.test(url)) return 'freshteam';
  if (/ats\.rippling\.com/i.test(url)) return 'rippling';
  if (/recruitee\.com/i.test(url)) return 'recruitee';
  if (/breezy\.hr/i.test(url)) return 'breezy';
  if (/jobs\.jobvite\.com/i.test(url)) return 'jobvite';
  if (/\.keka\.com/i.test(url)) return 'keka';
  return null;
}

// Resolve the Keka embed identifier from the Keka careers page
async function resolveKekaIdentifier(kekaSubdomain: string): Promise<string | null> {
  try {
    const kekaUrl = `https://${kekaSubdomain}.keka.com/careers/`;
    const res = await fetch(kekaUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const idMatch = html.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
    return idMatch ? idMatch[1] : null;
  } catch {
    return null;
  }
}

// Fetch jobs directly from Keka HR API (no LLM needed)
// Convert HTML to structured text preserving headings, bullets, and paragraphs
function htmlToStructuredText(html: string): string {
  if (!html) return '';
  const $ = cheerio.load(html);

  $('br').replaceWith('\n');

  // Bold/strong text that starts a div or is standalone → treat as heading
  $('h1, h2, h3, h4, h5, h6').each((_, el) => {
    $(el).replaceWith(`\n\n### ${$(el).text().trim()}\n`);
  });

  // Strong tags that are the sole child of a div → section heading
  $('div').each((_, el) => {
    const $el = $(el);
    const children = $el.children();
    if (children.length === 1 && children.first().is('strong, b')) {
      const text = $el.text().trim();
      if (text.length > 0 && text.length < 200) {
        $el.replaceWith(`\n\n### ${text}\n`);
        return;
      }
    }
    $el.prepend('\n').append('\n');
  });

  $('p').each((_, el) => {
    $(el).prepend('\n').append('\n');
  });

  $('li').each((_, el) => {
    $(el).prepend('• ').append('\n');
  });

  $('ul, ol').each((_, el) => {
    $(el).prepend('\n').append('\n');
  });

  let text = $.root().text()
    .replace(/\t/g, ' ')
    .replace(/ {2,}/g, ' ')
    .replace(/\n /g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return text;
}

async function fetchKekaJobs(apiUrl: string, careerPageUrl: string): Promise<any[] | null> {
  try {
    const res = await fetch(apiUrl, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const jobs = await res.json();
    if (!Array.isArray(jobs) || jobs.length === 0) return null;

    const kekaBase = apiUrl.replace(/\/api\/embedjobs\/.*/, '/careers/');

    return jobs.map((j: any, i: number) => {
      const loc = j.jobLocations?.[0];
      const locationText = loc ? [loc.city, loc.state, loc.countryName].filter(Boolean).join(', ') : null;
      const expMatch = j.experience?.match(/(\d+)\s*[-–]\s*(\d+)/);

      const jobTypeMap: Record<number, string> = { 1: 'FULL_TIME', 2: 'FULL_TIME', 3: 'PART_TIME', 4: 'CONTRACT', 5: 'INTERNSHIP' };

      return {
        id: `scraped-${i}`,
        title: j.title || 'Untitled',
        department: j.departmentName || null,
        location: locationText,
        workType: null,
        description: j.excerpt ? j.excerpt.slice(0, 300) : null,
        jobPageUrl: `${kekaBase}#openings`,
        applicationUrl: `${kekaBase}#openings`,
        category: categorizeJobTitle(j.title || ''),
        employmentType: jobTypeMap[j.jobType] || 'FULL_TIME',
        _kekaDetail: {
          id: j.id,
          fullDescription: j.description ? htmlToStructuredText(j.description) : null,
          experience: j.experience || null,
          experienceMin: expMatch ? parseInt(expMatch[1]) : null,
          experienceMax: expMatch ? parseInt(expMatch[2]) : null,
          salaryRange: j.salaryRange || null,
          skills: j.skillNames || [],
          publishedOn: j.publishedOn || null,
        },
      };
    });
  } catch (err) {
    console.error('[scraper:keka] API fetch failed:', err);
    return null;
  }
}

function categorizeJobTitle(title: string): string {
  const t = title.toUpperCase();
  if (/\bAI\b|ARTIFICIAL INTELLIGENCE/.test(t)) {
    if (/ENGINEER|DEVELOPER/.test(t)) return 'AI_ENGINEER';
    if (/RESEARCH|SCIENTIST/.test(t)) return 'AI_RESEARCH_SCIENTIST';
    if (/PRODUCT/.test(t)) return 'AI_PRODUCT_MANAGER';
    if (/DESIGN/.test(t)) return 'AI_DESIGNER';
    if (/SALES/.test(t)) return 'AI_SALES';
    if (/MARKET/.test(t)) return 'AI_MARKETING';
    if (/DEVREL|ADVOCATE/.test(t)) return 'AI_DEVREL';
    if (/SOLUTION|ARCHITECT/.test(t)) return 'AI_SOLUTIONS_ARCHITECT';
    if (/ETHIC/.test(t)) return 'AI_ETHICS';
    if (/INFRA/.test(t)) return 'AI_INFRASTRUCTURE';
    return 'AI_ENGINEER';
  }
  if (/\bML\b|MACHINE LEARNING/.test(t)) return 'ML_ENGINEER';
  if (/\bLLM\b|LARGE LANGUAGE/.test(t)) return 'LLM_ENGINEER';
  if (/DATA SCIEN/.test(t)) return 'DATA_SCIENTIST';
  if (/DATA ENGINEER/.test(t)) return 'DATA_ENGINEER';
  if (/PROMPT ENGINEER/.test(t)) return 'PROMPT_ENGINEER';
  if (/NLP|NATURAL LANGUAGE/.test(t)) return 'NLP_ENGINEER';
  if (/COMPUTER VISION|CV ENGINEER/.test(t)) return 'COMPUTER_VISION';
  if (/ROBOT/.test(t)) return 'ROBOTICS_ENGINEER';
  return 'OTHER';
}

// Build the direct apply URL from ATS-specific patterns
function buildAtsApplyUrl(jobPageUrl: string, platform: string | null): string | null {
  if (!platform) return null;
  try {
    const parsed = new URL(jobPageUrl);
    switch (platform) {
      case 'greenhouse': {
        // boards.greenhouse.io/company/jobs/12345 → append #app
        if (parsed.hostname === 'boards.greenhouse.io') return `${jobPageUrl}#app`;
        break;
      }
      case 'lever': {
        // jobs.lever.co/company/uuid → /apply
        const path = parsed.pathname.replace(/\/$/, '');
        if (!path.endsWith('/apply')) return `${parsed.origin}${path}/apply`;
        break;
      }
      case 'ashby': {
        // jobs.ashbyhq.com/company/uuid → /application
        const path = parsed.pathname.replace(/\/$/, '');
        if (!path.endsWith('/application')) return `${parsed.origin}${path}/application`;
        break;
      }
      case 'workable': {
        // apply.workable.com/company/j/UUID → /apply
        const path = parsed.pathname.replace(/\/$/, '');
        if (!path.endsWith('/apply')) return `${parsed.origin}${path}/apply`;
        break;
      }
      case 'smartrecruiters': {
        // jobs.smartrecruiters.com/Company/uuid → /apply
        const path = parsed.pathname.replace(/\/$/, '');
        if (!path.endsWith('/apply')) return `${parsed.origin}${path}/apply`;
        break;
      }
      case 'bamboohr': {
        // company.bamboohr.com/careers/123 → /careers/123/detail
        const path = parsed.pathname.replace(/\/$/, '');
        if (!path.endsWith('/detail')) return `${parsed.origin}${path}/detail`;
        break;
      }
    }
  } catch {}
  return null;
}

// Fetch page with smart fallback chain
async function fetchPage(url: string, forceBrowser = false): Promise<{ html: string; resolvedUrl: string; atsInfo: AtsInfo | null } | null> {
  // For known ATS pages, always use Puppeteer (they're often SPA)
  const urlPlatform = detectAtsPlatform(url);
  if (urlPlatform || forceBrowser) {
    const rendered = await fetchPageWithBrowser(url, { scrollToBottom: true, clickLoadMore: true });
    if (rendered) return { html: rendered, resolvedUrl: url, atsInfo: urlPlatform ? { platform: urlPlatform, boardUrl: url } : null };
  }

  const html = await fetchPageSimple(url);

  if (html) {
    const atsInfo = detectAtsEmbed(html);
    if (atsInfo && !isBlockedUrl(atsInfo.boardUrl)) {
      console.log(`[scraper] Detected ATS embed → ${sanitizeForLog(atsInfo.boardUrl)} (${atsInfo.platform})`);
      // Keka HR: board URL is a JSON API or subdomain ref — return the original HTML with atsInfo so caller can handle it
      if (atsInfo.platform === 'keka') {
        return { html, resolvedUrl: url, atsInfo };
      }
      // Always use Puppeteer for ATS boards (they're JavaScript-heavy)
      const atsRendered = await fetchPageWithBrowser(atsInfo.boardUrl, { scrollToBottom: true, clickLoadMore: true });
      if (atsRendered) {
        const $ats = cheerio.load(atsRendered);
        $ats('script, style, noscript, svg').remove();
        const atsTextLen = $ats('body').text().replace(/\s+/g, ' ').trim().length;
        if (atsTextLen > 100) {
          return { html: atsRendered, resolvedUrl: atsInfo.boardUrl, atsInfo };
        }
      }
      // Fallback to simple fetch of ATS URL
      const atsHtml = await fetchPageSimple(atsInfo.boardUrl);
      if (atsHtml) return { html: atsHtml, resolvedUrl: atsInfo.boardUrl, atsInfo };
    }

    const $ = cheerio.load(html);
    // Check if the page has real content (not just an SPA shell)
    const scriptTags = $('script').length;
    $('script, style, noscript, svg').remove();
    const textLen = $('body').text().replace(/\s+/g, ' ').trim().length;
    const linkCount = $('a[href]').length;
    const hasJsonLd = $('script[type="application/ld+json"]').length > 0;

    if (textLen > 300 || linkCount > 10 || hasJsonLd) {
      return { html, resolvedUrl: url, atsInfo: null };
    }

    // SPA shell — many scripts but no content
    console.log(`[scraper] SPA shell (text: ${textLen}, links: ${linkCount}, scripts: ${scriptTags}), using Puppeteer`);
  }

  // Fallback: full Puppeteer render with scroll + load-more
  const rendered = await fetchPageWithBrowser(url, { scrollToBottom: true, clickLoadMore: true });
  return rendered ? { html: rendered, resolvedUrl: url, atsInfo: null } : null;
}

// ─── Content Extraction ────────────────────────────────────────────────────

function extractJsonLd(html: string): any[] {
  const $ = cheerio.load(html);
  const results: any[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const raw = $(el).html() || '';
      const data = JSON.parse(raw);
      const process = (d: any) => {
        if (d['@type'] === 'JobPosting') results.push(d);
        if (d['@graph'] && Array.isArray(d['@graph'])) d['@graph'].forEach(process);
      };
      if (Array.isArray(data)) data.forEach(process);
      else process(data);
    } catch {}
  });
  return results;
}

function extractEmbeddedData(html: string): string {
  const patterns = [
    /<script[^>]*>\s*(?:self\.__next_f\.push|self\.__next_f=)[\s\S]*?<\/script>/,
    /__NEXT_DATA__\s*=\s*({[\s\S]+?})\s*<\/script>/,
    /__NUXT_DATA__\s*=\s*({[\s\S]+?})\s*<\/script>/,
    /window\.__data\s*=\s*({[\s\S]+?})\s*;?\s*<\/script>/,
    /window\.initialData\s*=\s*({[\s\S]+?})\s*;?\s*<\/script>/,
    /window\.__INITIAL_STATE__\s*=\s*({[\s\S]+?})\s*;?\s*<\/script>/,
  ];
  for (const pat of patterns) {
    const match = html.match(pat);
    if (match?.[1]) {
      try {
        const parsed = JSON.parse(match[1]);
        return JSON.stringify(parsed).slice(0, 15000);
      } catch {}
    }
  }
  return '';
}

function extractMetaTags(html: string): Record<string, string> {
  const $ = cheerio.load(html);
  const meta: Record<string, string> = {};
  $('meta').each((_, el) => {
    const name = $(el).attr('name') || $(el).attr('property') || '';
    const content = $(el).attr('content') || '';
    if (name && content) meta[name] = content;
  });
  meta['title'] = $('title').text().trim();
  return meta;
}

// Extract ALL links from the page (not just job-specific ones)
function extractAllLinks(html: string, baseUrl: string): Array<{ text: string; url: string; isApply: boolean }> {
  const $ = cheerio.load(html);
  const links: Array<{ text: string; url: string; isApply: boolean }> = [];
  const seen = new Set<string>();

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const text = $(el).text().trim().replace(/\s+/g, ' ');
    const ariaLabel = $(el).attr('aria-label') || '';
    const classes = $(el).attr('class') || '';
    if (!href || href === '#' || href.startsWith('javascript:') || href.startsWith('mailto:')) return;
    if (!text && !ariaLabel) return;

    try {
      const fullUrl = href.startsWith('http') ? href : new URL(href, baseUrl).toString();
      if (seen.has(fullUrl) || isBlockedUrl(fullUrl)) return;
      seen.add(fullUrl);

      const isApply =
        /apply|submit|candidate|application|bewerbung/i.test(href) ||
        /apply\s*(now|here|today|for\s*this)?|submit\s*application|start\s*application/i.test(text) ||
        /apply/i.test(ariaLabel) ||
        /apply-btn|apply_button|btn-apply|cta-apply/i.test(classes) ||
        $(el).attr('data-apply-url') != null;

      const label = text || ariaLabel;
      if (label.length >= 2 && label.length <= 300) {
        links.push({ text: label, url: fullUrl, isApply });
      }
    } catch {}
  });

  // Also check buttons with data-href or onclick
  $('button[data-href], button[data-url], [role="button"][data-href]').each((_, el) => {
    const href = $(el).attr('data-href') || $(el).attr('data-url') || '';
    const text = $(el).text().trim();
    if (href && !seen.has(href)) {
      try {
        const fullUrl = href.startsWith('http') ? href : new URL(href, baseUrl).toString();
        if (!isBlockedUrl(fullUrl)) {
          seen.add(fullUrl);
          links.push({ text: text || 'Link', url: fullUrl, isApply: /apply/i.test(text) });
        }
      } catch {}
    }
  });

  return links;
}

// Clean page content: strip noise, keep job-relevant content
function extractCleanContent(html: string, baseUrl: string): { text: string; applyLinks: string[]; allLinks: Array<{ text: string; url: string; isApply: boolean }> } {
  const allLinks = extractAllLinks(html, baseUrl);
  const applyLinks = allLinks.filter(l => l.isApply).map(l => `${l.text} → ${l.url}`);

  const $ = cheerio.load(html);

  // Remove only obvious noise — be CONSERVATIVE to keep job data intact
  $('script, style, noscript, iframe, svg, video, audio, canvas').remove();
  $('[role="navigation"]').remove();
  $('[class*="cookie"], [class*="consent"], [class*="gdpr"]').remove();
  $('[class*="popup"], [class*="modal"]:not(.job-modal)').remove();
  $('[id="cookie"], [id="gdpr"], [id="consent"], [id="onetrust"]').remove();
  // Only remove site-level chrome — NOT generic nav/header/footer since many job pages
  // put title, location, experience in header sections
  $('[class*="site-nav"], [class*="site-header"], [class*="site-footer"]').remove();
  $('[class*="global-nav"], [class*="global-header"], [class*="global-footer"]').remove();
  $('[class*="main-nav"], [class*="top-nav"], [class*="primary-nav"]').remove();

  // Try to find the main content area — expanded selectors for job pages
  const contentSelectors = [
    'main', '[role="main"]', 'article',
    '.job-description', '.job-content', '.job-details', '.job-posting',
    '#job-description', '#job-details', '#job-content',
    '.posting-page', '.career-page', '.careers-listing',
    '.content-area', '.page-content', '.main-content',
    '[data-automation="job-description"]',
    '.section-job', '.section-careers',
    '.job-header', '.job-info', '.job-overview', '.job-summary',
    '.position-description', '.position-details',
    '.opening-description', '.opening-details',
    '#content', '#main', '.container > .row',
  ];

  let contentArea = $(contentSelectors.join(', '));
  if (contentArea.length === 0) {
    contentArea = $('body');
  }

  // Convert HTML to well-structured text preserving ALL content
  contentArea.find('br').replaceWith('\n');
  contentArea.find('h1, h2, h3, h4, h5, h6').each((_, el) => {
    const tag = el.tagName?.toLowerCase() || 'h3';
    const level = parseInt(tag.charAt(1)) || 3;
    const prefix = level <= 2 ? '\n\n### ' : '\n\n**';
    const suffix = level <= 2 ? '\n' : '**\n';
    $(el).prepend(prefix);
    $(el).append(suffix);
  });
  contentArea.find('p, div, section').each((_, el) => {
    $(el).prepend('\n');
    $(el).append('\n');
  });
  contentArea.find('li').each((_, el) => {
    $(el).prepend('\n• ');
  });
  contentArea.find('table').each((_, table) => {
    $(table).find('tr').each((_, row) => {
      const cells = $(row).find('td, th').map((__, cell) => $(cell).text().trim()).get();
      $(row).replaceWith(`\n| ${cells.join(' | ')} |`);
    });
  });

  // Also extract dl/dt/dd (common for job meta: Experience, Location, etc.)
  contentArea.find('dl').each((_, dl) => {
    $(dl).find('dt').each((__, dt) => {
      $(dt).prepend('\n**').append(':** ');
    });
    $(dl).find('dd').each((__, dd) => {
      $(dd).append('\n');
    });
  });

  let bodyText = contentArea.text()
    .replace(/\t/g, ' ')
    .replace(/ {2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { text: bodyText, applyLinks, allLinks };
}

function extractJobLinks(html: string, baseUrl: string): Array<{ text: string; url: string }> {
  const $ = cheerio.load(html);
  const links: Array<{ text: string; url: string }> = [];
  const seen = new Set<string>();

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    let text = $(el).text().trim().replace(/\s+/g, ' ');
    if (!href || !text || text.length < 3 || text.length > 200) return;

    const isJobLink =
      /career|job|position|opening|hiring|apply|role|vacanc|posting/i.test(href) ||
      /apply|view\s*(role|job|position|details)|learn\s*more|see\s*details|read\s*more/i.test(text);

    if (isJobLink) {
      try {
        const fullUrl = href.startsWith('http') ? href : new URL(href, baseUrl).toString();
        if (!seen.has(fullUrl) && !isBlockedUrl(fullUrl)) {
          seen.add(fullUrl);
          links.push({ text, url: fullUrl });
        }
      } catch {}
    }
  });
  return links;
}

// ─── JSON-LD JobPosting Conversion ─────────────────────────────────────────

function jobPostingToJob(jp: any, sourceUrl: string, applyLinks: string[] = []): any {
  const loc = jp.jobLocation;
  let location = null;
  let workType = null;

  if (loc) {
    if (Array.isArray(loc)) {
      const parts = loc.map((l: any) => {
        const addr = l.address;
        if (addr) return [addr.addressLocality, addr.addressRegion, addr.addressCountry].filter(Boolean).join(', ');
        return l.name;
      }).filter(Boolean);
      location = parts.join('; ');
    } else {
      const addr = loc.address;
      if (addr) {
        location = [addr.addressLocality, addr.addressRegion, addr.addressCountry].filter(Boolean).join(', ');
      } else {
        location = loc.name || null;
      }
    }
  }

  const locationType = String(jp.jobLocationType || '').toUpperCase();
  const empType = String(jp.employmentType || '').toUpperCase();
  const allText = `${locationType} ${empType} ${location || ''} ${jp.title || ''}`.toUpperCase();

  if (locationType === 'TELECOMMUTE' || allText.includes('REMOTE') || allText.includes('WORK FROM HOME') || allText.includes('WFH')) {
    workType = 'REMOTE';
  } else if (allText.includes('HYBRID') || allText.includes('FLEXIBLE')) {
    workType = 'HYBRID';
  } else if (location || allText.includes('ONSITE') || allText.includes('ON-SITE') || allText.includes('IN-OFFICE')) {
    workType = 'ONSITE';
  }

  let salaryMin = null, salaryMax = null, salaryCurrency = null;
  const salarySource = jp.baseSalary || jp.estimatedSalary;
  const salaryObj = Array.isArray(salarySource) ? salarySource[0] : salarySource;
  if (salaryObj) {
    salaryCurrency = salaryObj.currency || null;
    const val = salaryObj.value;
    if (val) {
      if (typeof val === 'object') {
        salaryMin = val.minValue != null ? Number(val.minValue) : null;
        salaryMax = val.maxValue != null ? Number(val.maxValue) : null;
        if (!salaryCurrency) salaryCurrency = val.unitText?.includes('₹') ? 'INR' : val.unitText?.includes('$') ? 'USD' : null;
      } else {
        salaryMin = Number(val) || null;
      }
    }
  }

  // Convert HTML description to readable text using cheerio
  let description = jp.description || '';
  if (description) {
    const $desc = cheerio.load(`<div>${description}</div>`);
    $desc('script, style, noscript').remove();
    $desc('br').replaceWith('\n');
    $desc('p, div, h1, h2, h3, h4, h5, h6, section').each((_: number, el: any) => {
      $desc(el).prepend('\n\n').append('\n\n');
    });
    $desc('li').each((_: number, el: any) => {
      $desc(el).prepend('\n• ');
    });
    description = $desc.text().replace(/\n{3,}/g, '\n\n').trim();
  }

  const shortDesc = description ? description.split('\n')[0].trim().slice(0, 200) : null;

  const skills = Array.isArray(jp.skills)
    ? jp.skills
    : (typeof jp.skills === 'string' ? jp.skills.split(',').map((s: string) => s.trim()) : []);

  let experienceMin = null;
  let experienceMax = null;
  const expReq = jp.experienceRequirements;
  if (expReq) {
    if (typeof expReq === 'string') {
      const match = expReq.match(/(\d+)\s*[-–to]+\s*(\d+)/);
      if (match) { experienceMin = Number(match[1]); experienceMax = Number(match[2]); }
      else {
        const single = expReq.match(/(\d+)\s*\+?\s*year/i);
        if (single) experienceMin = Number(single[1]);
      }
    } else if (expReq.monthsOfExperience) {
      experienceMin = Math.round(expReq.monthsOfExperience / 12);
    }
  }

  // Application URL priority chain: directApply → structured url → apply links → ATS pattern → source page
  let applicationUrl = null;
  const atsPlatform = detectAtsPlatform(sourceUrl);

  // 1. Check directApply flag with structured apply URL
  if (jp.directApply && jp.url) applicationUrl = jp.url;

  // 2. Try ATS-specific apply URL construction
  if (!applicationUrl && atsPlatform) {
    applicationUrl = buildAtsApplyUrl(sourceUrl, atsPlatform);
  }

  // 3. Try structured data URLs
  if (!applicationUrl && jp.url && typeof jp.url === 'string' && jp.url.startsWith('http')) applicationUrl = jp.url;
  if (!applicationUrl && jp.sameAs && typeof jp.sameAs === 'string') applicationUrl = jp.sameAs;

  // 4. Try extracted apply links from page
  if (!applicationUrl && applyLinks.length > 0) {
    const urlMatch = applyLinks[0].match(/→\s*(https?:\/\/.+)/);
    if (urlMatch) applicationUrl = urlMatch[1].trim();
  }

  // 5. Fallback to source page itself
  if (!applicationUrl) applicationUrl = sourceUrl;

  return {
    title: jp.title || null,
    shortDescription: shortDesc,
    description: description || null,
    department: jp.industry || jp.occupationalCategory || jp.department || null,
    location,
    workType,
    category: null,
    skills,
    experienceMin,
    experienceMax,
    salaryMin,
    salaryMax,
    salaryCurrency,
    applicationUrl,
    applicationEmail: null,
    employmentType: normalizeEmploymentType(jp.employmentType),
  };
}

function normalizeEmploymentType(et: any): string | null {
  if (!et) return null;
  const upper = String(et).toUpperCase().replace(/[\s-]+/g, '_');
  if (upper.includes('FULL')) return 'FULL_TIME';
  if (upper.includes('PART')) return 'PART_TIME';
  if (upper.includes('CONTRACT') || upper.includes('TEMPORARY') || upper.includes('TEMP')) return 'CONTRACT';
  if (upper.includes('INTERN')) return 'INTERNSHIP';
  if (upper.includes('FREELAN') || upper.includes('CONSULT')) return 'FREELANCE';
  return null;
}

// ─── Post-processing: extract experience/salary from text when LLM misses ──

function extractExperienceFromText(text: string): { min: number | null; max: number | null } {
  const patterns = [
    // "3-5 years", "3 - 5 years", "3 to 5 years", "3–5 years"
    /(\d{1,2})\s*[-–to]+\s*(\d{1,2})\s*(?:\+?\s*)?(?:years?|yrs?)\s*(?:of\s*)?(?:experience|exp)?/i,
    // "minimum 3 years", "at least 3 years", "min 3 years"
    /(?:minimum|at\s*least|min\.?)\s*(\d{1,2})\s*(?:\+?\s*)?(?:years?|yrs?)/i,
    // "3+ years experience", "3 years+ experience"
    /(\d{1,2})\s*\+\s*(?:years?|yrs?)\s*(?:of\s*)?(?:experience|exp)?/i,
    // "experience: 3-5 years"
    /(?:experience|exp)[\s:]+(\d{1,2})\s*[-–to]+\s*(\d{1,2})\s*(?:years?|yrs?)?/i,
    // "3 years of experience"
    /(\d{1,2})\s*(?:years?|yrs?)\s*(?:of\s*)?(?:experience|exp)/i,
    // "Experience Required : 2 - 4 Years"
    /(?:experience|exp)\s*(?:required|needed)?[\s:]+(\d{1,2})\s*[-–to]+\s*(\d{1,2})/i,
  ];

  for (const pat of patterns) {
    const match = text.match(pat);
    if (match) {
      const n1 = parseInt(match[1]);
      const n2 = match[2] ? parseInt(match[2]) : null;
      if (n1 >= 0 && n1 <= 30) {
        return { min: n1, max: n2 && n2 >= n1 && n2 <= 30 ? n2 : null };
      }
    }
  }
  return { min: null, max: null };
}

function extractSalaryFromText(text: string): { min: number | null; max: number | null; currency: string | null } {
  const patterns = [
    // "₹10L - ₹15L" or "10 LPA - 15 LPA" or "10-15 LPA"
    { re: /(?:₹|INR|Rs\.?)\s*(\d+(?:\.\d+)?)\s*(?:L|lakh|lac|LPA)?\s*[-–to]+\s*(?:₹|INR|Rs\.?)?\s*(\d+(?:\.\d+)?)\s*(?:L|lakh|lac|LPA)/i, currency: 'INR', multiplier: 100000 },
    { re: /(\d+(?:\.\d+)?)\s*[-–to]+\s*(\d+(?:\.\d+)?)\s*(?:L|lakh|lac)\s*(?:per\s*annum|PA|p\.a\.)?/i, currency: 'INR', multiplier: 100000 },
    { re: /(\d+(?:\.\d+)?)\s*[-–to]+\s*(\d+(?:\.\d+)?)\s*LPA/i, currency: 'INR', multiplier: 100000 },
    // "$120K - $150K" or "$120,000 - $150,000"
    { re: /\$\s*(\d+(?:,\d{3})*(?:\.\d+)?)\s*[kK]?\s*[-–to]+\s*\$?\s*(\d+(?:,\d{3})*(?:\.\d+)?)\s*[kK]?/i, currency: 'USD', multiplier: 0 },
    // "€80k-€100k"
    { re: /€\s*(\d+(?:,\d{3})*(?:\.\d+)?)\s*[kK]?\s*[-–to]+\s*€?\s*(\d+(?:,\d{3})*(?:\.\d+)?)\s*[kK]?/i, currency: 'EUR', multiplier: 0 },
    // "£60k-£80k"
    { re: /£\s*(\d+(?:,\d{3})*(?:\.\d+)?)\s*[kK]?\s*[-–to]+\s*£?\s*(\d+(?:,\d{3})*(?:\.\d+)?)\s*[kK]?/i, currency: 'GBP', multiplier: 0 },
    // Single salary: "₹10 LPA", "$120K"
    { re: /(?:₹|INR|Rs\.?)\s*(\d+(?:\.\d+)?)\s*(?:L|lakh|lac|LPA)/i, currency: 'INR', multiplier: 100000, single: true },
    { re: /\$\s*(\d+(?:,\d{3})*)\s*[kK]/i, currency: 'USD', multiplier: 0, single: true },
  ];

  for (const { re, currency, multiplier, single } of patterns) {
    const match = text.match(re);
    if (match) {
      const parseNum = (s: string) => {
        let num = parseFloat(s.replace(/,/g, ''));
        if (multiplier > 0) num *= multiplier;
        else if (/[kK]/.test(s) || (num < 1000 && currency !== 'INR')) num *= 1000;
        return Math.round(num);
      };
      const n1 = parseNum(match[1]);
      const n2 = match[2] ? parseNum(match[2]) : null;
      if (single) {
        return { min: n1, max: null, currency };
      }
      return { min: n1, max: n2, currency };
    }
  }
  return { min: null, max: null, currency: null };
}

// Post-process job data: fill gaps the LLM missed using regex on page text
// Extract job description directly from page text — bypasses LLM to prevent summarization
function extractJobDescriptionFromText(pageText: string): string | null {
  if (!pageText || pageText.length < 100) return null;

  // Look for section headers that mark the start of job description content
  const sectionHeaders = [
    /(?:^|\n)\s*(?:###?\s*|[*]{2})?(?:about\s+(?:the\s+)?role|role\s+overview|job\s+description|position\s+overview|what\s+you'?(?:ll|will)\s+do|key\s+responsibilities|responsibilities|about\s+(?:the\s+)?position)/im,
    /(?:^|\n)\s*(?:###?\s*|[*]{2})?(?:overview|description|summary)/im,
  ];

  // Look for section headers that mark the END of relevant content
  const endHeaders = [
    /(?:^|\n)\s*(?:###?\s*|[*]{2})?(?:about\s+(?:the\s+)?company|about\s+us|who\s+we\s+are|our\s+(?:mission|story|values)|company\s+(?:overview|description))\b/im,
    /(?:^|\n)\s*(?:###?\s*|[*]{2})?(?:how\s+to\s+apply|apply\s+(?:now|here|today)|submit\s+your|equal\s+opportunity|eeo\s+statement|disclaimer)/im,
    /(?:^|\n)\s*(?:###?\s*|[*]{2})?(?:share\s+this\s+job|similar\s+(?:jobs|positions|roles)|other\s+openings|related\s+jobs)/im,
  ];

  let startIdx = 0;
  let endIdx = pageText.length;

  // Try to find the start of job-relevant content
  for (const pattern of sectionHeaders) {
    const match = pageText.match(pattern);
    if (match && match.index != null) {
      startIdx = match.index;
      break;
    }
  }

  // If we didn't find a clear start, use the beginning but skip very short leading text
  // (likely navigation breadcrumbs)
  if (startIdx === 0) {
    const lines = pageText.split('\n');
    let charCount = 0;
    for (let i = 0; i < lines.length; i++) {
      charCount += lines[i].length;
      if (charCount > 200) break;
      // Skip lines that look like navigation
      if (/^(home|careers|jobs|back|menu|about|contact|login)\s*[›>|/]/i.test(lines[i].trim())) {
        startIdx = charCount;
      }
    }
  }

  // Find end of relevant content
  for (const pattern of endHeaders) {
    const match = pageText.slice(startIdx + 50).match(pattern);
    if (match && match.index != null) {
      endIdx = startIdx + 50 + match.index;
      break;
    }
  }

  let description = pageText.slice(startIdx, endIdx).trim();

  // Clean up: collapse excessive whitespace, keep structure
  description = description
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^[\s•\-]+$/gm, '')
    .trim();

  // Must be substantial
  if (description.length < 200) return null;

  // Cap at reasonable length (keep first 5000 chars of job content)
  if (description.length > 5000) {
    description = description.slice(0, 5000).replace(/\n[^\n]*$/, '');
  }

  return description;
}

function postProcessJob(job: any, pageText: string, sourceUrl: string): any {
  // Extract experience from page text if LLM returned null
  if (job.experienceMin == null && job.experienceMax == null) {
    const exp = extractExperienceFromText(pageText);
    if (exp.min != null) job.experienceMin = exp.min;
    if (exp.max != null) job.experienceMax = exp.max;
  }

  // Also try extracting from description
  if (job.experienceMin == null && job.description) {
    const exp = extractExperienceFromText(job.description);
    if (exp.min != null) job.experienceMin = exp.min;
    if (exp.max != null) job.experienceMax = exp.max;
  }

  // Extract salary from page text if LLM returned null
  if (job.salaryMin == null && job.salaryMax == null) {
    const salary = extractSalaryFromText(pageText);
    if (salary.min != null) job.salaryMin = salary.min;
    if (salary.max != null) job.salaryMax = salary.max;
    if (salary.currency) job.salaryCurrency = salary.currency;
  }

  // Also try from description
  if (job.salaryMin == null && job.description) {
    const salary = extractSalaryFromText(job.description);
    if (salary.min != null) job.salaryMin = salary.min;
    if (salary.max != null) job.salaryMax = salary.max;
    if (salary.currency) job.salaryCurrency = salary.currency;
  }

  // Ensure applicationUrl is always set
  if (!job.applicationUrl || !job.applicationUrl.startsWith('http')) {
    job.applicationUrl = sourceUrl;
  }

  // Ensure skills is always an array
  if (!Array.isArray(job.skills)) {
    if (typeof job.skills === 'string') {
      job.skills = job.skills.split(',').map((s: string) => s.trim()).filter(Boolean);
    } else {
      job.skills = [];
    }
  }

  // Validate skills against page text — remove any skill not mentioned on the page
  if (job.skills.length > 0 && pageText) {
    const pageTextLower = pageText.toLowerCase();
    job.skills = job.skills.filter((skill: string) => {
      const skillLower = skill.toLowerCase();
      return pageTextLower.includes(skillLower);
    });
  }

  // Validate applicationEmail — remove obviously fake emails
  if (job.applicationEmail) {
    const email = String(job.applicationEmail).toLowerCase();
    if (email.includes('example.com') || email.includes('test.com') || email.includes('sample.com') || !email.includes('@')) {
      // Check if this email actually appears in the page text
      if (!pageText.toLowerCase().includes(email)) {
        job.applicationEmail = null;
      }
    }
  }

  // Extract email from page text if LLM missed it
  if (!job.applicationEmail && pageText) {
    const emailMatch = pageText.match(/(?:send|submit|email|resume|cv|apply)\s+(?:to|at)?\s*[:\-]?\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
    if (emailMatch) {
      job.applicationEmail = emailMatch[1];
    } else {
      // Try standalone pattern near "resume" or "apply" context
      const contextMatch = pageText.match(/([a-zA-Z0-9._%+-]+@(?!example\.com|test\.com)[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
      if (contextMatch) {
        job.applicationEmail = contextMatch[1];
      }
    }
  }

  return job;
}

// ─── LLM Prompts (upgraded for gpt-4o) ────────────────────────────────────

const DETAIL_SYSTEM_PROMPT = `You extract job posting data from web pages. You MUST return accurate data — NEVER guess, infer, or hallucinate.

Return a JSON object with these fields:

{
  "title": "exact job title — copy it letter-for-letter from the page",
  "shortDescription": "one-line summary, max 200 chars",
  "description": "null — description is extracted by code, not by you",
  "department": "department/team name from the page, or null",
  "location": "city, state/region, country exactly as written on page, or null",
  "workType": "REMOTE or HYBRID or ONSITE or null — only if page explicitly states it",
  "category": "one of the categories listed below",
  "skills": ["only", "skills", "explicitly", "named", "on", "the", "page"],
  "experienceMin": "number or null — see rules below",
  "experienceMax": "number or null — see rules below",
  "salaryMin": "number or null",
  "salaryMax": "number or null",
  "salaryCurrency": "USD or INR or EUR or GBP or null",
  "applicationUrl": "see rules below",
  "applicationEmail": "email from the page, or null — NEVER invent emails",
  "employmentType": "FULL_TIME or PART_TIME or CONTRACT or INTERNSHIP or FREELANCE or null"
}

Categories: AI_ENGINEER, ML_ENGINEER, LLM_ENGINEER, AI_RESEARCH_SCIENTIST, DATA_SCIENTIST, DATA_ENGINEER, PROMPT_ENGINEER, AI_PRODUCT_MANAGER, AI_DESIGNER, AI_SALES, AI_MARKETING, AI_DEVREL, AI_SOLUTIONS_ARCHITECT, AI_ETHICS, ROBOTICS_ENGINEER, COMPUTER_VISION, NLP_ENGINEER, AI_INFRASTRUCTURE, OTHER

ABSOLUTE RULES — VIOLATION CAUSES INCORRECT DATA:

1. ZERO HALLUCINATION: Every single value you return MUST appear verbatim on the page. If a skill like "Python" is not written anywhere on the page, do NOT include it. If no email is shown, return null — NEVER generate fake emails like "hr@example.com". If no salary is mentioned, return null. When in doubt, return null.

2. DESCRIPTION: Set description to null. The description is extracted from the page by code, not by you. Do NOT generate a description.

3. EXPERIENCE — SEARCH THE ENTIRE TEXT:
   Look for experience mentions ANYWHERE on the page, especially in:
   - Headings like "2–4 years" next to the title
   - Requirements sections: "3-5 years of experience"
   - Qualifications: "minimum 2 years", "5+ years"
   - Meta info bars: "Experience: 2-4 years"
   Examples: "2–4 years" → experienceMin: 2, experienceMax: 4
             "5+ years" → experienceMin: 5, experienceMax: null
             "minimum 3 years" → experienceMin: 3, experienceMax: null

4. SKILLS — ONLY WHAT THE PAGE SAYS:
   Extract ONLY tools/technologies/skills that are explicitly written on the page.
   Example: If the page says "Excel and SQL" and "Power BI or Tableau", return ["Excel", "SQL", "Power BI", "Tableau"].
   NEVER add skills that are not mentioned. A Business Analyst role does NOT automatically get "Python" or "TensorFlow".

5. APPLICATION URL: Check the "=== APPLY LINKS ===" section FIRST. Use the most specific URL. It must start with http. If no apply links section exists, use the Source URL.

6. APPLICATION EMAIL: ONLY extract an email that appears on the page text (e.g. "submit your resume to recruitment@company.com"). NEVER generate or guess email addresses.

7. SALARY: Only if explicitly stated. "10 LPA" → salaryMin: 1000000, "INR". "$120K" → 120000, "USD".

8. LOCATION and WORK TYPE: Only extract what is explicitly shown. "Gurugram, Haryana" means location is "Gurugram, Haryana". "Full-time" is employmentType, NOT workType.`;

const LIST_SYSTEM_PROMPT = `You extract job listings from a company's career/jobs page. Return a JSON object with a "jobs" array.

Each job in the array:
{
  "title": "exact title from the page — never paraphrase",
  "department": "department or null",
  "location": "location or null",
  "workType": "REMOTE or HYBRID or ONSITE or null",
  "description": "brief summary if visible, or null",
  "jobPageUrl": "URL to this job's DETAIL PAGE — see rules below",
  "applicationUrl": "URL to APPLY for this job — see rules below",
  "category": "one of the categories below",
  "employmentType": "FULL_TIME or PART_TIME or CONTRACT or INTERNSHIP or FREELANCE or null"
}

Categories: AI_ENGINEER, ML_ENGINEER, LLM_ENGINEER, AI_RESEARCH_SCIENTIST, DATA_SCIENTIST, DATA_ENGINEER, PROMPT_ENGINEER, AI_PRODUCT_MANAGER, AI_DESIGNER, AI_SALES, AI_MARKETING, AI_DEVREL, AI_SOLUTIONS_ARCHITECT, AI_ETHICS, ROBOTICS_ENGINEER, COMPUTER_VISION, NLP_ENGINEER, AI_INFRASTRUCTURE, OTHER

CRITICAL RULES:

1. Only extract jobs that ACTUALLY appear on the page. NEVER invent jobs.
2. Job titles must match EXACTLY what appears on the page.

3. jobPageUrl vs applicationUrl — THESE ARE DIFFERENT:
   - jobPageUrl = the page that DESCRIBES the job (has title, responsibilities, requirements, qualifications). It is usually on the SAME website/domain as the career page. Look in "=== JOB LINKS ===" section.
   - applicationUrl = the page where candidates SUBMIT their application (Google Forms, Lever apply page, external form). This may be on a DIFFERENT domain (docs.google.com, forms.gle, etc.).
   - NEVER put a Google Forms/Docs link, LinkedIn apply link, or external application form as jobPageUrl.
   - If a job links ONLY to an application form (no separate detail page), set jobPageUrl to null and applicationUrl to that form link.
   - Both must be FULL URLs starting with http.

4. Include ALL jobs found. Use OTHER for non-AI/tech roles.
5. NO duplicates — each title+location combination appears once.
6. If structured data (JSON-LD) is provided, cross-reference it with page text and links.

If no jobs found, return {"jobs": []}.`;

// ─── Main Handler ──────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const { error } = await requireApiAuth();
  if (error) return NextResponse.json({ error }, { status: 401 });

  try {
    const body = await req.json();
    const { url, mode } = body;

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }
    if (isBlockedUrl(url)) {
      return NextResponse.json({ error: 'Invalid or blocked URL' }, { status: 400 });
    }

    const openai = monitoredOpenAI('careers_scraper');

    // ─── Detail Mode: scrape single job page ────────────────────────────
    if (mode === 'detail') {
      // Detect non-job URLs that should never be scraped as job detail pages
      const NON_JOB_DOMAINS = [
        'docs.google.com', 'forms.google.com', 'accounts.google.com',
        'linkedin.com/login', 'linkedin.com/authwall',
        'indeed.com/login', 'glassdoor.com/login',
        'mail.google.com', 'drive.google.com',
        'facebook.com', 'twitter.com', 'x.com',
      ];
      try {
        const parsedUrl = new URL(url);
        const hostPath = `${parsedUrl.hostname}${parsedUrl.pathname}`;
        const isNonJobUrl = NON_JOB_DOMAINS.some(d => hostPath.includes(d));
        if (isNonJobUrl) {
          // This is an application/login page, not a job detail page
          // Return it as the applicationUrl but don't try to extract job data from it
          return NextResponse.json({
            success: true,
            job: { applicationUrl: url },
            partial: true,
            skipped: 'non-job-page',
          });
        }
      } catch {}

      const result = await fetchPage(url);
      if (!result) {
        return NextResponse.json({ error: 'Failed to fetch job page. The page may be protected or require login.' }, { status: 400 });
      }
      const { html, atsInfo } = result;
      const platform = atsInfo?.platform || detectAtsPlatform(url);

      const jsonLdJobs = extractJsonLd(html);
      const metaTags = extractMetaTags(html);
      const embeddedData = extractEmbeddedData(html);
      const { text: pageText, applyLinks, allLinks } = extractCleanContent(html, url);

      console.log(`[scraper:detail] URL: ${sanitizeForLog(url)}, ATS: ${platform || 'none'}, HTML: ${html.length}, JSON-LD: ${jsonLdJobs.length}, Text: ${pageText.length}, Apply links: ${applyLinks.length}, All links: ${allLinks.length}`);

      // Detect if we landed on a non-job page (login, sign-in, form, etc.)
      const pageTextLower = pageText.toLowerCase();
      const isLoginPage = (
        (pageTextLower.includes('sign in') || pageTextLower.includes('log in') || pageTextLower.includes('create account')) &&
        (pageTextLower.includes('email or phone') || pageTextLower.includes('password') || pageTextLower.includes('forgot')) &&
        !pageTextLower.includes('responsibilities') && !pageTextLower.includes('requirements') && !pageTextLower.includes('qualifications')
      );
      if (isLoginPage) {
        console.log('[scraper:detail] Detected login/auth page, returning partial');
        return NextResponse.json({
          success: true,
          job: { applicationUrl: url },
          partial: true,
          skipped: 'login-page',
        });
      }

      // If page text is thin, try again with forced Puppeteer
      let finalPageText = pageText;
      let finalApplyLinks = applyLinks;
      if (pageText.length < 200 && !platform) {
        console.log('[scraper:detail] Thin content, retrying with Puppeteer');
        const browserResult = await fetchPageWithBrowser(url, { scrollToBottom: true });
        if (browserResult) {
          const cleaned = extractCleanContent(browserResult, url);
          if (cleaned.text.length > finalPageText.length) {
            finalPageText = cleaned.text;
            finalApplyLinks = cleaned.applyLinks;
          }
        }
      }

      // Build ATS-specific apply URL
      let atsApplyUrl: string | null = null;
      if (platform) {
        atsApplyUrl = buildAtsApplyUrl(url, platform);
      }

      // Build content sections for LLM
      const sections: string[] = [];

      sections.push(`Source URL: ${url}`);
      if (platform) sections.push(`ATS Platform: ${platform}`);

      if (jsonLdJobs.length > 0) {
        sections.push('=== STRUCTURED DATA (JSON-LD) ===\n' + JSON.stringify(jsonLdJobs[0], null, 2).slice(0, 10000));
      }

      if (metaTags['og:title'] || metaTags['og:description'] || metaTags['description']) {
        sections.push('=== META TAGS ===\n' + Object.entries(metaTags)
          .filter(([k]) => ['title', 'description', 'og:title', 'og:description'].includes(k))
          .map(([k, v]) => `${k}: ${v}`)
          .join('\n'));
      }

      if (embeddedData) {
        sections.push('=== EMBEDDED APP DATA ===\n' + embeddedData.slice(0, 8000));
      }

      // Always include page text
      if (finalPageText.length > 30) {
        sections.push('=== PAGE TEXT ===\n' + finalPageText.slice(0, 18000));
      }

      // Collect ALL apply URLs: extracted from page + ATS-constructed
      const allApplyUrls: string[] = [];
      if (atsApplyUrl) allApplyUrls.push(`[ATS ${platform} Apply URL] → ${atsApplyUrl}`);
      allApplyUrls.push(...finalApplyLinks.slice(0, 15));

      if (allApplyUrls.length > 0) {
        sections.push('=== APPLY LINKS ===\n' + allApplyUrls.join('\n'));
      }

      const allContent = sections.join('\n\n');

      if (allContent.length < 80) {
        return NextResponse.json({
          success: true,
          job: { applicationUrl: atsApplyUrl || url, title: metaTags['og:title'] || metaTags['title'] || null },
          partial: true,
        });
      }

      // If JSON-LD exists, extract directly and enhance with LLM
      if (jsonLdJobs.length > 0) {
        const structuredJob = jobPostingToJob(jsonLdJobs[0], url, allApplyUrls);

        // ALWAYS ask LLM for these fields — even if JSON-LD had data,
        // the page text often has richer info (experience, skills, full description)
        const catCompletion = await openai.chat.completions.create({
          model: 'gpt-4o',
          temperature: 0,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: `You extract job metadata from a job posting page. Return valid JSON only.

CRITICAL: ZERO HALLUCINATION. Every value MUST appear on the page. NEVER invent skills, emails, or data.
- DO NOT extract description — it is handled by code.
- experience: Search the ENTIRE text. "2–4 years" → experienceMin: 2, experienceMax: 4. "5+ years" → experienceMin: 5.
- skills: ONLY skills explicitly named on the page. If the page says "Excel and SQL", return ["Excel", "SQL"]. NEVER add skills not mentioned.
- applicationUrl: Check Apply links section FIRST.
- applicationEmail: ONLY if an email appears on the page. NEVER generate fake emails.` },
            { role: 'user', content: `Job Title: ${structuredJob.title}

Extract these metadata fields from the page below (DO NOT extract description):
- category (one of: AI_ENGINEER, ML_ENGINEER, LLM_ENGINEER, AI_RESEARCH_SCIENTIST, DATA_SCIENTIST, DATA_ENGINEER, PROMPT_ENGINEER, AI_PRODUCT_MANAGER, AI_DESIGNER, AI_SALES, AI_MARKETING, AI_DEVREL, AI_SOLUTIONS_ARCHITECT, AI_ETHICS, ROBOTICS_ENGINEER, COMPUTER_VISION, NLP_ENGINEER, AI_INFRASTRUCTURE, OTHER)
- skills (array of ALL technical skills, tools, frameworks, languages explicitly named)
- shortDescription (one-line summary, max 200 chars)
- experienceMin (number or null)
- experienceMax (number or null)
- department (string or null)
- applicationUrl (direct apply URL — check Apply links section first)
- applicationEmail (email from the page, or null)
- salaryMin (annual salary as integer, or null. Convert LPA: 10 LPA = 1000000)
- salaryMax (annual salary as integer, or null)
- salaryCurrency (USD, INR, EUR, GBP, or null)

Page content:
${finalPageText.slice(0, 12000)}
${allApplyUrls.length > 0 ? '\nApply links:\n' + allApplyUrls.join('\n') : ''}` },
          ],
        });

        try {
          const extra = JSON.parse(catCompletion.choices[0]?.message?.content || '{}');
          structuredJob.category = extra.category || 'OTHER';
          if (extra.skills?.length > (structuredJob.skills?.length || 0)) structuredJob.skills = extra.skills;
          if (extra.shortDescription) structuredJob.shortDescription = extra.shortDescription;
          if (extra.experienceMin != null) structuredJob.experienceMin = extra.experienceMin;
          if (extra.experienceMax != null) structuredJob.experienceMax = extra.experienceMax;
          if (extra.department) structuredJob.department = extra.department;
          if (extra.description && extra.description.length > (structuredJob.description?.length || 0)) {
            structuredJob.description = extra.description;
          }
          if (extra.applicationUrl && extra.applicationUrl.startsWith('http') && (!structuredJob.applicationUrl || structuredJob.applicationUrl === url)) {
            structuredJob.applicationUrl = extra.applicationUrl;
          }
          if (extra.applicationEmail) structuredJob.applicationEmail = extra.applicationEmail;
          if (extra.salaryMin != null && !structuredJob.salaryMin) structuredJob.salaryMin = extra.salaryMin;
          if (extra.salaryMax != null && !structuredJob.salaryMax) structuredJob.salaryMax = extra.salaryMax;
          if (extra.salaryCurrency && !structuredJob.salaryCurrency) structuredJob.salaryCurrency = extra.salaryCurrency;
        } catch {}

        // OVERRIDE LLM/JSON-LD description with code-extracted page text
        const codeDescription = extractJobDescriptionFromText(finalPageText);
        if (codeDescription && codeDescription.length > 200) {
          structuredJob.description = codeDescription;
        }

        // Final apply URL fallback chain
        if (!structuredJob.applicationUrl || structuredJob.applicationUrl === url) {
          if (atsApplyUrl) structuredJob.applicationUrl = atsApplyUrl;
          else structuredJob.applicationUrl = url;
        }

        // Post-process: regex-based extraction for anything LLM still missed
        const finalJob = postProcessJob(structuredJob, finalPageText, url);

        return NextResponse.json({ success: true, job: finalJob });
      }

      // No JSON-LD — full LLM extraction with gpt-4o
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: DETAIL_SYSTEM_PROMPT },
          { role: 'user', content: allContent },
        ],
      });

      const content = completion.choices[0]?.message?.content || '{}';
      let job: any;
      try {
        job = JSON.parse(content);
      } catch {
        return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 });
      }

      // OVERRIDE LLM description with code-extracted page text (LLMs summarize/rewrite)
      const codeDescription = extractJobDescriptionFromText(finalPageText);
      if (codeDescription && codeDescription.length > 200) {
        job.description = codeDescription;
      }

      // Ensure applicationUrl is set
      if (!job.applicationUrl || !job.applicationUrl.startsWith('http')) {
        if (atsApplyUrl) {
          job.applicationUrl = atsApplyUrl;
        } else if (finalApplyLinks.length > 0) {
          const urlMatch = finalApplyLinks[0].match(/→\s*(https?:\/\/.+)/);
          if (urlMatch) job.applicationUrl = urlMatch[1].trim();
        }
        if (!job.applicationUrl) job.applicationUrl = url;
      }

      // Post-process: regex-based extraction for anything LLM missed
      const finalJob = postProcessJob(job, finalPageText, url);

      return NextResponse.json({ success: true, job: finalJob });
    }

    // ─── List Mode: scrape career page for job listings ─────────────────

    // First, try to detect Keka HR before full page fetch
    const rawHtml = await fetchPageSimple(url);
    if (rawHtml) {
      const kekaEmbed = detectAtsEmbed(rawHtml);
      if (kekaEmbed?.platform === 'keka') {
        let kekaApiUrl = kekaEmbed.boardUrl;

        // If we only have subdomain (no identifier), resolve it from the Keka careers page
        if (kekaApiUrl.startsWith('keka://')) {
          const subdomain = kekaApiUrl.replace('keka://', '');
          console.log(`[scraper:list] Keka HR detected (links only), resolving identifier for: ${subdomain}`);
          const identifier = await resolveKekaIdentifier(subdomain);
          if (identifier) {
            kekaApiUrl = `https://${subdomain}.keka.com/careers/api/embedjobs/default/active/${identifier}`;
          }
        }

        if (kekaApiUrl.includes('/api/embedjobs/')) {
          console.log(`[scraper:list] Keka HR → calling API: ${sanitizeForLog(kekaApiUrl)}`);
          const kekaJobs = await fetchKekaJobs(kekaApiUrl, url);
          if (kekaJobs && kekaJobs.length > 0) {
            return NextResponse.json({
              success: true,
              jobs: kekaJobs,
              url,
              ats: 'keka',
            });
          }
        }
      }
    }

    const result = await fetchPage(url);
    if (!result) {
      return NextResponse.json({ error: 'Failed to fetch career page. The page may be protected or require login.' }, { status: 400 });
    }
    const { html, resolvedUrl, atsInfo } = result;

    // If ATS is Keka and we haven't handled it above, try the API
    if (atsInfo?.platform === 'keka') {
      let kekaApiUrl = atsInfo.boardUrl;
      if (kekaApiUrl.startsWith('keka://')) {
        const subdomain = kekaApiUrl.replace('keka://', '');
        const identifier = await resolveKekaIdentifier(subdomain);
        if (identifier) {
          kekaApiUrl = `https://${subdomain}.keka.com/careers/api/embedjobs/default/active/${identifier}`;
        }
      }
      if (kekaApiUrl.includes('/api/embedjobs/')) {
        const kekaJobs = await fetchKekaJobs(kekaApiUrl, url);
        if (kekaJobs && kekaJobs.length > 0) {
          return NextResponse.json({
            success: true,
            jobs: kekaJobs,
            url: resolvedUrl,
            ats: 'keka',
          });
        }
      }
    }

    const jsonLdJobs = extractJsonLd(html);
    const { text: pageText, applyLinks, allLinks } = extractCleanContent(html, resolvedUrl);
    const jobLinks = extractJobLinks(html, resolvedUrl);
    const embeddedData = extractEmbeddedData(html);

    // If page content is thin, retry with Puppeteer
    let finalPageText = pageText;
    let finalJobLinks = jobLinks;
    if (pageText.length < 200) {
      console.log('[scraper:list] Thin content, retrying with forced Puppeteer');
      const browserHtml = await fetchPageWithBrowser(url, { scrollToBottom: true, clickLoadMore: true });
      if (browserHtml) {
        const cleaned = extractCleanContent(browserHtml, resolvedUrl);
        if (cleaned.text.length > finalPageText.length) finalPageText = cleaned.text;
        const moreLinks = extractJobLinks(browserHtml, resolvedUrl);
        if (moreLinks.length > finalJobLinks.length) finalJobLinks = moreLinks;
      }
    }

    console.log(`[scraper:list] URL: ${sanitizeForLog(resolvedUrl)}, ATS: ${atsInfo?.platform || 'none'}, Text: ${finalPageText.length}, JSON-LD: ${jsonLdJobs.length}, Links: ${finalJobLinks.length}, Apply: ${applyLinks.length}`);

    const sections: string[] = [];

    sections.push(`Career page URL: ${resolvedUrl}`);
    if (atsInfo) sections.push(`ATS Platform: ${atsInfo.platform}`);

    if (finalPageText.length > 30) {
      sections.push('=== PAGE CONTENT ===\n' + finalPageText.slice(0, 18000));
    }

    if (finalJobLinks.length > 0) {
      sections.push('=== JOB LINKS (detail page URLs) ===\n' + finalJobLinks.slice(0, 80).map(l => `${l.text} → ${l.url}`).join('\n'));
    }

    // Include non-job links that might contain job detail pages
    const otherLinks = allLinks.filter(l =>
      !l.isApply && /\/job|\/position|\/career|\/role|\/opening/i.test(l.url)
    );
    if (otherLinks.length > 0 && finalJobLinks.length < 5) {
      sections.push('=== OTHER RELEVANT LINKS ===\n' + otherLinks.slice(0, 30).map(l => `${l.text} → ${l.url}`).join('\n'));
    }

    if (jsonLdJobs.length > 0) {
      sections.push('=== STRUCTURED DATA (JSON-LD) ===\n' + JSON.stringify(jsonLdJobs.slice(0, 20), null, 2).slice(0, 10000));
    }

    if (embeddedData) {
      sections.push('=== EMBEDDED APP DATA ===\n' + embeddedData.slice(0, 6000));
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: LIST_SYSTEM_PROMPT },
        { role: 'user', content: sections.join('\n\n') },
      ],
    });

    const content = completion.choices[0]?.message?.content || '{"jobs":[]}';
    let parsed: { jobs: any[] };
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = { jobs: [] };
    }

    // Deduplicate jobs by title+location
    const seenKeys = new Set<string>();
    const jobs = (parsed.jobs || [])
      .filter((j: any) => j.title && typeof j.title === 'string')
      .filter((j: any) => {
        const key = `${j.title.toLowerCase().trim()}|${(j.location || '').toLowerCase().trim()}`;
        if (seenKeys.has(key)) return false;
        seenKeys.add(key);
        return true;
      })
      .map((j: any, i: number) => ({
        id: `scraped-${i}`,
        title: j.title.trim(),
        department: j.department || null,
        location: j.location || null,
        workType: j.workType || null,
        description: j.description || null,
        jobPageUrl: j.jobPageUrl || null,
        applicationUrl: j.applicationUrl || null,
        category: j.category || 'OTHER',
        employmentType: j.employmentType || null,
      }));

    return NextResponse.json({
      success: true,
      jobs,
      url: resolvedUrl,
      originalUrl: url !== resolvedUrl ? url : undefined,
      linksFound: finalJobLinks.length,
      ats: atsInfo?.platform || null,
    });
  } catch (err: any) {
    console.error('[scrape-careers]', err);
    return NextResponse.json({ error: err.message || 'Scraping failed' }, { status: 500 });
  }
}
