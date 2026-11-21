'use client';

import { useState, useRef } from 'react';
import { Plus, Trash2, Upload, Loader2 } from 'lucide-react';

export interface FounderDetail {
  name: string;
  role: string;
  prev?: string;
  bio: string;
  avatar: string;
  linkedin: string;
  twitter?: string;
}

interface FoundersDetailsManagerProps {
  founders: FounderDetail[];
  onChange: (founders: FounderDetail[]) => void;
  maxFounders?: number;
  uploadEndpoint?: string;
}

export default function FoundersDetailsManager({ founders, onChange, maxFounders = 5, uploadEndpoint = '/api/media/upload' }: FoundersDetailsManagerProps) {
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);
  const fileInputRefs = useRef<Record<number, HTMLInputElement | null>>({});

  const addFounder = () => {
    if (founders.length >= maxFounders) return;
    onChange([...founders, { name: '', role: '', prev: '', bio: '', avatar: '', linkedin: '', twitter: '' }]);
  };

  const removeFounder = (index: number) => {
    onChange(founders.filter((_, i) => i !== index));
  };

  const updateFounder = (index: number, field: keyof FounderDetail, value: string) => {
    const updated = [...founders];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  };

  const handlePhotoUpload = async (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select a JPG or PNG image file');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('Image must be less than 5MB');
      return;
    }

    setUploadingIndex(index);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(uploadEndpoint, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      updateFounder(index, 'avatar', data.url);
    } catch (err: any) {
      console.error('Photo upload failed:', err);
      alert('Upload failed: ' + (err.message || 'Please try again'));
    } finally {
      setUploadingIndex(null);
      if (fileInputRefs.current[index]) {
        fileInputRefs.current[index]!.value = '';
      }
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-900 dark:text-white font-sora">Founders <span className="text-red-500">*</span></h3>
        {founders.length < maxFounders && (
          <button
            type="button"
            onClick={addFounder}
            className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 text-[13px] font-semibold text-brand bg-brand/10 hover:bg-brand/20 rounded-lg whitespace-nowrap shrink-0 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Founder
          </button>
        )}
      </div>

      {founders.length === 0 && (
        <p className="text-xs text-gray-400 font-jakarta">No founders added. Click &quot;Add Founder&quot; to add team members.</p>
      )}

      {founders.map((founder, index) => (
        <div key={index} className="border border-gray-200 dark:border-gray-700 rounded-xl p-3 sm:p-4 space-y-3 relative">
          <button
            type="button"
            onClick={() => removeFounder(index)}
            className="absolute top-3 right-3 p-1 text-gray-400 hover:text-red-500 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>

          {/* Row 1: Photo + Name + Role */}
          <div className="flex gap-3">
            {/* Photo upload */}
            <div className="shrink-0 flex flex-col items-center">
              <input
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp"
                ref={(el) => { fileInputRefs.current[index] = el; }}
                onChange={(e) => handlePhotoUpload(index, e)}
                className="hidden"
              />
              {founder.avatar ? (
                <div className="relative group">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={founder.avatar}
                    alt={founder.name}
                    className="w-14 h-14 rounded-full object-cover border-2 border-gray-200 dark:border-gray-700"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRefs.current[index]?.click()}
                    className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Upload className="w-4 h-4 text-white" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRefs.current[index]?.click()}
                  disabled={uploadingIndex === index}
                  className="w-14 h-14 rounded-full border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center hover:border-brand transition-colors disabled:opacity-50"
                >
                  {uploadingIndex === index ? (
                    <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4 text-gray-400" />
                  )}
                </button>
              )}
              <span className="text-xs text-gray-400 mt-1 text-center leading-tight">JPG/PNG<br/>Max 5MB</span>
            </div>

            {/* Name + Role */}
            <div className="flex-1 space-y-2">
              <input
                type="text"
                value={founder.name || ''}
                onChange={(e) => updateFounder(index, 'name', e.target.value)}
                placeholder="Full name *"
                className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand focus:border-transparent"
              />
              <input
                type="text"
                value={founder.role || ''}
                onChange={(e) => updateFounder(index, 'role', e.target.value)}
                placeholder="Role (e.g. Co-founder & CEO)"
                className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand focus:border-transparent"
              />
            </div>
          </div>

          {/* Row 2: LinkedIn + Twitter */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[13px] font-semibold text-gray-600 dark:text-gray-300 mb-1">LinkedIn URL</label>
              <input
                type="url"
                value={founder.linkedin || ''}
                onChange={(e) => updateFounder(index, 'linkedin', e.target.value)}
                placeholder="https://linkedin.com/in/..."
                className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-[13px] font-semibold text-gray-600 dark:text-gray-300 mb-1">Twitter URL</label>
              <input
                type="url"
                value={founder.twitter || ''}
                onChange={(e) => updateFounder(index, 'twitter', e.target.value)}
                placeholder="https://twitter.com/..."
                className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand focus:border-transparent"
              />
            </div>
          </div>

          {/* Row 3: Bio */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[13px] font-semibold text-gray-600 dark:text-gray-300">Short Bio</label>
              <span className="text-xs text-gray-400">{(founder.bio || '').length}/800</span>
            </div>
            <textarea
              value={founder.bio || ''}
              onChange={(e) => {
                if ((e.target.value || '').length <= 800) {
                  updateFounder(index, 'bio', e.target.value);
                }
              }}
              placeholder="Brief background (1-2 lines)"
              rows={2}
              maxLength={800}
              className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand focus:border-transparent resize-none"
            />
          </div>

        </div>
      ))}
    </div>
  );
}
