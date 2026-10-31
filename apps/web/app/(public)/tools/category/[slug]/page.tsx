import Link from 'next/link';
import Image from 'next/image';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Star, ChevronRight } from 'lucide-react';
import { getDirectoryToolsDirect } from '@/lib/db';
import { sql } from '@/lib/db';
export const revalidate = 60;

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

  // Get subcategories if this is a parent
  let subcategories: any[] = [];
  if (category.level === 0) {
    subcategories = await sql`
      SELECT name, slug, "toolCount" FROM "ToolCategory"
      WHERE "parentId" = ${category.id} AND "isActive" = true
      ORDER BY "sortOrder" ASC, name ASC
    `;
  }

  // Get tools in this category
  const tools = await getDirectoryToolsDirect(params.slug);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs font-jakarta text-gray-400 mb-6">
        <Link href="/" className="hover:text-brand">Home</Link>
        <ChevronRight className="w-3 h-3" />
        <Link href="/tools" className="hover:text-brand">Tools</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-gray-600 dark:text-gray-300">{category.name}</span>
      </nav>

      {/* Header */}
      <div className="mb-6">
        <h1 className="font-sora font-extrabold text-2xl md:text-3xl text-navy dark:text-white">
          {category.name} AI Tools
        </h1>
        {category.description && (
          <p className="text-gray-500 dark:text-gray-400 font-jakarta text-sm mt-2 max-w-3xl">{category.description}</p>
        )}
      </div>

      {/* Subcategory pills */}
      {subcategories.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          {subcategories.map((sub: any) => (
            <Link
              key={sub.slug}
              href={`/tools/category/${sub.slug}`}
              className="px-3 py-1.5 rounded-full text-xs font-semibold font-jakarta bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-brand/10 hover:text-brand border border-transparent hover:border-brand/20 transition-all"
            >
              {sub.name} {sub.toolCount > 0 && <span className="text-gray-400 ml-1">({sub.toolCount})</span>}
            </Link>
          ))}
        </div>
      )}

      {/* Tools Grid */}
      {tools.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {tools.map((tool: any) => (
            <Link
              key={tool.slug}
              href={`/tools/${tool.slug}`}
              className="group block rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 hover:border-brand/30 hover:shadow-md transition-all"
            >
              <div className="flex items-start gap-3 mb-2">
                <div className="w-9 h-9 rounded-lg bg-gray-50 dark:bg-gray-800 flex items-center justify-center shrink-0 overflow-hidden border border-gray-100 dark:border-gray-700">
                  {tool.logoUrl ? (
                    <Image src={tool.logoUrl} alt={tool.name} width={28} height={28} sizes="28px" className="w-7 h-7 object-contain" />
                  ) : (
                    <span className="text-xs font-bold text-brand">{tool.name.charAt(0)}</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-sora font-bold text-sm text-navy dark:text-white group-hover:text-brand transition-colors truncate">{tool.name}</h3>
                  <p className="text-xs text-gray-400 font-jakarta">{tool.category}</p>
                </div>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-jakarta line-clamp-2 mb-3">{tool.tagline}</p>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                  <span className="text-xs font-bold text-gray-600">{tool.rating}</span>
                </div>
                <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 uppercase">{tool.pricing}</span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="text-center py-16 text-gray-400 font-jakarta">
          No tools in this category yet.
        </div>
      )}
    </div>
  );
}
