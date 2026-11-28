'use client';

import { useState, useRef } from 'react';
import { Loader2, Upload, Type, X } from 'lucide-react';

export function BrandAssetUpload({ label, description, assetType, currentUrl, accept, onUploaded }: {
  label: string; description: string; assetType: string; currentUrl: string | null; accept: string; onUploaded: (url: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (file: File) => {
    setUploading(true); setError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('assetType', assetType);
      const res = await fetch('/api/admin/brand', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.success) onUploaded(data.url);
      else setError(data.error || 'Upload failed');
    } catch { setError('Upload failed'); }
    finally { setUploading(false); }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase font-jakarta">{label}</p>
          <p className="text-[11px] text-gray-400 font-jakarta">{description}</p>
        </div>
        {uploading && <Loader2 className="w-4 h-4 animate-spin text-brand" />}
      </div>
      <div
        onClick={() => fileRef.current?.click()}
        className="relative border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl p-4 text-center cursor-pointer hover:border-brand transition-colors group"
      >
        {currentUrl ? (
          <div className="flex items-center justify-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={currentUrl} alt={label} className="h-10 max-w-[160px] object-contain rounded" />
            <span className="text-xs text-gray-400 group-hover:text-brand font-jakarta transition-colors">Click to replace</span>
          </div>
        ) : (
          <div className="py-2">
            <Upload className="w-5 h-5 text-gray-300 dark:text-gray-600 mx-auto mb-1" />
            <p className="text-xs text-gray-400 font-jakarta">Click to upload</p>
          </div>
        )}
        <input ref={fileRef} type="file" accept={accept} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ''; }} />
      </div>
      {error && <p className="text-xs text-red-500 font-jakarta">{error}</p>}
    </div>
  );
}

export const GOOGLE_FONTS_LIST = [
  { name: "Inter", category: "Sans-serif" },
  { name: "Plus Jakarta Sans", category: "Sans-serif" },
  { name: "Sora", category: "Sans-serif" },
  { name: "DM Sans", category: "Sans-serif" },
  { name: "Outfit", category: "Sans-serif" },
  { name: "Space Grotesk", category: "Sans-serif" },
  { name: "Manrope", category: "Sans-serif" },
  { name: "Poppins", category: "Sans-serif" },
  { name: "Lora", category: "Serif" },
  { name: "Playfair Display", category: "Serif" },
  { name: "Source Serif 4", category: "Serif" },
  { name: "Fraunces", category: "Serif" },
  { name: "JetBrains Mono", category: "Monospace" },
];

export function ColorPicker({ label, description, value, onChange }: { label: string; description: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-4">
      <input type="color" className="w-10 h-10 rounded-lg border-2 border-gray-200 dark:border-gray-700 cursor-pointer" value={value} onChange={(e) => onChange(e.target.value)} />
      <div className="flex-1">
        <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 font-jakarta">{label}</p>
        <p className="text-[11px] text-gray-400 font-jakarta">{description}</p>
      </div>
      <input type="text" className="input-field text-xs font-mono w-24 text-center" value={value}
        onChange={(e) => { if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)) onChange(e.target.value); }} maxLength={7} />
      <div className="flex gap-1">
        <div className="w-6 h-6 rounded" style={{ backgroundColor: value }} />
        <div className="w-6 h-6 rounded" style={{ backgroundColor: value, opacity: 0.2 }} />
      </div>
    </div>
  );
}

export function FontSelector({ label, description, selectedFont, customFontName, customFontUrl, onFontChange, onUploadFont, onRemoveCustomFont, role }: {
  label: string; description: string; selectedFont: string | null; customFontName: string | null; customFontUrl: string | null;
  onFontChange: (font: string | null) => void; onUploadFont: (file: File, fontName: string) => void; onRemoveCustomFont: () => void; role: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [fontNameInput, setFontNameInput] = useState('');
  const [showUpload, setShowUpload] = useState(false);

  const handleFileSelect = async (file: File) => {
    if (!file.name.endsWith('.woff2')) { setUploadError('Only .woff2 files accepted'); return; }
    if (file.size > 2 * 1024 * 1024) { setUploadError('File must be under 2MB'); return; }
    const name = fontNameInput.trim() || file.name.replace(/\.woff2$/i, '');
    setUploading(true); setUploadError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('assetType', role === 'display' ? 'customDisplayFont' : 'customBodyFont');
      formData.append('fontName', name);
      const res = await fetch('/api/admin/brand', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.success) { onUploadFont(file, data.fontName); setShowUpload(false); setFontNameInput(''); }
      else setUploadError(data.error || 'Upload failed');
    } catch { setUploadError('Upload failed'); }
    finally { setUploading(false); }
  };

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 font-jakarta">{label}</p>
        <p className="text-[11px] text-gray-400 font-jakarta">{description}</p>
      </div>

      {customFontName && customFontUrl ? (
        <div className="flex items-center gap-3 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
          <Type className="w-4 h-4 text-brand" />
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-900 dark:text-white font-jakarta">{customFontName}</p>
            <p className="text-[10px] text-gray-400 font-jakarta">Custom uploaded font</p>
          </div>
          <button onClick={onRemoveCustomFont} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <select
          className="input-field text-sm w-full"
          value={selectedFont || ''}
          onChange={(e) => onFontChange(e.target.value || null)}
        >
          <option value="">System default</option>
          {Object.entries(
            GOOGLE_FONTS_LIST.reduce((acc, f) => {
              if (!acc[f.category]) acc[f.category] = [];
              acc[f.category].push(f.name);
              return acc;
            }, {} as Record<string, string[]>)
          ).map(([category, fonts]) => (
            <optgroup key={category} label={category}>
              {fonts.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </optgroup>
          ))}
        </select>
      )}

      {!customFontUrl && (
        <>
          {showUpload ? (
            <div className="space-y-2 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
              <input type="text" className="input-field text-sm" placeholder="Font family name (e.g., My Brand Font)" value={fontNameInput} onChange={(e) => setFontNameInput(e.target.value)} />
              <div onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg p-3 text-center cursor-pointer hover:border-brand transition-colors">
                {uploading ? <Loader2 className="w-4 h-4 animate-spin text-brand mx-auto" /> : (
                  <p className="text-xs text-gray-400 font-jakarta"><Upload className="w-4 h-4 mx-auto mb-1 text-gray-300" />Click to upload .woff2 file (max 2MB)</p>
                )}
                <input ref={fileRef} type="file" accept=".woff2" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); e.target.value = ''; }} />
              </div>
              {uploadError && <p className="text-xs text-red-500 font-jakarta">{uploadError}</p>}
              <button onClick={() => { setShowUpload(false); setUploadError(''); }} className="text-xs text-gray-400 hover:text-gray-600 font-jakarta">Cancel</button>
            </div>
          ) : (
            <button onClick={() => setShowUpload(true)} className="text-xs text-brand hover:text-brand/80 font-semibold font-jakarta flex items-center gap-1">
              <Upload className="w-3 h-3" /> Upload custom font
            </button>
          )}
        </>
      )}
    </div>
  );
}
