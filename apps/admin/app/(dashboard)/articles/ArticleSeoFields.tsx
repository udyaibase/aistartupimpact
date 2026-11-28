'use client';

import { ChevronDown, ChevronUp, Image as ImageIcon, Globe, X } from 'lucide-react';
import { Toggle, seoInput, seoLabel } from './editor-bits';

/** Search and social settings: SEO title, description, keyword, canonical address and social image. */
export default function ArticleSeoFields({ canEditCanonical, metaDesc, seoPanelOpen, seoTitle, ogImage, canonicalUrl, focusKeyword, noIndex, setCanonicalUrl, setFocusKeyword, setMetaDesc, setNoIndex, setOgImage, setPicker, setSeoPanelOpen, setSeoTitle }: {
  /** Only editors may point an article's canonical address at another page. */
  canEditCanonical: boolean;
  metaDesc: string;
  seoPanelOpen: boolean;
  seoTitle: string;
  ogImage: string;
  canonicalUrl: string;
  focusKeyword: string;
  noIndex: boolean;
  setCanonicalUrl: (v: string) => void;
  setFocusKeyword: (v: string) => void;
  setMetaDesc: (v: string) => void;
  setNoIndex: (v: boolean) => void;
  setOgImage: (v: string) => void;
  setPicker: (v: null | 'og' | 'inline') => void;
  setSeoPanelOpen: (v: boolean) => void;
  setSeoTitle: (v: string) => void;
}) {
  return (
    <>
      {/* SEO */}
      <div className="mt-12 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden shadow-sm">
        <button onClick={() => setSeoPanelOpen(!seoPanelOpen)} className="w-full flex items-center justify-between p-5 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
          <div className="flex items-center gap-3">
            <Globe className="w-5 h-5 text-brand" />
            <div>
              <h3 className="font-sora font-bold text-navy dark:text-white text-left text-[15px]">Search Engine Optimization</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-jakarta text-left mt-0.5">Title, meta description, social image and canonical link</p>
            </div>
          </div>
          {seoPanelOpen ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
        </button>

        {seoPanelOpen && (
          <div className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className={seoLabel}>SEO Title<span className={`normal-case font-medium ${seoTitle.length > 60 ? 'text-red-500' : 'text-gray-400'}`}>{seoTitle.length}/60</span></label>
                <input type="text" className={seoInput} placeholder="Defaults to the article title" maxLength={120} value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} />
                <p className="text-[11px] text-gray-400 mt-1.5 font-jakarta">The title shown in Google results.</p>
              </div>
              <div>
                <label className={seoLabel}>Canonical URL</label>
                <input type="url" className={`${seoInput} disabled:opacity-60 disabled:cursor-not-allowed`} placeholder="https://..." value={canonicalUrl} disabled={!canEditCanonical} onChange={(e) => setCanonicalUrl(e.target.value)} />
                <p className="text-[11px] text-gray-400 mt-1.5 font-jakarta">{canEditCanonical ? 'Only if this was first published elsewhere. It tells Google the other page is the original.' : 'Set by an editor, only when the article was first published elsewhere.'}</p>
              </div>
            </div>
            <div>
              <label className={seoLabel}>Meta Description<span className={`normal-case font-medium ${metaDesc.length > 160 ? 'text-red-500' : 'text-gray-400'}`}>{metaDesc.length}/160</span></label>
              <textarea className={`${seoInput} resize-none`} rows={3} maxLength={320} placeholder="Defaults to the subtitle" value={metaDesc} onChange={(e) => setMetaDesc(e.target.value)} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
              <div>
                <label className={`${seoLabel} block`}>Social Preview (OG Image)</label>
                {ogImage ? (
                  <div className="relative group rounded-xl overflow-hidden aspect-video bg-gray-100 dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-800">
                    <img src={ogImage} className="w-full h-full object-cover" alt="Social preview" />
                    <button onClick={() => setOgImage('')} aria-label="Remove social image" className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-red-600 text-white rounded-lg transition-colors"><X className="w-4 h-4" /></button>
                  </div>
                ) : (
                  <button onClick={() => setPicker('og')} className="w-full py-8 border-2 border-dashed border-gray-300 dark:border-gray-700 hover:border-brand dark:hover:border-brand/60 rounded-xl text-center group transition-colors">
                    <ImageIcon className="w-6 h-6 text-gray-300 dark:text-gray-600 mx-auto group-hover:text-brand/60 mb-2 transition-colors" />
                    <span className="text-sm font-medium text-gray-500 font-jakarta group-hover:text-brand transition-colors">Select from Media Library</span>
                  </button>
                )}
                <p className="text-[11px] text-gray-400 mt-2 font-jakarta">Shown when shared on X, LinkedIn, WhatsApp. Defaults to the cover image (1200×630 recommended).</p>
              </div>
              <div className="space-y-6">
                <div>
                  <label className={`${seoLabel} block`}>Focus Keyword</label>
                  <input type="text" className={seoInput} placeholder="e.g. AI startup tools in India" maxLength={100} value={focusKeyword} onChange={(e) => setFocusKeyword(e.target.value)} />
                </div>
                <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
                  <div>
                    <span className="block text-sm font-bold text-navy dark:text-white font-jakarta">No Index</span>
                    <span className="block text-xs text-gray-500 font-jakarta mt-0.5">Hide this article from search engines</span>
                  </div>
                  <Toggle value={noIndex} onChange={setNoIndex} />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
