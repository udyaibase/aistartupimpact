import * as cheerio from 'cheerio';

/**
 * Turning career/job pages into data without AI: structured data (JSON-LD), links, readable text, and the
 * experience / salary / email / skills rules used to fill gaps and to check what the AI returned.
 */

export const JOB_CATEGORIES = [
  'AI_ENGINEER', 'ML_ENGINEER', 'LLM_ENGINEER', 'AI_RESEARCH_SCIENTIST', 'DATA_SCIENTIST', 'DATA_ENGINEER',
  'PROMPT_ENGINEER', 'AI_PRODUCT_MANAGER', 'AI_DESIGNER', 'AI_SALES', 'AI_MARKETING', 'AI_DEVREL',
  'AI_SOLUTIONS_ARCHITECT', 'AI_ETHICS', 'ROBOTICS_ENGINEER', 'COMPUTER_VISION', 'NLP_ENGINEER', 'AI_INFRASTRUCTURE', 'OTHER',
] as const;
export const EMPLOYMENT_TYPES = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP', 'FREELANCE'] as const;
export const WORK_TYPES = ['REMOTE', 'HYBRID', 'ONSITE'] as const;

/** One job with everything the job form needs. Salaries are yearly amounts. */
export type DetailedJob = {
  title: string | null;
  shortDescription: string | null;
  description: string | null;
  department: string | null;
  location: string | null;
  workType: string | null;
  category: string | null;
  skills: string[];
  experienceMin: number | null;
  experienceMax: number | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  applicationUrl: string | null;
  applicationEmail: string | null;
  employmentType: string | null;
};

/** A row in the scraped list. `detail` is set when the source already gave everything (job-board feeds). */
export type ListedJob = {
  id: string;
  title: string;
  department: string | null;
  location: string | null;
  workType: string | null;
  description: string | null;
  jobPageUrl: string | null;
  applicationUrl: string | null;
  category: string;
  employmentType: string | null;
  detail?: DetailedJob;
};

export type PageLink = { text: string; url: string; isApply: boolean; isJob: boolean };

export type ParsedPage = {
  url: string;
  jsonLdJobs: any[];
  meta: Record<string, string>;
  links: PageLink[];
  /** Every link URL on the page, for checking that a URL the AI returned really is on the page. */
  linkSet: Set<string>;
  text: string;
  embedded: string;
};

export function normalizeUrl(u: string): string {
  try {
    const url = new URL(u);
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return u;
  }
}

const textOf = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Parse a page once and pull out everything the scraper uses. */
export function parsePage(html: string, baseUrl: string): ParsedPage {
  const $ = cheerio.load(html);

  const jsonLdJobs: any[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const visit = (d: any) => {
        if (!d || typeof d !== 'object') return;
        if (Array.isArray(d)) return d.forEach(visit);
        const type = d['@type'];
        if (type === 'JobPosting' || (Array.isArray(type) && type.includes('JobPosting'))) jsonLdJobs.push(d);
        if (Array.isArray(d['@graph'])) d['@graph'].forEach(visit);
        if (Array.isArray(d.itemListElement)) d.itemListElement.forEach((i: any) => visit(i?.item ?? i));
      };
      visit(JSON.parse($(el).text()));
    } catch { /* malformed JSON-LD */ }
  });

  const meta: Record<string, string> = { title: textOf($('title').first().text()) };
  $('meta').each((_, el) => {
    const name = $(el).attr('name') || $(el).attr('property');
    const content = $(el).attr('content');
    if (name && content) meta[name] = content;
  });

  const embedded = extractEmbeddedData($);

  const links: PageLink[] = [];
  const linkSet = new Set<string>();
  const addLink = (href: string, label: string, classes = '', dataApply = false) => {
    if (!href || href === '#') return;
    let parsed: URL;
    try { parsed = new URL(href, baseUrl); } catch { return; }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return;
    const url = parsed.toString();
    const key = normalizeUrl(url);
    if (linkSet.has(key)) return;
    linkSet.add(key);
    const text = textOf(label);
    if (text.length < 2 || text.length > 300) return;
    const isApply = dataApply || /apply|application|candidate/i.test(parsed.pathname + parsed.search)
      || /^(apply|apply now|apply here|apply for this (job|role|position)|submit application|start application)$/i.test(text)
      || /apply-btn|apply_button|btn-apply|cta-apply/i.test(classes);
    const isJob = /career|job|position|opening|hiring|role|vacanc|posting|requisition/i.test(parsed.pathname)
      || /view\s*(role|job|position|details)|learn\s*more|see\s*details|read\s*more/i.test(text);
    links.push({ text, url, isApply, isJob });
  };
  $('a[href]').each((_, el) => {
    const $el = $(el);
    addLink($el.attr('href') || '', $el.text() || $el.attr('aria-label') || '', $el.attr('class') || '', $el.attr('data-apply-url') != null);
  });
  $('[data-href], [data-url]').each((_, el) => {
    const $el = $(el);
    addLink($el.attr('data-href') || $el.attr('data-url') || '', $el.text() || 'Link');
  });

  return { url: baseUrl, jsonLdJobs, meta, links, linkSet, text: pageText($), embedded };
}

/** App state some sites embed (Next.js, Nuxt, Redux), compacted, when it looks job-related. */
function extractEmbeddedData($: cheerio.CheerioAPI): string {
  const candidates: string[] = [];
  const next = $('script#__NEXT_DATA__').text();
  if (next) candidates.push(next);
  const nuxt = $('script#__NUXT_DATA__').text();
  if (nuxt) candidates.push(nuxt);
  $('script:not([src])').each((_, el) => {
    const m = $(el).text().match(/window\.(?:__INITIAL_STATE__|__data|initialData|__APOLLO_STATE__)\s*=\s*(\{[\s\S]*\})\s*;?\s*$/);
    if (m) candidates.push(m[1]);
  });
  for (const raw of candidates) {
    try {
      const json = JSON.stringify(JSON.parse(raw));
      if (/"(title|jobTitle|position|name)"\s*:/.test(json) && /job|position|opening|role/i.test(json)) return json.slice(0, 8000);
    } catch { /* not JSON */ }
  }
  return '';
}

/** Readable text of the main content, keeping headings, bullets, tables and key/value lists. */
function pageText($: cheerio.CheerioAPI): string {
  $('script, style, noscript, iframe, svg, video, audio, canvas, template').remove();
  $('[role="navigation"], [class*="cookie"], [class*="consent"], [class*="gdpr"], [id*="onetrust"]').remove();
  $('[class*="site-nav"], [class*="site-header"], [class*="site-footer"], [class*="global-nav"], [class*="global-footer"], [class*="main-nav"], [class*="top-nav"]').remove();

  const selectors = [
    'main', '[role="main"]', 'article', '.job-description', '.job-content', '.job-details', '.job-posting',
    '#job-description', '#job-details', '#job-content', '.posting-page', '.career-page', '.careers-listing',
    '.content-area', '.page-content', '.main-content', '[data-automation="job-description"]', '#content', '#main',
  ];
  let area = $(selectors.join(', ')).first();
  if (!area.length || textOf(area.text()).length < 200) area = $('body');

  area.find('br').replaceWith('\n');
  area.find('h1, h2, h3, h4, h5, h6').each((_, el) => { $(el).prepend('\n\n### ').append('\n'); });
  area.find('p, div, section, tr').each((_, el) => { $(el).prepend('\n').append('\n'); });
  area.find('li').each((_, el) => { $(el).prepend('\n• '); });
  area.find('td, th').each((_, el) => { $(el).append(' | '); });
  area.find('dt').each((_, el) => { $(el).prepend('\n').append(': '); });

  return area.text().replace(/\t/g, ' ').replace(/[  ]{2,}/g, ' ').replace(/\n /g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Job HTML (from a feed or JSON-LD) → structured text with headings and bullets. */
export function htmlToText(html: string): string {
  if (!html) return '';
  // Some feeds (Greenhouse) send HTML with its tags escaped.
  const decoded = /&lt;\w/.test(html) && !/<\w/.test(html) ? cheerio.load(`<div>${html}</div>`)('div').text() : html;
  const $ = cheerio.load(`<div id="root">${decoded}</div>`);
  $('script, style, noscript').remove();
  $('br').replaceWith('\n');
  $('h1, h2, h3, h4, h5, h6').each((_, el) => { $(el).replaceWith(`\n\n### ${textOf($(el).text())}\n`); });
  $('p, div, section, ul, ol').each((_, el) => { $(el).prepend('\n').append('\n'); });
  $('li').each((_, el) => { $(el).prepend('• ').append('\n'); });
  return $('#root').text().replace(/\t/g, ' ').replace(/[  ]{2,}/g, ' ').replace(/\n /g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function firstLine(text: string | null, max = 200): string | null {
  const line = text?.split('\n').map((l) => l.replace(/^[#•\s]+/, '').trim()).find((l) => l.length > 20);
  return line ? line.slice(0, max) : null;
}

// ─── Classification ────────────────────────────────────────────────────────

export function categorizeJobTitle(title: string): string {
  const t = title.toUpperCase();
  if (/\bAI\b|ARTIFICIAL INTELLIGENCE|\bGENAI\b|GENERATIVE AI/.test(t)) {
    if (/RESEARCH|SCIENTIST/.test(t)) return 'AI_RESEARCH_SCIENTIST';
    if (/PRODUCT/.test(t)) return 'AI_PRODUCT_MANAGER';
    if (/DESIGN/.test(t)) return 'AI_DESIGNER';
    if (/SALES|ACCOUNT EXEC/.test(t)) return 'AI_SALES';
    if (/MARKET/.test(t)) return 'AI_MARKETING';
    if (/DEVREL|ADVOCATE/.test(t)) return 'AI_DEVREL';
    if (/SOLUTION|ARCHITECT/.test(t)) return 'AI_SOLUTIONS_ARCHITECT';
    if (/ETHIC|SAFETY|POLICY/.test(t)) return 'AI_ETHICS';
    if (/INFRA|PLATFORM|MLOPS/.test(t)) return 'AI_INFRASTRUCTURE';
    return 'AI_ENGINEER';
  }
  if (/\bLLM\b|LARGE LANGUAGE/.test(t)) return 'LLM_ENGINEER';
  if (/\bML\b|MACHINE LEARNING|\bMLOPS\b/.test(t)) return 'ML_ENGINEER';
  if (/DATA SCIEN/.test(t)) return 'DATA_SCIENTIST';
  if (/DATA ENGINEER/.test(t)) return 'DATA_ENGINEER';
  if (/PROMPT ENGINEER/.test(t)) return 'PROMPT_ENGINEER';
  if (/\bNLP\b|NATURAL LANGUAGE/.test(t)) return 'NLP_ENGINEER';
  if (/COMPUTER VISION|\bCV ENGINEER/.test(t)) return 'COMPUTER_VISION';
  if (/ROBOT/.test(t)) return 'ROBOTICS_ENGINEER';
  return 'OTHER';
}

/** One rule for every source: a clear title wins; otherwise the AI's pick (if valid); otherwise OTHER. */
export function pickCategory(title: string | null, aiCategory?: string | null): string {
  const byTitle = categorizeJobTitle(title || '');
  if (byTitle !== 'OTHER') return byTitle;
  return aiCategory && (JOB_CATEGORIES as readonly string[]).includes(aiCategory) ? aiCategory : 'OTHER';
}

export function normalizeEmploymentType(value: unknown): string | null {
  if (!value) return null;
  const v = String(Array.isArray(value) ? value[0] : value).toUpperCase().replace(/[\s-]+/g, '_');
  if (v.includes('INTERN')) return 'INTERNSHIP';
  if (v.includes('PART')) return 'PART_TIME';
  if (v.includes('CONTRACT') || v.includes('TEMP')) return 'CONTRACT';
  if (v.includes('FREELAN') || v.includes('CONSULT')) return 'FREELANCE';
  if (v.includes('FULL') || v.includes('PERMANENT')) return 'FULL_TIME';
  return null;
}

export function workTypeFrom(...hints: (string | null | undefined | boolean)[]): string | null {
  const t = hints.filter((h) => typeof h === 'string').join(' ').toUpperCase();
  if (/TELECOMMUTE|REMOTE|WORK FROM HOME|\bWFH\b/.test(t)) return 'REMOTE';
  if (/HYBRID/.test(t)) return 'HYBRID';
  if (/ON_?-?SITE|IN_?-?OFFICE|ONSITE/.test(t)) return 'ONSITE';
  return null;
}

// ─── Salary & experience ───────────────────────────────────────────────────

/** Yearly multiplier for a pay period ("YEAR", "1 YEAR", "MONTH", "monthly"…); null for hourly/daily/unknown. */
export function perYear(unit: unknown): number | null {
  const u = String(unit ?? 'YEAR').toUpperCase();
  if (/YEAR|ANNUM|ANNUAL|\bPA\b|LPA/.test(u) || u === '') return 1;
  if (/MONTH/.test(u)) return 12;
  if (/WEEK/.test(u)) return 52;
  return null;
}

export function extractExperience(text: string): { min: number | null; max: number | null } {
  const patterns = [
    /(\d{1,2})\s*(?:-|–|to)\s*(\d{1,2})\s*\+?\s*(?:years?|yrs?)/i,
    /(?:experience|exp)\s*(?:required|needed)?\s*[:\-]?\s*(\d{1,2})\s*(?:-|–|to)\s*(\d{1,2})/i,
    /(?:minimum|at\s*least|min\.?)\s*(?:of\s*)?(\d{1,2})\s*\+?\s*(?:years?|yrs?)/i,
    /(\d{1,2})\s*\+\s*(?:years?|yrs?)/i,
    /(\d{1,2})\s*(?:years?|yrs?)\s*(?:of\s*)?(?:\w+\s){0,3}?(?:experience|exp)\b/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (!m) continue;
    const min = Number(m[1]);
    const max = m[2] != null ? Number(m[2]) : null;
    if (min <= 30) return { min, max: max != null && max >= min && max <= 40 ? max : null };
  }
  return { min: null, max: null };
}

/** Salary stated in text, as yearly amounts. Monthly figures are converted; hourly ones are ignored. */
export function extractSalary(text: string): { min: number | null; max: number | null; currency: string | null } {
  const none = { min: null, max: null, currency: null };
  const lakh = text.match(/(?:₹|INR|Rs\.?)?\s*(\d+(?:\.\d+)?)\s*(?:L|lakhs?|lacs?|LPA)?\s*(?:-|–|to)\s*(?:₹|INR|Rs\.?)?\s*(\d+(?:\.\d+)?)\s*(?:L\b|lakhs?|lacs?|LPA)/i)
    || text.match(/(?:₹|INR|Rs\.?)\s*(\d+(?:\.\d+)?)\s*(?:L\b|lakhs?|lacs?|LPA)/i);
  if (lakh) {
    const min = Math.round(Number(lakh[1]) * 100_000);
    const max = lakh[2] ? Math.round(Number(lakh[2]) * 100_000) : null;
    return { min, max, currency: 'INR' };
  }
  const symbols: [RegExp, string][] = [[/\$/, 'USD'], [/€/, 'EUR'], [/£/, 'GBP'], [/₹/, 'INR']];
  for (const [sym, currency] of symbols) {
    const s = sym.source;
    const re = new RegExp(`${s}\\s*(\\d[\\d,]*(?:\\.\\d+)?)\\s*([kK])?\\s*(?:-|–|to)\\s*${s}?\\s*(\\d[\\d,]*(?:\\.\\d+)?)\\s*([kK])?(?:\\s*(?:per|/|a)\\s*(year|yr|annum|month|mo|hour|hr))?`, 'i');
    const single = new RegExp(`${s}\\s*(\\d[\\d,]*(?:\\.\\d+)?)\\s*([kK])(?:\\s*(?:per|/|a)\\s*(year|yr|annum|month|mo))?`, 'i');
    const m = text.match(re);
    const num = (n: string, k?: string) => Number(n.replace(/,/g, '')) * (k ? 1000 : 1);
    if (m) {
      const mult = perYear(m[5] === 'mo' ? 'MONTH' : m[5] === 'yr' ? 'YEAR' : m[5]);
      if (mult == null) return none;
      return { min: Math.round(num(m[1], m[2]) * mult), max: Math.round(num(m[3], m[4] ?? m[2]) * mult), currency };
    }
    const one = text.match(single);
    if (one) {
      const mult = perYear(one[3] === 'mo' ? 'MONTH' : one[3]);
      if (mult == null) return none;
      return { min: Math.round(num(one[1], one[2]) * mult), max: null, currency };
    }
  }
  return none;
}

// ─── Checking what the AI (or a page) claims ───────────────────────────────

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const HIRING_MAILBOX = /^(careers?|jobs?|hr|hiring|talent|recruit\w*|people|resumes?|cv|apply|work|joinus|join)([._+-]|$)/i;

/**
 * An application email, only if it is really on the page: one written next to "send/email/apply … to", or a
 * hiring mailbox (careers@, jobs@, hr@ …). Never support@, privacy@ or any other address on the page.
 */
export function applicationEmailFrom(pageText: string, claimed?: string | null): string | null {
  const lower = pageText.toLowerCase();
  if (claimed && /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(claimed) && lower.includes(claimed.toLowerCase())) return claimed;
  const near = pageText.match(/(?:send|submit|email|mail|forward|share)\s+(?:your\s+)?(?:resume|cv|application|profile)?[^.\n]{0,40}?(?:to|at)\s*[:\-]?\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
  if (near) return near[1];
  return (pageText.match(EMAIL_RE) ?? []).find((e) => HIRING_MAILBOX.test(e.split('@')[0])) ?? null;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9+#]/g, '');

/**
 * Skills that are really named on the page. Short names (Go, C, R) must appear as a whole word with the same
 * capitalisation; longer ones match ignoring case and punctuation (Node.js = NodeJS).
 */
export function skillsOnPage(skills: unknown, pageText: string): string[] {
  if (!Array.isArray(skills)) return [];
  const squashed = squash(pageText);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of skills) {
    const skill = typeof raw === 'string' ? raw.trim() : '';
    if (!skill || skill.length > 40 || seen.has(skill.toLowerCase())) continue;
    const ok = skill.length <= 2
      ? new RegExp(`(^|[^A-Za-z0-9])${escapeRe(skill)}(?![A-Za-z0-9])`).test(pageText)
      : new RegExp(`(^|[^a-z0-9])${escapeRe(skill.toLowerCase())}(?![a-z0-9])`).test(pageText.toLowerCase()) || (squash(skill).length >= 4 && squashed.includes(squash(skill)));
    if (ok) { seen.add(skill.toLowerCase()); out.push(skill); }
  }
  return out.slice(0, 25);
}

/** Common skills, found in a description by rule (job-board feeds have no skills field). Words that are also plain
 * English (Go, R, Excel, Swift, Spring, Rails, REST) are left out or written in full, so they can't match by accident. */
const KNOWN_SKILLS = [
  'Python', 'Java', 'JavaScript', 'TypeScript', 'Golang', 'Rust', 'C++', 'C#', 'Scala', 'Kotlin', 'Ruby', 'PHP', 'SQL', 'Bash',
  'React', 'Next.js', 'Vue', 'Angular', 'Node.js', 'Django', 'Flask', 'FastAPI', 'Spring Boot', 'Ruby on Rails', 'GraphQL', 'REST APIs',
  'PyTorch', 'TensorFlow', 'JAX', 'Keras', 'scikit-learn', 'Pandas', 'NumPy', 'Spark', 'PySpark', 'Hadoop', 'Kafka', 'Airflow', 'dbt',
  'Hugging Face', 'LangChain', 'LlamaIndex', 'LLMs', 'RAG', 'NLP', 'Computer Vision', 'MLOps', 'CUDA', 'Triton', 'ONNX', 'vLLM',
  'Machine Learning', 'Deep Learning', 'Reinforcement Learning', 'Generative AI', 'Prompt Engineering',
  'AWS', 'GCP', 'Azure', 'Kubernetes', 'Docker', 'Terraform', 'Linux', 'CI/CD', 'Git',
  'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Elasticsearch', 'Snowflake', 'BigQuery', 'Databricks', 'Pinecone',
  'Tableau', 'Power BI', 'Microsoft Excel', 'Looker', 'Figma', 'Salesforce', 'HubSpot', 'Jira',
];

export function knownSkillsIn(text: string): string[] {
  return skillsOnPage(KNOWN_SKILLS, text);
}

/** A URL the AI returned, kept only if it is one of the page's own links (or an allowed extra). */
export function urlFromPage(url: unknown, page: Pick<ParsedPage, 'linkSet'>, extra: string[] = []): string | null {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return null;
  const key = normalizeUrl(url);
  if (page.linkSet.has(key) || extra.some((e) => normalizeUrl(e) === key)) return url;
  return null;
}

// ─── JSON-LD JobPosting ────────────────────────────────────────────────────

export function jobFromJsonLd(jp: any): Partial<DetailedJob> {
  const locs = Array.isArray(jp.jobLocation) ? jp.jobLocation : jp.jobLocation ? [jp.jobLocation] : [];
  const location = locs.map((l: any) => {
    const a = l?.address;
    return a ? [a.addressLocality, a.addressRegion, typeof a.addressCountry === 'string' ? a.addressCountry : a.addressCountry?.name].filter(Boolean).join(', ') : l?.name;
  }).filter(Boolean).join('; ') || null;

  let salaryMin: number | null = null, salaryMax: number | null = null, salaryCurrency: string | null = null;
  const sal = Array.isArray(jp.baseSalary ?? jp.estimatedSalary) ? (jp.baseSalary ?? jp.estimatedSalary)[0] : (jp.baseSalary ?? jp.estimatedSalary);
  if (sal) {
    const v = sal.value;
    const unit = (typeof v === 'object' ? v?.unitText : null) ?? sal.unitText;
    const mult = perYear(unit);
    if (mult != null) {
      salaryCurrency = sal.currency || null;
      const n = (x: unknown) => (x != null && x !== '' && Number.isFinite(Number(x)) ? Math.round(Number(x) * mult) : null);
      if (typeof v === 'object' && v) { salaryMin = n(v.minValue ?? v.value); salaryMax = n(v.maxValue); }
      else salaryMin = n(v);
    }
  }

  const description = jp.description ? htmlToText(String(jp.description)) : null;
  let experienceMin: number | null = null, experienceMax: number | null = null;
  const exp = jp.experienceRequirements;
  if (typeof exp === 'string') ({ min: experienceMin, max: experienceMax } = extractExperience(exp));
  else if (exp?.monthsOfExperience) experienceMin = Math.round(Number(exp.monthsOfExperience) / 12);
  // Many postings state experience only in the description.
  if (experienceMin == null && description) ({ min: experienceMin, max: experienceMax } = extractExperience(description));

  const listed = Array.isArray(jp.skills) ? jp.skills.map(String) : typeof jp.skills === 'string' ? jp.skills.split(/[,;]/).map((s: string) => s.trim()) : [];
  const skills = listed.filter(Boolean).length ? listed : description ? knownSkillsIn(description) : [];
  return {
    title: jp.title ? textOf(String(jp.title)) : null,
    description,
    shortDescription: firstLine(description),
    department: (typeof jp.department === 'string' ? jp.department : null) || (typeof jp.occupationalCategory === 'string' ? jp.occupationalCategory : null),
    location,
    workType: workTypeFrom(jp.jobLocationType, location, jp.title),
    skills: skills.filter(Boolean),
    experienceMin, experienceMax, salaryMin, salaryMax, salaryCurrency,
    employmentType: normalizeEmploymentType(jp.employmentType),
    applicationUrl: jp.directApply && typeof jp.url === 'string' ? jp.url : null,
  };
}

/** The job's own description from page text: from its first section heading to the company/apply boilerplate. */
export function descriptionFromText(pageText: string): string | null {
  if (!pageText || pageText.length < 200) return null;
  const start = pageText.search(/(?:^|\n)\s*(?:###\s*)?(?:about\s+(?:the\s+)?(?:role|job|position)|role\s+overview|job\s+description|position\s+overview|what\s+you'?(?:ll|will)\s+do|key\s+responsibilities|responsibilities|the\s+role)\b/im);
  const from = start > 0 ? start : 0;
  const rest = pageText.slice(from + 50);
  const end = rest.search(/(?:^|\n)\s*(?:###\s*)?(?:how\s+to\s+apply|apply\s+(?:now|here|for\s+this)|equal\s+opportunity|eeo\b|share\s+this\s+job|similar\s+(?:jobs|roles|positions)|other\s+openings|related\s+jobs)\b/im);
  let description = pageText.slice(from, end >= 0 ? from + 50 + end : undefined).replace(/\n{3,}/g, '\n\n').trim();
  if (description.length < 200) return null;
  if (description.length > 8000) description = description.slice(0, 8000).replace(/\n[^\n]*$/, '');
  return description;
}
