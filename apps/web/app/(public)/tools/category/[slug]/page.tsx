import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import CategoryToolsView from '@/components/tools/CategoryToolsView';
import { getDirectoryToolsDirect, getToolTagGroupsForFilterDirect, getToolTagMappingsDirect } from '@/lib/db';
import { sql } from '@/lib/db';

export const revalidate = 86400;

// Pages are built on first visit and then cached (no list at build time); refreshed when content changes.
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata(props: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const params = await props.params;
  const categories = await sql`
    SELECT name, description FROM "ToolCategory" WHERE slug = ${params.slug} AND "isActive" = true LIMIT 1
  `;
  if (categories.length === 0) return { title: 'Category Not Found' };
  const cat = categories[0] as any;
  const title = `Best ${cat.name} AI Tools — Reviewed & Rated`;
  const description = cat.description || `Discover the best ${cat.name} AI tools. Compare features, pricing, and reviews.`;
  return {
    title,
    description,
    alternates: { canonical: `https://udyaibase.com/tools/category/${params.slug}` },
    openGraph: { title, description, type: 'website' },
  };
}

export default async function CategoryPage(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  // Get category info
  const categories = await sql`
    SELECT id, name, slug, description, level, "parentId"
    FROM "ToolCategory"
    WHERE slug = ${params.slug} AND "isActive" = true
    LIMIT 1
  `;

  if (categories.length === 0) notFound();
  const category = categories[0] as any;

  // Parent and subcategory pages both show the parent's tools; a subcategory page starts filtered to itself.
  let parent = category;
  if (category.level !== 0 && category.parentId) {
    const rows = await sql`
      SELECT id, name, slug, description FROM "ToolCategory" WHERE id = ${category.parentId} AND "isActive" = true LIMIT 1
    `;
    if (rows.length > 0) parent = rows[0];
  }
  const isSubPage = parent.id !== category.id;

  const [subcategories, tools, tagGroups, allTagMap] = await Promise.all([
    sql`
      SELECT name, slug, description FROM "ToolCategory"
      WHERE "parentId" = ${parent.id} AND "isActive" = true
      ORDER BY "sortOrder" ASC, name ASC
    `,
    getDirectoryToolsDirect(parent.slug),
    getToolTagGroupsForFilterDirect(),
    getToolTagMappingsDirect(),
  ]);

  // Only send this category's tag mappings to the browser.
  const toolTagMap: Record<string, string[]> = {};
  for (const t of tools as any[]) if (allTagMap[t.id]) toolTagMap[t.id] = allTagMap[t.id];
  // And only the tags those tools use: the filters never show a tag no tool here has.
  const usedTags = new Set(Object.values(toolTagMap).flat());
  const categoryTagGroups = (tagGroups as any[])
    .map((g) => ({ ...g, tags: g.tags.filter((t: any) => usedTags.has(t.id)) }))
    .filter((g) => g.tags.length > 0);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 pb-24 sm:pb-10">
      <CategoryToolsView
        parent={{ name: parent.name, slug: parent.slug, description: parent.description }}
        subcategories={(subcategories as any[]).map((c) => ({ name: c.name, slug: c.slug, description: c.description }))}
        initialSubcategory={isSubPage ? category.slug : null}
        tools={tools as any[]}
        tagGroups={categoryTagGroups}
        toolTagMap={toolTagMap}
      />
    </div>
  );
}
