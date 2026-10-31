'use server';

import { neon } from '@neondatabase/serverless';
import { revalidatePath } from 'next/cache';
import { requireActionAuth } from '@/lib/api-auth';
import { refreshPublic } from '@/lib/refresh-public';

const sql = neon(process.env.DATABASE_URL!);

export async function getHeroSlotsAction() {
  const { error } = await requireActionAuth();
  if (error) return [];
  try {
    const rows = await sql`
      SELECT id, title, excerpt, "coverImage", "ctaUrl", "ctaLabel", "badgeText",
             "authorName", "readTimeMinutes", "sortOrder", "isActive",
             "startDate"::text AS "startDate", "endDate"::text AS "endDate",
             "createdAt"::text AS "createdAt"
      FROM "HeroSlot"
      ORDER BY "sortOrder" ASC, "createdAt" DESC
    `;
    return rows;
  } catch (e: any) {
    console.error('getHeroSlotsAction error:', e);
    return [];
  }
}

export async function createHeroSlotAction(data: {
  title: string; excerpt?: string; coverImage?: string;
  ctaUrl: string; ctaLabel?: string; badgeText?: string;
  authorName?: string; readTimeMinutes?: number;
  sortOrder?: number; isActive?: boolean;
  startDate?: string; endDate?: string;
}) {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };
  try {
    await sql`
      INSERT INTO "HeroSlot" (id, title, excerpt, "coverImage", "ctaUrl", "ctaLabel", "badgeText",
        "authorName", "readTimeMinutes", "sortOrder", "isActive", "startDate", "endDate", "createdAt", "updatedAt")
      VALUES (
        gen_random_uuid()::text, ${data.title}, ${data.excerpt || null}, ${data.coverImage || null},
        ${data.ctaUrl}, ${data.ctaLabel || 'Read Story'}, ${data.badgeText || 'Featured'},
        ${data.authorName || null}, ${data.readTimeMinutes || 5},
        ${data.sortOrder ?? 0}, ${data.isActive ?? true},
        ${data.startDate ? data.startDate + 'T00:00:00' : null}::timestamp,
        ${data.endDate ? data.endDate + 'T23:59:59' : null}::timestamp,
        NOW(), NOW()
      )
    `;
    revalidatePath('/hero-slots');
    await refreshPublic(['home']); return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function updateHeroSlotAction(id: string, data: {
  title: string; excerpt?: string; coverImage?: string;
  ctaUrl: string; ctaLabel?: string; badgeText?: string;
  authorName?: string; readTimeMinutes?: number;
  sortOrder?: number; isActive?: boolean;
  startDate?: string; endDate?: string;
}) {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };
  try {
    await sql`
      UPDATE "HeroSlot" SET
        title = ${data.title}, excerpt = ${data.excerpt || null},
        "coverImage" = ${data.coverImage || null}, "ctaUrl" = ${data.ctaUrl},
        "ctaLabel" = ${data.ctaLabel || 'Read Story'}, "badgeText" = ${data.badgeText || 'Featured'},
        "authorName" = ${data.authorName || null}, "readTimeMinutes" = ${data.readTimeMinutes || 5},
        "sortOrder" = ${data.sortOrder ?? 0}, "isActive" = ${data.isActive ?? true},
        "startDate" = ${data.startDate ? data.startDate + 'T00:00:00' : null}::timestamp,
        "endDate" = ${data.endDate ? data.endDate + 'T23:59:59' : null}::timestamp,
        "updatedAt" = NOW()
      WHERE id = ${id}
    `;
    revalidatePath('/hero-slots');
    await refreshPublic(['home']); return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function deleteHeroSlotAction(id: string) {
  const { error } = await requireActionAuth(['SUPER_ADMIN']);
  if (error) return { success: false, error };
  try {
    await sql`DELETE FROM "HeroSlot" WHERE id = ${id}`;
    revalidatePath('/hero-slots');
    await refreshPublic(['home']); return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function toggleHeroSlotAction(id: string, current: boolean) {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };
  try {
    await sql`UPDATE "HeroSlot" SET "isActive" = ${!current}, "updatedAt" = NOW() WHERE id = ${id}`;
    revalidatePath('/hero-slots');
    await refreshPublic(['home']); return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function reorderHeroSlotAction(id: string, sortOrder: number) {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };
  try {
    await sql`UPDATE "HeroSlot" SET "sortOrder" = ${sortOrder}, "updatedAt" = NOW() WHERE id = ${id}`;
    revalidatePath('/hero-slots');
    await refreshPublic(['home']); return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function getPublishedArticlesForHeroAction() {
  const { error } = await requireActionAuth();
  if (error) return [];
  try {
    const rows = await sql`
      SELECT a.id, a.title, a.slug, a.excerpt, a."coverImage", a."readTimeMinutes",
             u.name AS "authorName"
      FROM "Article" a
      LEFT JOIN "User" u ON u.id = a."authorId"
      WHERE a.status = 'PUBLISHED' AND a."deletedAt" IS NULL
      ORDER BY a."publishedAt" DESC
      LIMIT 50
    `;
    return rows;
  } catch (e: any) {
    console.error('getPublishedArticlesForHeroAction error:', e);
    return [];
  }
}
