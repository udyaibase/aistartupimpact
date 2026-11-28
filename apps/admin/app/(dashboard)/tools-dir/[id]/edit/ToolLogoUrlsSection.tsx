'use client';

import { Upload, Loader2 } from 'lucide-react';
import { Tool } from './types';

/** Logo upload and the tool's web addresses. */
export default function ToolLogoUrlsSection({ formData, handleChange, logoUploading, fileInputRef, logoPreviewError, logoUploadError, setLogoPreviewError, handleLogoUpload }: {
  formData: Tool;
  handleChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
  logoUploading: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  logoPreviewError: boolean;
  logoUploadError: string | null;
  setLogoPreviewError: (v: boolean) => void;
  handleLogoUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <>
      {/* Logo & URLs */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-6 space-y-6">
        <h2 className="font-sora font-bold text-lg text-navy dark:text-white">Logo & URLs</h2>

        <div>
          <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta">
            Logo <span className="text-red-500" aria-hidden>*</span>
          </label>
          <div className="flex gap-2 items-start">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleLogoUpload}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={logoUploading}
              className="shrink-0 flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 disabled:opacity-50"
            >
              {logoUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              {logoUploading ? 'Uploading…' : 'Upload'}
            </button>
            <input
              type="url"
              name="logoUrl"
              value={formData.logoUrl || ''}
              onChange={(e) => { handleChange(e); setLogoPreviewError(false); }}
              className="input-field text-sm flex-1"
              placeholder="https://... or upload above"
            />
          </div>
          {logoUploadError && (
            <p className="mt-1.5 text-xs text-red-500 font-jakarta">{logoUploadError}</p>
          )}
          {formData.logoUrl && logoPreviewError && (
            <p className="mt-1.5 text-xs text-amber-600 font-jakarta">
              Logo URL could not be loaded. The image may not be publicly reachable — check the URL or the media domain.
            </p>
          )}
          {formData.logoUrl && !logoPreviewError && (
            <div className="mt-2 flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={formData.logoUrl}
                alt="Logo preview"
                className="w-12 h-12 rounded-lg object-contain border border-gray-200 dark:border-gray-700 p-1 bg-white"
                onError={() => setLogoPreviewError(true)}
              />
              <span className="text-xs text-gray-400 font-jakarta">Preview</span>
            </div>
          )}
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta">
            Website URL *
          </label>
          <input
            type="url"
            name="websiteUrl"
            value={formData.websiteUrl}
            onChange={handleChange}
            required
            className="input-field text-sm"
            placeholder="https://..."
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta">
            Affiliate/Referral URL
          </label>
          <input
            type="url"
            name="affiliateUrl"
            value={formData.affiliateUrl || ''}
            onChange={handleChange}
            className="input-field text-sm"
            placeholder="https://..."
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta">
            Demo Video URL
          </label>
          <input
            type="url"
            name="demoVideoUrl"
            value={formData.demoVideoUrl || ''}
            onChange={handleChange}
            className="input-field text-sm"
            placeholder="YouTube, Vimeo, or Loom URL"
          />
          <p className="text-[10px] text-gray-400 font-jakarta mt-1">Accepts YouTube, Vimeo, or Loom links</p>
        </div>
      </div>

    </>
  );
}
