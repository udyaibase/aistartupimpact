'use server';

import { neon } from '@neondatabase/serverless';
import { revalidatePath } from 'next/cache';
import { requireActionAuth } from '@/lib/api-auth';
import { refreshPublic } from '@/lib/refresh-public';

const sql = neon(process.env.DATABASE_URL!);

// ─── Business Categories ────────────────────────────────────────────────────

export async function getBusinessCategoriesAction() {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };
  try {
    const rows = await sql`
      SELECT category, COUNT(*)::int AS count
      FROM "Startup"
      WHERE category IS NOT NULL AND "deletedAt" IS NULL
      GROUP BY category
      ORDER BY count DESC, category ASC
    `;
    return rows.map((r: any) => ({ name: r.category, count: r.count }));
  } catch (error) {
    console.error('getBusinessCategoriesAction error:', error);
    return [];
  }
}

export async function addBusinessCategoryAction(name: string) {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };
  // Business categories are freeform strings on the Startup model.
  // "Adding" a category means it becomes available in the dropdown.
  // We store the canonical list in a dedicated lightweight table.
  try {
    if (!name.trim()) return { success: false, error: 'Name is required' };

    // Check if already exists
    const existing = await sql`
      SELECT name FROM "StartupBusinessCategory" WHERE LOWER(name) = LOWER(${name.trim()}) LIMIT 1
    `;
    if (existing.length > 0) {
      return { success: false, error: 'This category already exists' };
    }

    const maxOrder = await sql`
      SELECT COALESCE(MAX("sortOrder"), 0) + 1 AS next FROM "StartupBusinessCategory"
    `;

    await sql`
      INSERT INTO "StartupBusinessCategory" (id, name, "sortOrder", "isActive", "createdAt")
      VALUES (gen_random_uuid(), ${name.trim()}, ${(maxOrder[0] as any).next}, true, NOW())
    `;

    revalidatePath('/startups-dir/manage');
    await refreshPublic(['startups', 'funding', 'india-ai', 'home']); return { success: true };
  } catch (error: any) {
    console.error('addBusinessCategoryAction error:', error);
    return { success: false, error: error.message || 'Failed to add category' };
  }
}

export async function updateBusinessCategoryAction(oldName: string, newName: string) {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };
  try {
    if (!newName.trim()) return { success: false, error: 'Name is required' };

    // Update the canonical list
    await sql`
      UPDATE "StartupBusinessCategory" SET name = ${newName.trim()} WHERE name = ${oldName}
    `;

    // Also update all startups using this category
    await sql`
      UPDATE "Startup" SET category = ${newName.trim()} WHERE category = ${oldName}
    `;

    revalidatePath('/startups-dir/manage');
    await refreshPublic(['startups', 'funding', 'india-ai', 'home']); return { success: true };
  } catch (error: any) {
    console.error('updateBusinessCategoryAction error:', error);
    return { success: false, error: error.message || 'Failed to update category' };
  }
}

export async function deleteBusinessCategoryAction(name: string) {
  const { error } = await requireActionAuth(['SUPER_ADMIN']);
  if (error) return { success: false, error };
  try {
    // Check if startups use it
    const count = await sql`
      SELECT COUNT(*)::int AS count FROM "Startup" WHERE category = ${name} AND "deletedAt" IS NULL
    `;
    if ((count[0] as any).count > 0) {
      return { success: false, error: `Cannot delete: ${(count[0] as any).count} startup(s) use this category. Reassign them first.` };
    }

    await sql`DELETE FROM "StartupBusinessCategory" WHERE name = ${name}`;

    revalidatePath('/startups-dir/manage');
    await refreshPublic(['startups', 'funding', 'india-ai', 'home']); return { success: true };
  } catch (error: any) {
    console.error('deleteBusinessCategoryAction error:', error);
    return { success: false, error: error.message || 'Failed to delete category' };
  }
}

export async function toggleBusinessCategoryAction(name: string, isActive: boolean) {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };
  try {
    await sql`UPDATE "StartupBusinessCategory" SET "isActive" = ${isActive} WHERE name = ${name}`;
    revalidatePath('/startups-dir/manage');
    await refreshPublic(['startups', 'funding', 'india-ai', 'home']); return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ─── Business Types ─────────────────────────────────────────────────────────

export async function getBusinessTypesAction() {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };
  try {
    const rows = await sql`
      SELECT "businessType", COUNT(*)::int AS count
      FROM "Startup"
      WHERE "businessType" IS NOT NULL AND "deletedAt" IS NULL
      GROUP BY "businessType"
      ORDER BY count DESC, "businessType" ASC
    `;
    return rows.map((r: any) => ({ name: r.businessType, count: r.count }));
  } catch (error) {
    console.error('getBusinessTypesAction error:', error);
    return [];
  }
}

export async function addBusinessTypeAction(name: string) {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };
  try {
    if (!name.trim()) return { success: false, error: 'Name is required' };

    const existing = await sql`
      SELECT name FROM "StartupBusinessType" WHERE LOWER(name) = LOWER(${name.trim()}) LIMIT 1
    `;
    if (existing.length > 0) {
      return { success: false, error: 'This business type already exists' };
    }

    const maxOrder = await sql`
      SELECT COALESCE(MAX("sortOrder"), 0) + 1 AS next FROM "StartupBusinessType"
    `;

    await sql`
      INSERT INTO "StartupBusinessType" (id, name, "sortOrder", "isActive", "createdAt")
      VALUES (gen_random_uuid(), ${name.trim()}, ${(maxOrder[0] as any).next}, true, NOW())
    `;

    revalidatePath('/startups-dir/manage');
    await refreshPublic(['startups', 'funding', 'india-ai', 'home']); return { success: true };
  } catch (error: any) {
    console.error('addBusinessTypeAction error:', error);
    return { success: false, error: error.message || 'Failed to add business type' };
  }
}

export async function updateBusinessTypeAction(oldName: string, newName: string) {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };
  try {
    if (!newName.trim()) return { success: false, error: 'Name is required' };

    await sql`
      UPDATE "StartupBusinessType" SET name = ${newName.trim()} WHERE name = ${oldName}
    `;

    await sql`
      UPDATE "Startup" SET "businessType" = ${newName.trim()} WHERE "businessType" = ${oldName}
    `;

    revalidatePath('/startups-dir/manage');
    await refreshPublic(['startups', 'funding', 'india-ai', 'home']); return { success: true };
  } catch (error: any) {
    console.error('updateBusinessTypeAction error:', error);
    return { success: false, error: error.message || 'Failed to update business type' };
  }
}

export async function deleteBusinessTypeAction(name: string) {
  const { error } = await requireActionAuth(['SUPER_ADMIN']);
  if (error) return { success: false, error };
  try {
    const count = await sql`
      SELECT COUNT(*)::int AS count FROM "Startup" WHERE "businessType" = ${name} AND "deletedAt" IS NULL
    `;
    if ((count[0] as any).count > 0) {
      return { success: false, error: `Cannot delete: ${(count[0] as any).count} startup(s) use this type. Reassign them first.` };
    }

    await sql`DELETE FROM "StartupBusinessType" WHERE name = ${name}`;

    revalidatePath('/startups-dir/manage');
    await refreshPublic(['startups', 'funding', 'india-ai', 'home']); return { success: true };
  } catch (error: any) {
    console.error('deleteBusinessTypeAction error:', error);
    return { success: false, error: error.message || 'Failed to delete business type' };
  }
}

export async function toggleBusinessTypeAction(name: string, isActive: boolean) {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };
  try {
    await sql`UPDATE "StartupBusinessType" SET "isActive" = ${isActive} WHERE name = ${name}`;
    revalidatePath('/startups-dir/manage');
    await refreshPublic(['startups', 'funding', 'india-ai', 'home']); return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ─── Get canonical lists (for dropdowns) ────────────────────────────────────

export async function getCanonicalCategoriesAction() {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };
  try {
    const rows = await sql`
      SELECT name, "sortOrder", "isActive" FROM "StartupBusinessCategory" ORDER BY "sortOrder" ASC, name ASC
    `;
    return rows;
  } catch (error) {
    console.error('getCanonicalCategoriesAction error:', error);
    return [];
  }
}

export async function getCanonicalTypesAction() {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };
  try {
    const rows = await sql`
      SELECT name, "sortOrder", "isActive" FROM "StartupBusinessType" ORDER BY "sortOrder" ASC, name ASC
    `;
    return rows;
  } catch (error) {
    console.error('getCanonicalTypesAction error:', error);
    return [];
  }
}
