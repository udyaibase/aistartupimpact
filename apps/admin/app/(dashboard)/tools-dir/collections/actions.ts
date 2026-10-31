'use server';

import { neon } from '@neondatabase/serverless';
import { revalidatePath } from 'next/cache';
import { requireActionAuth } from '@/lib/api-auth';
import { refreshPublic } from '@/lib/refresh-public';

const sql = neon(process.env.DATABASE_URL!);

export async function getCollectionsAction() {
  try {
    const collections = await sql`
      SELECT c.*, 
        (SELECT COUNT(*)::int FROM "ToolCollectionItem" WHERE "collectionId" = c.id) AS "itemCount"
      FROM "ToolCollection" c
      ORDER BY c."sortOrder" ASC, c."createdAt" DESC
    `;
    return collections;
  } catch (error) {
    console.error('getCollectionsAction error:', error);
    return [];
  }
}

export async function createCollectionAction(data: { title: string; description?: string }) {
  try {
    const slug = data.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const existing = await sql`SELECT id FROM "ToolCollection" WHERE slug = ${slug} LIMIT 1`;
    if (existing.length > 0) return { success: false, error: 'A collection with this name already exists' };

    await sql`
      INSERT INTO "ToolCollection" (id, title, slug, description, "isPublished", "sortOrder", "createdAt", "updatedAt")
      VALUES (gen_random_uuid(), ${data.title}, ${slug}, ${data.description || null}, false, 0, NOW(), NOW())
    `;
    revalidatePath('/tools-dir/collections');
    await refreshPublic(['tools', 'home']); return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function updateCollectionAction(id: string, data: { title?: string; description?: string; isPublished?: boolean }) {
  try {
    if (data.title !== undefined) await sql`UPDATE "ToolCollection" SET title = ${data.title}, "updatedAt" = NOW() WHERE id = ${id}`;
    if (data.description !== undefined) await sql`UPDATE "ToolCollection" SET description = ${data.description}, "updatedAt" = NOW() WHERE id = ${id}`;
    if (data.isPublished !== undefined) await sql`UPDATE "ToolCollection" SET "isPublished" = ${data.isPublished}, "updatedAt" = NOW() WHERE id = ${id}`;
    revalidatePath('/tools-dir/collections');
    await refreshPublic(['tools', 'home']); return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function deleteCollectionAction(id: string) {
  try {
    await sql`DELETE FROM "ToolCollectionItem" WHERE "collectionId" = ${id}`;
    await sql`DELETE FROM "ToolCollection" WHERE id = ${id}`;
    revalidatePath('/tools-dir/collections');
    await refreshPublic(['tools', 'home']); return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function getCollectionItemsAction(collectionId: string) {
  try {
    const items = await sql`
      SELECT ci.id, ci."sortOrder", ci."editorNote", 
             t.id AS "toolId", t.name, t.slug, t."logoUrl", t.tagline, t."avgRating"
      FROM "ToolCollectionItem" ci
      JOIN "AiTool" t ON t.id = ci."toolId"
      WHERE ci."collectionId" = ${collectionId} AND t."deletedAt" IS NULL
      ORDER BY ci."sortOrder" ASC
    `;
    return items;
  } catch (error) {
    return [];
  }
}

export async function addToolToCollectionAction(collectionId: string, toolId: string, editorNote?: string) {
  try {
    const existing = await sql`SELECT id FROM "ToolCollectionItem" WHERE "collectionId" = ${collectionId} AND "toolId" = ${toolId} LIMIT 1`;
    if (existing.length > 0) return { success: false, error: 'Tool already in collection' };

    const maxOrder = await sql`SELECT COALESCE(MAX("sortOrder"), 0) + 1 AS next FROM "ToolCollectionItem" WHERE "collectionId" = ${collectionId}`;
    await sql`
      INSERT INTO "ToolCollectionItem" (id, "collectionId", "toolId", "sortOrder", "editorNote", "createdAt")
      VALUES (gen_random_uuid(), ${collectionId}, ${toolId}, ${(maxOrder[0] as any).next}, ${editorNote || null}, NOW())
    `;
    revalidatePath('/tools-dir/collections');
    await refreshPublic(['tools', 'home']); return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function removeToolFromCollectionAction(itemId: string) {
  try {
    await sql`DELETE FROM "ToolCollectionItem" WHERE id = ${itemId}`;
    revalidatePath('/tools-dir/collections');
    await refreshPublic(['tools', 'home']); return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
