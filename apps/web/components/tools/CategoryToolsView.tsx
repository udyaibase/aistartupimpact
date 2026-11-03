'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { ChevronRight } from 'lucide-react';

// Same list as /tools (cards with save, compare, upvote and tags), limited to one parent category.
const ToolsListWithComparison = dynamic(() => import('@/components/ToolsListWithComparison'), {
  loading: () => <div className="h-96 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />,
});

interface CategoryInfo { name: string; slug: string; description?: string | null }

interface Props {
  parent: CategoryInfo;
  subcategories: CategoryInfo[];
  /** Set on a subcategory page. */
  initialSubcategory: string | null;
  tools: any[];
  tagGroups: any[];
  toolTagMap: Record<string, string[]>;
}

/**
 * A tool category page. Parent and subcategory pages both list the parent's tools, so the subcategory pills switch
 * instantly; the heading, breadcrumb and URL follow the selected subcategory (each URL is still its own page).
 */
export default function CategoryToolsView({ parent, subcategories, initialSubcategory, tools, tagGroups, toolTagMap }: Props) {
  const [current, setCurrent] = useState<string | null>(initialSubcategory);
  const sub = current ? subcategories.find((c) => c.slug === current) : undefined;
  const shown = sub ?? parent;

  const onSubcategoryChange = useCallback((slug: string) => {
    const next = slug === 'all' ? null : slug;
    setCurrent(next);
    const url = `/tools/category/${next ?? parent.slug}`;
    if (window.location.pathname === url) return;
    window.history.replaceState(window.history.state, '', url);
    const name = (next && subcategories.find((c) => c.slug === next)?.name) || parent.name;
    document.title = document.title.replace(/^Best .+? AI Tools/, `Best ${name} AI Tools`);
  }, [parent.slug, parent.name, subcategories]);

  return (
    <>
      <nav className="flex items-center gap-1.5 text-xs font-jakarta text-gray-400 mb-6">
        <Link href="/" className="hover:text-brand">Home</Link>
        <ChevronRight className="w-3 h-3" />
        <Link href="/tools" className="hover:text-brand">Tools</Link>
        <ChevronRight className="w-3 h-3" />
        {sub ? (
          <>
            <Link href={`/tools/category/${parent.slug}`} className="hover:text-brand">{parent.name}</Link>
            <ChevronRight className="w-3 h-3" />
            <span className="text-gray-600 dark:text-gray-300">{sub.name}</span>
          </>
        ) : (
          <span className="text-gray-600 dark:text-gray-300">{parent.name}</span>
        )}
      </nav>

      <div className="mb-4 sm:mb-6">
        <h1 className="font-sora font-extrabold text-2xl md:text-3xl text-navy dark:text-white">{shown.name} AI Tools</h1>
        {shown.description && (
          <p className="text-gray-500 dark:text-gray-400 font-jakarta text-sm mt-2 max-w-3xl">{shown.description}</p>
        )}
      </div>

      {tools.length > 0 ? (
        <ToolsListWithComparison
          picks={tools}
          tagGroups={tagGroups}
          toolTagMap={toolTagMap}
          scopeCategory={parent.slug}
          initialSubcategory={initialSubcategory}
          onSubcategoryChange={onSubcategoryChange}
        />
      ) : (
        <div className="text-center py-16 text-gray-400 font-jakarta">No tools in this category yet.</div>
      )}
    </>
  );
}
