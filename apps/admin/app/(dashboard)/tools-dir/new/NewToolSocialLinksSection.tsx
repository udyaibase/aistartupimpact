'use client';

import { Plus, X } from 'lucide-react';
import type { NewToolForm } from './types';

/** Social and community links for the tool. */
export default function NewToolSocialLinksSection({ formData, handleChange, socialLinks, setSocialLinks }: {
  formData: NewToolForm;
  handleChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
  socialLinks: Array<{ platform: string; url: string }>;
  setSocialLinks: React.Dispatch<React.SetStateAction<Array<{ platform: string; url: string }>>>;
}) {
  return (
    <>
      {/* Social Links */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-6 space-y-6">
        <h2 className="font-sora font-bold text-lg text-navy dark:text-white">Social Links</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta">
              Twitter / X URL
            </label>
            <input
              type="url"
              name="twitterUrl"
              value={formData.twitterUrl}
              onChange={handleChange}
              className="input-field text-sm"
              placeholder="https://x.com/..."
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta">
              LinkedIn URL <span className="text-red-500" aria-hidden>*</span>
            </label>
            <input
              type="url"
              name="linkedinUrl"
              value={formData.linkedinUrl}
              onChange={handleChange}
              className="input-field text-sm"
              placeholder="https://linkedin.com/company/..."
            />
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5 block font-jakarta">
            Additional Social Links
          </label>
          <div className="space-y-2">
            {socialLinks.map((link, index) => (
              <div key={index} className="flex gap-2 items-center">
                <select
                  value={link.platform}
                  onChange={(e) => {
                    const updated = [...socialLinks];
                    updated[index] = { ...updated[index], platform: e.target.value };
                    setSocialLinks(updated);
                  }}
                  className="input-field text-sm w-40"
                >
                  <option value="instagram">Instagram</option>
                  <option value="github">GitHub</option>
                  <option value="youtube">YouTube</option>
                  <option value="facebook">Facebook</option>
                  <option value="producthunt">Product Hunt</option>
                  <option value="discord">Discord</option>
                </select>
                <input
                  type="url"
                  value={link.url}
                  onChange={(e) => {
                    const updated = [...socialLinks];
                    updated[index] = { ...updated[index], url: e.target.value };
                    setSocialLinks(updated);
                  }}
                  className="input-field text-sm flex-1"
                  placeholder="https://..."
                />
                <button
                  type="button"
                  onClick={() => setSocialLinks(prev => prev.filter((_, i) => i !== index))}
                  className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setSocialLinks(prev => [...prev, { platform: 'instagram', url: '' }])}
              className="flex items-center gap-1.5 text-xs font-semibold text-brand hover:text-brand-600 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Add Social Link
            </button>
          </div>
        </div>
      </div>

    </>
  );
}
