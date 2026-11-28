'use client';

import { Loader2 } from 'lucide-react';
import CategoryCascadeSelect from '@/components/shared/CategoryCascadeSelect';
import ToolTagSelector from '@/components/shared/ToolTagSelector';
import { Category } from './types';
import type { NewToolForm } from './types';

/** Name, tagline, description, category and tags. */
export default function NewToolBasicInfoSection({ formData, setFormData, handleChange, tagGroups, categories, selectedTagIds, setSelectedTagIds }: {
  formData: NewToolForm;
  setFormData: React.Dispatch<React.SetStateAction<NewToolForm>>;
  handleChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
  tagGroups: any[];
  categories: Category[];
  selectedTagIds: string[];
  setSelectedTagIds: React.Dispatch<React.SetStateAction<string[]>>;
}) {
  return (
    <>
      {/* Basic Information */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-6 space-y-6">
        <h2 className="font-sora font-bold text-lg text-navy dark:text-white">Basic Information</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="md:col-span-2">
            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta">
              Tool Name *
            </label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
              className="input-field text-sm"
              placeholder="e.g. ChatGPT"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta">
              Slug *
            </label>
            <input
              type="text"
              name="slug"
              value={formData.slug}
              onChange={handleChange}
              required
              className="input-field text-sm"
              placeholder="e.g. chatgpt"
            />
          </div>

          <div>
            <CategoryCascadeSelect
              categories={categories}
              value={formData.categoryId}
              onChange={(categoryId) => setFormData(prev => ({ ...prev, categoryId }))}
              required
            />
          </div>

          <div className="md:col-span-2">
            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta">
              Tagline *
            </label>
            <input
              type="text"
              name="tagline"
              value={formData.tagline}
              onChange={handleChange}
              required
              maxLength={100}
              className="input-field text-sm"
              placeholder="A short, catchy description"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {formData.tagline.length}/100 characters
            </p>
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta">
            Description <span className="text-red-500" aria-hidden>*</span>
          </label>
          <textarea
            name="description"
            value={formData.description}
            onChange={handleChange}
            rows={6}
            maxLength={1000}
            className="input-field text-sm"
            placeholder="Detailed description of the tool..."
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {formData.description.length}/1000 characters
          </p>
        </div>

        {/* Tags — inline in Basic Info */}
        <div>
          {tagGroups.length > 0 ? (
            <ToolTagSelector
              groups={tagGroups}
              selectedTagIds={selectedTagIds}
              onChange={setSelectedTagIds}
              maxTags={30}
              isAdmin={true}
            />
          ) : (
            <div className="flex items-center gap-2 py-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />
              <span className="text-xs text-gray-500">Loading tags...</span>
            </div>
          )}
        </div>
      </div>

    </>
  );
}
