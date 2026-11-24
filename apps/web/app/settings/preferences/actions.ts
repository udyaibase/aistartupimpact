'use server';

import { sql } from '@/lib/db';
import { getUserSession } from '@/lib/user-session';
import { cleanJobPrefs, cleanTopics, isIntent, MAX_INTENTS, topicById, type JobPrefs } from '@/lib/personalization/topics';
import { JOB_CATEGORIES } from '@/lib/jobs/composer';

const ROLE_VALUES = JOB_CATEGORIES.filter((c) => c.value !== 'OTHER').map((c) => c.value as string);

export interface Preferences {
  intents: string[];
  topics: string[];
  jobPrefs: JobPrefs;
  cityId: string | null;
  cityName: string | null;
}

export async function getPreferences(): Promise<Preferences | null> {
  const session = await getUserSession();
  if (!session) return null;
  const rows = await sql`
    SELECT w.intents, w.topics, w."jobPrefs", w."primaryIntent", w."cityId", c.name, c.state, c.country
    FROM "WebUser" w LEFT JOIN "City" c ON c.id = w."cityId"
    WHERE w.id = ${session.id} LIMIT 1
  `;
  const u = rows[0] as { intents: string[] | null; topics: string[] | null; jobPrefs: unknown; primaryIntent: string | null; cityId: string | null; name: string | null; state: string | null; country: string | null } | undefined;
  if (!u) return null;
  return {
    intents: (u.intents?.length ? u.intents : u.primaryIntent ? [u.primaryIntent] : []).filter(isIntent),
    topics: cleanTopics(u.topics),
    jobPrefs: cleanJobPrefs(u.jobPrefs, ROLE_VALUES),
    cityId: u.cityId,
    cityName: u.name ? `${u.name}${u.state ? `, ${u.state}` : ''}, ${u.country}` : null,
  };
}

/** Everything the preferences form needs (Settings page and the Profile → Preferences tab). */
export async function getPreferencesForm() {
  const prefs = await getPreferences();
  if (!prefs) return null;
  return { prefs, jobRoles: JOB_CATEGORIES.filter((c) => c.value !== 'OTHER').map((c) => ({ value: c.value as string, label: c.label as string })) };
}

export async function updatePreferences(data: {
  intents?: string[];
  topics?: string[];
  jobPrefs?: Partial<JobPrefs>;
  cityId?: string | null;
}): Promise<{ success: true } | { error: string }> {
  const session = await getUserSession();
  if (!session) return { error: 'Your session has expired. Please sign in again.' };

  const intents = [...new Set((data.intents ?? []).filter(isIntent))].slice(0, MAX_INTENTS);
  const topics = cleanTopics(data.topics);
  const jobPrefs = cleanJobPrefs(data.jobPrefs, ROLE_VALUES);
  try {
    const cityId = typeof data.cityId === 'string' && data.cityId
      ? (((await sql`SELECT id FROM "City" WHERE id = ${data.cityId} LIMIT 1`) as { id: string }[])[0]?.id ?? null)
      : null;
    const toolNames = [...new Set(topics.flatMap((t) => topicById(t)?.tools ?? []))];
    const categoryIds = toolNames.length
      ? ((await sql`SELECT id FROM "ToolCategory" WHERE name = ANY(${toolNames}::text[]) AND "isActive" = true`) as { id: string }[]).map((r) => r.id)
      : [];

    await sql`
      UPDATE "WebUser"
      SET "primaryIntent" = ${intents[0] ?? null},
          "intents" = ${intents}::text[],
          "topics" = ${topics}::text[],
          "jobPrefs" = ${JSON.stringify(jobPrefs)}::jsonb,
          "cityId" = ${cityId},
          "preferencesUpdatedAt" = NOW(),
          "updatedAt" = NOW()
      WHERE id = ${session.id}
    `;
    await sql`DELETE FROM "WebUserInterest" WHERE "userId" = ${session.id}`;
    if (categoryIds.length) {
      await sql`INSERT INTO "WebUserInterest" ("userId", "categoryId") SELECT ${session.id}, unnest(${categoryIds}::text[]) ON CONFLICT DO NOTHING`;
    }
    return { success: true };
  } catch (err) {
    console.error('[preferences] could not save:', err instanceof Error ? err.message : err);
    return { error: 'We couldn’t save your preferences. Please try again.' };
  }
}

/** "Clear my activity history": what they've viewed stops shaping their suggestions. */
export async function clearActivity(): Promise<{ success: true } | { error: string }> {
  const session = await getUserSession();
  if (!session) return { error: 'Your session has expired. Please sign in again.' };
  try {
    await sql`DELETE FROM "WebUserInteraction" WHERE "userId" = ${session.id}`;
    return { success: true };
  } catch {
    return { error: 'We couldn’t clear your history. Please try again.' };
  }
}
