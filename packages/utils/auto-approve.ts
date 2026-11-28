/**
 * Fast approval: a startup or AI tool goes live by itself, a few minutes after it qualifies, when three things are
 * all true: the founder proved they own the website, the website's address looks like an AI company's, and the
 * automatic first look says "likely an AI product". Anything else waits for a person, as before.
 *
 * The address alone is never enough: anyone can buy a .ai domain, and "ai" hides inside ordinary words (dubai,
 * chai, paint, mail). A person still looks at every fast approval afterwards.
 */

export const AUTO_APPROVE_KEY = 'autoApprove';
/** Who approved it, stored on the listing. */
export const AUTO_APPROVER = 'AUTO';

export interface AutoApproveSettings {
  enabled: boolean;
  /** Minutes between qualifying and going live: time for a reviewer who is looking to press Hold. */
  delayMinutes: number;
  /** The most fast approvals in any 24 hours, startups and tools together. */
  dailyCap: number;
  /** Ordinary words that contain or end in "ai". A domain name made of one of these does not count. */
  blockWords: string[];
}

export const DEFAULT_BLOCK_WORDS = [
  'dubai', 'mumbai', 'chennai', 'shanghai', 'hawaii', 'thai', 'chai', 'bonsai', 'samurai', 'sensai', 'assai', 'masai', 'sinai',
  'mail', 'email', 'gmail', 'paint', 'chair', 'hair', 'fair', 'pair', 'repair', 'stair', 'affair', 'dairy', 'daily', 'detail',
  'retail', 'trail', 'rail', 'nail', 'sail', 'tail', 'jail', 'bail', 'fail', 'snail', 'air', 'airline', 'airport', 'aid', 'aim',
  'main', 'maid', 'rain', 'train', 'brain', 'chain', 'gain', 'grain', 'plain', 'spain', 'stain', 'domain', 'captain', 'fountain',
  'mountain', 'certain', 'contain', 'maintain', 'explain', 'obtain', 'remain', 'wait', 'bait', 'faith', 'saint', 'waist', 'raise',
  'praise', 'said', 'paid', 'laid', 'raid', 'afraid', 'haiti', 'taiwan', 'kuwait', 'bahrain', 'ukraine', 'jain', 'saini', 'nair',
  'aisle', 'aide', 'aikido', 'aioli', 'ailment', 'airy', 'kai', 'mai', 'sai',
];

export const DEFAULT_AUTO_APPROVE: AutoApproveSettings = { enabled: false, delayMinutes: 15, dailyCap: 20, blockWords: DEFAULT_BLOCK_WORDS };

const clampInt = (v: unknown, min: number, max: number, fallback: number) => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
};

/** Whatever is stored, as usable settings. Off unless it was switched on. */
export function sanitizeAutoApprove(raw: unknown): AutoApproveSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const words = Array.isArray(r.blockWords)
    ? [...new Set(r.blockWords.filter((w): w is string => typeof w === 'string').map((w) => w.toLowerCase().replace(/[^a-z0-9]/g, '')).filter((w) => w.length >= 2 && w.length <= 30))].slice(0, 400)
    : DEFAULT_BLOCK_WORDS;
  return {
    // An emptied list would let every ordinary word through, so it falls back to the built-in one.
    enabled: r.enabled === true,
    delayMinutes: clampInt(r.delayMinutes, 5, 24 * 60, DEFAULT_AUTO_APPROVE.delayMinutes),
    dailyCap: clampInt(r.dailyCap, 1, 500, DEFAULT_AUTO_APPROVE.dailyCap),
    blockWords: words.length ? words : DEFAULT_BLOCK_WORDS,
  };
}

/** example.co.in → "example"; www.acme-ai.com → "acme-ai". The part a company chooses, without subdomains or the ending. */
export function domainParts(input: string | null | undefined): { host: string; name: string; tld: string } | null {
  let host = (input ?? '').trim().toLowerCase();
  if (!host) return null;
  try { if (/^[a-z]+:\/\//.test(host)) host = new URL(host).hostname; } catch { return null; }
  host = host.replace(/^www\./, '').replace(/\.$/, '').split('/')[0].split(':')[0];
  const labels = host.split('.').filter(Boolean);
  if (labels.length < 2 || labels.some((l) => !/^[a-z0-9-]+$/.test(l))) return null;
  const tld = labels[labels.length - 1];
  // Two-part endings such as .co.in or .com.au: the company's own name is one label further left.
  const second = labels[labels.length - 2];
  const twoPart = labels.length >= 3 && tld.length === 2 && ['co', 'com', 'net', 'org', 'ac', 'gov', 'edu', 'ind', 'gen', 'firm'].includes(second);
  return { host, name: labels[labels.length - (twoPart ? 3 : 2)], tld };
}

/**
 * Is `website` the address ownership was proven for (or a subdomain of it)? A plain "ends with" would let
 * evil-acme.ai pass for acme.ai, so the match is the whole domain or a dot before it.
 */
export function hostMatchesDomain(website: string | null | undefined, provenDomain: string | null | undefined): boolean {
  const host = domainParts(website)?.host;
  const proven = domainParts(provenDomain)?.host;
  return !!host && !!proven && (host === proven || host.endsWith(`.${proven}`));
}

/**
 * Does this address look like an AI company's? Yes when it ends in .ai, or when "ai" stands as its own word in the
 * name: at the start or the end, or between hyphens (aiacme, acmeai, acme-ai-labs). No when the whole name, or the
 * hyphen-separated word carrying the "ai", is an ordinary word on the block list.
 */
export function domainLooksAi(input: string | null | undefined, blockWords: readonly string[] = DEFAULT_BLOCK_WORDS): { ok: boolean; why: string } {
  const d = domainParts(input);
  if (!d) return { ok: false, why: 'No usable website address.' };
  const blocked = new Set(blockWords);
  if (blocked.has(d.name.replace(/-/g, ''))) return { ok: false, why: `"${d.name}" is an ordinary word, not an AI name.` };
  if (d.tld === 'ai') return { ok: true, why: `${d.host} ends in .ai.` };
  for (const word of d.name.split('-').filter(Boolean)) {
    if (word === 'ai') return { ok: true, why: `"ai" is a word of its own in ${d.host}.` };
    if (blocked.has(word)) continue;
    // Glued on: at least three other letters, so "thai" or "kai" alone never counts.
    if (word.length >= 5 && (word.startsWith('ai') || word.endsWith('ai'))) {
      // A block-listed word at the same end ("...dubai", "mail...") explains the letters.
      const explained = [...blocked].some((b) => b.length >= 3 && (word.endsWith('ai') ? word.endsWith(b) : word.startsWith(b)));
      if (!explained) return { ok: true, why: `"ai" starts or ends the name in ${d.host}.` };
    }
  }
  return { ok: false, why: `${d.host} does not end in .ai and has no "ai" word in its name.` };
}

export interface AutoApproveFacts {
  /** The founder proved they control the website. */
  ownershipProven: boolean;
  /** The address ownership was proven for (startups) or the listing's website (tools). */
  domain: string | null;
  aiCheckLabel: string | null;
  /** Every required detail is filled in. */
  complete: boolean;
  /** Other listings on the same website. */
  duplicates: number;
  /** A reviewer has turned it down, asked for changes or taken it down before. */
  turnedDownBefore: boolean;
  /** A reviewer pressed Hold. */
  held: boolean;
}

export interface AutoApproveCheck { key: string; label: string; ok: boolean; detail: string }

/** Every check with its result, in the order shown to a reviewer. Fast approval needs all of them. */
export function autoApproveChecks(f: AutoApproveFacts, settings: AutoApproveSettings): AutoApproveCheck[] {
  const domain = domainLooksAi(f.domain, settings.blockWords);
  return [
    { key: 'ownership', label: 'Ownership proven', ok: f.ownershipProven, detail: f.ownershipProven ? 'The founder proved they control the website.' : 'The founder has not verified the website yet.' },
    { key: 'domain', label: 'AI-looking address', ok: domain.ok, detail: domain.why },
    { key: 'aiCheck', label: 'First look says AI', ok: f.aiCheckLabel === 'LIKELY_AI', detail: f.aiCheckLabel === 'LIKELY_AI' ? 'The automatic first look says "likely an AI product".' : f.aiCheckLabel ? 'The automatic first look did not say "likely an AI product".' : 'The automatic first look has not run yet.' },
    { key: 'complete', label: 'Details complete', ok: f.complete, detail: f.complete ? 'Every required detail is filled in.' : 'Some required details are missing.' },
    { key: 'unique', label: 'Not a duplicate', ok: f.duplicates === 0, detail: f.duplicates === 0 ? 'No other listing uses this website.' : `${f.duplicates} other listing${f.duplicates === 1 ? ' uses' : 's use'} this website.` },
    { key: 'clean', label: 'Never turned down', ok: !f.turnedDownBefore, detail: f.turnedDownBefore ? 'A reviewer turned this down or asked for changes before, so a person decides.' : 'No earlier decision against it.' },
    { key: 'hold', label: 'Not on hold', ok: !f.held, detail: f.held ? 'A reviewer put fast approval on hold.' : 'No hold.' },
  ];
}

export const autoApproveEligible = (f: AutoApproveFacts, settings: AutoApproveSettings) =>
  settings.enabled && autoApproveChecks(f, settings).every((c) => c.ok);
