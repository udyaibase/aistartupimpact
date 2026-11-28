'use server';

import { prisma } from '@udyaibase/database';
import { generateSlug } from '@udyaibase/utils/slug';
import { requireActionAuth } from '@/lib/api-auth';
import { sectionRoles } from '@/lib/section-access';
import { logAuditEvent } from '@/lib/audit-log';
import { publicError } from '@/lib/public-error';
import { refreshPublic } from '@/lib/refresh-public';

/**
 * Article categories (News, Stories, Opinions share one list). Editors add, rename and remove them here; writers
 * only pick one in the article editor. Articles point at a category by id, so a rename reaches every article.
 */

const ROLES = sectionRoles('/articles/categories');
const NAME_MAX = 60;
const DESCRIPTION_MAX = 200;

export type ArticleCategoryRow = { id: string; name: string; slug: string; description: string; articles: number; published: number };
type Fail = { success: false; error: string };

const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

async function rows(): Promise<ArticleCategoryRow[]> {
  const list = await prisma.$queryRaw<Array<Omit<ArticleCategoryRow, 'description'> & { description: string | null }>>`
    SELECT c.id, c.name, c.slug, c.description,
           COUNT(a.id)::int AS articles,
           COUNT(a.id) FILTER (WHERE a.status = 'PUBLISHED')::int AS published
    FROM "Category" c
    LEFT JOIN "Article" a ON a."categoryId" = c.id AND a."deletedAt" IS NULL
    GROUP BY c.id
    ORDER BY c."sortOrder" ASC, c.name ASC`;
  return list.map((c) => ({ ...c, description: c.description ?? '' }));
}

export async function listArticleCategoriesAction(): Promise<{ success: true; data: ArticleCategoryRow[]; uncategorised: number } | Fail> {
  const { error } = await requireActionAuth(ROLES);
  if (error) return { success: false, error };
  try {
    const [data, none] = await Promise.all([
      rows(),
      prisma.$queryRaw<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM "Article" WHERE "categoryId" IS NULL AND "deletedAt" IS NULL AND status = 'PUBLISHED'`,
    ]);
    return { success: true, data, uncategorised: none[0]?.n ?? 0 };
  } catch (e) {
    return { success: false, error: publicError(e, "Couldn't load the categories. Try again.") };
  }
}

/** Add a category (id null) or change its name and description. The name must be unique, whatever the letter case. */
export async function saveArticleCategoryAction(id: string | null, raw: { name?: unknown; description?: unknown }): Promise<{ success: true; data: ArticleCategoryRow[] } | Fail> {
  const { error } = await requireActionAuth(ROLES);
  if (error) return { success: false, error };
  const name = clean(raw?.name, NAME_MAX);
  const description = clean(raw?.description, DESCRIPTION_MAX) || null;
  if (name.length < 2) return { success: false, error: 'Give the category a name of at least 2 characters.' };
  try {
    const clash = await prisma.$queryRaw<{ id: string }[]>`SELECT id FROM "Category" WHERE LOWER(name) = LOWER(${name}) AND id <> ${id ?? ''} LIMIT 1`;
    if (clash.length) return { success: false, error: `A category called "${name}" already exists.` };

    if (!id) {
      const base = generateSlug(name).slice(0, 80) || 'category';
      const taken = new Set((await prisma.$queryRaw<{ slug: string }[]>`SELECT slug FROM "Category" WHERE slug = ${base} OR slug LIKE ${base + '-%'}`).map((r) => r.slug));
      let slug = base;
      for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
      const newId = crypto.randomUUID();
      await prisma.$executeRaw`
        INSERT INTO "Category" (id, name, slug, description, "sortOrder", "createdAt", "updatedAt")
        VALUES (${newId}, ${name}, ${slug}, ${description}, 0, NOW(), NOW())`;
      await logAuditEvent({ action: 'CREATE', resourceType: 'ARTICLE_CATEGORY', resourceId: newId, resourceName: name, after: { name, description } });
    } else {
      const before = (await prisma.$queryRaw<{ name: string; description: string | null }[]>`SELECT name, description FROM "Category" WHERE id = ${id} LIMIT 1`)[0];
      if (!before) return { success: false, error: 'This category no longer exists.' };
      await prisma.$executeRaw`UPDATE "Category" SET name = ${name}, description = ${description}, "updatedAt" = NOW() WHERE id = ${id}`;
      await logAuditEvent({ action: 'UPDATE', resourceType: 'ARTICLE_CATEGORY', resourceId: id, resourceName: name, before, after: { name, description } });
      // The name is printed on published articles; the name and description are the category's public page.
      if (before.name !== name || (before.description ?? null) !== description) await refreshPublic(['news', 'stories', 'opinions', 'home']);
    }
    return { success: true, data: await rows() };
  } catch (e) {
    return { success: false, error: publicError(e, "Couldn't save the category. Try again.") };
  }
}

/**
 * Remove a category. Its articles are never deleted: they move to `moveToId`, or become uncategorised when that is
 * null. Both steps happen together, so no article is left pointing at a category that is gone.
 */
export async function deleteArticleCategoryAction(id: string, moveToId: string | null): Promise<{ success: true; data: ArticleCategoryRow[]; moved: number } | Fail> {
  const { error } = await requireActionAuth(ROLES);
  if (error) return { success: false, error };
  if (moveToId === id) return { success: false, error: 'Pick a different category to move the articles to.' };
  try {
    const found = await prisma.$queryRaw<{ id: string; name: string }[]>`SELECT id, name FROM "Category" WHERE id = ANY(${[id, moveToId ?? id]}::text[])`;
    const target = found.find((c) => c.id === id);
    if (!target) return { success: false, error: 'This category no longer exists.' };
    const dest = moveToId ? found.find((c) => c.id === moveToId) : null;
    if (moveToId && !dest) return { success: false, error: 'The category to move the articles to no longer exists.' };

    const [moved] = await prisma.$transaction([
      prisma.$executeRaw`UPDATE "Article" SET "categoryId" = ${moveToId} WHERE "categoryId" = ${id}`,
      prisma.$executeRaw`UPDATE "Category" SET "parentId" = NULL WHERE "parentId" = ${id}`,
      prisma.$executeRaw`DELETE FROM "Category" WHERE id = ${id}`,
    ]);
    await logAuditEvent({
      action: 'DELETE', resourceType: 'ARTICLE_CATEGORY', resourceId: id, resourceName: target.name,
      before: { name: target.name, articles: moved }, after: { movedTo: dest?.name ?? 'Uncategorised' },
    });
    if (moved > 0) await refreshPublic(['news', 'stories', 'opinions', 'home']);
    return { success: true, data: await rows(), moved };
  } catch (e) {
    return { success: false, error: publicError(e, "Couldn't remove the category. Try again.") };
  }
}
