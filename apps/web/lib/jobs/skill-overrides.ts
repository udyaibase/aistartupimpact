import { prisma } from '@udyaibase/database';
import { baseKey } from '@udyaibase/utils/skill-dictionary';
import { isKnownSkill, setSkillOverrides } from '@/lib/jobs/skills';

/**
 * Server side of the skills dictionary: loads admin-approved additions from the database over the base list (cached
 * for a few minutes per server instance) and records skill-like strings the dictionary doesn't know for review.
 */

const TTL_MS = 5 * 60_000;
let loadedAt = 0;
let loading: Promise<number> | null = null;
let version = 0;

/** Make sure this server instance matches with the latest approved dictionary. Returns the dictionary version. */
export async function ensureSkillOverrides(force = false): Promise<number> {
  if (!force && Date.now() - loadedAt < TTL_MS) return version;
  if (loading) return loading;
  loading = (async () => {
    try {
      const [skills, aliases, rules, meta] = await Promise.all([
        prisma.skillDictionarySkill.findMany({ select: { key: true, name: true } }),
        prisma.skillDictionaryAlias.findMany({ select: { aliasKey: true, skillKey: true } }),
        prisma.skillDictionaryRule.findMany({ select: { kind: true, fromKey: true, toKey: true } }),
        prisma.skillDictionaryMeta.findUnique({ where: { id: 'main' }, select: { version: true } }),
      ]);
      const implies: Record<string, string[]> = {};
      for (const r of rules) if (r.kind === 'implies' && r.toKey) (implies[r.fromKey] ??= []).push(r.toKey);
      setSkillOverrides({
        names: Object.fromEntries(skills.map((s) => [s.key, s.name])),
        aliases: Object.fromEntries(aliases.map((a) => [a.aliasKey, a.skillKey])),
        ambiguous: rules.filter((r) => r.kind === 'ambiguous').map((r) => r.fromKey),
        notAmbiguous: rules.filter((r) => r.kind === 'not_ambiguous').map((r) => r.fromKey),
        implies,
      });
      version = meta?.version ?? 0;
    } catch (err) {
      // No table yet (before the migration) or the database is busy: keep matching with the base list.
      console.error('[skills] overrides', err instanceof Error ? err.message : err);
    }
    loadedAt = Date.now();
    return version;
  })().finally(() => { loading = null; });
  return loading;
}

/** Split a skills-list line ("Python, SQL | Docker • K8s") into skill tags. */
export function skillTags(line: string): string[] {
  // Not on "/": CI/CD, A/B Testing and AR/VR are one skill each.
  return line.split(/[,|•·;\n]+|\.\s+|\s{2,}|\s+-\s+/).map((t) => t.replace(/^(skills?|tools|technologies|tech stack)\s*:/i, '').trim()).filter(Boolean);
}

/** Looks like a skill name, not a sentence, a number or redacted identity. */
function plausible(t: string): boolean {
  if (t.length < 2 || t.length > 40) return false;
  if (t.split(/\s+/).length > 4) return false;
  if (!/[a-z]/i.test(t) || /\[(name|email|phone|link)\]/i.test(t)) return false;
  if (/^\d/.test(t) || /https?:|www\.|@/.test(t)) return false;
  return true;
}

/** Count skill tags the dictionary doesn't know (job skills, resume skills lists), for review in admin. Never throws. */
export async function recordUnknownSkills(raw: string[], source: 'job' | 'resume'): Promise<number> {
  try {
    await ensureSkillOverrides();
    const seen = new Map<string, string>();
    for (const t of raw.flatMap((r) => skillTags(r))) {
      if (!plausible(t) || isKnownSkill(t)) continue;
      const key = baseKey(t);
      if (key.length >= 2 && !seen.has(key)) seen.set(key, t.slice(0, 40));
    }
    const items = [...seen].slice(0, 30);
    const now = new Date();
    for (const [key, sample] of items) {
      await prisma.skillDictionaryUnknown.upsert({
        where: { key },
        create: { key, sample, source },
        update: { seenCount: { increment: 1 }, lastSeen: now },
      });
    }
    return items.length;
  } catch (err) {
    console.error('[skills] unknown', err instanceof Error ? err.message : err);
    return 0;
  }
}
