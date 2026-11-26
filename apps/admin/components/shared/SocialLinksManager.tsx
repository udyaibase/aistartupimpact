'use client';

import { notify } from '@/components/Toast';
import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';

export interface SocialLink {
  platform: string;
  url: string;
}

interface SocialLinksManagerProps {
  links: SocialLink[];
  onChange: (links: SocialLink[]) => void;
}

const PLATFORM_OPTIONS = [
  { value: 'facebook', label: 'Facebook', placeholder: 'https://facebook.com/yourpage' },
  { value: 'crunchbase', label: 'Crunchbase', placeholder: 'https://crunchbase.com/organization/...' },
  { value: 'github', label: 'GitHub', placeholder: 'https://github.com/your-org' },
  { value: 'instagram', label: 'Instagram', placeholder: 'https://instagram.com/yourpage' },
  { value: 'youtube', label: 'YouTube', placeholder: 'https://youtube.com/@yourchannel' },
  { value: 'producthunt', label: 'Product Hunt', placeholder: 'https://producthunt.com/products/...' },
  { value: 'discord', label: 'Discord', placeholder: 'https://discord.gg/invite-code' },
];

export default function SocialLinksManager({ links = [], onChange }: SocialLinksManagerProps) {
  const [selectedPlatform, setSelectedPlatform] = useState(PLATFORM_OPTIONS[0].value);
  const [urlInput, setUrlInput] = useState('');

  const addLink = () => {
    if (!urlInput.trim()) return;
    
    // Check if platform is already added
    if (links.some(l => l.platform === selectedPlatform)) {
      notify(`A link for ${PLATFORM_OPTIONS.find(p => p.value === selectedPlatform)?.label} already exists.`);
      return;
    }

    const newLinks = [...links, { platform: selectedPlatform, url: urlInput.trim() }];
    onChange(newLinks);
    setUrlInput('');
    
    // Auto-select the next available platform
    const remaining = PLATFORM_OPTIONS.filter(p => !newLinks.some(l => l.platform === p.value));
    if (remaining.length > 0) {
      setSelectedPlatform(remaining[0].value);
    }
  };

  const removeLink = (platformToRemove: string) => {
    const newLinks = links.filter(l => l.platform !== platformToRemove);
    onChange(newLinks);
    
    // Reset selectedPlatform to first available if needed
    const remaining = PLATFORM_OPTIONS.filter(p => !newLinks.some(l => l.platform === p.value));
    if (remaining.length > 0 && !remaining.some(p => p.value === selectedPlatform)) {
      setSelectedPlatform(remaining[0].value);
    }
  };

  const getPlatformLabel = (value: string) => {
    return PLATFORM_OPTIONS.find(p => p.value === value)?.label || value;
  };

  const getPlatformPlaceholder = (value: string) => {
    return PLATFORM_OPTIONS.find(p => p.value === value)?.placeholder || 'https://...';
  };

  // Get platforms that haven't been added yet
  const availablePlatforms = PLATFORM_OPTIONS.filter(
    p => !links.some(l => l.platform === p.value)
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-semibold text-gray-900 dark:text-white font-sora">
          Additional Links / Socials
        </label>
      </div>

      {/* Added Links List */}
      {links.length > 0 && (
        <div className="space-y-2">
          {links.map((link) => (
            <div
              key={link.platform}
              className="flex items-center justify-between gap-3 px-4 py-2 border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/40 rounded-xl animate-in fade-in slide-in-from-top-1 duration-150"
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="text-xs font-semibold px-2 py-0.5 bg-brand/10 text-brand rounded uppercase font-jakarta">
                  {getPlatformLabel(link.platform)}
                </span>
                <span className="text-xs text-gray-600 dark:text-gray-305 truncate font-jakarta">
                  {link.url}
                </span>
              </div>
              <button
                type="button"
                onClick={() => removeLink(link.platform)}
                className="p-1 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add New Link Row */}
      {availablePlatforms.length > 0 ? (
        <div className="flex flex-col sm:flex-row gap-2">
          <select
            value={selectedPlatform}
            onChange={(e) => setSelectedPlatform(e.target.value)}
            className="w-full sm:w-48 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand focus:border-transparent font-jakarta text-sm"
          >
            {availablePlatforms.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
          <div className="flex-1 flex gap-2">
            <input
              type="url"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder={getPlatformPlaceholder(selectedPlatform)}
              className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand focus:border-transparent font-jakarta text-sm"
            />
            <button
              type="button"
              onClick={addLink}
              className="inline-flex items-center justify-center px-3 py-2 bg-brand hover:bg-brand/90 text-white rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-gray-400 dark:text-gray-500 font-jakarta">
          All supported platform links have been added.
        </p>
      )}
    </div>
  );
}
