import { boardFromHtml, boardFromUrl, boardJob, boardJobs } from './ats';
import type { RenderPage } from './browser';
import {
  type DetailedJob, type ListedJob, type ParsedPage, EMPLOYMENT_TYPES, WORK_TYPES, applicationEmailFrom, descriptionFromText,
  extractExperience, extractSalary, firstLine, jobFromJsonLd, normalizeUrl, parsePage, perYear, pickCategory, skillsOnPage, urlFromPage,
} from './extract';
import { fetchHtml } from './fetch';
import { LIST_CHUNK, MAX_LIST_CHUNKS, aiJobDetail, aiListJobs } from './llm';

/**
 * Career page scraping, cheapest and most exact source first:
 *   1. the job board's public feed (Greenhouse, Lever, Ashby, Workable, SmartRecruiters, Keka): no browser, no AI;
 *   2. structured job data on the page (JSON-LD);
 *   3. the AI, reading page text — and only values that can be found on the page are kept.
 * Results are cached for 10 minutes, so re-opening the same page costs nothing.
 */

export type ListResult =
  | { ok: true; jobs: ListedJob[]; url: string; ats: string | null; source: 'feed' | 'structured' | 'ai'; truncated?: boolean }
  | { ok: false; error: string };
export type DetailResult =
  | { ok: true; job: Partial<DetailedJob>; partial?: boolean; skipped?: string; source: 'feed' | 'structured' | 'ai' | 'page' }
  | { ok: false; error: string };

// ─── Cache ─────────────────────────────────────────────────────────────────

const TTL_MS = 10 * 60_000;
const cache = new Map<string, { at: number; value: unknown }>();
async function cached<T extends { ok: boolean }>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as T;
  const value = await fn();
  if (value.ok) {
    cache.set(key, { at: Date.now(), value });
    if (cache.size > 100) cache.delete(cache.keys().next().value!);
  }
  return value;
}
export const clearScrapeCache = () => cache.clear();

// ─── Page loading ──────────────────────────────────────────────────────────

const looksEmpty = (p: ParsedPage) => p.text.length < 300 && p.links.length <= 10 && p.jsonLdJobs.length === 0;

/** The page as served, or rendered in a browser when it is an empty JavaScript shell. */
async function loadPage(url: string, render: RenderPage, opts: { firstHtml?: { body: string; finalUrl: string } | null; clickLoadMore?: boolean } = {}) {
  const fetched = opts.firstHtml !== undefined ? opts.firstHtml : await fetchHtml(url);
  let page = fetched ? parsePage(fetched.body, fetched.finalUrl) : null;
  let html = fetched?.body ?? null;
  if (!page || looksEmpty(page)) {
    const rendered = await render(fetched?.finalUrl ?? url, { clickLoadMore: opts.clickLoadMore });
    if (rendered) {
      const renderedPage = parsePage(rendered, fetched?.finalUrl ?? url);
      if (!page || renderedPage.text.length > page.text.length) { page = renderedPage; html = rendered; }
    }
  }
  return page && html ? { page, html } : null;
}

const squashWs = (s: string) => s.toLowerCase().replace(/\s+/g, ' ');
const onPage = (value: string | null | undefined, text: string) => !!value && squashWs(text).includes(squashWs(value).slice(0, 80));
const inEnum = (v: unknown, values: readonly string[]) => (typeof v === 'string' && values.includes(v) ? v : null);

// ─── List ──────────────────────────────────────────────────────────────────

export function scrapeList(url: string, render: RenderPage): Promise<ListResult> {
  return cached(`list:${normalizeUrl(url)}`, async (): Promise<ListResult> => {
    const direct = boardFromUrl(url);
    if (direct) {
      const jobs = await boardJobs(direct);
      if (jobs?.length) return { ok: true, jobs, url, ats: direct.ats, source: 'feed' };
    }

    const first = await fetchHtml(url);
    const embedded = first ? boardFromHtml(first.body) : null;
    if (embedded) {
      const jobs = await boardJobs(embedded);
      if (jobs?.length) return { ok: true, jobs, url: first!.finalUrl, ats: embedded.ats, source: 'feed' };
    }

    const loaded = await loadPage(url, render, { firstHtml: first, clickLoadMore: true });
    if (!loaded) return { ok: false, error: 'Couldn’t open that page. It may need a login, block bots, or not be public.' };
    const { page } = loaded;
    const rendered = boardFromHtml(loaded.html);
    if (rendered && !embedded) {
      const jobs = await boardJobs(rendered);
      if (jobs?.length) return { ok: true, jobs, url: page.url, ats: rendered.ats, source: 'feed' };
    }

    // Structured data that lists the jobs: no AI needed.
    if (page.jsonLdJobs.length >= 1) {
      const jobs = dedupe(page.jsonLdJobs.map((jp, i) => {
        const d = jobFromJsonLd(jp);
        const link = urlFromPage(jp.url, page, [page.url]) ?? null;
        return {
          id: `ld-${i}`, title: d.title || '', department: d.department ?? null, location: d.location ?? null, workType: d.workType ?? null,
          description: d.shortDescription ?? null, jobPageUrl: link, applicationUrl: d.applicationUrl && urlFromPage(d.applicationUrl, page, [page.url]) || link,
          category: pickCategory(d.title ?? null), employmentType: d.employmentType ?? null,
        };
      }));
      if (jobs.length) return { ok: true, jobs, url: page.url, ats: null, source: 'structured' };
    }

    const chunks: string[] = [];
    for (let i = 0; i < page.text.length && chunks.length < MAX_LIST_CHUNKS; i += LIST_CHUNK) chunks.push(page.text.slice(i, i + LIST_CHUNK));
    if (!chunks.length) return { ok: true, jobs: [], url: page.url, ats: null, source: 'ai' };
    const links = page.links.filter((l) => l.isJob || l.isApply).slice(0, 200).map((l) => `${l.text} → ${l.url}`).join('\n');
    const raw = await aiListJobs({ url: page.url, chunks, links, structured: '', embedded: page.embedded });

    // Keep only jobs whose title is on the page, with links that are the page's own.
    const jobs = dedupe(raw.filter((j) => typeof j.title === 'string' && j.title.trim() && onPage(j.title, page.text + '\n' + links)).map((j, i) => ({
      id: `ai-${i}`,
      title: j.title.trim(),
      department: j.department || null,
      location: j.location || null,
      workType: inEnum(j.workType, WORK_TYPES),
      description: j.description || null,
      jobPageUrl: urlFromPage(j.jobPageUrl, page),
      applicationUrl: urlFromPage(j.applicationUrl, page),
      category: pickCategory(j.title, j.category),
      employmentType: inEnum(j.employmentType, EMPLOYMENT_TYPES),
    })));
    return { ok: true, jobs, url: page.url, ats: null, source: 'ai', truncated: page.text.length > LIST_CHUNK * MAX_LIST_CHUNKS };
  });
}

function dedupe(jobs: ListedJob[]): ListedJob[] {
  const seen = new Set<string>();
  return jobs.filter((j) => {
    if (!j.title) return false;
    const key = `${j.title.toLowerCase()}|${(j.location || '').toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── Detail ────────────────────────────────────────────────────────────────

/** Links that are forms or logins, not job descriptions: keep them as the apply link and read nothing. */
const FORM_HOSTS = ['docs.google.com', 'forms.gle', 'forms.google.com', 'accounts.google.com', 'mail.google.com', 'drive.google.com', 'forms.office.com', 'typeform.com', 'tally.so', 'jotform.com'];
const LOGIN_HOSTS = ['linkedin.com', 'indeed.com', 'glassdoor.com', 'facebook.com', 'twitter.com', 'x.com', 'instagram.com'];
const hostIs = (host: string, list: string[]) => list.some((h) => host === h || host.endsWith(`.${h}`));

export function scrapeDetail(url: string, render: RenderPage): Promise<DetailResult> {
  return cached(`detail:${normalizeUrl(url)}`, async (): Promise<DetailResult> => {
    const host = new URL(url).hostname.toLowerCase();
    if (hostIs(host, FORM_HOSTS) || hostIs(host, LOGIN_HOSTS)) {
      return { ok: true, job: { applicationUrl: url }, partial: true, skipped: 'non-job-page', source: 'page' };
    }

    const board = boardFromUrl(url);
    if (board) {
      const job = await boardJob(board, url);
      if (job) return { ok: true, job, source: 'feed' };
    }

    const loaded = await loadPage(url, render);
    if (!loaded) return { ok: false, error: 'Couldn’t open the job page. It may need a login or block bots.' };
    const { page } = loaded;
    const lower = page.text.toLowerCase();
    if (/sign in|log in|create account/.test(lower) && /password|forgot/.test(lower) && !/responsibilit|requirement|qualification/.test(lower)) {
      return { ok: true, job: { applicationUrl: url }, partial: true, skipped: 'login-page', source: 'page' };
    }

    const ld = page.jsonLdJobs[0] ? jobFromJsonLd(page.jsonLdJobs[0]) : null;
    const description = descriptionFromText(page.text) ?? ld?.description ?? null;
    const applyLinks = page.links.filter((l) => l.isApply);
    const pageTitle = ld?.title || page.meta['og:title'] || page.meta.title || null;

    // Structured data with the essentials needs no AI; fill skills/experience/salary from text by rule.
    const ldComplete = !!(ld?.title && description && ((ld.skills?.length ?? 0) > 0 || ld.experienceMin != null));
    const ai = ldComplete ? null : await aiJobDetail({
      url: page.url, title: ld?.title, text: page.text,
      applyLinks: applyLinks.slice(0, 20).map((l) => `${l.text} → ${l.url}`).join('\n'),
      structured: page.jsonLdJobs[0] ? JSON.stringify(page.jsonLdJobs[0]) : undefined,
    }).catch((err) => { console.error('[scraper] AI detail failed:', err instanceof Error ? err.message : err); return null; });

    const title = ld?.title || (ai?.title && onPage(ai.title, page.text) ? ai.title : null) || pageTitle;
    const textExp = extractExperience(description || page.text);
    const aiExpOk = ai?.experienceMin != null && ai.experienceMin >= 0 && ai.experienceMin <= 30;
    const ruleSalary = extractSalary(description || page.text);
    const aiMult = ai?.salaryPeriod ? perYear(ai.salaryPeriod) : null;
    const salary = ld?.salaryMin != null || ld?.salaryMax != null
      ? { min: ld.salaryMin ?? null, max: ld.salaryMax ?? null, currency: ld.salaryCurrency ?? null }
      : ruleSalary.min != null ? ruleSalary
      : ai && aiMult != null && (ai.salaryMin != null || ai.salaryMax != null)
        ? { min: ai.salaryMin != null ? Math.round(ai.salaryMin * aiMult) : null, max: ai.salaryMax != null ? Math.round(ai.salaryMax * aiMult) : null, currency: ai.salaryCurrency }
        : { min: null, max: null, currency: null };

    // Apply link: the AI's pick only if it is one of the page's own apply links; else the page's clearest apply link.
    const clearApply = applyLinks.find((l) => /^(apply|apply now|apply for this (job|role|position)|submit application)$/i.test(l.text) && normalizeUrl(l.url) !== normalizeUrl(page.url));
    const applicationUrl = urlFromPage(ai?.applicationUrl, { linkSet: new Set(applyLinks.map((l) => normalizeUrl(l.url))) })
      ?? (ld?.applicationUrl && urlFromPage(ld.applicationUrl, page, [page.url])) ?? clearApply?.url ?? page.url;

    const job: DetailedJob = {
      title,
      shortDescription: (ai?.shortDescription || ld?.shortDescription || firstLine(description))?.slice(0, 200) ?? null,
      description,
      department: ld?.department || (onPage(ai?.department, page.text) ? ai!.department : null),
      location: ld?.location || (onPage(ai?.location?.split(',')[0], page.text) ? ai!.location : null),
      workType: ld?.workType || inEnum(ai?.workType, WORK_TYPES),
      category: pickCategory(title, ai?.category),
      skills: skillsOnPage([...(ld?.skills ?? []), ...(ai?.skills ?? [])], page.text),
      experienceMin: ld?.experienceMin ?? (aiExpOk ? ai!.experienceMin : textExp.min),
      experienceMax: ld?.experienceMax ?? (aiExpOk ? ai!.experienceMax : textExp.max),
      salaryMin: salary.min, salaryMax: salary.max, salaryCurrency: salary.currency,
      applicationUrl,
      applicationEmail: applicationEmailFrom(page.text, ai?.applicationEmail),
      employmentType: ld?.employmentType || inEnum(ai?.employmentType, EMPLOYMENT_TYPES),
    };
    return { ok: true, job, source: ai ? 'ai' : ld ? 'structured' : 'page' };
  });
}
