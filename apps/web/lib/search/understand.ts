/**
 * Turns what people type ("funded fintech startups in bangalore", "Free AI tool to write blog posts") into
 * structured search: filters it recognises (city, stage, pricing…) plus keyword groups to rank by.
 *
 * Pure and dependency-free — used on the server (startups) and in the browser (tools). Deterministic on purpose:
 * instant, free, and explainable (every recognised filter comes back as a chip the user can remove).
 */

export interface SearchChip {
  kind: 'city' | 'country' | 'stage' | 'funding' | 'businessType' | 'category' | 'pricing' | 'feature';
  label: string;
  /** The words in the query that produced this chip — removing them from the query removes the chip. */
  source: string;
}

/** One concept from the query: the word itself plus close synonyms. A document matches the group if it matches any. */
export type KeywordGroup = string[];

const STOPWORDS = new Set(`
  a an the and or of to for in on at by with without from into about as is are was were be been being am
  i me my we us our you your it its this that these those which who whom whose what where when how why
  can could should would will shall may might must do does did done have has had
  best top good great better popular famous leading new latest list lists show find search looking look
  need needs want wants help helps helping get give some any all more most very really just also
  ai tool tools app apps application applications software platform platforms solution solutions service services
  startup startups company companies firm firms business businesses based like using use used make makes making
  please near around within than then there here other others such so if not no
  maker makers generator generators builder builders creator creators create creates creating
  generate generates generating thing things way ways
`.split(/\s+/).filter(Boolean));

// Close synonyms — expands recall without drifting far from the intent.
const SYNONYM_SETS: string[][] = [
  ['write', 'writing', 'writer', 'blog', 'article', 'content', 'copywriting', 'copy'],
  ['image', 'images', 'photo', 'picture', 'art', 'illustration', 'graphic', 'graphics'],
  ['video', 'videos', 'film', 'clip', 'youtube', 'reel', 'reels'],
  ['code', 'coding', 'developer', 'developers', 'programming', 'programmer', 'devtools'],
  ['chatbot', 'chat', 'assistant', 'conversational', 'bot'],
  ['voice', 'speech', 'tts', 'dubbing'],
  ['audio', 'podcast', 'sound'],
  ['music', 'song', 'songs'],
  ['resume', 'cv'],
  ['presentation', 'slides', 'ppt', 'deck'],
  ['meeting', 'meetings', 'transcription', 'transcribe', 'notetaker'],
  ['translate', 'translation', 'translator', 'multilingual'],
  ['summary', 'summarize', 'summarise', 'summarizer'],
  ['email', 'emails', 'mail', 'inbox'],
  ['customer', 'support', 'helpdesk', 'ticket'],
  ['sales', 'crm', 'leads', 'prospecting'],
  ['hiring', 'recruitment', 'recruiting', 'hr', 'talent'],
  ['legal', 'law', 'lawyer', 'contract', 'contracts'],
  ['health', 'healthcare', 'medical', 'doctor', 'clinical', 'hospital'],
  ['education', 'learning', 'students', 'student', 'teaching', 'tutor', 'edtech'],
  ['finance', 'financial', 'fintech', 'payments', 'payment', 'banking', 'lending', 'accounting'],
  ['agent', 'agents', 'agentic', 'automation', 'automate', 'workflow', 'workflows'],
  ['design', 'designer', 'ui', 'ux', 'figma'],
  ['logo', 'branding', 'brand'],
  ['seo', 'search engine'],
  ['research', 'paper', 'papers', 'academic'],
  ['security', 'cybersecurity', 'cyber'],
  ['data', 'analytics', 'dashboard', 'bi'],
  ['ecommerce', 'shopping', 'retail', 'store'],
  ['marketing', 'ads', 'advertising', 'campaign', 'social media'],
];
const SYNONYMS = new Map<string, string[]>();
for (const set of SYNONYM_SETS) for (const w of set) SYNONYMS.set(w, set);

const CITY_ALIASES: Record<string, string> = {
  bengaluru: 'Bengaluru', bangalore: 'Bengaluru', blr: 'Bengaluru',
  mumbai: 'Mumbai', bombay: 'Mumbai', 'navi mumbai': 'Mumbai',
  'new delhi': 'Delhi', delhi: 'Delhi',
  gurugram: 'Gurugram', gurgaon: 'Gurugram', noida: 'Noida',
  hyderabad: 'Hyderabad', pune: 'Pune', chennai: 'Chennai', madras: 'Chennai',
  ahmedabad: 'Ahmedabad', kolkata: 'Kolkata', calcutta: 'Kolkata', jaipur: 'Jaipur',
  kochi: 'Kochi', cochin: 'Kochi', indore: 'Indore', chandigarh: 'Chandigarh', surat: 'Surat',
  bhubaneswar: 'Bhubaneswar', coimbatore: 'Coimbatore', thiruvananthapuram: 'Thiruvananthapuram', trivandrum: 'Thiruvananthapuram',
  'san francisco': 'San Francisco', sf: 'San Francisco', 'new york': 'New York', nyc: 'New York',
  'palo alto': 'Palo Alto', 'mountain view': 'Mountain View', london: 'London', singapore: 'Singapore',
  dubai: 'Dubai', berlin: 'Berlin', paris: 'Paris', toronto: 'Toronto', seattle: 'Seattle', austin: 'Austin', boston: 'Boston',
};

const COUNTRY_ALIASES: Record<string, 'India' | 'International'> = {
  india: 'India', indian: 'India', bharat: 'India',
  international: 'International', global: 'International', foreign: 'International', overseas: 'International',
  usa: 'International', 'united states': 'International', american: 'International', america: 'International',
};

const STAGE_ALIASES: Record<string, { value: string; label: string }> = {
  'pre seed': { value: 'PRE_SEED', label: 'Pre-Seed' }, preseed: { value: 'PRE_SEED', label: 'Pre-Seed' },
  'seed stage': { value: 'SEED', label: 'Seed' }, seed: { value: 'SEED', label: 'Seed' },
  'pre series a': { value: 'PRE_SERIES_A', label: 'Pre-Series A' },
  'series a': { value: 'SERIES_A', label: 'Series A' }, 'series b': { value: 'SERIES_B', label: 'Series B' },
  'series c': { value: 'SERIES_C', label: 'Series C' }, 'series d': { value: 'SERIES_D', label: 'Series D' },
  'series e': { value: 'SERIES_E', label: 'Series E' },
  bootstrapped: { value: 'BOOTSTRAPPED', label: 'Bootstrapped' }, 'idea stage': { value: 'IDEA', label: 'Idea' },
  'growth stage': { value: 'GROWTH', label: 'Growth' }, 'late stage': { value: 'GROWTH', label: 'Growth' },
};

const FUNDING_ALIASES: Record<string, 'funded' | 'unfunded'> = {
  'not funded': 'unfunded', unfunded: 'unfunded', 'no funding': 'unfunded', 'without funding': 'unfunded',
  'self funded': 'unfunded', 'yet to raise': 'unfunded',
  funded: 'funded', 'vc backed': 'funded', 'venture backed': 'funded', backed: 'funded', raised: 'funded',
  funding: 'funded', investors: 'funded', invested: 'funded',
};

const BUSINESS_TYPES: Record<string, string> = { b2b: 'B2B', b2c: 'B2C', b2b2c: 'B2B2C', b2g: 'B2G', d2c: 'D2C', marketplace: 'Marketplace' };

/** Startup categories, matched by prefix because stored names vary ("HealthTech", "HealthTech & BioTech"). */
const STARTUP_CATEGORY_ALIASES: Record<string, { prefixes: string[]; label: string }> = {
  fintech: { prefixes: ['FinTech'], label: 'FinTech' }, payments: { prefixes: ['FinTech'], label: 'FinTech' },
  banking: { prefixes: ['FinTech'], label: 'FinTech' }, lending: { prefixes: ['FinTech'], label: 'FinTech' },
  healthtech: { prefixes: ['HealthTech'], label: 'HealthTech' }, healthcare: { prefixes: ['HealthTech'], label: 'HealthTech' },
  medtech: { prefixes: ['HealthTech'], label: 'HealthTech' }, biotech: { prefixes: ['HealthTech', 'Pharma'], label: 'HealthTech' },
  edtech: { prefixes: ['EdTech'], label: 'EdTech' }, education: { prefixes: ['EdTech'], label: 'EdTech' },
  hrtech: { prefixes: ['HRTech'], label: 'HRTech' }, legaltech: { prefixes: ['LegalTech'], label: 'LegalTech' },
  agritech: { prefixes: ['AgriTech'], label: 'AgriTech' }, agriculture: { prefixes: ['AgriTech'], label: 'AgriTech' },
  cybersecurity: { prefixes: ['Cybersecurity'], label: 'Cybersecurity' },
  martech: { prefixes: ['MarTech'], label: 'MarTech' }, adtech: { prefixes: ['MarTech'], label: 'MarTech' },
  ecommerce: { prefixes: ['E-Commerce'], label: 'E-Commerce' }, 'e commerce': { prefixes: ['E-Commerce'], label: 'E-Commerce' },
  logistics: { prefixes: ['Logistics'], label: 'Logistics' }, 'supply chain': { prefixes: ['Logistics'], label: 'Logistics' },
  cleantech: { prefixes: ['CleanTech', 'Climate'], label: 'Climate & CleanTech' }, climate: { prefixes: ['Climate', 'CleanTech'], label: 'Climate & CleanTech' },
  proptech: { prefixes: ['PropTech'], label: 'PropTech' }, 'real estate': { prefixes: ['PropTech'], label: 'PropTech' },
  insurtech: { prefixes: ['Insurance'], label: 'InsurTech' }, insurance: { prefixes: ['Insurance'], label: 'InsurTech' },
  robotics: { prefixes: ['Robotics'], label: 'Robotics' }, spacetech: { prefixes: ['SpaceTech'], label: 'SpaceTech' },
  deeptech: { prefixes: ['DeepTech'], label: 'DeepTech' }, semiconductor: { prefixes: ['DeepTech'], label: 'DeepTech' },
  saas: { prefixes: ['Enterprise Software'], label: 'Enterprise SaaS' }, mlops: { prefixes: ['AI Infrastructure'], label: 'AI Infrastructure' },
  govtech: { prefixes: ['Defense'], label: 'GovTech' }, defence: { prefixes: ['Defense'], label: 'GovTech' }, defense: { prefixes: ['Defense'], label: 'GovTech' },
  mobility: { prefixes: ['Mobility'], label: 'Mobility' }, traveltech: { prefixes: ['TravelTech'], label: 'Travel' },
  pharma: { prefixes: ['Pharma'], label: 'Pharma' }, manufacturing: { prefixes: ['Manufacturing'], label: 'Manufacturing' },
  telecom: { prefixes: ['Telecom'], label: 'Telecom' }, web3: { prefixes: ['Blockchain'], label: 'Web3' }, blockchain: { prefixes: ['Blockchain'], label: 'Web3' },
};

const TOOL_PRICING: Record<string, { values: string[]; label: string }> = {
  'open source': { values: ['OPEN_SOURCE'], label: 'Open source' }, opensource: { values: ['OPEN_SOURCE'], label: 'Open source' },
  'free trial': { values: [], label: 'Free trial' },
  freemium: { values: ['FREEMIUM'], label: 'Freemium' },
  free: { values: ['FREE', 'FREEMIUM', 'OPEN_SOURCE'], label: 'Free' },
  paid: { values: ['PAID', 'ENTERPRISE'], label: 'Paid' },
};

/** Lowercase, strip accents and punctuation, collapse spaces. "Série-A, Bangalore!" → "serie a bangalore". */
export function normalizeQuery(q: string): string {
  return q
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]s\b/g, '')
    .replace(/[^a-z0-9+#.]+/g, ' ')
    .replace(/(^|\s)\.+|\.+(\s|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Light stemmer for matching ("writing", "writes", "writer" → "writ"). */
export function stem(w: string): string {
  if (w.length <= 4) return w;
  for (const suf of ['ations', 'ation', 'ings', 'ing', 'ers', 'ies', 'er', 'ed', 'es', 's']) {
    if (w.endsWith(suf) && w.length - suf.length >= 3) return suf === 'ies' ? w.slice(0, -3) + 'y' : w.slice(0, -suf.length);
  }
  return w;
}

/** Finds the longest alias phrases first and cuts them out of the text, so "series a" wins over "a". */
function takePhrases<T>(text: string, table: Record<string, T>): { text: string; hits: { key: string; value: T }[] } {
  const keys = Object.keys(table).sort((a, b) => b.length - a.length);
  const hits: { key: string; value: T }[] = [];
  let rest = ` ${text} `;
  for (const key of keys) {
    const needle = ` ${key} `;
    if (rest.includes(needle)) {
      hits.push({ key, value: table[key] });
      rest = rest.split(needle).join(' ');
    }
  }
  return { text: rest.replace(/\s+/g, ' ').trim(), hits };
}

function keywordGroups(text: string): KeywordGroup[] {
  const seen = new Set<string>();
  const groups: KeywordGroup[] = [];
  for (const w of text.split(' ')) {
    if (!w || STOPWORDS.has(w) || (w.length < 2 && !/\d/.test(w)) || seen.has(w)) continue;
    seen.add(w);
    const syn = SYNONYMS.get(w);
    groups.push(syn ? [w, ...syn.filter((s) => s !== w && !s.includes(' '))] : [w]);
  }
  return groups.slice(0, 8);
}

/** Category prefixes for a single keyword ("fintech" → ["FinTech"]), so a group can also match on the category column. */
export function startupCategoryFor(word: string): string[] | undefined {
  return STARTUP_CATEGORY_ALIASES[word]?.prefixes;
}

export interface StartupQuery {
  /** Normalised full query — used for exact/prefix name matches even when every word is a stopword. */
  phrase: string;
  groups: KeywordGroup[];
  city?: string;
  country?: 'India' | 'International';
  stage?: string;
  funding?: 'funded' | 'unfunded';
  businessType?: string;
  categoryPrefixes: string[];
  chips: SearchChip[];
}

export function understandStartupQuery(raw: string): StartupQuery {
  const phrase = normalizeQuery(raw);
  const chips: SearchChip[] = [];
  const out: StartupQuery = { phrase, groups: [], categoryPrefixes: [], chips };

  let text = phrase;
  const city = takePhrases(text, CITY_ALIASES); text = city.text;
  if (city.hits[0]) { out.city = city.hits[0].value; chips.push({ kind: 'city', label: out.city, source: city.hits[0].key }); }

  const stage = takePhrases(text, STAGE_ALIASES); text = stage.text;
  if (stage.hits[0]) { out.stage = stage.hits[0].value.value; chips.push({ kind: 'stage', label: stage.hits[0].value.label, source: stage.hits[0].key }); }

  const funding = takePhrases(text, FUNDING_ALIASES); text = funding.text;
  if (funding.hits[0]) {
    out.funding = funding.hits.some((h) => h.value === 'unfunded') ? 'unfunded' : 'funded';
    const hit = funding.hits.find((h) => h.value === out.funding)!;
    chips.push({ kind: 'funding', label: out.funding === 'funded' ? 'Funded' : 'Not funded', source: hit.key });
  }

  const country = takePhrases(text, COUNTRY_ALIASES); text = country.text;
  if (country.hits[0] && !out.city) { out.country = country.hits[0].value; chips.push({ kind: 'country', label: out.country, source: country.hits[0].key }); }

  const bt = takePhrases(text, BUSINESS_TYPES); text = bt.text;
  if (bt.hits[0]) { out.businessType = bt.hits[0].value; chips.push({ kind: 'businessType', label: out.businessType, source: bt.hits[0].key }); }

  // Category words stay as keywords too (soft): a payments company filed under "Enterprise SaaS" still matches "payments".
  const cat = takePhrases(text, STARTUP_CATEGORY_ALIASES);
  for (const h of cat.hits) {
    out.categoryPrefixes.push(...h.value.prefixes);
    if (!chips.some((c) => c.kind === 'category' && c.label === h.value.label)) chips.push({ kind: 'category', label: h.value.label, source: h.key });
  }

  out.groups = keywordGroups(text);
  return out;
}

export interface ToolQuery {
  phrase: string;
  groups: KeywordGroup[];
  pricing?: string[];
  freeTrial?: boolean;
  hasApi?: boolean;
  hasMobileApp?: boolean;
  chips: SearchChip[];
}

export function understandToolQuery(raw: string): ToolQuery {
  const phrase = normalizeQuery(raw);
  const chips: SearchChip[] = [];
  const out: ToolQuery = { phrase, groups: [], chips };
  let text = phrase;

  const pricing = takePhrases(text, TOOL_PRICING); text = pricing.text;
  for (const h of pricing.hits) {
    if (h.key === 'free trial') { out.freeTrial = true; chips.push({ kind: 'feature', label: 'Free trial', source: h.key }); continue; }
    if (!out.pricing) { out.pricing = h.value.values; chips.push({ kind: 'pricing', label: h.value.label, source: h.key }); }
  }

  // "api" / "mobile app" stay ordinary search words: the hasApi / hasMobileApp flags are rarely filled in, so
  // filtering on them would hide almost every tool.

  out.groups = keywordGroups(text);
  return out;
}

/** Removes the words behind a chip from the query, e.g. dropping "in bangalore" when the Bengaluru chip is removed. */
export function removeChipFromQuery(query: string, chip: SearchChip): string {
  const words = chip.source.split(' ').map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(`\\b(?:in|from|at|with|for|that|are|is)?\\s*${words.join('[^a-z0-9]+')}\\b`, 'i');
  return query.replace(re, ' ').replace(/\s+/g, ' ').trim();
}

/** Edit distance (swapped neighbours count as one typo: "chatgtp" ≈ "chatgpt") with an early exit past `max`. */
export function withinEdits(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  let prev2: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      let d = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d = Math.min(d, prev2[j - 2] + 1);
      cur[j] = d;
      rowMin = Math.min(rowMin, d);
    }
    if (rowMin > max) return false;
    prev2 = prev;
    prev = cur;
  }
  return prev[b.length] <= max;
}

/** Keyword groups for text with no filter recognition — used when recognised filters are relaxed. */
export function plainKeywordGroups(raw: string): KeywordGroup[] {
  return keywordGroups(normalizeQuery(raw));
}

/** How many typos a word may have and still count as a match. */
export const typoBudget = (w: string) => (w.length >= 8 ? 2 : w.length >= 4 ? 1 : 0);
