'use server';

import { neon } from '@neondatabase/serverless';
import { revalidatePath } from 'next/cache';
import { requireActionAuth } from '@/lib/api-auth';
import { invalidateToolCache, invalidateTaxonomyCache, invalidateToolTagsCache } from '@/lib/cache-invalidate';
import { refreshPublic } from '@/lib/refresh-public';

const sql = neon(process.env.DATABASE_URL!);

// ─── Read Operations ────────────────────────────────────────────────────────

export async function getTagGroupsWithTagsAction() {
  try {
    const groups = await sql`
      SELECT id, name, slug, icon, description, "sortOrder", "displayMode", "maxVisibleDefault", "isAdminOnly", "isActive"
      FROM "ToolTagGroup"
      ORDER BY "sortOrder" ASC
    `;

    const tags = await sql`
      SELECT id, name, slug, emoji, "groupId", "sortOrder", "isActive", "tagCount"
      FROM "ToolSystemTag"
      ORDER BY "sortOrder" ASC, name ASC
    `;

    // Group tags by groupId
    const tagsByGroup: Record<string, any[]> = {};
    for (const tag of tags) {
      const gid = (tag as any).groupId;
      if (!tagsByGroup[gid]) tagsByGroup[gid] = [];
      tagsByGroup[gid].push(tag);
    }

    return groups.map((g: any) => ({
      ...g,
      tags: tagsByGroup[g.id] || [],
    }));
  } catch (error) {
    console.error('getTagGroupsWithTagsAction error:', error);
    return [];
  }
}

export async function getToolTagsAction(toolId: string) {
  try {
    const mappings = await sql`
      SELECT t.id, t.name, t.slug, t.emoji, t."groupId", g.name AS "groupName", g.slug AS "groupSlug"
      FROM "ToolSystemTagMapping" m
      JOIN "ToolSystemTag" t ON t.id = m."tagId"
      JOIN "ToolTagGroup" g ON g.id = t."groupId"
      WHERE m."toolId" = ${toolId}
      ORDER BY g."sortOrder" ASC, t."sortOrder" ASC
    `;
    return mappings;
  } catch (error) {
    console.error('getToolTagsAction error:', error);
    return [];
  }
}

// ─── Tool Tag Assignment ────────────────────────────────────────────────────

export async function updateToolTagsAction(toolId: string, tagIds: string[]) {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };
  try {
    // Cap at 30 tags per tool
    const cappedTagIds = tagIds.slice(0, 30);

    // Get existing mappings
    const existing = await sql`
      SELECT "tagId" FROM "ToolSystemTagMapping" WHERE "toolId" = ${toolId}
    `;
    const existingIds = new Set(existing.map((r: any) => r.tagId));
    const newIds = new Set(cappedTagIds);

    // Tags to add
    const toAdd = cappedTagIds.filter(id => !existingIds.has(id));
    // Tags to remove
    const toRemove = [...existingIds].filter(id => !newIds.has(id));

    // Remove old mappings
    if (toRemove.length > 0) {
      await sql`
        DELETE FROM "ToolSystemTagMapping"
        WHERE "toolId" = ${toolId} AND "tagId" = ANY(${toRemove}::text[])
      `;
      // Decrement tag counts
      await sql`
        UPDATE "ToolSystemTag"
        SET "tagCount" = GREATEST("tagCount" - 1, 0), "updatedAt" = NOW()
        WHERE id = ANY(${toRemove}::text[])
      `;
    }

    // Add new mappings
    if (toAdd.length > 0) {
      for (const tagId of toAdd) {
        await sql`
          INSERT INTO "ToolSystemTagMapping" (id, "toolId", "tagId", "addedBy", "createdAt")
          VALUES (gen_random_uuid(), ${toolId}, ${tagId}, 'admin', NOW())
          ON CONFLICT ("toolId", "tagId") DO NOTHING
        `;
      }
      // Increment tag counts
      await sql`
        UPDATE "ToolSystemTag"
        SET "tagCount" = "tagCount" + 1, "updatedAt" = NOW()
        WHERE id = ANY(${toAdd}::text[])
      `;
    }

    revalidatePath('/tools-dir');
    invalidateToolCache();
    invalidateTaxonomyCache();
    invalidateToolTagsCache(toolId);
    await refreshPublic(['tools', 'home']); return { success: true, count: cappedTagIds.length };
  } catch (error: any) {
    console.error('updateToolTagsAction error:', error);
    return { success: false, error: error.message || 'Failed to update tags' };
  }
}

// ─── Tag CRUD ───────────────────────────────────────────────────────────────

export async function createTagAction(data: {
  name: string;
  groupId: string;
  emoji?: string;
}) {
  try {
    const slug = data.name
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    // Check for duplicate slug
    const existing = await sql`
      SELECT id FROM "ToolSystemTag" WHERE slug = ${slug} LIMIT 1
    `;
    if (existing.length > 0) {
      return { success: false, error: 'A tag with this name already exists' };
    }

    // Get next sort order for this group
    const maxOrder = await sql`
      SELECT COALESCE(MAX("sortOrder"), 0) + 1 AS next FROM "ToolSystemTag" WHERE "groupId" = ${data.groupId}
    `;

    await sql`
      INSERT INTO "ToolSystemTag" (id, name, slug, emoji, "groupId", "sortOrder", "isActive", "tagCount", "createdAt", "updatedAt")
      VALUES (gen_random_uuid(), ${data.name}, ${slug}, ${data.emoji || null}, ${data.groupId}, ${(maxOrder[0] as any).next}, true, 0, NOW(), NOW())
    `;

    revalidatePath('/tools-dir/tags');
    await refreshPublic(['tools', 'home']); return { success: true };
  } catch (error: any) {
    console.error('createTagAction error:', error);
    return { success: false, error: error.message || 'Failed to create tag' };
  }
}

export async function createTagsBulkAction(data: {
  names: string[];
  groupId: string;
}) {
  try {
    const results: Array<{ name: string; success: boolean; error?: string }> = [];

    const maxOrder = await sql`
      SELECT COALESCE(MAX("sortOrder"), 0) AS max FROM "ToolSystemTag" WHERE "groupId" = ${data.groupId}
    `;
    let nextOrder = ((maxOrder[0] as any).max || 0) + 1;

    for (const name of data.names) {
      const trimmed = name.trim();
      if (!trimmed) continue;

      const slug = trimmed
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/[\s_]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

      const existing = await sql`
        SELECT id FROM "ToolSystemTag" WHERE slug = ${slug} LIMIT 1
      `;
      if (existing.length > 0) {
        results.push({ name: trimmed, success: false, error: 'Already exists' });
        continue;
      }

      await sql`
        INSERT INTO "ToolSystemTag" (id, name, slug, emoji, "groupId", "sortOrder", "isActive", "tagCount", "createdAt", "updatedAt")
        VALUES (gen_random_uuid(), ${trimmed}, ${slug}, null, ${data.groupId}, ${nextOrder}, true, 0, NOW(), NOW())
      `;
      nextOrder++;
      results.push({ name: trimmed, success: true });
    }

    revalidatePath('/tools-dir/tags');
    const created = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success);
    await refreshPublic(['tools', 'home']); return { success: true, created, failed };
  } catch (error: any) {
    console.error('createTagsBulkAction error:', error);
    return { success: false, error: error.message || 'Failed to create tags' };
  }
}

export async function updateTagAction(id: string, data: { name?: string; emoji?: string; isActive?: boolean; sortOrder?: number }) {
  try {
    if (data.name !== undefined) {
      await sql`UPDATE "ToolSystemTag" SET name = ${data.name}, "updatedAt" = NOW() WHERE id = ${id}`;
    }
    if (data.emoji !== undefined) {
      await sql`UPDATE "ToolSystemTag" SET emoji = ${data.emoji}, "updatedAt" = NOW() WHERE id = ${id}`;
    }
    if (data.isActive !== undefined) {
      await sql`UPDATE "ToolSystemTag" SET "isActive" = ${data.isActive}, "updatedAt" = NOW() WHERE id = ${id}`;
    }
    if (data.sortOrder !== undefined) {
      await sql`UPDATE "ToolSystemTag" SET "sortOrder" = ${data.sortOrder}, "updatedAt" = NOW() WHERE id = ${id}`;
    }

    revalidatePath('/tools-dir/tags');
    await refreshPublic(['tools', 'home']); return { success: true };
  } catch (error: any) {
    console.error('updateTagAction error:', error);
    return { success: false, error: error.message || 'Failed to update tag' };
  }
}

export async function deleteTagAction(id: string) {
  try {
    // Remove all mappings first
    await sql`DELETE FROM "ToolSystemTagMapping" WHERE "tagId" = ${id}`;
    // Delete the tag
    await sql`DELETE FROM "ToolSystemTag" WHERE id = ${id}`;

    revalidatePath('/tools-dir/tags');
    await refreshPublic(['tools', 'home']); return { success: true };
  } catch (error: any) {
    console.error('deleteTagAction error:', error);
    return { success: false, error: error.message || 'Failed to delete tag' };
  }
}

// ─── Tag Group CRUD ─────────────────────────────────────────────────────────

export async function createTagGroupAction(data: {
  name: string;
  icon?: string;
  description?: string;
  displayMode?: string;
  maxVisibleDefault?: number;
  isAdminOnly?: boolean;
}) {
  try {
    const slug = data.name
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    const maxOrder = await sql`
      SELECT COALESCE(MAX("sortOrder"), 0) + 1 AS next FROM "ToolTagGroup"
    `;

    await sql`
      INSERT INTO "ToolTagGroup" (id, name, slug, icon, description, "sortOrder", "displayMode", "maxVisibleDefault", "isAdminOnly", "isActive", "createdAt", "updatedAt")
      VALUES (gen_random_uuid(), ${data.name}, ${slug}, ${data.icon || null}, ${data.description || null}, ${(maxOrder[0] as any).next}, ${data.displayMode || 'expandable'}, ${data.maxVisibleDefault || 6}, ${data.isAdminOnly || false}, true, NOW(), NOW())
    `;

    revalidatePath('/tools-dir/tags');
    await refreshPublic(['tools', 'home']); return { success: true };
  } catch (error: any) {
    console.error('createTagGroupAction error:', error);
    return { success: false, error: error.message || 'Failed to create tag group' };
  }
}

export async function refreshTagCountsAction() {
  try {
    await sql`
      UPDATE "ToolSystemTag" t
      SET "tagCount" = (
        SELECT COUNT(*)::int FROM "ToolSystemTagMapping" m WHERE m."tagId" = t.id
      ),
      "updatedAt" = NOW()
    `;
    revalidatePath('/tools-dir/tags');
    await refreshPublic(['tools', 'home']); return { success: true };
  } catch (error: any) {
    console.error('refreshTagCountsAction error:', error);
    return { success: false, error: error.message || 'Failed to refresh counts' };
  }
}
