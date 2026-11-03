import * as cheerio from 'cheerio';
import { fetchJson, safeGet } from './fetch';
import {
  type DetailedJob, type ListedJob, categorizeJobTitle, extractExperience, extractSalary, firstLine, htmlToText,
  knownSkillsIn, normalizeEmploymentType, normalizeUrl, perYear, skillsOnPage, workTypeFrom,
} from './extract';

/**
 * Applicant tracking systems with public job feeds. When a career page is (or embeds) one of these boards, the jobs
 * come straight from the feed: exact titles, locations, descriptions and apply links, with no browser and no AI.
 */

export type Board =
  | { ats: 'greenhouse'; token: string; eu?: boolean }
  | { ats: 'lever'; company: string; eu?: boolean }
  | { ats: 'ashby'; name: string }
  | { ats: 'workable'; account: string }
  | { ats: 'smartrecruiters'; company: string }
  | { ats: 'keka'; subdomain: string; identifier?: string };

const SLUG = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/;
const RESERVED = new Set(['embed', 'jobs', 'job', 'api', 'v1', 'careers', 'j', 'apply']);
const firstSegment = (u: URL) => u.pathname.split('/').filter(Boolean)[0] ?? '';

/** The board a URL belongs to, by host name. */
export function boardFromUrl(raw: string): Board | null {
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  const host = u.hostname.toLowerCase();
  const seg = firstSegment(u);
  const ok = (s: string) => SLUG.test(s) && !RESERVED.has(s.toLowerCase());
  if (/^(boards|job-boards)(\.eu)?\.greenhouse\.io$/.test(host)) {
    const token = u.searchParams.get('for') || seg;
    return ok(token) ? { ats: 'greenhouse', token, eu: host.includes('.eu.') } : null;
  }
  if (host === 'jobs.lever.co' || host === 'jobs.eu.lever.co') return ok(seg) ? { ats: 'lever', company: seg, eu: host.includes('.eu.') } : null;
  if (host === 'jobs.ashbyhq.com') return ok(seg) ? { ats: 'ashby', name: decodeURIComponent(seg) } : null;
  if (host === 'apply.workable.com') return ok(seg) ? { ats: 'workable', account: seg } : null;
  if (host.endsWith('.workable.com') && host !== 'www.workable.com') return { ats: 'workable', account: host.split('.')[0] };
  if (host === 'jobs.smartrecruiters.com' || host === 'careers.smartrecruiters.com') return ok(seg) ? { ats: 'smartrecruiters', company: seg } : null;
  if (host.endsWith('.keka.com') && host.split('.').length === 3) return { ats: 'keka', subdomain: host.split('.')[0] };
  return null;
}

/** A board embedded in a company's own career page (script tags, iframes, links). */
export function boardFromHtml(html: string): Board | null {
  const $ = cheerio.load(html);
  const refs: string[] = [];
  $('script[src], iframe[src], a[href], link[href]').each((_, el) => {
    const v = $(el).attr('src') || $(el).attr('href');
    if (v) refs.push(v);
  });
  for (const ref of refs) {
    try {
      const board = boardFromUrl(new URL(ref, 'https://x.invalid').toString());
      if (board) return board.ats === 'keka' ? withKekaId(board, html) : board;
    } catch { /* not a URL */ }
  }
  // Greenhouse's embed script names the board in Grnhse.Settings / ?for=.
  const gh = html.match(/boards(?:\.eu)?\.greenhouse\.io\/embed\/job_board(?:\/js)?\?for=([A-Za-z0-9_-]+)/);
  if (gh) return { ats: 'greenhouse', token: gh[1] };
  const keka = html.match(/([a-z0-9-]+)\.keka\.com\/careers/i);
  if (keka) return withKekaId({ ats: 'keka', subdomain: keka[1].toLowerCase() }, html);
  return null;
}

function withKekaId(board: Extract<Board, { ats: 'keka' }>, html: string): Board {
  const id = html.match(/identifier:\s*["']([a-f0-9-]{36})["']/i)?.[1] || html.match(/embedjobs\/(?:js\/|default\/active\/)?([a-f0-9-]{36})/i)?.[1];
  return id ? { ...board, identifier: id } : board;
}

// ─── Feeds ─────────────────────────────────────────────────────────────────

type Built = Omit<DetailedJob, 'category'> & { jobPageUrl: string | null; id: string };

function toListed(jobs: Built[]): ListedJob[] {
  const seen = new Set<string>();
  return jobs.filter((j) => {
    if (!j.title) return false;
    const key = `${j.title.toLowerCase()}|${(j.location || '').toLowerCase()}|${j.jobPageUrl ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((j, i) => {
    const category = categorizeJobTitle(j.title!);
    const detail: DetailedJob = { ...j, category };
    return {
      id: `ats-${i}-${j.id}`,
      title: j.title!,
      department: j.department,
      location: j.location,
      workType: j.workType,
      description: j.shortDescription,
      jobPageUrl: j.jobPageUrl,
      applicationUrl: j.applicationUrl,
      category,
      employmentType: j.employmentType,
      detail,
    };
  });
}

/** Fill experience, salary and skills from the description where the feed has no field for them. */
function fromDescription(description: string, given: { skills?: string[]; salary?: { min: number | null; max: number | null; currency: string | null } }) {
  const exp = extractExperience(description);
  const salary = given.salary && (given.salary.min != null || given.salary.max != null) ? given.salary : extractSalary(description);
  return {
    experienceMin: exp.min, experienceMax: exp.max,
    salaryMin: salary.min, salaryMax: salary.max, salaryCurrency: salary.currency,
    skills: given.skills?.length ? skillsOnPage(given.skills, description) : knownSkillsIn(description),
  };
}

/** True only when the link's host is Greenhouse itself (never a look-alike path or host on another domain). */
function isGreenhouseHost(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === 'greenhouse.io' || host.endsWith('.greenhouse.io');
  } catch {
    return false;
  }
}

async function greenhouse(b: Extract<Board, { ats: 'greenhouse' }>): Promise<Built[] | null> {
  const api = `https://boards-api${b.eu ? '.eu' : ''}.greenhouse.io/v1/boards/${encodeURIComponent(b.token)}/jobs?content=true`;
  const data = await fetchJson<{ jobs?: any[] }>(api);
  if (!data?.jobs) return null;
  return data.jobs.map((j) => {
    const description = htmlToText(j.content || '');
    const location = j.location?.name || null;
    return {
      id: String(j.id), title: j.title, jobPageUrl: j.absolute_url || null,
      // On Greenhouse-hosted pages #app jumps to the form; companies hosting the board themselves use their own page.
      applicationUrl: j.absolute_url ? (isGreenhouseHost(j.absolute_url) ? `${j.absolute_url}#app` : j.absolute_url) : null, applicationEmail: null,
      description, shortDescription: firstLine(description), location,
      department: j.departments?.[0]?.name || null, workType: workTypeFrom(location, j.title),
      employmentType: normalizeEmploymentType(j.metadata?.find?.((m: any) => /employment|type/i.test(m?.name))?.value) || null,
      ...fromDescription(description, {}),
    };
  });
}

async function lever(b: Extract<Board, { ats: 'lever' }>): Promise<Built[] | null> {
  const data = await fetchJson<any[]>(`https://api${b.eu ? '.eu' : ''}.lever.co/v0/postings/${encodeURIComponent(b.company)}?mode=json`);
  if (!Array.isArray(data)) return null;
  return data.map((j) => {
    const lists = (j.lists ?? []).map((l: any) => `### ${l.text}\n${htmlToText(l.content || '')}`).join('\n\n');
    const description = [j.descriptionPlain || htmlToText(j.description || ''), lists, j.additionalPlain || ''].filter(Boolean).join('\n\n').trim();
    const mult = perYear(j.salaryRange?.interval);
    const salary = j.salaryRange && mult != null
      ? { min: j.salaryRange.min != null ? Math.round(j.salaryRange.min * mult) : null, max: j.salaryRange.max != null ? Math.round(j.salaryRange.max * mult) : null, currency: j.salaryRange.currency || null }
      : undefined;
    const location = j.categories?.allLocations?.join('; ') || j.categories?.location || null;
    return {
      id: String(j.id), title: j.text, jobPageUrl: j.hostedUrl || null, applicationUrl: j.applyUrl || j.hostedUrl || null, applicationEmail: null,
      description, shortDescription: firstLine(description), location,
      department: j.categories?.team || j.categories?.department || null,
      workType: workTypeFrom(j.workplaceType, location), employmentType: normalizeEmploymentType(j.categories?.commitment),
      ...fromDescription(description, { salary }),
    };
  });
}

async function ashby(b: Extract<Board, { ats: 'ashby' }>): Promise<Built[] | null> {
  const data = await fetchJson<{ jobs?: any[] }>(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(b.name)}?includeCompensation=true`);
  if (!data?.jobs) return null;
  return data.jobs.filter((j) => j.isListed !== false).map((j) => {
    const description = j.descriptionPlain || htmlToText(j.descriptionHtml || '');
    const comp = j.compensation?.summaryComponents?.find((c: any) => c.compensationType === 'Salary');
    const mult = comp ? perYear(comp.interval) : null;
    const salary = comp && mult != null
      ? { min: comp.minValue != null ? Math.round(comp.minValue * mult) : null, max: comp.maxValue != null ? Math.round(comp.maxValue * mult) : null, currency: comp.currencyCode || null }
      : undefined;
    return {
      id: String(j.id), title: j.title, jobPageUrl: j.jobUrl || null, applicationUrl: j.applyUrl || j.jobUrl || null, applicationEmail: null,
      description, shortDescription: firstLine(description), location: j.location || null,
      department: j.department || j.team || null,
      workType: workTypeFrom(j.workplaceType, j.isRemote ? 'remote' : null), employmentType: normalizeEmploymentType(j.employmentType),
      ...fromDescription(description, { salary }),
    };
  });
}

async function workable(b: Extract<Board, { ats: 'workable' }>): Promise<Built[] | null> {
  const data = await fetchJson<{ jobs?: any[] }>(`https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(b.account)}?details=true`);
  if (!data?.jobs) return null;
  return data.jobs.map((j) => {
    const description = htmlToText([j.description, j.requirements, j.benefits].filter(Boolean).join(''));
    const location = [j.city, j.state, j.country].filter(Boolean).join(', ') || null;
    return {
      id: String(j.shortcode || j.id), title: j.title, jobPageUrl: j.url || j.shortlink || null,
      applicationUrl: j.application_url || j.url || null, applicationEmail: null,
      description, shortDescription: firstLine(description), location, department: j.department || null,
      workType: workTypeFrom(j.telecommuting ? 'remote' : null, j.workplace_type, location), employmentType: normalizeEmploymentType(j.employment_type),
      ...fromDescription(description, {}),
    };
  });
}

async function smartrecruiters(b: Extract<Board, { ats: 'smartrecruiters' }>): Promise<Built[] | null> {
  const base = `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(b.company)}/postings`;
  const list = await fetchJson<{ content?: any[] }>(`${base}?limit=100`);
  if (!list?.content) return null;
  // The list has no descriptions; fetch details for the first 40, a few at a time.
  const postings = list.content.slice(0, 40);
  const details = await mapLimit(postings, 5, (p) => fetchJson<any>(`${base}/${encodeURIComponent(p.id)}`, 10_000));
  return postings.map((p, i) => {
    const d = details[i];
    const sections = d?.jobAd?.sections ?? {};
    const description = htmlToText([sections.jobDescription?.text, sections.qualifications?.text, sections.additionalInformation?.text].filter(Boolean).join(''));
    const loc = p.location ?? {};
    const location = [loc.city, loc.region, loc.country?.toUpperCase?.()].filter(Boolean).join(', ') || null;
    const page = d?.postingUrl || `https://jobs.smartrecruiters.com/${b.company}/${p.id}`;
    return {
      id: String(p.id), title: p.name, jobPageUrl: page, applicationUrl: d?.applyUrl || page, applicationEmail: null,
      description, shortDescription: firstLine(description), location, department: p.department?.label || null,
      workType: workTypeFrom(loc.remote ? 'remote' : null, loc.hybrid ? 'hybrid' : null), employmentType: normalizeEmploymentType(p.typeOfEmployment?.label),
      ...fromDescription(description, {}),
    };
  });
}

async function keka(b: Extract<Board, { ats: 'keka' }>): Promise<Built[] | null> {
  let id = b.identifier;
  if (!id) {
    const page = await safeGet(`https://${b.subdomain}.keka.com/careers/`, { timeoutMs: 10_000 });
    id = page?.body.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i)?.[1];
  }
  if (!id) return null;
  const careers = `https://${b.subdomain}.keka.com/careers/`;
  const data = await fetchJson<any[]>(`${careers}api/embedjobs/default/active/${id}`);
  if (!Array.isArray(data)) return null;
  const types: Record<number, string> = { 1: 'FULL_TIME', 2: 'FULL_TIME', 3: 'PART_TIME', 4: 'CONTRACT', 5: 'INTERNSHIP' };
  return data.map((j) => {
    const description = htmlToText(j.description || '') || j.excerpt || '';
    const loc = j.jobLocations?.[0];
    const location = loc ? [loc.city, loc.state, loc.countryName].filter(Boolean).join(', ') : null;
    const exp = extractExperience(String(j.experience ?? ''));
    const page = j.id ? `${careers}jobdetails/${j.id}` : `${careers}#openings`;
    const salary = j.salaryRange && (j.salaryRange.minSalary || j.salaryRange.maxSalary)
      ? { min: j.salaryRange.minSalary || null, max: j.salaryRange.maxSalary || null, currency: j.salaryRange.currency || null }
      : undefined;
    const filled = fromDescription(description, { salary, skills: j.skillNames ?? [] });
    return {
      id: String(j.id ?? j.title), title: j.title, jobPageUrl: page, applicationUrl: page, applicationEmail: null,
      description, shortDescription: firstLine(description), location, department: j.departmentName || null,
      workType: workTypeFrom(location), employmentType: types[j.jobType] || null,
      ...filled,
      // Keka states experience as its own field; the description is only a fallback.
      experienceMin: exp.min ?? filled.experienceMin, experienceMax: exp.max ?? filled.experienceMax,
      // Keka's skill list is the employer's own, so keep it even where the description doesn't repeat it.
      skills: (j.skillNames ?? []).filter((s: unknown) => typeof s === 'string').slice(0, 25),
    };
  });
}

export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }));
  return out;
}

/** All open jobs on a board, from its public feed; null when the feed can't be read. */
export async function boardJobs(board: Board): Promise<ListedJob[] | null> {
  const built = await ({ greenhouse, lever, ashby, workable, smartrecruiters, keka } as Record<Board['ats'], (b: any) => Promise<Built[] | null>>)[board.ats](board)
    .catch((err) => { console.error(`[scraper:${board.ats}] feed failed:`, err instanceof Error ? err.message : err); return null; });
  return built ? toListed(built) : null;
}

/** One job on a board, matched by its page or apply URL (used when a single ATS job link is pasted). */
export async function boardJob(board: Board, url: string): Promise<DetailedJob | null> {
  const jobs = await boardJobs(board);
  const key = normalizeUrl(url);
  const tail = key.split('/').filter(Boolean).pop();
  const hit = jobs?.find((j) => [j.jobPageUrl, j.applicationUrl].some((u) => u && (normalizeUrl(u) === key || (tail && tail.length >= 6 && normalizeUrl(u).includes(tail)))));
  return hit?.detail ?? null;
}
