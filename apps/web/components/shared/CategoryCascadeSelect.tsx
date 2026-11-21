'use client';

import { useState, useEffect, useMemo, useId } from 'react';
import { Search } from 'lucide-react';

interface Category {
  id: string;
  name: string;
  slug: string;
  parentId?: string | null;
  parentName?: string | null;
  parentSlug?: string | null;
  parentIcon?: string | null;
}

interface CategoryCascadeSelectProps {
  value: string;
  onChange: (categoryId: string) => void;
  required?: boolean;
  className?: string;
}

/**
 * Cascading category select for founder portal.
 * Fetches categories from /api/tool-categories and shows
 * parent → subcategory cascade.
 */
export default function CategoryCascadeSelect({
  value,
  onChange,
  required = false,
  className = '',
}: CategoryCascadeSelectProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const fieldId = useId();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const res = await fetch('/api/tool-categories');
        const data = await res.json();
        if (data.success && data.categories) {
          setCategories(data.categories);
        }
      } catch (err) {
        console.error('Failed to load categories:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchCategories();
  }, []);

  // Group categories by parent
  const parentGroups = useMemo(() => {
    const groups: Record<string, {
      name: string;
      icon: string | null;
      slug: string;
      subcategories: Category[];
    }> = {};
    for (const cat of categories) {
      const parentKey = cat.parentSlug || 'uncategorized';
      if (!groups[parentKey]) {
        groups[parentKey] = {
          name: cat.parentName || 'Other',
          icon: cat.parentIcon || null,
          slug: parentKey,
          subcategories: [],
        };
      }
      groups[parentKey].subcategories.push(cat);
    }
    return Object.values(groups);
  }, [categories]);

  // Find current selection's parent
  const selectedCat = categories.find(c => c.id === value);
  const [selectedParent, setSelectedParent] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');

  // Update parent when value changes externally
  useEffect(() => {
    if (value && categories.length > 0) {
      const cat = categories.find(c => c.id === value);
      if (cat?.parentSlug && cat.parentSlug !== selectedParent) {
        setSelectedParent(cat.parentSlug);
      }
    }
  }, [value, categories]);

  // Get subcategories for selected parent
  const currentSubcategories = useMemo(() => {
    if (!selectedParent) return [];
    const group = parentGroups.find(g => g.slug === selectedParent);
    return group?.subcategories || [];
  }, [selectedParent, parentGroups]);

  // Filtered subcategories based on search
  const filteredSubcategories = useMemo(() => {
    if (!searchQuery) return currentSubcategories;
    const q = searchQuery.toLowerCase();
    return currentSubcategories.filter(c =>
      c.name.toLowerCase().includes(q)
    );
  }, [currentSubcategories, searchQuery]);

  const handleParentChange = (parentSlug: string) => {
    setSelectedParent(parentSlug);
    setSearchQuery('');
    // Auto-select first subcategory
    const group = parentGroups.find(g => g.slug === parentSlug);
    if (group && group.subcategories.length > 0) {
      onChange(group.subcategories[0].id);
    } else {
      onChange('');
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-10 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />
        <div className="h-10 bg-gray-50 dark:bg-gray-800/50 rounded-lg animate-pulse" />
      </div>
    );
  }

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Parent Category */}
      <div>
        <label htmlFor={`${fieldId}-category`} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Category <span className="text-red-500">*</span>
        </label>
        <select
          id={`${fieldId}-category`}
          value={selectedParent}
          onChange={(e) => handleParentChange(e.target.value)}
          required={required}
          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand focus:border-transparent"
        >
          <option value="">Select a category</option>
          {parentGroups.map((group) => (
            <option key={group.slug} value={group.slug}>
              {group.name}
            </option>
          ))}
        </select>
      </div>

      {/* Subcategory */}
      {selectedParent && (
        <div>
          <label htmlFor={`${fieldId}-subcategory`} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Subcategory <span className="text-red-500">*</span>
          </label>
          {currentSubcategories.length > 8 && (
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                inputMode="search" enterKeyHint="search" placeholder="Search subcategories..."
                className="w-full pl-9 pr-4 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              />
            </div>
          )}
          <select
            id={`${fieldId}-subcategory`}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            required={required}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand focus:border-transparent"
          >
            <option value="">Select a subcategory</option>
            {filteredSubcategories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
          {selectedCat && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {selectedCat.parentName} → {selectedCat.name}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
