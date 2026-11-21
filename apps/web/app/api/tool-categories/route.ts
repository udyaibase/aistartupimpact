import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const format = searchParams.get('format') || 'flat'; // 'flat' | 'tree'

  try {
    if (format === 'tree') {
      // Return hierarchical structure: parents with nested subcategories
      const parents = await prisma.$queryRaw<any[]>`
        SELECT id, name, slug, icon, description, "toolCount", "sortOrder"
        FROM "ToolCategory"
        WHERE level = 0 AND "isActive" = true
        ORDER BY "sortOrder" ASC
      `;
      const subcategories = await prisma.$queryRaw<any[]>`
        SELECT id, name, slug, description, "parentId", "toolCount", "sortOrder"
        FROM "ToolCategory"
        WHERE level = 1 AND "isActive" = true
        ORDER BY "sortOrder" ASC, name ASC
      `;

      // Group subcategories by parentId
      const subsByParent = new Map<string, any[]>();
      for (const sub of subcategories) {
        const pid = sub.parentId;
        if (!subsByParent.has(pid)) subsByParent.set(pid, []);
        subsByParent.get(pid)!.push(sub);
      }

      const tree = parents.map((p: any) => ({
        ...p,
        subcategories: subsByParent.get(p.id) || [],
      }));

      return NextResponse.json({ success: true, categories: tree });
    }

    // Default: flat list of subcategories only (for backwards compatibility with forms)
    const categories = await prisma.$queryRaw<any[]>`
      SELECT c.id, c.name, c.slug, c."parentId",
             p.name AS "parentName", p.slug AS "parentSlug", p.icon AS "parentIcon"
      FROM "ToolCategory" c
      LEFT JOIN "ToolCategory" p ON p.id = c."parentId"
      WHERE c.level = 1 AND c."isActive" = true
      ORDER BY p."sortOrder" ASC, c."sortOrder" ASC, c.name ASC
    `;

    // No subcategories set up yet (a fresh database, or a flat list): offer the top-level categories instead,
    // so the tool form never shows an empty category list that blocks listing a tool.
    if (categories.length === 0) {
      const topLevel = await prisma.$queryRaw<any[]>`
        SELECT id, name, slug, NULL AS "parentId", NULL AS "parentName", NULL AS "parentSlug", NULL AS "parentIcon"
        FROM "ToolCategory"
        WHERE level = 0 AND "isActive" = true
        ORDER BY "sortOrder" ASC, name ASC
      `;
      return NextResponse.json({ success: true, categories: topLevel });
    }

    return NextResponse.json({ success: true, categories });
  } catch (error: any) {
    console.error('Error fetching tool categories:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch categories', categories: [] },
      { status: 500 }
    );
  }
}
