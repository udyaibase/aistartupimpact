import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/api-auth';
import * as cheerio from 'cheerio';
import OpenAI from 'openai';
import puppeteer from 'puppeteer-core';

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

async function fetchPageWithBrowser(url: string): Promise<string | null> {
  let browser = null;
  try {
    browser = await puppeteer.launch({
      executablePath: getChromePath(),
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-default-apps',
        '--no-first-run',
      ],
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1280, height: 900 });

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 25000 });

    // Wait for dynamic content to render
    await page.waitForFunction(
      () => document.querySelectorAll('a').length > 3 || document.body.innerText.length > 500,
      { timeout: 8000 }
    ).catch(() => {});

    const html = await page.content();
    return html;
  } catch (err) {
    console.error('[scraper] Browser fetch failed:', err);
    return null;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

async function fetchPageSimple(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
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

// Detect embedded ATS widgets and return their direct URL
function detectAtsEmbed(html: string): string | null {
  const $ = cheerio.load(html);

  // Jobvite: <div class="jv-careersite" data-careersite="companyname">
  const jobvite = $('[data-careersite]').attr('data-careersite');
  if (jobvite) return `https://jobs.jobvite.com/${jobvite}`;

  // Greenhouse: <div id="grnhse_app"> or script src containing greenhouse
  if ($('#grnhse_app').length > 0) {
    const ghScript = $('script[src*="boards.greenhouse.io"]').attr('src');
    if (ghScript) {
      const match = ghScript.match(/boards\.greenhouse\.io\/embed\/job_board.*for=([^&"]+)/);
      if (match) return `https://boards.greenhouse.io/${match[1]}`;
    }
  }
  const ghEmbed = html.match(/boards\.greenhouse\.io\/(?:embed\/job_board\?.*?for=|)([a-z0-9_-]+)/i);
  if (ghEmbed) return `https://boards.greenhouse.io/${ghEmbed[1]}`;

  // Lever: <script src="...lever.co/..."> or iframe with lever
  const leverMatch = html.match(/jobs\.lever\.co\/([a-z0-9_-]+)/i);
  if (leverMatch) return `https://jobs.lever.co/${leverMatch[1]}`;

  // Ashby: <script src="...ashbyhq.com/..."> or iframe
  const ashbyMatch = html.match(/jobs\.ashbyhq\.com\/([a-z0-9_-]+)/i);
  if (ashbyMatch) return `https://jobs.ashbyhq.com/${ashbyMatch[1]}`;

  // BambooHR: <script src="...bamboohr.com/...">
  const bambooMatch = html.match(/([a-z0-9_-]+)\.bamboohr\.com\/(?:careers|jobs)/i);
  if (bambooMatch) return `https://${bambooMatch[1]}.bamboohr.com/careers`;

  // Workable: <script src="...workable.com/...">
  const workableMatch = html.match(/apply\.workable\.com\/([a-z0-9_-]+)/i);
  if (workableMatch) return `https://apply.workable.com/${workableMatch[1]}`;

  return null;
}

// Try simple fetch first; detect ATS embeds; if SPA shell, use Puppeteer
async function fetchPage(url: string): Promise<{ html: string; resolvedUrl: string } | null> {
  const html = await fetchPageSimple(url);

  if (html) {
    // Check for embedded ATS widgets — scrape the ATS page directly
    const atsUrl = detectAtsEmbed(html);
    if (atsUrl && !isBlockedUrl(atsUrl)) {
      console.log(`[scraper] Detected ATS embed → ${atsUrl}`);
      const atsHtml = await fetchPageSimple(atsUrl);
      if (atsHtml) {
        const $ats = cheerio.load(atsHtml);
        $ats('script, style, noscript, svg').remove();
        const atsTextLen = $ats('body').text().replace(/\s+/g, ' ').trim().length;
        if (atsTextLen > 100) {
          console.log(`[scraper] ATS page OK — text: ${atsTextLen}`);
          return { html: atsHtml, resolvedUrl: atsUrl };
        }
      }
      // ATS page might be SPA too — use Puppeteer on it
      const atsRendered = await fetchPageWithBrowser(atsUrl);
      if (atsRendered) return { html: atsRendered, resolvedUrl: atsUrl };
    }

    const $ = cheerio.load(html);
    $('script, style, noscript, svg').remove();
    const textLen = $('body').text().replace(/\s+/g, ' ').trim().length;
    const linkCount = $('a[href]').length;
    const hasJsonLd = $('script[type="application/ld+json"]').length > 0;

    // If the page has enough content or structured data, use it directly
    if (textLen > 300 || linkCount > 10 || hasJsonLd) {
      console.log(`[scraper] Simple fetch OK — text: ${textLen}, links: ${linkCount}, JSON-LD: ${hasJsonLd}`);
      return { html, resolvedUrl: url };
    }
    console.log(`[scraper] Simple fetch got SPA shell (text: ${textLen}, links: ${linkCount}), falling back to Puppeteer`);
  }

  // SPA shell or fetch failed — render with Puppeteer
  const rendered = await fetchPageWithBrowser(url);
  return rendered ? { html: rendered, resolvedUrl: url } : null;
}

// Extract JSON-LD structured data (JobPosting schema) — works even on SPA shells
function extractJsonLd(html: string): any[] {
  const $ = cheerio.load(html);
  const results: any[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).html() || '');
      if (Array.isArray(data)) {
        data.forEach(d => { if (d['@type'] === 'JobPosting') results.push(d); });
      } else if (data['@type'] === 'JobPosting') {
        results.push(data);
      } else if (data['@graph']) {
        (data['@graph'] as any[]).forEach(d => { if (d['@type'] === 'JobPosting') results.push(d); });
      }
    } catch {}
  });
  return results;
}

// Extract __NEXT_DATA__ or similar embedded JSON from SPA shells
function extractEmbeddedData(html: string): string {
  const patterns = [
    /__NEXT_DATA__\s*=\s*({[\s\S]+?})\s*<\/script>/,
    /__NUXT_DATA__\s*=\s*({[\s\S]+?})\s*<\/script>/,
    /window\.__data\s*=\s*({[\s\S]+?})\s*;?\s*<\/script>/,
    /window\.initialData\s*=\s*({[\s\S]+?})\s*;?\s*<\/script>/,
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

// Extract meta tags (og:, twitter:, description)
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

// Extract visible text + apply links
function extractFullContent(html: string, baseUrl: string): string {
  const $ = cheerio.load(html);

  const applyLinks: string[] = [];
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const text = $(el).text().trim();
    if (/apply|submit|candidate|application/i.test(href) || /apply/i.test(text)) {
      try {
        const fullUrl = href.startsWith('http') ? href : new URL(href, baseUrl).toString();
        applyLinks.push(`${text || 'Apply'} → ${fullUrl}`);
      } catch {}
    }
  });

  $('script, style, noscript, iframe, svg').remove();
  let bodyText = $('body').text().replace(/\s+/g, ' ').trim();

  if (applyLinks.length > 0) {
    bodyText += '\n\nApply/Application links found:\n' + applyLinks.slice(0, 10).join('\n');
  }

  return bodyText;
}

function extractJobLinks(html: string, baseUrl: string): Array<{ text: string; url: string }> {
  const $ = cheerio.load(html);
  const links: Array<{ text: string; url: string }> = [];
  const seen = new Set<string>();

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const text = $(el).text().trim().replace(/\s+/g, ' ');
    if (!href || !text || text.length < 3 || text.length > 200) return;

    if (/career|job|position|opening|hiring|apply|role|vacanc/i.test(href) ||
        /apply|view\s*(role|job|position)|learn\s*more|see\s*details/i.test(text)) {
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

// Convert JSON-LD JobPosting to our format
function jobPostingToJob(jp: any, sourceUrl: string): any {
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

  // Determine work type from multiple signals
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

  // Extract salary from baseSalary or estimatedSalary
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

  // Convert HTML description to readable text with structure
  let description = jp.description || '';
  if (description) {
    description = description
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/?(p|div|h[1-6]|section)[\s>]/gi, '\n\n')
      .replace(/<li[\s>]/gi, '\n• ')
      .replace(/<\/li>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  const shortDesc = description ? description.split('\n')[0].trim().slice(0, 200) : null;

  const skills = Array.isArray(jp.skills)
    ? jp.skills
    : (typeof jp.skills === 'string' ? jp.skills.split(',').map((s: string) => s.trim()) : []);

  // Extract experience from experienceRequirements
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

  // Get apply URL
  let applicationUrl = null;
  if (jp.directApply) applicationUrl = sourceUrl;
  if (jp.url) applicationUrl = jp.url;
  if (jp.sameAs) applicationUrl = jp.sameAs;

  return {
    title: jp.title || null,
    shortDescription: shortDesc,
    description: description || null,
    department: jp.industry || jp.occupationalCategory || jp.department || null,
    location,
    workType,
    category: null, // will be inferred by LLM
    skills,
    experienceMin,
    experienceMax,
    salaryMin,
    salaryMax,
    salaryCurrency,
    applicationUrl: applicationUrl || sourceUrl,
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

const DETAIL_SYSTEM_PROMPT = `You extract detailed job information from a job posting page. Return a JSON object with ALL of these fields (use null when info is not available):

- title (string, required)
- shortDescription (string - one-line summary of the role, max 200 chars)
- description (string - full job description. Include ALL sections from the page: About, Responsibilities, Requirements, Qualifications, What we offer, Benefits. Format with "\\n\\n" between sections and "• " for bullet points. Be comprehensive — include every detail you find.)
- department (string or null)
- location (string or null - city/region mentioned)
- workType ("REMOTE", "HYBRID", "ONSITE", or null - infer from content like "work from home"=REMOTE, "in-office"=ONSITE)
- category (one of: AI_ENGINEER, ML_ENGINEER, LLM_ENGINEER, AI_RESEARCH_SCIENTIST, DATA_SCIENTIST, DATA_ENGINEER, PROMPT_ENGINEER, AI_PRODUCT_MANAGER, AI_DESIGNER, AI_SALES, AI_MARKETING, AI_DEVREL, AI_SOLUTIONS_ARCHITECT, AI_ETHICS, ROBOTICS_ENGINEER, COMPUTER_VISION, NLP_ENGINEER, AI_INFRASTRUCTURE, OTHER)
- skills (array of strings - ALL technical skills, tools, frameworks, languages mentioned. e.g. ["Python", "TensorFlow", "AWS", "SQL"])
- experienceMin (number or null - minimum years. e.g. "3-5 years" → 3)
- experienceMax (number or null - maximum years. e.g. "3-5 years" → 5)
- salaryMin (number or null - annual salary as integer, no decimals. Convert "10 LPA" to 1000000, "$120K" to 120000)
- salaryMax (number or null - same conversion)
- salaryCurrency (string or null - "USD", "INR", "EUR", "GBP". Infer from context: LPA/lakhs=INR, $/K=USD)
- applicationUrl (string or null - the direct URL to apply. Look in the "Apply" links section. Use the FULL URL.)
- applicationEmail (string or null - email address to send applications to)
- employmentType (one of: "FULL_TIME", "PART_TIME", "CONTRACT", "INTERNSHIP", "FREELANCE", or null. Infer from content: "full-time"=FULL_TIME, "part-time"=PART_TIME, "contract"=CONTRACT, "internship"=INTERNSHIP, "freelance"/"consultant"=FREELANCE)

IMPORTANT:
- Extract compensation if mentioned ANYWHERE on the page (even in benefits section).
- For applicationUrl, check the "Apply/Application links" section — use the most specific apply URL.
- For description, include EVERYTHING — do not summarize or shorten. Copy all responsibilities, requirements, qualifications, benefits verbatim.
- If structured data is provided, use it but also incorporate any additional info from the page text.`;

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

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // Mode: "detail" — scrape a single job page for full details
    if (mode === 'detail') {
      const result = await fetchPage(url);
      if (!result) {
        return NextResponse.json({ error: 'Failed to fetch job page' }, { status: 400 });
      }
      const { html } = result;

      // Strategy 1: JSON-LD structured data (works on SPA shells)
      const jsonLdJobs = extractJsonLd(html);
      console.log(`[scraper:detail] URL: ${url}, HTML length: ${html.length}, JSON-LD found: ${jsonLdJobs.length}`);

      // Strategy 2: Meta tags
      const metaTags = extractMetaTags(html);

      // Strategy 3: Embedded SPA data (__NEXT_DATA__ etc.)
      const embeddedData = extractEmbeddedData(html);

      // Strategy 4: Visible text + links
      const pageText = extractFullContent(html, url);
      console.log(`[scraper:detail] Text length: ${pageText.length}, Embedded data: ${embeddedData.length > 0}, Meta title: ${metaTags['og:title'] || metaTags['title'] || 'none'}`);

      // Build the best possible content for LLM
      const sections: string[] = [];

      if (jsonLdJobs.length > 0) {
        sections.push('=== STRUCTURED DATA (JSON-LD JobPosting) ===\n' + JSON.stringify(jsonLdJobs[0], null, 2).slice(0, 8000));
      }

      if (metaTags['og:title'] || metaTags['og:description'] || metaTags['description']) {
        sections.push('=== META TAGS ===\n' + Object.entries(metaTags)
          .filter(([k]) => ['title', 'description', 'og:title', 'og:description', 'og:type', 'twitter:title', 'twitter:description'].includes(k))
          .map(([k, v]) => `${k}: ${v}`)
          .join('\n'));
      }

      if (embeddedData) {
        sections.push('=== EMBEDDED APP DATA ===\n' + embeddedData.slice(0, 8000));
      }

      if (pageText.length > 100) {
        sections.push('=== PAGE TEXT ===\n' + pageText.slice(0, 12000));
      }

      const allContent = sections.join('\n\n');

      if (allContent.length < 50) {
        return NextResponse.json({
          success: true,
          job: { applicationUrl: url },
          partial: true,
        });
      }

      // If we have JSON-LD, extract directly and enhance with LLM for category
      if (jsonLdJobs.length > 0) {
        const structuredJob = jobPostingToJob(jsonLdJobs[0], url);

        // Use LLM just to categorize and extract skills if not in structured data
        const catCompletion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          temperature: 0,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: `Given a job title and description, return a JSON with:
- category (one of: AI_ENGINEER, ML_ENGINEER, LLM_ENGINEER, AI_RESEARCH_SCIENTIST, DATA_SCIENTIST, DATA_ENGINEER, PROMPT_ENGINEER, AI_PRODUCT_MANAGER, AI_DESIGNER, AI_SALES, AI_MARKETING, AI_DEVREL, AI_SOLUTIONS_ARCHITECT, AI_ETHICS, ROBOTICS_ENGINEER, COMPUTER_VISION, NLP_ENGINEER, AI_INFRASTRUCTURE, OTHER)
- skills (array of strings - technical skills, tools, frameworks mentioned)
- shortDescription (string - one-line summary, max 200 chars)
- experienceMin (number or null)
- experienceMax (number or null)`,
            },
            {
              role: 'user',
              content: `Title: ${structuredJob.title}\nDescription: ${(structuredJob.description || '').slice(0, 5000)}`,
            },
          ],
        });

        try {
          const extra = JSON.parse(catCompletion.choices[0]?.message?.content || '{}');
          structuredJob.category = extra.category || 'OTHER';
          if (!structuredJob.skills?.length && extra.skills?.length) structuredJob.skills = extra.skills;
          if (!structuredJob.shortDescription) structuredJob.shortDescription = extra.shortDescription;
          if (!structuredJob.experienceMin) structuredJob.experienceMin = extra.experienceMin;
          if (!structuredJob.experienceMax) structuredJob.experienceMax = extra.experienceMax;
        } catch {}

        if (!structuredJob.applicationUrl) structuredJob.applicationUrl = url;
        console.log('[scraper:detail] JSON-LD result:', JSON.stringify({ title: structuredJob.title, workType: structuredJob.workType, salaryMin: structuredJob.salaryMin, salaryMax: structuredJob.salaryMax, skills: structuredJob.skills?.length, descLen: structuredJob.description?.length }));

        return NextResponse.json({ success: true, job: structuredJob });
      }

      // No JSON-LD — use full LLM extraction
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: DETAIL_SYSTEM_PROMPT },
          {
            role: 'user',
            content: `Extract full job details from this page:\n\nURL: ${url}\n\n${allContent}`,
          },
        ],
      });

      const content = completion.choices[0]?.message?.content || '{}';
      let job: any;
      try {
        job = JSON.parse(content);
      } catch {
        return NextResponse.json({ error: 'Failed to parse job details' }, { status: 500 });
      }

      if (!job.applicationUrl) job.applicationUrl = url;
      console.log('[scraper:detail] LLM result:', JSON.stringify({ title: job.title, workType: job.workType, salaryMin: job.salaryMin, salaryMax: job.salaryMax, skills: job.skills?.length, descLen: job.description?.length, category: job.category }));

      return NextResponse.json({ success: true, job });
    }

    // Default mode: "list" — scrape career page for job listings
    const result = await fetchPage(url);
    if (!result) {
      return NextResponse.json({ error: 'Failed to fetch career page' }, { status: 400 });
    }
    const { html, resolvedUrl } = result;

    // Check for JSON-LD job listings on the career page itself
    const jsonLdJobs = extractJsonLd(html);

    const $ = cheerio.load(html);
    $('script, style, nav, footer, header, noscript, iframe, svg').remove();
    const pageText = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 15000);

    const jobLinks = extractJobLinks(html, resolvedUrl);
    const embeddedData = extractEmbeddedData(html);

    const sections: string[] = [];
    sections.push('Page content:\n' + pageText);

    if (jobLinks.length > 0) {
      sections.push('Job links found on page:\n' + jobLinks.slice(0, 40).map(l => `${l.text} → ${l.url}`).join('\n'));
    }

    if (jsonLdJobs.length > 0) {
      sections.push('Structured data (JSON-LD):\n' + JSON.stringify(jsonLdJobs.slice(0, 10), null, 2).slice(0, 5000));
    }

    if (embeddedData) {
      sections.push('Embedded app data:\n' + embeddedData.slice(0, 5000));
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You extract job listings from a career/jobs page. Return a JSON object with a "jobs" array. Each job object should have:
- title (string, required)
- department (string or null)
- location (string or null)
- workType ("REMOTE", "HYBRID", "ONSITE", or null)
- description (string or null - brief summary if visible on listing page)
- jobPageUrl (string or null - the direct URL to this specific job's detail page, from the links provided. This is CRITICAL for fetching full details later.)
- category (one of: AI_ENGINEER, ML_ENGINEER, LLM_ENGINEER, AI_RESEARCH_SCIENTIST, DATA_SCIENTIST, DATA_ENGINEER, PROMPT_ENGINEER, AI_PRODUCT_MANAGER, AI_DESIGNER, AI_SALES, AI_MARKETING, AI_DEVREL, AI_SOLUTIONS_ARCHITECT, AI_ETHICS, ROBOTICS_ENGINEER, COMPUTER_VISION, NLP_ENGINEER, AI_INFRASTRUCTURE, OTHER)
- employmentType (one of: "FULL_TIME", "PART_TIME", "CONTRACT", "INTERNSHIP", "FREELANCE", or null)

IMPORTANT:
- Match each job to its detail page URL from the links section. The jobPageUrl must be a FULL URL.
- Extract ALL info visible on the listing: title, department, location, work type.
- If structured data (JSON-LD) or embedded data is provided, use it to find jobs even if the page text is empty.
- Include ALL roles found. Use OTHER for non-AI roles.

If no jobs are found, return {"jobs": []}.`,
        },
        {
          role: 'user',
          content: `Extract job listings from this career page:\n\nURL: ${resolvedUrl}\n\n${sections.join('\n\n')}`,
        },
      ],
    });

    const content = completion.choices[0]?.message?.content || '{"jobs":[]}';
    let parsed: { jobs: any[] };
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = { jobs: [] };
    }

    const jobs = (parsed.jobs || [])
      .filter((j: any) => j.title && typeof j.title === 'string')
      .map((j: any, i: number) => ({
        id: `scraped-${i}`,
        title: j.title,
        department: j.department || null,
        location: j.location || null,
        workType: j.workType || null,
        description: j.description || null,
        jobPageUrl: j.jobPageUrl || null,
        category: j.category || 'OTHER',
        employmentType: j.employmentType || null,
      }));

    return NextResponse.json({
      success: true,
      jobs,
      url: resolvedUrl,
      originalUrl: url !== resolvedUrl ? url : undefined,
      linksFound: jobLinks.length,
    });
  } catch (err: any) {
    console.error('[scrape-careers]', err);
    return NextResponse.json({ error: err.message || 'Scraping failed' }, { status: 500 });
  }
}
