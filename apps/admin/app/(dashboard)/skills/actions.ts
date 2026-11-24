'use server';

import { neon } from '@neondatabase/serverless';
import { requireActionAuth } from '@/lib/api-auth';
import { SKILLS, baseKey, type SkillCategory } from '@udyaibase/utils/skill-dictionary';

const sql = neon(process.env.DATABASE_URL!);
const ROLES = ['SUPER_ADMIN', 'EDITOR_IN_CHIEF'];
const CATEGORIES: SkillCategory[] = ['language', 'frontend', 'backend', 'mobile', 'data', 'database', 'ml', 'ai', 'cloud', 'devops', 'testing', 'security', 'design', 'product', 'business', 'soft', 'tools'];
const id = () => `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

/**
 * Skills dictionary admin (web app: lib/jobs/skills.ts, lib/jobs/skill-overrides.ts). The base list lives in code;
 * these actions add aliases, skills and rules on top, and work through the unknown-skills queue. Every change raises
 * the dictionary version; the daily maintenance job then recomputes stored AI review scores by code (no AI calls).
 */

/** The signed-in admin's email for the change log. */
const emailOf = (session: { user?: { email?: string | null } } | null) => String(session?.user?.email ?? 'admin');

async function bump() {
  await sql`INSERT INTO "SkillDictionaryMeta" (id, version, "rescoredVersion", "updatedAt") VALUES ('main', 1, 0, NOW())
            ON CONFLICT (id) DO UPDATE SET version = "SkillDictionaryMeta".version + 1, "updatedAt" = NOW()`;
}

/** Canonical keys that exist: base list plus skills added here. */
async function skillKeys(): Promise<Set<string>> {
  const added = await sql`SELECT key FROM "SkillDictionarySkill"`;
  return new Set([...SKILLS.map((s) => baseKey(s.name)), ...added.map((r) => r.key as string)]);
}

export async function getSkillsAdminAction() {
  const { error } = await requireActionAuth(ROLES);
  if (error) return { success: false as const, error };
  try {
    const [meta] = await sql`SELECT version, "rescoredVersion" FROM "SkillDictionaryMeta" WHERE id = 'main'`;
    const counts = await sql`SELECT status, COUNT(*)::int AS n FROM "SkillDictionaryUnknown" GROUP BY status`;
    const queue = await sql`
      SELECT key, sample, source, "seenCount", "lastSeen"::text, suggestion
      FROM "SkillDictionaryUnknown" WHERE status = 'PENDING' ORDER BY "seenCount" DESC, "lastSeen" DESC LIMIT 100`;
    const skills = await sql`SELECT id, key, name, category, "createdBy", "createdAt"::text FROM "SkillDictionarySkill" ORDER BY name`;
    const aliases = await sql`SELECT id, "aliasKey", alias, "skillKey", "createdBy", "createdAt"::text FROM "SkillDictionaryAlias" ORDER BY "createdAt" DESC`;
    const rules = await sql`SELECT id, kind, "fromKey", "toKey", "createdBy", "createdAt"::text FROM "SkillDictionaryRule" ORDER BY "createdAt" DESC`;
    return {
      success: true as const,
      version: (meta?.version as number) ?? 0, rescoredVersion: (meta?.rescoredVersion as number) ?? 0,
      counts: Object.fromEntries(counts.map((c) => [c.status, c.n])) as Record<string, number>,
      queue: queue as { key: string; sample: string; source: string; seenCount: number; lastSeen: string; suggestion: { action: string; skill: string; category: string; reason: string } | null }[],
      skills: skills as { id: string; key: string; name: string; category: string; createdBy: string; createdAt: string }[],
      aliases: aliases as { id: string; aliasKey: string; alias: string; skillKey: string; createdBy: string; createdAt: string }[],
      rules: rules as { id: string; kind: string; fromKey: string; toKey: string; createdBy: string; createdAt: string }[],
    };
  } catch (e) {
    return { success: false as const, error: e instanceof Error && /does not exist/.test(e.message) ? 'Run the skill dictionary migration first.' : 'Couldn’t load the dictionary.' };
  }
}

export async function addAliasAction(alias: string, skillKey: string) {
  const { session, error } = await requireActionAuth(ROLES);
  const email = emailOf(session);
  if (error) return { success: false as const, error };
  const a = alias.trim().slice(0, 60);
  const k = baseKey(a);
  if (k.length < 1) return { success: false as const, error: 'Type the alias.' };
  if (!(await skillKeys()).has(skillKey)) return { success: false as const, error: 'That skill isn’t in the dictionary.' };
  if (k === skillKey) return { success: false as const, error: 'That’s already the skill’s own name.' };
  await sql`INSERT INTO "SkillDictionaryAlias" (id, "aliasKey", alias, "skillKey", "createdBy") VALUES (${id()}, ${k}, ${a}, ${skillKey}, ${email})
            ON CONFLICT ("aliasKey") DO UPDATE SET alias = EXCLUDED.alias, "skillKey" = EXCLUDED."skillKey", "createdBy" = EXCLUDED."createdBy", "createdAt" = NOW()`;
  await sql`UPDATE "SkillDictionaryUnknown" SET status = 'MAPPED', "decidedBy" = ${email}, "decidedAt" = NOW() WHERE key = ${k} AND status = 'PENDING'`;
  await bump();
  return { success: true as const };
}

export async function addSkillAction(name: string, category: string) {
  const { session, error } = await requireActionAuth(ROLES);
  const email = emailOf(session);
  if (error) return { success: false as const, error };
  const n = name.trim().slice(0, 60);
  const k = baseKey(n);
  if (k.length < 1) return { success: false as const, error: 'Type the skill’s name.' };
  if (!CATEGORIES.includes(category as SkillCategory)) return { success: false as const, error: 'Pick a category.' };
  if ((await skillKeys()).has(k)) return { success: false as const, error: 'That skill is already in the dictionary.' };
  await sql`INSERT INTO "SkillDictionarySkill" (id, key, name, category, "createdBy") VALUES (${id()}, ${k}, ${n}, ${category}, ${email})`;
  await sql`UPDATE "SkillDictionaryUnknown" SET status = 'ADDED', "decidedBy" = ${email}, "decidedAt" = NOW() WHERE key = ${k} AND status = 'PENDING'`;
  await bump();
  return { success: true as const };
}

/** kind: implies (from → to), ambiguous or not_ambiguous (from only). */
export async function addRuleAction(kind: 'implies' | 'ambiguous' | 'not_ambiguous', fromKey: string, toKey = '') {
  const { session, error } = await requireActionAuth(ROLES);
  const email = emailOf(session);
  if (error) return { success: false as const, error };
  const keys = await skillKeys();
  if (kind === 'implies' && (!keys.has(fromKey) || !keys.has(toKey) || fromKey === toKey)) return { success: false as const, error: 'Pick two different skills from the dictionary.' };
  if (kind !== 'implies') {
    toKey = '';
    // Marking one way removes the opposite mark.
    await sql`DELETE FROM "SkillDictionaryRule" WHERE "fromKey" = ${fromKey} AND kind = ${kind === 'ambiguous' ? 'not_ambiguous' : 'ambiguous'}`;
  }
  await sql`INSERT INTO "SkillDictionaryRule" (id, kind, "fromKey", "toKey", "createdBy") VALUES (${id()}, ${kind}, ${fromKey}, ${toKey}, ${email})
            ON CONFLICT (kind, "fromKey", "toKey") DO NOTHING`;
  await bump();
  return { success: true as const };
}

export async function removeAdditionAction(table: 'alias' | 'rule' | 'skill', rowId: string) {
  const { error } = await requireActionAuth(ROLES);
  if (error) return { success: false as const, error };
  if (table === 'alias') await sql`DELETE FROM "SkillDictionaryAlias" WHERE id = ${rowId}`;
  else if (table === 'rule') await sql`DELETE FROM "SkillDictionaryRule" WHERE id = ${rowId}`;
  else {
    const [s] = await sql`SELECT key FROM "SkillDictionarySkill" WHERE id = ${rowId}`;
    if (s) {
      const [{ n }] = await sql`SELECT COUNT(*)::int AS n FROM "SkillDictionaryAlias" WHERE "skillKey" = ${s.key}`;
      if (n > 0) return { success: false as const, error: 'Remove or move this skill’s aliases first.' };
      await sql`DELETE FROM "SkillDictionaryRule" WHERE "fromKey" = ${s.key} OR "toKey" = ${s.key}`;
      await sql`DELETE FROM "SkillDictionarySkill" WHERE id = ${rowId}`;
    }
  }
  await bump();
  return { success: true as const };
}

/** Merge: from becomes an alias of into; aliases and rules that pointed at from now point at into. */
export async function mergeSkillAction(fromKey: string, intoKey: string) {
  const { session, error } = await requireActionAuth(ROLES);
  const email = emailOf(session);
  if (error) return { success: false as const, error };
  const keys = await skillKeys();
  if (!keys.has(fromKey) || !keys.has(intoKey) || fromKey === intoKey) return { success: false as const, error: 'Pick two different skills from the dictionary.' };
  const name = SKILLS.find((s) => baseKey(s.name) === fromKey)?.name ?? ((await sql`SELECT name FROM "SkillDictionarySkill" WHERE key = ${fromKey}`)[0]?.name as string) ?? fromKey;
  await sql`INSERT INTO "SkillDictionaryAlias" (id, "aliasKey", alias, "skillKey", "createdBy") VALUES (${id()}, ${fromKey}, ${name}, ${intoKey}, ${email})
            ON CONFLICT ("aliasKey") DO UPDATE SET "skillKey" = EXCLUDED."skillKey", "createdBy" = EXCLUDED."createdBy", "createdAt" = NOW()`;
  await sql`UPDATE "SkillDictionaryAlias" SET "skillKey" = ${intoKey} WHERE "skillKey" = ${fromKey}`;
  await sql`UPDATE "SkillDictionaryRule" SET "fromKey" = ${intoKey} WHERE "fromKey" = ${fromKey} AND NOT EXISTS (SELECT 1 FROM "SkillDictionaryRule" r2 WHERE r2.kind = "SkillDictionaryRule".kind AND r2."fromKey" = ${intoKey} AND r2."toKey" = "SkillDictionaryRule"."toKey")`;
  await sql`DELETE FROM "SkillDictionaryRule" WHERE "fromKey" = ${fromKey} OR ("toKey" = ${fromKey})`;
  await sql`DELETE FROM "SkillDictionarySkill" WHERE key = ${fromKey}`;
  await bump();
  return { success: true as const };
}

export async function ignoreUnknownAction(key: string) {
  const { session, error } = await requireActionAuth(ROLES);
  const email = emailOf(session);
  if (error) return { success: false as const, error };
  await sql`UPDATE "SkillDictionaryUnknown" SET status = 'IGNORED', "decidedBy" = ${email}, "decidedAt" = NOW() WHERE key = ${key}`;
  return { success: true as const };
}
