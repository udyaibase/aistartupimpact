'use client';

import React, { useState, useMemo, useRef, useEffect, useDeferredValue, useCallback } from 'react';
import IntentLink from '@/components/IntentLink';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useListRestore } from '@/hooks/useListRestore';
import { Star, Zap, ArrowRight, CheckSquare, Square, X, BarChart, Search, Grid3X3, List, Loader2, SlidersHorizontal, ChevronDown, ChevronRight, SearchX } from 'lucide-react';
import BookmarkButton from './BookmarkButton';
import UpvoteButton from './tools/UpvoteButton';
import { useHeadroomBar } from '@/hooks/useHeadroomBar';
import BottomSheet from './ui/BottomSheet';
import FilterList, { type FilterRow } from './ui/FilterList';
import SmartSearchBox, { type SearchSuggestion } from './search/SmartSearchBox';
import { indexTools, searchTools } from '@/lib/search/tool-search';
import { removeChipFromQuery } from '@/lib/search/understand';
import type { ToolFacets } from '@/lib/tools/facets';
import { compareHref } from '@/lib/tools/compare-slug';

const TOOL_EXAMPLES = [
  'Free AI tool to write blog posts',
  'Generate images from text',
  'Code assistant with API',
  'Summarize long PDFs',
  'Open source chatbot',
  'Turn meetings into notes',
];

interface ToolPick {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  category: string;
  categorySlug: string;
  parentCategory?: string | null;
  parentCategorySlug?: string | null;
  rating: number;
  pricing: string;
  verdict: string;
  logoUrl?: string;
  hasApi?: boolean;
  hasMobileApp?: boolean;
  freeTrialDays?: number | null;
  upvoteCount?: number;
  launchYear?: number;
  country?: string;
  founderNames?: string[];
}

interface TagItem {
  id: string;
  name: string;
  slug: string;
  emoji: string | null;
  groupId: string;
  sortOrder: number;
  tagCount: number;
}

interface TagGroupItem {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  description: string | null;
  sortOrder: number;
  displayMode: string;
  maxVisibleDefault: number;
  tags: TagItem[];
}

interface ToolsListProps {
  picks: ToolPick[];
  tagGroups?: TagGroupItem[];
  toolTagMap?: Record<string, string[]>;
  initialTagId?: string | null;
  initialPricing?: string | null;
  /** Set on a category page: `picks` are already that category's tools, so the parent-category pills are hidden
   *  and filtering starts (and resets) inside this parent category. */
  scopeCategory?: string | null;
  /** Subcategory selected on first render (a subcategory page shows its parent's tools, filtered to it). */
  initialSubcategory?: string | null;
  /** Called whenever the selected subcategory changes ('all' for none). */
  onSubcategoryChange?: (slug: string) => void;
  /**
   * Set on /tools: `picks` is only the first, top-rated part of the directory and `fullDataUrl` returns all of it
   * (`{ tools, toolTagMap }`). It is loaded the first time the visitor interacts with the list; until then the
   * filter options and counts come from `facets` (computed from the full directory on the server).
   */
  fullDataUrl?: string;
  facets?: ToolFacets;
}

type SortOption = 'relevance' | 'rating' | 'upvotes' | 'name' | 'newest';
const SORT_OPTIONS: SortOption[] = ['relevance', 'rating', 'upvotes', 'name', 'newest'];
type ViewMode = 'grid' | 'list';

const ITEMS_PER_PAGE = 30;

// Primary filter groups shown expanded by default (sortOrder 1-4)
const PRIMARY_GROUP_SLUGS = ['pricing-access', 'platform-access', 'target-user', 'ai-model-technology'];

export default function ToolsListWithComparison({ picks: firstPicks, tagGroups: firstTagGroups = [], toolTagMap: firstTagMap = {}, initialTagId, initialPricing, scopeCategory, initialSubcategory, onSubcategoryChange, fullDataUrl, facets }: ToolsListProps) {
  const defaultCategory = scopeCategory || 'all';
  const router = useRouter();
  const [full, setFull] = useState<{ tools: ToolPick[]; toolTagMap: Record<string, string[]>; tagGroups: TagGroupItem[] } | null>(null);
  const [loadingFull, setLoadingFull] = useState(false);
  const fullRequested = useRef(false);
  /** A ?tag=<slug> link waiting for the full tag list. */
  const pendingTagSlug = useRef<string | null>(null);
  const picks = full?.tools ?? firstPicks;
  const toolTagMap = full?.toolTagMap ?? firstTagMap;
  const tagGroups = full?.tagGroups ?? firstTagGroups;
  /** Only the first tools are loaded so far (see `fullDataUrl`). */
  const partial = !!fullDataUrl && !full;
  const ensureFull = useCallback(() => {
    if (!fullDataUrl || fullRequested.current) return;
    fullRequested.current = true;
    setLoadingFull(true);
    fetch(fullDataUrl)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`directory ${res.status}`))))
      .then((data) => setFull({ tools: data.tools || [], toolTagMap: data.toolTagMap || {}, tagGroups: data.tagGroups || firstTagGroups }))
      .catch(() => { fullRequested.current = false; })
      .finally(() => setLoadingFull(false));
  }, [fullDataUrl, firstTagGroups]);
  const [selectedTools, setSelectedTools] = useState<ToolPick[]>([]);
  const [categoryBeforeCompare, setCategoryBeforeCompare] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(defaultCategory);
  const [selectedSubcategory, setSelectedSubcategory] = useState(initialSubcategory || 'all');
  const [selectedPricing, setSelectedPricing] = useState(initialPricing || 'all');
  const [sortBy, setSortBy] = useState<SortOption>('rating');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [visibleCount, setVisibleCount] = useState(ITEMS_PER_PAGE);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(initialTagId ? [initialTagId] : []);
  const [freeTrialOnly, setFreeTrialOnly] = useState(false);
  const [showMoreFilters, setShowMoreFilters] = useState(!!initialTagId);
  const [expandedFilterGroups, setExpandedFilterGroups] = useState<Set<string>>(
    new Set(PRIMARY_GROUP_SLUGS)
  );
  const [showAllInGroup, setShowAllInGroup] = useState<Set<string>>(new Set());
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const parentPillsRef = useRef<HTMLDivElement>(null);
  const subPillsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const wheelHandler = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        (e.currentTarget as HTMLDivElement).scrollLeft += e.deltaY;
        e.preventDefault();
      }
    };

    function addDragScroll(el: HTMLDivElement) {
      let isDown = false;
      let startX = 0;
      let scrollStart = 0;

      const onDown = (e: MouseEvent) => {
        isDown = true;
        startX = e.pageX;
        scrollStart = el.scrollLeft;
        el.style.cursor = 'grabbing';
        el.style.userSelect = 'none';
      };
      const onMove = (e: MouseEvent) => {
        if (!isDown) return;
        e.preventDefault();
        el.scrollLeft = scrollStart - (e.pageX - startX);
      };
      const onUp = () => {
        if (!isDown) return;
        isDown = false;
        el.style.cursor = 'grab';
        el.style.removeProperty('user-select');
      };

      el.style.cursor = 'grab';
      el.addEventListener('mousedown', onDown);
      el.addEventListener('mousemove', onMove);
      el.addEventListener('mouseup', onUp);
      el.addEventListener('mouseleave', onUp);
      return () => {
        el.style.removeProperty('cursor');
        el.removeEventListener('mousedown', onDown);
        el.removeEventListener('mousemove', onMove);
        el.removeEventListener('mouseup', onUp);
        el.removeEventListener('mouseleave', onUp);
      };
    }

    const opts = { passive: false } as AddEventListenerOptions;
    const el1 = parentPillsRef.current;
    const el2 = subPillsRef.current;
    el1?.addEventListener('wheel', wheelHandler, opts);
    el2?.addEventListener('wheel', wheelHandler, opts);
    const cleanDrag1 = el1 ? addDragScroll(el1) : undefined;
    const cleanDrag2 = el2 ? addDragScroll(el2) : undefined;
    return () => {
      el1?.removeEventListener('wheel', wheelHandler);
      el2?.removeEventListener('wheel', wheelHandler);
      cleanDrag1?.();
      cleanDrag2?.();
    };
  });

  // Get parent categories with counts
  const parentCategories = useMemo(() => {
    if (partial && facets) return facets.parentCategories;
    const catMap = new Map<string, { name: string; slug: string; count: number }>();
    picks.forEach(p => {
      const slug = p.parentCategorySlug || p.categorySlug;
      const name = p.parentCategory || p.category;
      const existing = catMap.get(slug);
      if (existing) {
        existing.count++;
      } else {
        catMap.set(slug, { name, slug, count: 1 });
      }
    });
    return Array.from(catMap.values()).sort((a, b) => b.count - a.count);
  }, [picks, partial, facets]);

  // Get subcategories for selected parent
  const subcategories = useMemo(() => {
    if (selectedCategory === 'all') return [];
    if (partial && facets) return facets.subcategoriesByParent[selectedCategory] || [];
    const subMap = new Map<string, { name: string; slug: string; count: number }>();
    picks.forEach(p => {
      const parentSlug = p.parentCategorySlug || p.categorySlug;
      if (parentSlug === selectedCategory) {
        const existing = subMap.get(p.categorySlug);
        if (existing) existing.count++;
        else subMap.set(p.categorySlug, { name: p.category, slug: p.categorySlug, count: 1 });
      }
    });
    return Array.from(subMap.values()).sort((a, b) => b.count - a.count);
  }, [picks, selectedCategory, partial, facets]);

  // Tag counts for the tools on this page (a category page shows fewer tools than the site-wide counts).
  const tagCounts = useMemo(() => {
    if (partial && facets) return new Map(facets.tagCounts);
    const counts = new Map<string, number>();
    for (const p of picks) for (const id of toolTagMap[p.id] || []) counts.set(id, (counts.get(id) || 0) + 1);
    return counts;
  }, [picks, toolTagMap, partial, facets]);

  const pricingModels = useMemo(() => {
    if (partial && facets) return facets.pricingModels;
    return Array.from(new Set(picks.map(p => p.pricing))).sort();
  }, [picks, partial, facets]);

  // Relevance search: index once per tool list, rank on every (deferred) keystroke.
  const tagNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of tagGroups) for (const t of g.tags) m.set(t.id, t.name);
    return m;
  }, [tagGroups]);
  const toolIndex = useMemo(
    () => indexTools(picks, (tool) => (toolTagMap[tool.id] || []).map((id) => tagNameById.get(id) || '').filter(Boolean)),
    [picks, toolTagMap, tagNameById],
  );
  const deferredQuery = useDeferredValue(searchQuery);
  const searchResult = useMemo(
    () => (deferredQuery.trim() ? searchTools(toolIndex, deferredQuery) : null),
    [toolIndex, deferredQuery],
  );

  // "Best match" only means something while searching (e.g. after "Clear all" it falls back to Top Rated).
  const effectiveSort: SortOption = sortBy === 'relevance' && !searchResult ? 'rating' : sortBy;

  // Filter and sort tools
  const filteredTools = useMemo(() => {
    let result = (searchResult ? searchResult.tools : picks).filter(tool => {
      const matchesCategory = selectedCategory === 'all' || 
        (tool.parentCategorySlug || tool.categorySlug) === selectedCategory;
      const matchesSubcategory = selectedSubcategory === 'all' || tool.categorySlug === selectedSubcategory;
      const matchesPricing = selectedPricing === 'all' || tool.pricing === selectedPricing;

      // Free Trial filter
      const matchesTrial = !freeTrialOnly || (tool.freeTrialDays && tool.freeTrialDays > 0);

      // Tag filtering: within a group → OR, across groups → AND
      let matchesTags = true;
      if (selectedTagIds.length > 0) {
        const toolTags = new Set(toolTagMap[tool.id] || []);
        // Group selected tags by their group
        const selectedByGroup = new Map<string, string[]>();
        for (const tagId of selectedTagIds) {
          // Find which group this tag belongs to
          for (const group of tagGroups) {
            const tag = group.tags.find((t: TagItem) => t.id === tagId);
            if (tag) {
              if (!selectedByGroup.has(group.id)) selectedByGroup.set(group.id, []);
              selectedByGroup.get(group.id)!.push(tagId);
              break;
            }
          }
        }
        // AND across groups: tool must match at least one tag from each group
        for (const [, groupTagIds] of selectedByGroup) {
          const hasAny = groupTagIds.some(tid => toolTags.has(tid));
          if (!hasAny) {
            matchesTags = false;
            break;
          }
        }
      }

      return matchesCategory && matchesSubcategory && matchesPricing && matchesTrial && matchesTags;
    });

    // Sort ('relevance' keeps the search ranking)
    switch (effectiveSort) {
      case 'rating':
        result.sort((a, b) => b.rating - a.rating);
        break;
      case 'upvotes':
        result.sort((a, b) => (b.upvoteCount || 0) - (a.upvoteCount || 0));
        break;
      case 'name':
        result.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'newest':
        result.sort((a, b) => (b.launchYear || 0) - (a.launchYear || 0));
        break;
    }

    return result;
  }, [picks, searchResult, selectedCategory, selectedSubcategory, selectedPricing, effectiveSort, selectedTagIds, freeTrialOnly, toolTagMap, tagGroups]);

  // Until the full directory arrives, filters and other sorts can't be applied to the first tools alone: those
  // stay on screen (with a loading note) and the chosen filters apply as soon as everything is loaded.
  const filtersActive = !!searchQuery.trim() || selectedCategory !== defaultCategory
    || selectedSubcategory !== (initialSubcategory || 'all') || selectedPricing !== 'all'
    || selectedTagIds.length > 0 || freeTrialOnly || effectiveSort !== 'rating';
  const waitingForFull = partial && filtersActive;

  useEffect(() => {
    if (filtersActive || visibleCount > firstPicks.length) ensureFull();
  }, [filtersActive, visibleCount, firstPicks.length, ensureFull]);

  // Paginated tools
  const visibleTools = useMemo(() => {
    return (waitingForFull ? firstPicks : filteredTools).slice(0, visibleCount);
  }, [waitingForFull, firstPicks, filteredTools, visibleCount]);

  const matchingCount = partial ? (waitingForFull ? null : facets?.total ?? firstPicks.length) : filteredTools.length;
  const hasMore = visibleCount < (matchingCount ?? firstPicks.length);

  const searchSuggestions = useMemo<SearchSuggestion[]>(() => {
    if (!searchQuery.trim()) return [];
    return filteredTools.slice(0, 5).map((t) => ({
      key: t.id,
      title: t.name,
      subtitle: [t.category, t.pricing].filter(Boolean).join(' · '),
      logoUrl: t.logoUrl,
      href: `/tools/${t.slug}`,
    }));
  }, [searchQuery, filteredTools]);

  // Reset pagination when filters change
  const handleCategoryChange = (slug: string) => {
    setSelectedCategory(slug);
    setSelectedSubcategory('all'); // Reset subcategory when parent changes
    setVisibleCount(ITEMS_PER_PAGE);
  };

  const handleSubcategoryChange = (slug: string) => {
    setSelectedSubcategory(slug);
    setVisibleCount(ITEMS_PER_PAGE);
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    // Searching ranks by best match; clearing the search goes back to the default order.
    if (value.trim() && sortBy === 'rating') setSortBy('relevance');
    if (!value.trim() && sortBy === 'relevance') setSortBy('rating');
    setVisibleCount(ITEMS_PER_PAGE);
  };

  const compareCategory = selectedTools.length > 0
    ? (selectedTools[0].parentCategorySlug || selectedTools[0].categorySlug)
    : null;

  const toggleTool = (tool: ToolPick, e: React.MouseEvent) => {
    e.preventDefault();
    if (selectedTools.find((t) => t.slug === tool.slug)) {
      const remaining = selectedTools.filter((t) => t.slug !== tool.slug);
      setSelectedTools(remaining);
      if (remaining.length === 0 && categoryBeforeCompare !== null) {
        setSelectedCategory(categoryBeforeCompare);
        setSelectedSubcategory('all');
        setCategoryBeforeCompare(null);
      }
    } else {
      const toolCat = tool.parentCategorySlug || tool.categorySlug;
      if (compareCategory && toolCat !== compareCategory) {
        setToastMessage("You can only compare tools in the same category.");
        setTimeout(() => setToastMessage(null), 3000);
        return;
      }
      if (selectedTools.length < 3) {
        if (selectedTools.length === 0) {
          setCategoryBeforeCompare(selectedCategory);
          setSelectedCategory(toolCat);
          setSelectedSubcategory('all');
          setVisibleCount(ITEMS_PER_PAGE);
        }
        setSelectedTools([...selectedTools, tool]);
      } else {
        setToastMessage("You can compare up to 3 tools at a time.");
        setTimeout(() => setToastMessage(null), 3000);
      }
    }
  };

  // Mirror the filters into the URL (replace, not push: filtering doesn't add history entries). The path is left
  // alone, since category pages put the subcategory there themselves.
  const filterQuery = useMemo(() => {
    const params = new URLSearchParams();
    const put = (k: string, v: string, fallback = '') => { if (v && v !== fallback) params.set(k, v); };
    put('q', searchQuery.trim());
    if (!scopeCategory) put('category', selectedCategory, 'all');
    if (!onSubcategoryChange) put('sub', selectedSubcategory, 'all');
    put('pricing', selectedPricing, 'all');
    put('tags', selectedTagIds.join(','));
    put('trial', freeTrialOnly ? '1' : '');
    put('sort', sortBy, searchQuery.trim() ? 'relevance' : 'rating');
    put('view', viewMode, 'grid');
    return params.toString();
  }, [searchQuery, selectedCategory, selectedSubcategory, selectedPricing, selectedTagIds, freeTrialOnly, sortBy, viewMode, scopeCategory, onSubcategoryChange]);

  // Filters live in the URL, so Back from a tool, a refresh or a shared link shows the same list. They are read
  // after mounting (category pages are pre-rendered, so the server can't know them), and the URL isn't written
  // until it has been read.
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const q = sp.get('q');
    if (q) setSearchQuery(q);
    if (!scopeCategory && sp.get('category')) setSelectedCategory(sp.get('category')!);
    if (!onSubcategoryChange && sp.get('sub')) setSelectedSubcategory(sp.get('sub')!);
    if (sp.get('pricing')) setSelectedPricing(sp.get('pricing')!);
    const s = sp.get('sort');
    if (s && SORT_OPTIONS.includes(s as SortOption)) setSortBy(s as SortOption);
    else if (q) setSortBy('relevance');
    if (sp.get('view') === 'list') setViewMode('list');
    const tags = sp.get('tags')?.split(',').filter(Boolean);
    if (tags?.length) setSelectedTagIds(tags);
    // Older links name one tag by slug (?tag=chatbots); it may only be in the full tag list.
    const tagSlug = sp.get('tag');
    if (!tags?.length && tagSlug) { pendingTagSlug.current = tagSlug; ensureFull(); }
    if (sp.get('trial') === '1') setFreeTrialOnly(true);
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const slug = pendingTagSlug.current;
    const tag = slug ? tagGroups.flatMap((g) => g.tags).find((t) => t.slug === slug) : undefined;
    if (!tag) return;
    pendingTagSlug.current = null;
    setSelectedTagIds([tag.id]);
    setShowMoreFilters(true);
  }, [tagGroups]);

  // Skip the first run: it happens with the defaults, before the URL's filters above are applied.
  const firstSync = useRef(true);
  useEffect(() => {
    if (firstSync.current) { firstSync.current = false; return; }
    const url = `${window.location.pathname}${filterQuery ? `?${filterQuery}` : ''}`;
    if (url !== window.location.pathname + window.location.search) window.history.replaceState(window.history.state, '', url);
  }, [filterQuery]);

  // Back from a tool (or a refresh) shows as many tools as before, at the same scroll position.
  useListRestore('tools', filterQuery, visibleCount, (n) => setVisibleCount(Math.max(ITEMS_PER_PAGE, Math.min(n, 2000))));

  const onSubcategoryChangeRef = useRef(onSubcategoryChange);
  onSubcategoryChangeRef.current = onSubcategoryChange;
  useEffect(() => { onSubcategoryChangeRef.current?.(selectedSubcategory); }, [selectedSubcategory]);

  // Sticky search & filter bar (same behaviour as the startups directory).
  const resultsRow = (
        <div className="flex items-center justify-between gap-3 text-[13px] sm:text-sm text-gray-500 dark:text-gray-400 font-jakarta">
          <p aria-live="polite">
            {matchingCount === null ? (
              <span className="inline-flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading all tools…</span>
            ) : (
              <>
                Found <span className="font-semibold sm:font-bold text-navy dark:text-white">{matchingCount}</span> {matchingCount === 1 ? 'tool' : 'tools'}
                {hasMore && <span className="ml-1 text-gray-400">· showing {Math.min(visibleCount, visibleTools.length)}</span>}
              </>
            )}
          </p>
          <div role="group" aria-label="View" className="flex items-center gap-1.5">
            <button
              onClick={() => setViewMode('grid')}
              aria-pressed={viewMode === 'grid'}
              className={`btn-icon w-8 h-8 sm:w-9 sm:h-9 ${viewMode === 'grid' ? 'btn-icon-active' : ''}`}
              aria-label="Grid view"
            >
              <Grid3X3 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              aria-pressed={viewMode === 'list'}
              className={`btn-icon w-8 h-8 sm:w-9 sm:h-9 ${viewMode === 'list' ? 'btn-icon-active' : ''}`}
              aria-label="List view"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
  );

  const barAnchorRef = useRef<HTMLDivElement>(null);
  const bar = useHeadroomBar(barAnchorRef, showMoreFilters || searchOpen || sheetOpen);

  // A link with a tag opens the inline panel on desktop; phones use the sheet instead, so the bar can still hide.
  useEffect(() => {
    if (!window.matchMedia('(min-width: 640px)').matches) setShowMoreFilters(false);
  }, []);

  // Opening the filters shows every tag ("show all"), so fetch the full directory then.
  useEffect(() => {
    if (showMoreFilters || sheetOpen || showAllInGroup.size > 0) ensureFull();
  }, [showMoreFilters, sheetOpen, showAllInGroup, ensureFull]);

  const clearAllFilters = () => { setSearchQuery(''); setSelectedCategory(defaultCategory); setSelectedSubcategory('all'); setSelectedPricing('all'); setSelectedTagIds([]); setFreeTrialOnly(false); setVisibleCount(ITEMS_PER_PAGE); };
  const filterCount = selectedTagIds.length + (selectedPricing !== 'all' ? 1 : 0) + (freeTrialOnly ? 1 : 0);
  const toggleTag = (id: string) => {
    setSelectedTagIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
    setVisibleCount(ITEMS_PER_PAGE);
  };
  const sheetRows: FilterRow[] = [
    {
      key: 'sort', label: 'Sort by', value: effectiveSort, defaultValue: searchQuery.trim() ? 'relevance' : 'rating', onChange: v => setSortBy(v as SortOption),
      options: [
        ...(searchQuery.trim() ? [{ value: 'relevance', label: 'Best match' }] : []),
        { value: 'rating', label: 'Top Rated' }, { value: 'upvotes', label: 'Most Upvoted' }, { value: 'newest', label: 'Newest First' }, { value: 'name', label: 'A → Z' },
      ],
    },
    {
      key: 'pricing', label: 'Pricing', value: selectedPricing === 'all' ? '' : selectedPricing, onChange: v => { setSelectedPricing(v || 'all'); setVisibleCount(ITEMS_PER_PAGE); },
      options: [{ value: '', label: 'All Pricing' }, ...pricingModels.map(p => ({ value: p, label: p.charAt(0) + p.slice(1).toLowerCase().replace(/_/g, ' ') }))],
    },
    { kind: 'toggle', key: 'trial', label: 'Free trial only', checked: freeTrialOnly, onChange: v => { setFreeTrialOnly(v); setVisibleCount(ITEMS_PER_PAGE); } },
    ...tagGroups.flatMap((group): FilterRow[] => {
      const tags = group.tags.filter((t: TagItem) => (tagCounts.get(t.id) || 0) > 0 || selectedTagIds.includes(t.id));
      if (tags.length === 0) return [];
      return [{
        kind: 'multi', key: `tag-${group.id}`, label: group.name, values: selectedTagIds.filter(id => tags.some((t: TagItem) => t.id === id)), onToggle: toggleTag,
        options: tags.map((t: TagItem) => ({ value: t.id, label: (tagCounts.get(t.id) || 0) > 0 ? `${t.name} (${tagCounts.get(t.id)})` : t.name })),
      }];
    }),
  ];
  const scrollToResults = bar.scrollToResults;
  const filterKey = [searchQuery, selectedCategory, selectedSubcategory, selectedPricing, sortBy, freeTrialOnly, selectedTagIds.join(',')].join('|');
  const prevFilterKey = useRef(filterKey);
  useEffect(() => {
    if (prevFilterKey.current === filterKey) return;
    prevFilterKey.current = filterKey;
    scrollToResults();
  }, [filterKey, scrollToResults]);

  return (
    <div className="relative">
      {/* Toast notification */}
      {toastMessage && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-gray-900 dark:bg-white text-white dark:text-gray-900 px-4 py-2.5 rounded-xl shadow-xl text-sm font-jakarta font-semibold animate-fade-in">
          {toastMessage}
        </div>
      )}

      {/* ── Search & filter bar: sticks under the site header (hides on scroll down on small screens) ── */}
      <div ref={barAnchorRef} aria-hidden className="h-0" />
      <div
        style={{
          top: bar.headerOffset,
          transform: bar.hidden ? `translate3d(0, calc(-100% - ${bar.headerOffset}px), 0)` : 'translate3d(0, 0, 0)',
          transition: 'transform 360ms cubic-bezier(0.32, 0.72, 0, 1)',
        }}
        className="sticky z-40 -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 py-2 sm:pt-0 sm:pb-3 mb-0 sm:mb-5 flex flex-col gap-2 sm:block will-change-transform motion-reduce:!transition-none"
      >
      {/* Full-bleed backdrop: runs edge to edge of the window while the controls stay aligned with the content */}
      <div
        aria-hidden
        className={`absolute inset-y-0 -left-[100vw] -right-[100vw] -z-10 bg-gray-50 dark:bg-gray-950 sm:bg-gray-50/95 sm:dark:bg-gray-950/95 sm:backdrop-blur-md transition-shadow duration-300 ${
          bar.stuck ? 'shadow-[0_8px_16px_-12px_rgba(0,0,0,0.25)] border-b border-gray-200/70 dark:border-gray-800' : ''
        }`}
      />

      {/* ── Category Pills ── */}
      {(!scopeCategory || subcategories.length > 1) && (
      <div className="order-2 sm:order-none min-w-0 sm:pt-3">
        {/* Parent category pills */}
        {!scopeCategory && (
        <div className="relative">
        <div ref={parentPillsRef} className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4 py-1 -my-1 sm:m-0 sm:px-0 sm:pt-0 sm:pb-1 sm:pr-8" style={{ WebkitOverflowScrolling: 'touch' }}>
          <button
            onClick={() => handleCategoryChange('all')}
            className={`relative shrink-0 h-8 sm:h-auto px-3 sm:px-4 sm:py-1.5 rounded-full text-[13px] sm:text-xs font-medium sm:font-bold font-jakarta before:absolute before:inset-x-0 before:-inset-y-1 sm:before:hidden transition-colors duration-200 ${
              selectedCategory === 'all'
                ? 'bg-brand text-white sm:shadow-sm'
                : 'bg-gray-200/60 sm:bg-gray-100 dark:bg-gray-800 text-gray-700 sm:text-gray-600 dark:text-gray-300 sm:dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            All ({partial && facets ? facets.total : picks.length})
          </button>
          {parentCategories.map(cat => (
            <button
              key={cat.slug}
              onClick={() => handleCategoryChange(cat.slug)}
              className={`relative shrink-0 h-8 sm:h-auto px-3 sm:px-4 sm:py-1.5 rounded-full text-[13px] sm:text-xs font-medium sm:font-bold font-jakarta before:absolute before:inset-x-0 before:-inset-y-1 sm:before:hidden transition-colors duration-200 ${
                selectedCategory === cat.slug
                  ? 'bg-brand text-white sm:shadow-sm'
                  : 'bg-gray-200/60 sm:bg-gray-100 dark:bg-gray-800 text-gray-700 sm:text-gray-600 dark:text-gray-300 sm:dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              {cat.name} ({cat.count})
            </button>
          ))}
        </div>
        <div className="absolute right-0 top-0 bottom-0 w-10 bg-gradient-to-l from-gray-50 dark:from-gray-950 pointer-events-none sm:hidden" />
        </div>
        )}

        {/* Subcategory pills (shown when a parent is selected) */}
        {selectedCategory !== 'all' && subcategories.length > 1 && (
          <div ref={subPillsRef} className={`flex items-center gap-1.5 sm:gap-2 ${scopeCategory ? '' : 'mt-2'} overflow-x-auto scrollbar-hide -mx-4 px-4 py-1 -mb-1 sm:mx-0 sm:px-0 sm:pt-0 sm:pb-1 sm:mb-0`} style={{ WebkitOverflowScrolling: 'touch' }}>
            <button
              onClick={() => handleSubcategoryChange('all')}
              className={`relative shrink-0 h-8 sm:h-auto px-3 sm:py-1.5 rounded-full text-[13px] sm:text-xs font-medium sm:font-semibold font-jakarta before:absolute before:inset-x-0 before:-inset-y-1 sm:before:hidden transition-colors duration-200 ${
                selectedSubcategory === 'all'
                  ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
                  : 'bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              {scopeCategory ? 'All' : `All in ${parentCategories.find(c => c.slug === selectedCategory)?.name || 'category'}`} ({parentCategories.find(c => c.slug === selectedCategory)?.count ?? picks.length})
            </button>
            {subcategories.map(sub => (
              <button
                key={sub.slug}
                onClick={() => handleSubcategoryChange(sub.slug)}
                className={`relative shrink-0 h-8 sm:h-auto px-3 sm:py-1.5 rounded-full text-[13px] sm:text-xs font-medium sm:font-semibold font-jakarta before:absolute before:inset-x-0 before:-inset-y-1 sm:before:hidden transition-colors duration-200 ${
                  selectedSubcategory === sub.slug
                    ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
                    : 'bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                {sub.name} ({sub.count})
              </button>
            ))}
          </div>
        )}
      </div>
      )}

      {/* ── Search + Filters + Sort + View Toggle ── */}
      <div className="order-1 sm:order-none sm:pt-3 sm:space-y-3">
        {/* Search Bar, with the phone filter button beside it */}
        <div className="flex items-start gap-2 sm:block">
        <div className="flex-1 min-w-0">
        <SmartSearchBox
          value={searchQuery}
          onChange={handleSearchChange}
          noun="AI tools"
          examples={TOOL_EXAMPLES}
          suggestions={searchSuggestions}
          resultCount={searchQuery.trim() && !waitingForFull ? filteredTools.length : null}
          chips={searchResult?.understood.chips}
          relaxed={searchResult?.relaxed}
          onRemoveChip={(chip) => handleSearchChange(removeChipFromQuery(searchQuery, chip))}
          onOpenChange={(open) => { setSearchOpen(open); if (open) ensureFull(); }}
        />
        </div>
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          aria-haspopup="dialog"
          aria-label={filterCount > 0 ? `Filters, ${filterCount} on` : 'Filters'}
          className={`sm:hidden relative shrink-0 w-10 h-10 flex items-center justify-center rounded-xl border transition-colors duration-200 active:scale-95 motion-reduce:active:scale-100 ${
            filterCount > 0 || (sortBy !== 'rating' && sortBy !== 'relevance')
              ? 'border-brand bg-brand/5 text-brand'
              : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300'
          }`}
        >
          <SlidersHorizontal className="w-4 h-4" aria-hidden />
          {filterCount > 0 && <span className="absolute -top-1.5 -right-1.5 w-5 h-5 flex items-center justify-center bg-brand text-white text-xs font-bold rounded-full">{filterCount}</span>}
        </button>
        </div>

        {/* Filters + Sort Row (phones use the sheet) */}
        <div className="hidden sm:flex items-center gap-2">
          {/* Filters Button */}
          <button
            onClick={() => setShowMoreFilters(!showMoreFilters)}
            className={`flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2.5 rounded-lg sm:rounded-xl border font-jakarta text-xs sm:text-sm font-semibold transition-all select-none ${
              showMoreFilters || selectedTagIds.length > 0 || selectedPricing !== 'all' || freeTrialOnly
                ? 'border-brand bg-brand/5 text-brand shadow-sm'
                : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span>Filters</span>
            {(selectedTagIds.length + (selectedPricing !== 'all' ? 1 : 0) + (freeTrialOnly ? 1 : 0)) > 0 && (
              <span className="w-5 h-5 flex items-center justify-center bg-brand text-white text-xs font-bold rounded-full">
                {selectedTagIds.length + (selectedPricing !== 'all' ? 1 : 0) + (freeTrialOnly ? 1 : 0)}
              </span>
            )}
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showMoreFilters ? 'rotate-180' : ''}`} />
          </button>

          {/* Sort Dropdown */}
          <div className="relative">
            <select
              value={effectiveSort}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className={`appearance-none flex items-center gap-1.5 sm:gap-2 pl-7 sm:pl-9 pr-6 sm:pr-8 py-1.5 sm:py-2.5 rounded-lg sm:rounded-xl border font-jakarta text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-brand cursor-pointer ${
                sortBy !== 'rating' && sortBy !== 'relevance'
                  ? 'border-brand bg-brand/5 text-brand shadow-sm'
                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300'
              }`}
            >
              {searchQuery.trim() && <option value="relevance">Best match</option>}
              <option value="rating">Top Rated</option>
              <option value="upvotes">Most Upvoted</option>
              <option value="newest">Newest First</option>
              <option value="name">A → Z</option>
            </select>
            <svg className="absolute left-2.5 sm:left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" /></svg>
            <ChevronDown className="absolute right-1.5 sm:right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 sm:w-3.5 sm:h-3.5 text-gray-400 pointer-events-none" />
          </div>

          {/* Clear Filters */}
          {(searchQuery || selectedCategory !== 'all' || selectedPricing !== 'all' || selectedTagIds.length > 0 || freeTrialOnly) && (
            <button
              onClick={() => { setSearchQuery(''); setSelectedCategory(defaultCategory); setSelectedSubcategory('all'); setSelectedPricing('all'); setSelectedTagIds([]); setFreeTrialOnly(false); setVisibleCount(ITEMS_PER_PAGE); }}
              className="shrink-0 px-3 py-2 rounded-xl text-xs font-semibold text-brand hover:bg-brand/5 transition-colors font-jakarta active:scale-95"
            >
              Clear all
            </button>
          )}
        </div>

        <div className="hidden sm:block">{resultsRow}</div>
      </div>

      {/* ── FILTERS PANEL ── */}
      {tagGroups.length > 0 && (showMoreFilters || selectedTagIds.length > 0 || selectedPricing !== 'all' || freeTrialOnly) && (
        <div className="order-3 sm:order-none min-w-0 sm:pt-3">
          {/* Active filter chips */}
          {(selectedTagIds.length > 0 || selectedPricing !== 'all' || freeTrialOnly) && (
            <div className="flex flex-wrap items-center gap-1.5 mb-3">
              <span className="text-xs text-gray-500 font-jakarta mr-1">Active:</span>
              {selectedPricing !== 'all' && (
                <button
                  onClick={() => { setSelectedPricing('all'); setVisibleCount(ITEMS_PER_PAGE); }}
                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-brand/10 border border-brand/20 text-brand rounded-full text-xs font-jakarta font-semibold hover:bg-brand/20 transition-colors"
                >
                  {selectedPricing}
                  <X className="w-3 h-3" />
                </button>
              )}
              {freeTrialOnly && (
                <button
                  onClick={() => { setFreeTrialOnly(false); setVisibleCount(ITEMS_PER_PAGE); }}
                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-700 text-teal-700 dark:text-teal-400 rounded-full text-xs font-jakarta font-semibold hover:bg-teal-100 transition-colors"
                >
                  Free Trial
                  <X className="w-3 h-3" />
                </button>
              )}
              {selectedTagIds.map(tagId => {
                const tag = tagGroups.flatMap(g => g.tags).find((t: TagItem) => t.id === tagId);
                if (!tag) return null;
                return (
                  <button
                    key={tagId}
                    onClick={() => { setSelectedTagIds(prev => prev.filter(id => id !== tagId)); setVisibleCount(ITEMS_PER_PAGE); }}
                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-brand/10 border border-brand/20 text-brand rounded-full text-xs font-jakarta font-semibold hover:bg-brand/20 transition-colors"
                  >
                    {tag.name}
                    <X className="w-3 h-3" />
                  </button>
                );
              })}
              <button
                onClick={() => { setSelectedPricing('all'); setFreeTrialOnly(false); setSelectedTagIds([]); setVisibleCount(ITEMS_PER_PAGE); }}
                className="text-xs text-red-500 hover:text-red-600 font-semibold font-jakarta ml-1"
              >
                Clear all
              </button>
            </div>
          )}

          {/* Expanded filter panel */}
          {showMoreFilters && (
            <div className="hidden sm:block mt-3 p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl space-y-3 max-h-[45vh] overflow-y-auto overscroll-contain">
              {/* Pricing & Free Trial */}
              <div className="border-b border-gray-100 dark:border-gray-800 pb-3">
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wide font-jakarta">Pricing</label>
                  <select
                    value={selectedPricing}
                    onChange={(e) => { setSelectedPricing(e.target.value); setVisibleCount(ITEMS_PER_PAGE); }}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-jakarta text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-brand cursor-pointer"
                  >
                    <option value="all">All Pricing</option>
                    {pricingModels.map((pricing) => (
                      <option key={pricing} value={pricing}>{pricing}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => { setFreeTrialOnly(!freeTrialOnly); setVisibleCount(ITEMS_PER_PAGE); }}
                    className={`self-start px-3 py-1.5 rounded-lg border text-xs font-semibold font-jakarta transition-all active:scale-95 ${
                      freeTrialOnly
                        ? 'bg-teal-50 dark:bg-teal-900/20 border-teal-300 dark:border-teal-700 text-teal-700 dark:text-teal-400'
                        : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:border-teal-300'
                    }`}
                  >
                    Free Trial Only
                  </button>
                </div>
              </div>

              {tagGroups.map(group => {
                const isExpanded = expandedFilterGroups.has(group.slug);
                const activeTags = group.tags.filter((t: TagItem) => (tagCounts.get(t.id) || 0) > 0 || selectedTagIds.includes(t.id));
                const visibleTags = showAllInGroup.has(group.id)
                  ? activeTags
                  : activeTags.slice(0, group.maxVisibleDefault);
                const hasMore = activeTags.length > group.maxVisibleDefault;
                const selectedInGroup = group.tags.filter((t: TagItem) => selectedTagIds.includes(t.id)).length;

                return (
                  <div key={group.id} className="border-b border-gray-100 dark:border-gray-800 last:border-0 pb-3 last:pb-0">
                    <button
                      onClick={() => {
                        setExpandedFilterGroups(prev => {
                          const next = new Set(prev);
                          if (next.has(group.slug)) next.delete(group.slug);
                          else next.add(group.slug);
                          return next;
                        });
                      }}
                      className="w-full flex items-center justify-between py-1"
                    >
                      <div className="flex items-center gap-2">
                        {isExpanded ? <ChevronDown className="w-3 h-3 text-gray-400" /> : <ChevronRight className="w-3 h-3 text-gray-400" />}
                        <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 font-jakarta">{group.name}</span>
                      </div>
                      {selectedInGroup > 0 && (
                        <span className="text-xs font-bold bg-brand/10 text-brand px-1.5 py-0.5 rounded-full">{selectedInGroup}</span>
                      )}
                    </button>
                    {isExpanded && (
                      <div className="flex flex-wrap gap-1.5 mt-2 pl-5">
                        {visibleTags.map((tag: TagItem) => {
                          const isSelected = selectedTagIds.includes(tag.id);
                          return (
                            <button
                              key={tag.id}
                              onClick={() => {
                                setSelectedTagIds(prev =>
                                  isSelected ? prev.filter(id => id !== tag.id) : [...prev, tag.id]
                                );
                                setVisibleCount(ITEMS_PER_PAGE);
                              }}
                              className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-jakarta transition-all border ${
                                isSelected
                                  ? 'bg-brand/10 border-brand/30 text-brand font-semibold'
                                  : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-brand/30 hover:text-brand'
                              }`}
                            >
                              {tag.name}
                              {(tagCounts.get(tag.id) || 0) > 0 && <span className="text-xs text-gray-400 ml-0.5">({tagCounts.get(tag.id)})</span>}
                            </button>
                          );
                        })}
                        {hasMore && (
                          <button
                            onClick={() => setShowAllInGroup(prev => {
                              const next = new Set(prev);
                              if (next.has(group.id)) next.delete(group.id);
                              else next.add(group.id);
                              return next;
                            })}
                            className="text-xs font-jakarta font-semibold text-brand hover:underline px-2 py-1"
                          >
                            {showAllInGroup.has(group.id) ? 'Show less' : `Show all ${activeTags.length}`}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      </div>

      <div className="sm:hidden mt-2.5 mb-2.5">{resultsRow}</div>

      <BottomSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Filters"
        flush
        headerAction={(filterCount > 0 || (sortBy !== 'rating' && sortBy !== 'relevance') || searchQuery || selectedCategory !== defaultCategory) ? (
          <button type="button" onClick={clearAllFilters} className="min-h-[44px] px-2 text-sm font-semibold text-brand font-jakarta">Clear all</button>
        ) : null}
        footer={(
          <button type="button" onClick={() => setSheetOpen(false)} className="w-full min-h-[48px] rounded-xl bg-brand text-white font-jakarta font-bold text-[15px] active:scale-[0.98] transition-transform duration-150 motion-reduce:transition-none">
            {matchingCount === null ? 'Show tools' : `Show ${matchingCount} ${matchingCount === 1 ? 'tool' : 'tools'}`}
          </button>
        )}
      >
        <FilterList sheetOpen={sheetOpen} rows={sheetRows} />
      </BottomSheet>

      {/* ── GRID VIEW ── */}
      {viewMode === 'grid' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3 -mx-1 sm:mx-0">
          {visibleTools.map((tool, i) => {
            const isSelected = !!selectedTools.find((t) => t.slug === tool.slug);
            const toolCat = tool.parentCategorySlug || tool.categorySlug;
            const isDisabledForCompare = !isSelected && compareCategory != null && toolCat !== compareCategory;
            const iconUrl = tool.logoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(tool.name)}&background=random&color=fff&size=150`;
            const toolTagIds = toolTagMap[tool.id] || [];
            const toolTagNames = toolTagIds.slice(0, 2).map(tid => {
              for (const g of tagGroups) {
                const found = g.tags.find((t: any) => t.id === tid);
                if (found) return found.name;
              }
              return null;
            }).filter(Boolean);

            return (
              <IntentLink
                key={tool.slug}
                href={`/tools/${tool.slug}`}

                className={`group block rounded-xl transition-all h-full active:scale-[0.98] ${isSelected ? 'ring-2 ring-brand ring-offset-2 dark:ring-offset-gray-950' : 'hover:shadow-lg hover:shadow-brand/5'}`}
              >
                <div className="p-4 sm:p-5 flex flex-col gap-2.5 relative h-full bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl">

                  {/* Top Actions */}
                  <div className="absolute top-3 right-3 flex items-center gap-2 z-10">
                    <BookmarkButton type="tool" itemId={tool.slug} itemName={tool.name} size="md" />
                    <div className="relative group/compare">
                      <button
                        onClick={(e) => toggleTool(tool, e)}
                        aria-label={`Compare ${tool.name}`}
                        aria-pressed={isSelected}
                        className={`btn-icon ${isSelected ? 'btn-icon-active' : ''} ${isDisabledForCompare ? 'opacity-30 cursor-not-allowed' : ''}`}
                      >
                        {isSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                      </button>
                      <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 hidden group-hover/compare:flex flex-col items-center z-dropdown">
                        <div className="w-2.5 h-2.5 bg-black dark:bg-gray-800 rotate-45 -mb-1.5" />
                        <div className="bg-black dark:bg-gray-800 text-white text-xs px-3 py-1.5 rounded-lg whitespace-nowrap shadow-lg font-jakarta">
                          {isSelected ? 'Selected' : isDisabledForCompare ? 'Different category' : 'Compare'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Logo & Title */}
                  <div className="flex items-center gap-3 pr-20">
                    <div className="w-11 h-11 sm:w-10 sm:h-10 rounded-xl bg-white dark:bg-gray-800 shrink-0 overflow-hidden shadow-sm border border-gray-100 dark:border-gray-700/50">
                      <Image src={iconUrl} alt={tool.name} className="w-full h-full object-cover" width={44} height={44} unoptimized />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h2 className="font-sora font-bold text-[15px] sm:text-sm text-navy dark:text-white group-hover:text-brand transition-colors line-clamp-1">
                        {tool.name}
                      </h2>
                      <p className="text-xs text-gray-400 font-jakarta mt-0.5 line-clamp-1">
                        {tool.parentCategory || tool.category}
                      </p>
                    </div>
                  </div>

                  {/* Tagline */}
                  <p className="text-gray-500 dark:text-gray-400 text-xs font-jakarta line-clamp-2 flex-1 leading-relaxed">
                    {tool.tagline}
                  </p>

                  {/* Tag Pills (max 2) + Badges */}
                  {(toolTagNames.length > 0 || (tool.freeTrialDays && tool.freeTrialDays > 0)) && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {toolTagNames.map((name, idx) => (
                        <span key={idx} className="text-xs font-semibold px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 font-jakarta">
                          {name}
                        </span>
                      ))}
                      {tool.freeTrialDays && tool.freeTrialDays > 0 && (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-teal-50 dark:bg-teal-900/20 text-teal-600 dark:text-teal-400">Trial</span>
                      )}
                    </div>
                  )}

                  {/* Footer: Rating + Upvote + Pricing */}
                  <div className="mt-auto pt-2.5 flex items-center justify-between border-t border-gray-100 dark:border-gray-800">
                    <div className="flex items-center gap-2.5">
                      <div className="flex items-center gap-1">
                        <Star className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500" />
                        <span className="text-xs font-bold text-gray-700 dark:text-gray-300">{tool.rating}</span>
                      </div>
                      <UpvoteButton toolSlug={tool.slug} size="sm" />
                    </div>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full uppercase ${
                      tool.pricing === 'FREE' || tool.pricing === 'Free'
                        ? 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                        : tool.pricing === 'FREEMIUM' || tool.pricing === 'Freemium'
                        ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
                        : tool.pricing === 'OPEN_SOURCE' || tool.pricing === 'Open Source'
                        ? 'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400'
                        : tool.pricing === 'ENTERPRISE' || tool.pricing === 'Enterprise'
                        ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                    }`}>
                      {tool.pricing === 'OPEN_SOURCE' ? 'Open Source' : tool.pricing}
                    </span>
                  </div>
                </div>
              </IntentLink>
            );
          })}
        </div>
      )}

      {/* ── LIST VIEW ── */}
      {viewMode === 'list' && (
        <div className="space-y-1.5 sm:space-y-2 -mx-1 sm:mx-0">
          {visibleTools.map((tool) => {
            const isSelected = !!selectedTools.find((t) => t.slug === tool.slug);
            const toolCatList = tool.parentCategorySlug || tool.categorySlug;
            const isDisabledForCompare = !isSelected && compareCategory != null && toolCatList !== compareCategory;
            const iconUrl = tool.logoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(tool.name)}&background=random&color=fff&size=150`;
            const listTagIds = toolTagMap[tool.id] || [];
            const listTagNames = listTagIds.slice(0, 2).map(tid => {
              for (const g of tagGroups) {
                const found = g.tags.find((t: any) => t.id === tid);
                if (found) return found.name;
              }
              return null;
            }).filter(Boolean);

            return (
              <IntentLink
                key={tool.slug}
                href={`/tools/${tool.slug}`}

                className={`group flex items-center gap-3 p-3 sm:p-3 rounded-lg transition-all bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 hover:border-brand/30 hover:shadow-sm active:scale-[0.99] ${isSelected ? 'ring-2 ring-brand' : ''}`}
              >
                {/* Logo */}
                <div className="w-10 h-10 sm:w-9 sm:h-9 rounded-lg bg-white dark:bg-gray-800 shrink-0 overflow-hidden border border-gray-100 dark:border-gray-700/50">
                  <Image src={iconUrl} alt={tool.name} className="w-full h-full object-cover" width={40} height={40} unoptimized />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="font-sora font-bold text-[14px] sm:text-sm text-navy dark:text-white group-hover:text-brand transition-colors truncate">
                      {tool.name}
                    </h2>
                    <span className="hidden sm:inline text-xs text-gray-400 font-jakarta shrink-0">{tool.category}</span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-jakarta truncate mt-0.5">
                    {tool.tagline}
                  </p>
                  {listTagNames.length > 0 && (
                    <div className="hidden sm:flex items-center gap-1 mt-1">
                      {listTagNames.map((name, idx) => (
                        <span key={idx} className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 font-jakarta">
                          {name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Rating */}
                <div className="flex items-center gap-1 shrink-0">
                  <Star className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500" />
                  <span className="text-xs font-bold text-gray-700 dark:text-gray-300">{tool.rating}</span>
                </div>

                {/* Pricing - hidden on small mobile */}
                <span className={`hidden sm:inline shrink-0 text-xs font-bold px-2 py-0.5 rounded-full uppercase ${
                  tool.pricing === 'FREE' || tool.pricing === 'Free'
                    ? 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                    : tool.pricing === 'FREEMIUM' || tool.pricing === 'Freemium'
                    ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
                    : tool.pricing === 'OPEN_SOURCE' || tool.pricing === 'Open Source'
                    ? 'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400'
                    : tool.pricing === 'ENTERPRISE' || tool.pricing === 'Enterprise'
                    ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                }`}>
                  {tool.pricing === 'OPEN_SOURCE' ? 'Open Source' : tool.pricing}
                </span>

                {/* Upvote */}
                <UpvoteButton toolSlug={tool.slug} size="sm" />

                {/* Compare checkbox - hidden on mobile */}
                <button
                  onClick={(e) => toggleTool(tool, e)}
                  className={`hidden sm:block shrink-0 p-1 transition-colors ${isSelected ? 'text-brand' : isDisabledForCompare ? 'text-gray-200 dark:text-gray-700 cursor-not-allowed' : 'text-gray-300 hover:text-brand'}`}
                  title={isDisabledForCompare ? 'Different category' : 'Select for comparison'}
                >
                  {isSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                </button>
              </IntentLink>
            );
          })}
        </div>
      )}

      {/* ── Infinite Scroll / Load More ── */}
      {visibleTools.length > 0 && hasMore && (
        <>
          {!loadingFull && <ToolsInfiniteScrollTrigger onIntersect={() => setVisibleCount(prev => prev + ITEMS_PER_PAGE)} />}
          <div className="text-center pt-2 pb-4">
            <button
              onClick={() => setVisibleCount(prev => prev + ITEMS_PER_PAGE)}
              disabled={loadingFull}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-jakarta font-semibold text-sm hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors active:scale-95 disabled:opacity-70"
            >
              {loadingFull ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Loading all tools…</>
              ) : (
                <>Load more tools{matchingCount !== null && ` (${matchingCount - visibleCount} remaining)`}</>
              )}
            </button>
          </div>
        </>
      )}

      {/* End of list indicator */}
      {!partial && filteredTools.length > 0 && !hasMore && visibleCount > ITEMS_PER_PAGE && (
        <div className="text-center py-6">
          <p className="text-xs text-gray-400 font-jakarta">All {filteredTools.length} tools loaded</p>
        </div>
      )}

      {/* No Results */}
      {visibleTools.length === 0 && (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mx-auto mb-4">
            <SearchX className="w-7 h-7 text-gray-300 dark:text-gray-600" />
          </div>
          <p className="text-gray-500 dark:text-gray-400 font-jakarta text-sm font-semibold mb-1">No tools match your filters</p>
          <p className="text-gray-400 dark:text-gray-500 font-jakarta text-xs mb-4 max-w-xs mx-auto">
            {searchQuery ? `No results for "${searchQuery}". Try a different search term.` :
             selectedTagIds.length > 1 ? 'Try removing some tag filters to see more results.' :
             'Try broadening your search or removing some filters.'}
          </p>
          <button
            onClick={() => { setSearchQuery(''); setSelectedCategory(defaultCategory); setSelectedSubcategory('all'); setSelectedPricing('all'); setSelectedTagIds([]); setFreeTrialOnly(false); }}
            className="px-4 py-2 text-sm font-semibold text-brand bg-brand/5 hover:bg-brand/10 rounded-lg transition-colors"
          >
            Clear All Filters
          </button>
        </div>
      )}

      {/* ── Comparison Footer Bar ── */}
      {selectedTools.length > 0 && (
        <div className="fixed bottom-20 sm:bottom-6 left-1/2 -translate-x-1/2 bg-navy text-white px-4 sm:px-6 py-3 sm:py-4 rounded-2xl sm:rounded-full shadow-2xl flex items-center gap-4 sm:gap-6 z-sticky animate-fade-in-up border border-indigo-500/30 max-w-[calc(100vw-2rem)]">
          <div className="flex -space-x-2">
            <div className="font-sora font-bold text-sm mr-4 flex items-center gap-2"><BarChart className="w-4 h-4 text-brand" /> {selectedTools.length}/3 Selected</div>
          </div>
          <button
            onClick={() => {
              router.push(compareHref(selectedTools.map(t => t.slug)));
            }}
            disabled={selectedTools.length < 2}
            className="bg-brand text-white text-sm font-bold px-4 py-2 rounded-full hover:scale-105 transition-transform disabled:opacity-50 disabled:hover:scale-100 whitespace-nowrap"
          >
            {selectedTools.length < 2 ? 'Select one more' : 'Compare Now'}
          </button>
          <button onClick={() => { setSelectedTools([]); if (categoryBeforeCompare !== null) { setSelectedCategory(categoryBeforeCompare); setSelectedSubcategory('all'); setCategoryBeforeCompare(null); } }} className="text-gray-400 hover:text-white" aria-label="Clear all">
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

    </div>
  );
}

function ToolsInfiniteScrollTrigger({ onIntersect }: { onIntersect: () => void }) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const onIntersectRef = useRef(onIntersect);
  onIntersectRef.current = onIntersect;

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          onIntersectRef.current();
        }
      },
      { rootMargin: '200px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={sentinelRef} className="flex items-center justify-center py-6">
      <Loader2 className="w-5 h-5 text-brand animate-spin" />
    </div>
  );
}
