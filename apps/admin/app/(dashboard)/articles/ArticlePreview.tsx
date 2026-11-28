'use client';

import { X } from 'lucide-react';
import { editorClasses } from './editor-bits';

/** Full-screen preview of the article as readers will see it. */
export default function ArticlePreview({ category, coverImage, subtitle, title, bodyHtml, canEdit, doSave, primaryIntent, primaryLabel, readTime, saving, setShowPreview, showPreview, wordCount }: {
  category: string;
  coverImage: string | null;
  subtitle: string;
  title: string;
  bodyHtml: string;
  canEdit: boolean;
  doSave: (intent?: 'publish' | 'submit') => unknown;
  primaryIntent: 'publish' | 'submit' | undefined;
  primaryLabel: string;
  readTime: number;
  saving: boolean;
  setShowPreview: (v: boolean) => void;
  showPreview: boolean;
  wordCount: number;
}) {
  return (
    <>
      {/* Preview */}
      {showPreview && (
        <div className="fixed inset-0 z-50 bg-white dark:bg-gray-950 overflow-y-auto">
          <div className="sticky top-0 z-10 bg-white/80 dark:bg-gray-950/80 backdrop-blur-md border-b border-gray-100 dark:border-gray-800">
            <div className="max-w-[720px] mx-auto flex items-center justify-between py-3 px-6">
              <span className="text-sm text-gray-500 font-jakarta">Preview</span>
              <div className="flex items-center gap-3">
                {canEdit && <button onClick={() => doSave(primaryIntent)} disabled={!title.trim() || saving} className="px-4 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white text-sm font-semibold rounded-full transition-colors">{primaryLabel}</button>}
                <button onClick={() => setShowPreview(false)} aria-label="Close preview" className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"><X className="w-5 h-5 text-gray-400" /></button>
              </div>
            </div>
          </div>
          <div className="max-w-[720px] mx-auto py-12 px-6">
            {coverImage && (
              <div className="w-full overflow-hidden rounded-xl mb-8 aspect-video bg-gray-100 dark:bg-gray-800">
                <img src={coverImage} alt="Cover" className="w-full h-full object-cover" />
              </div>
            )}
            <h1 className="font-sora font-extrabold text-[42px] text-navy dark:text-white leading-[1.15] tracking-tight">{title || 'Untitled'}</h1>
            {subtitle && <p className="font-jakarta text-xl text-gray-400 dark:text-gray-500 mt-4 leading-relaxed">{subtitle}</p>}
            <div className="flex items-center gap-3 mt-6 text-sm text-gray-400 font-jakarta">
              {category && <span className="px-2.5 py-0.5 bg-brand/10 text-brand rounded-full text-xs font-semibold">{category}</span>}
              <span>{wordCount.toLocaleString()} words</span>
              <span>·</span>
              <span>{readTime} min read</span>
            </div>
            <div className="my-8 h-px bg-gray-100 dark:bg-gray-800" />
            {/* The editor's own content (pasted HTML is already cleaned on the way in). */}
            <div className={`${editorClasses} [&_img]:!outline-none [&_img]:!cursor-default [&_figcaption:empty]:hidden`} dangerouslySetInnerHTML={{ __html: bodyHtml || '<p style="color:#ccc;font-style:italic">No content yet…</p>' }} />
          </div>
        </div>
      )}
    </>
  );
}
