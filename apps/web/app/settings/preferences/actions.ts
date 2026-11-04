'use server';

import { sql } from '@/lib/db';
import { getUserSession } from '@/lib/user-session';

const VALID_INTENTS = ['exploring_tools', 'following_startups', 'looking_for_jobs', 'founder_builder', 'learning_ai', 'investor_vc'];

export async function getPreferences() {
  const session = await getUserSession();
  if (!session) return null;

  const users = await sql`
    SELECT "primaryIntent", "cityId"
    FROM "WebUser"
    WHERE id = ${session.id}
    LIMIT 1
  `;

  const interests = await sql`
    SELECT "categoryId" FROM "WebUserInterest" WHERE "userId" = ${session.id}
  `;

  let cityName = null;
  if (users[0]?.cityId) {
    const cities = await sql`
      SELECT name, state, country FROM "City" WHERE id = ${users[0].cityId} LIMIT 1
    `;
    if (cities.length > 0) {
      const c = cities[0];
      cityName = `${c.name}${c.state ? `, ${c.state}` : ''}, ${c.country}`;
    }
  }

  return {
    primaryIntent: users[0]?.primaryIntent || null,
    categoryIds: interests.map((i: any) => i.categoryId),
    cityId: users[0]?.cityId || null,
    cityName,
  };
}

/** Everything the preferences form needs, for showing it inside the Profile page. */
export async function getPreferencesForm() {
  const session = await getUserSession();
  if (!session) return null;
  const [categories, prefs] = await Promise.all([
    sql`SELECT id, name, slug, icon FROM "ToolCategory" WHERE level = 0 AND "isActive" = true ORDER BY "sortOrder", name`,
    getPreferences(),
  ]);
  return { categories: categories as { id: string; name: string; slug: string; icon: string | null }[], prefs };
}

export async function updatePreferences(data: {
  primaryIntent?: string | null;
  categoryIds?: string[];
  cityId?: string | null;
}) {
  const session = await getUserSession();
  if (!session) return { error: 'Not authenticated' };

  const { primaryIntent, categoryIds, cityId } = data;

  if (primaryIntent && !VALID_INTENTS.includes(primaryIntent)) {
    return { error: 'Invalid intent' };
  }

  await sql`
    UPDATE "WebUser"
    SET
      "primaryIntent" = ${primaryIntent ?? null},
      "cityId" = ${cityId ?? null},
      "preferencesUpdatedAt" = NOW(),
      "updatedAt" = NOW()
    WHERE id = ${session.id}
  `;

  if (categoryIds !== undefined) {
    await sql`DELETE FROM "WebUserInterest" WHERE "userId" = ${session.id}`;
    for (const catId of (categoryIds || []).slice(0, 15)) {
      await sql`
        INSERT INTO "WebUserInterest" ("userId", "categoryId")
        VALUES (${session.id}, ${catId})
        ON CONFLICT DO NOTHING
      `;
    }
  }

  return { success: true };
}
