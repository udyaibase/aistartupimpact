'use server';

import { neon } from '@neondatabase/serverless';
import { revalidatePath } from 'next/cache';
import { requireActionAuth } from '@/lib/api-auth';
import { refreshPublic } from '@/lib/refresh-public';

const sql = neon(process.env.DATABASE_URL!);

// ─── Read Operations ────────────────────────────────────────────────────────

export async function getCategoryTreeAction() {
  try {
    const parents = await sql`
      SELECT id, name, slug, icon, description, "toolCount", "sortOrder", "isActive"
      FROM "ToolCategory"
      WHERE level = 0
      ORDER BY "sortOrder" ASC, name ASC
    `;

    const subcategories = await sql`
      SELECT id, name, slug, description, "parentId", "toolCount", "sortOrder", "isActive"
      FROM "ToolCategory"
      WHERE level = 1
      ORDER BY "sortOrder" ASC, name ASC
    `;

    const subsByParent: Record<string, any[]> = {};
    for (const sub of subcategories) {
      const pid = (sub as any).parentId;
      if (!subsByParent[pid]) subsByParent[pid] = [];
      subsByParent[pid].push(sub);
    }

    return parents.map((p: any) => ({
      ...p,
      subcategories: subsByParent[p.id] || [],
    }));
  } catch (error) {
    console.error('getCategoryTreeAction error:', error);
    return [];
  }
}

// ─── Parent Category CRUD ───────────────────────────────────────────────────

export async function createParentCategoryAction(data: {
  name: string;
  description?: string;
  icon?: string;
}) {
  try {
    const slug = data.name
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    const existing = await sql`
      SELECT id FROM "ToolCategory" WHERE slug = ${slug} LIMIT 1
    `;
    if (existing.length > 0) {
      return { success: false, error: 'A category with this slug already exists' };
    }

    const maxOrder = await sql`
      SELECT COALESCE(MAX("sortOrder"), 0) + 1 AS next FROM "ToolCategory" WHERE level = 0
    `;

    await sql`
      INSERT INTO "ToolCategory" (id, name, slug, description, icon, "parentId", level, "sortOrder", "isActive", "toolCount", "createdAt")
      VALUES (gen_random_uuid(), ${data.name}, ${slug}, ${data.description || null}, ${data.icon || null}, NULL, 0, ${(maxOrder[0] as any).next}, true, 0, NOW())
    `;

    revalidatePath('/tools-dir/categories');
    await refreshPublic(['tools', 'home']); return { success: true };
  } catch (error: any) {
    console.error('createParentCategoryAction error:', error);
    return { success: false, error: error.message || 'Failed to create category' };
  }
}

export async function updateParentCategoryAction(id: string, data: {
  name?: string;
  description?: string;
  icon?: string;
  isActive?: boolean;
  sortOrder?: number;
}) {
  try {
    if (data.name !== undefined) {
      await sql`UPDATE "ToolCategory" SET name = ${data.name} WHERE id = ${id}`;
    }
    if (data.description !== undefined) {
      await sql`UPDATE "ToolCategory" SET description = ${data.description} WHERE id = ${id}`;
    }
    if (data.icon !== undefined) {
      await sql`UPDATE "ToolCategory" SET icon = ${data.icon} WHERE id = ${id}`;
    }
    if (data.isActive !== undefined) {
      await sql`UPDATE "ToolCategory" SET "isActive" = ${data.isActive} WHERE id = ${id}`;
    }
    if (data.sortOrder !== undefined) {
      await sql`UPDATE "ToolCategory" SET "sortOrder" = ${data.sortOrder} WHERE id = ${id}`;
    }

    revalidatePath('/tools-dir/categories');
    await refreshPublic(['tools', 'home']); return { success: true };
  } catch (error: any) {
    console.error('updateParentCategoryAction error:', error);
    return { success: false, error: error.message || 'Failed to update category' };
  }
}

// ─── Subcategory CRUD ───────────────────────────────────────────────────────

export async function createSubcategoryAction(data: {
  name: string;
  parentId: string;
  description?: string;
}) {
  try {
    const slug = data.name
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    const existing = await sql`
      SELECT id FROM "ToolCategory" WHERE slug = ${slug} LIMIT 1
    `;
    if (existing.length > 0) {
      return { success: false, error: 'A subcategory with this slug already exists' };
    }

    // Verify parent exists
    const parent = await sql`
      SELECT id FROM "ToolCategory" WHERE id = ${data.parentId} AND level = 0 LIMIT 1
    `;
    if (parent.length === 0) {
      return { success: false, error: 'Parent category not found' };
    }

    const maxOrder = await sql`
      SELECT COALESCE(MAX("sortOrder"), 0) + 1 AS next FROM "ToolCategory" WHERE "parentId" = ${data.parentId}
    `;

    await sql`
      INSERT INTO "ToolCategory" (id, name, slug, description, icon, "parentId", level, "sortOrder", "isActive", "toolCount", "createdAt")
      VALUES (gen_random_uuid(), ${data.name}, ${slug}, ${data.description || null}, NULL, ${data.parentId}, 1, ${(maxOrder[0] as any).next}, true, 0, NOW())
    `;

    revalidatePath('/tools-dir/categories');
    await refreshPublic(['tools', 'home']); return { success: true };
  } catch (error: any) {
    console.error('createSubcategoryAction error:', error);
    return { success: false, error: error.message || 'Failed to create subcategory' };
  }
}

export async function updateSubcategoryAction(id: string, data: {
  name?: string;
  description?: string;
  parentId?: string;
  isActive?: boolean;
  sortOrder?: number;
}) {
  try {
    if (data.name !== undefined) {
      await sql`UPDATE "ToolCategory" SET name = ${data.name} WHERE id = ${id}`;
    }
    if (data.description !== undefined) {
      await sql`UPDATE "ToolCategory" SET description = ${data.description} WHERE id = ${id}`;
    }
    if (data.parentId !== undefined) {
      await sql`UPDATE "ToolCategory" SET "parentId" = ${data.parentId} WHERE id = ${id}`;
    }
    if (data.isActive !== undefined) {
      await sql`UPDATE "ToolCategory" SET "isActive" = ${data.isActive} WHERE id = ${id}`;
    }
    if (data.sortOrder !== undefined) {
      await sql`UPDATE "ToolCategory" SET "sortOrder" = ${data.sortOrder} WHERE id = ${id}`;
    }

    revalidatePath('/tools-dir/categories');
    await refreshPublic(['tools', 'home']); return { success: true };
  } catch (error: any) {
    console.error('updateSubcategoryAction error:', error);
    return { success: false, error: error.message || 'Failed to update subcategory' };
  }
}

export async function deleteSubcategoryAction(id: string) {
  try {
    // Check if any tools use this category
    const tools = await sql`
      SELECT COUNT(*)::int AS count FROM "AiTool" WHERE "categoryId" = ${id} AND "deletedAt" IS NULL
    `;
    if ((tools[0] as any).count > 0) {
      return { success: false, error: `Cannot delete: ${(tools[0] as any).count} tool(s) are using this subcategory. Reassign them first.` };
    }

    await sql`DELETE FROM "ToolCategory" WHERE id = ${id} AND level = 1`;

    revalidatePath('/tools-dir/categories');
    await refreshPublic(['tools', 'home']); return { success: true };
  } catch (error: any) {
    console.error('deleteSubcategoryAction error:', error);
    return { success: false, error: error.message || 'Failed to delete subcategory' };
  }
}

export async function deleteParentCategoryAction(id: string) {
  try {
    // Check if any subcategories exist
    const subs = await sql`
      SELECT COUNT(*)::int AS count FROM "ToolCategory" WHERE "parentId" = ${id}
    `;
    if ((subs[0] as any).count > 0) {
      return { success: false, error: `Cannot delete: ${(subs[0] as any).count} subcategories belong to this parent. Remove them first.` };
    }

    await sql`DELETE FROM "ToolCategory" WHERE id = ${id} AND level = 0`;

    revalidatePath('/tools-dir/categories');
    await refreshPublic(['tools', 'home']); return { success: true };
  } catch (error: any) {
    console.error('deleteParentCategoryAction error:', error);
    return { success: false, error: error.message || 'Failed to delete category' };
  }
}

// ─── Utility ────────────────────────────────────────────────────────────────

export async function refreshCategoryCountsAction() {
  try {
    // Update subcategory counts
    await sql`
      UPDATE "ToolCategory" c
      SET "toolCount" = (
        SELECT COUNT(*)::int FROM "AiTool" t WHERE t."categoryId" = c.id AND t."deletedAt" IS NULL AND t.status = 'APPROVED'
      )
      WHERE c.level = 1
    `;

    // Update parent counts (sum of children)
    await sql`
      UPDATE "ToolCategory" p
      SET "toolCount" = (
        SELECT COALESCE(SUM(c."toolCount"), 0)::int FROM "ToolCategory" c WHERE c."parentId" = p.id
      )
      WHERE p.level = 0
    `;

    revalidatePath('/tools-dir/categories');
    await refreshPublic(['tools', 'home']); return { success: true };
  } catch (error: any) {
    console.error('refreshCategoryCountsAction error:', error);
    return { success: false, error: error.message || 'Failed to refresh counts' };
  }
}
