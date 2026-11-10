/** Filter options and counts for the /tools list, computed from the full directory. Safe for client and server. */

interface FacetTool {
  id: string;
  category: string;
  categorySlug: string;
  parentCategory?: string | null;
  parentCategorySlug?: string | null;
  pricing: string;
  rating: number;
}

export interface CategoryFacet { name: string; slug: string; count: number }

export interface ToolFacets {
  total: number;
  parentCategories: CategoryFacet[];
  subcategoriesByParent: Record<string, CategoryFacet[]>;
  tagCounts: [string, number][];
  pricingModels: string[];
}

const byCount = (a: CategoryFacet, b: CategoryFacet) => b.count - a.count;

export function computeToolFacets(tools: FacetTool[], toolTagMap: Record<string, string[]>): ToolFacets {
  const parents = new Map<string, CategoryFacet>();
  const subs = new Map<string, Map<string, CategoryFacet>>();
  const tagCounts = new Map<string, number>();
  const pricing = new Set<string>();

  for (const t of tools) {
    const parentSlug = t.parentCategorySlug || t.categorySlug;
    const parent = parents.get(parentSlug);
    if (parent) parent.count++;
    else parents.set(parentSlug, { name: t.parentCategory || t.category, slug: parentSlug, count: 1 });

    let subMap = subs.get(parentSlug);
    if (!subMap) subs.set(parentSlug, (subMap = new Map()));
    const sub = subMap.get(t.categorySlug);
    if (sub) sub.count++;
    else subMap.set(t.categorySlug, { name: t.category, slug: t.categorySlug, count: 1 });

    for (const id of toolTagMap[t.id] || []) tagCounts.set(id, (tagCounts.get(id) || 0) + 1);
    pricing.add(t.pricing);
  }

  const subcategoriesByParent: Record<string, CategoryFacet[]> = {};
  for (const [slug, m] of subs) subcategoriesByParent[slug] = Array.from(m.values()).sort(byCount);

  return {
    total: tools.length,
    parentCategories: Array.from(parents.values()).sort(byCount),
    subcategoriesByParent,
    tagCounts: Array.from(tagCounts.entries()),
    pricingModels: Array.from(pricing).sort(),
  };
}

interface TrimTagGroup { maxVisibleDefault: number; tags: { id: string }[] }

/**
 * The tag groups the first tools need: each group's tags shown before "show all" (in use, in group order) plus the
 * two tags each of those tools shows on its card. The full groups load with the rest of the directory.
 */
export function trimTagGroups<G extends TrimTagGroup>(
  groups: G[], facets: ToolFacets, tools: { id: string }[], toolTagMap: Record<string, string[]>,
): G[] {
  const counts = new Map(facets.tagCounts);
  const cardTags = new Set(tools.flatMap((t) => (toolTagMap[t.id] || []).slice(0, 2)));
  return groups.map((g) => {
    const shown = new Set(g.tags.filter((t) => (counts.get(t.id) || 0) > 0).slice(0, g.maxVisibleDefault).map((t) => t.id));
    return { ...g, tags: g.tags.filter((t) => shown.has(t.id) || cardTags.has(t.id)) };
  });
}

/** The first `n` tools in the list's default order (top rated; ties keep directory order, like the client sort). */
export function topRated<T extends { rating: number }>(tools: T[], n: number): T[] {
  return [...tools].sort((a, b) => b.rating - a.rating).slice(0, n);
}
