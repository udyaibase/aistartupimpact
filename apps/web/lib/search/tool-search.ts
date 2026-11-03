import { normalizeQuery, plainKeywordGroups, stem, typoBudget, understandToolQuery, withinEdits, type KeywordGroup, type ToolQuery } from './understand';

/**
 * Relevance search over the tools list, in the browser (the whole directory is already on the page).
 * Every concept in the query is scored against each field — name > category/tags > tagline > description —
 * with stemming ("writing" ≈ "writer"), prefixes ("summ" ≈ "summarizer") and typo tolerance on names/categories.
 *
 * Built as an inverted index: each distinct word in the directory is compared with a query word once, and the
 * score is handed to every tool containing it — fast enough to run on every keystroke.
 */

export interface SearchableTool {
  id: string;
  name: string;
  tagline: string;
  category: string;
  parentCategory?: string | null;
  verdict?: string;
  pricing: string;
  hasApi?: boolean;
  hasMobileApp?: boolean;
  freeTrialDays?: number | null;
  rating?: number;
}

// Field order: 0 name, 1 category + tags, 2 tagline, 3 description. Typos are only forgiven in 0 and 1.
const FIELD_WEIGHTS = [8, 7, 4, 1.5];
const FUZZY_FIELDS = 2;
const SYNONYM_FACTOR = 0.5;

interface Term {
  token: string;
  stem: string;
  /** tool index * 4 + field */
  postings: number[];
  /** Appears in a name or category field (eligible for typo matching). */
  fuzzy: boolean;
}

export interface ToolIndex<T> {
  tools: T[];
  names: string[];
  /** Normalised name + category + tagline, for phrase (adjacent word) matches. */
  phrases: string[];
  terms: Term[];
}

/** Build once per tool list; reuse for every keystroke. */
export function indexTools<T extends SearchableTool>(tools: T[], tagNames: (tool: T) => string[] = () => []): ToolIndex<T> {
  const byToken = new Map<string, Term>();
  tools.forEach((tool, i) => {
    const fields = [tool.name, [tool.category, tool.parentCategory ?? '', ...tagNames(tool)].join(' '), tool.tagline || '', tool.verdict || ''];
    fields.forEach((text, f) => {
      for (const token of new Set(normalizeQuery(text).split(' '))) {
        if (!token) continue;
        let term = byToken.get(token);
        if (!term) { term = { token, stem: stem(token), postings: [], fuzzy: false }; byToken.set(token, term); }
        term.postings.push(i * 4 + f);
        if (f < FUZZY_FIELDS) term.fuzzy = true;
      }
    });
  });
  return {
    tools,
    names: tools.map((t) => normalizeQuery(t.name)),
    phrases: tools.map((t, i) => normalizeQuery([t.name, t.category, t.parentCategory ?? '', ...tagNames(t), t.tagline || ''].join(' | '))),
    terms: [...byToken.values()],
  };
}

/** 1 exact (after stemming), 0.8 prefix, 0.6 typo (name/category only), 0 none. */
function termScore(word: string, sw: string, term: Term): { score: number; typo: boolean } {
  if (term.token === word || term.stem === sw) return { score: 1, typo: false };
  if (sw.length >= 3 && (term.token.startsWith(sw) || term.stem.startsWith(sw))) return { score: 0.8, typo: false };
  const budget = typoBudget(word);
  if (term.fuzzy && budget > 0 && term.token.length >= 4 && withinEdits(word, term.token, budget)) return { score: 0.6, typo: true };
  return { score: 0, typo: false };
}

/** Words from the same synonym set ("video" + "youtube") are one concept — don't count it twice. */
function mergeGroups(groups: KeywordGroup[]): KeywordGroup[] {
  const out: KeywordGroup[] = [];
  for (const g of groups) {
    const same = out.find((o) => o.length > 1 && o.includes(g[0]));
    if (same) continue;
    out.push(g);
  }
  return out;
}

/** Best score per tool for one concept. */
function scoreGroup<T>(index: ToolIndex<T>, group: KeywordGroup, weight = 1): Float32Array {
  const best = new Float32Array(index.tools.length);
  group.forEach((word, wi) => {
    const sw = stem(word);
    const factor = (wi === 0 ? 1 : SYNONYM_FACTOR) * weight;
    for (const term of index.terms) {
      const { score, typo } = termScore(word, sw, term);
      if (score === 0) continue;
      for (const p of term.postings) {
        const field = p & 3;
        if (typo && field >= FUZZY_FIELDS) continue;
        const v = score * FIELD_WEIGHTS[field] * factor;
        const t = p >> 2;
        if (v > best[t]) best[t] = v;
      }
    }
  });
  return best;
}

function passesIntents(tool: SearchableTool, q: ToolQuery) {
  if (q.pricing?.length && !q.pricing.includes(tool.pricing)) return false;
  if (q.freeTrial && !(tool.freeTrialDays && tool.freeTrialDays > 0)) return false;
  if (q.hasApi && !tool.hasApi) return false;
  if (q.hasMobileApp && !tool.hasMobileApp) return false;
  return true;
}

export interface ToolSearchResult<T> {
  /** Matching tools, best first. */
  tools: T[];
  understood: ToolQuery;
  /** True when the recognised filters gave nothing and were ignored to still show something. */
  relaxed: boolean;
}

export function searchTools<T extends SearchableTool>(index: ToolIndex<T>, rawQuery: string): ToolSearchResult<T> {
  const q = understandToolQuery(rawQuery);

  const run = (useIntents: boolean) => {
    // Relaxed: the filter words ("api", "free") count as search words again, but weaker than the topic words.
    const groups = mergeGroups(q.groups);
    const extra = useIntents ? [] : mergeGroups(plainKeywordGroups(q.chips.map((c) => c.source).join(' ')));
    const need = groups.length >= 3 ? Math.ceil(groups.length / 2) : Math.min(1, groups.length);
    const perGroup = [...groups.map((g) => scoreGroup(index, g)), ...extra.map((g) => scoreGroup(index, g, 0.4))];

    // Rarer concepts say more about what the user wants ("fitness" vs "mobile"): weight each by inverse frequency.
    const n = index.tools.length;
    const idf = perGroup.map((g) => {
      let df = 0;
      for (let i = 0; i < g.length; i++) if (g[i] > 0) df++;
      return 0.5 + 0.5 * (Math.log((n + 1) / (df + 1)) / Math.log(n + 1));
    });

    // Neighbouring query words found side by side ("code assistant", "voice cloning") — a strong phrase signal.
    const pairs: RegExp[] = [];
    for (let k = 0; k + 1 < groups.length; k++) {
      const a = stem(groups[k][0]).replace(/[^a-z0-9]/g, '');
      const b = stem(groups[k + 1][0]).replace(/[^a-z0-9]/g, '');
      if (a.length >= 2 && b.length >= 2) pairs.push(new RegExp(`\\b${a}[a-z0-9]*\\s+${b}`));
    }

    const hits: { tool: T; rank: number }[] = [];
    index.tools.forEach((tool, i) => {
      if (useIntents && !passesIntents(tool, q)) return;
      let score = 0;
      let matched = 0;
      perGroup.forEach((g, gi) => {
        if (g[i] > 0) { score += g[i] * idf[gi]; if (gi < groups.length) matched++; }
      });
      if (matched >= 2) for (const re of pairs) if (re.test(index.phrases[i])) score += 8;

      let nameHit = false;
      const name = index.names[i];
      if (q.phrase.length >= 2) {
        if (name === q.phrase) { score += 40; nameHit = true; }
        else if (name.startsWith(q.phrase)) { score += 20; nameHit = true; }
        else if (q.phrase.length >= 3 && name.includes(q.phrase)) { score += 10; nameHit = true; }
      }
      if (!nameHit && (matched < need || (groups.length > 0 && score === 0))) return;
      hits.push({ tool, rank: score + (tool.rating ?? 0) * 0.3 });
    });
    return hits.sort((a, b) => b.rank - a.rank).map((h) => h.tool);
  };

  let tools = run(true);
  let relaxed = false;
  const hasIntents = !!(q.pricing || q.freeTrial || q.hasApi || q.hasMobileApp);
  if (tools.length === 0 && hasIntents) {
    tools = run(false);
    relaxed = tools.length > 0;
  }
  return { tools, understood: q, relaxed };
}
