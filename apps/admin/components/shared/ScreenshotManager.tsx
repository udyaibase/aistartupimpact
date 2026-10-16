'use client';

import { useState, useRef, useCallback } from 'react';
import { X, Plus, Loader2, GripVertical, ImagePlus, Globe, Check, RotateCcw } from 'lucide-react';

interface ScreenshotMeta {
  source: 'auto' | 'manual';
  createdAt: string;
}

interface ScreenshotManagerProps {
  screenshots: string[];
  onChange: (screenshots: string[]) => void;
  maxScreenshots?: number;
  uploadEndpoint?: string;
  toolId?: string;
  websiteUrl?: string;
  screenshotMeta?: Record<string, ScreenshotMeta>;
  onMetaChange?: (meta: Record<string, ScreenshotMeta>) => void;
}

export default function ScreenshotManager({
  screenshots,
  onChange,
  maxScreenshots = 5,
  uploadEndpoint = '/api/media/upload',
  toolId,
  websiteUrl,
  screenshotMeta = {},
  onMetaChange,
}: ScreenshotManagerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOverZone, setDragOverZone] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [fetching, setFetching] = useState(false);
  const [fetchPreview, setFetchPreview] = useState<{ url: string; sizeBytes: number; needsReview: boolean; allUrls: string[] } | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const uploadFiles = useCallback(async (files: File[]) => {
    const imageFiles = files.filter(f => f.type.startsWith('image/'));
    if (imageFiles.length === 0) return;

    if (screenshots.length + imageFiles.length > maxScreenshots) {
      alert(`Maximum ${maxScreenshots} screenshots allowed`);
      return;
    }

    setUploading(true);
    const newUrls: string[] = [];

    for (const file of imageFiles) {
      try {
        const fd = new FormData();
        fd.append('file', file);
        const res = await fetch(uploadEndpoint, { method: 'POST', body: fd });
        const result = await res.json();
        if (res.ok && result.success && result.url) {
          newUrls.push(result.url);
        }
      } catch (err) {
        console.error('Screenshot upload error:', err);
      }
    }

    if (newUrls.length > 0) {
      onChange([...screenshots, ...newUrls]);
      if (onMetaChange) {
        const updated = { ...screenshotMeta };
        for (const url of newUrls) {
          updated[url] = { source: 'manual', createdAt: new Date().toISOString() };
        }
        onMetaChange(updated);
      }
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [screenshots, onChange, maxScreenshots, uploadEndpoint, screenshotMeta, onMetaChange]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    uploadFiles(Array.from(e.target.files || []));
  };

  const handleDropZone = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverZone(false);
    if (dragIndex !== null) return;
    uploadFiles(Array.from(e.dataTransfer.files));
  };

  const handleDragOverZone = (e: React.DragEvent) => {
    e.preventDefault();
    if (dragIndex !== null) return;
    setDragOverZone(true);
  };

  const remove = (index: number) => {
    const removedUrl = screenshots[index];
    onChange(screenshots.filter((_, i) => i !== index));
    if (onMetaChange && removedUrl) {
      const updated = { ...screenshotMeta };
      delete updated[removedUrl];
      onMetaChange(updated);
    }
  };

  const handleDragStart = (index: number) => {
    setDragIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragIndex === null) return;
    setDragOverIndex(index);
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === targetIndex) {
      setDragIndex(null);
      setDragOverIndex(null);
      return;
    }

    const reordered = [...screenshots];
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(targetIndex, 0, moved);
    onChange(reordered);
    setDragIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDragIndex(null);
    setDragOverIndex(null);
  };

  const handleFetchScreenshot = async () => {
    if (!toolId) return;
    setFetching(true);
    setFetchError(null);
    setFetchPreview(null);

    try {
      const res = await fetch(`/api/admin/tools/${toolId}/screenshot`, {
        method: 'POST',
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setFetchError(data.error || 'Failed to capture screenshot');
        return;
      }

      setFetchPreview({
        url: data.url,
        sizeBytes: data.sizeBytes,
        needsReview: data.needsReview,
        allUrls: data.screenshotUrls,
      });
    } catch (err: any) {
      setFetchError(err.message || 'Network error');
    } finally {
      setFetching(false);
    }
  };

  const confirmFetchedScreenshot = () => {
    if (!fetchPreview) return;
    onChange(fetchPreview.allUrls);
    if (onMetaChange) {
      const updated = { ...screenshotMeta };
      updated[fetchPreview.url] = { source: 'auto', createdAt: new Date().toISOString() };
      onMetaChange(updated);
    }
    setFetchPreview(null);
  };

  const discardFetchedScreenshot = () => {
    setFetchPreview(null);
  };

  const getSource = (url: string): 'auto' | 'manual' | undefined => {
    return screenshotMeta[url]?.source;
  };

  const autoCount = Object.values(screenshotMeta).filter(m => m.source === 'auto').length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-sora font-bold text-lg text-navy dark:text-white">
          Screenshots ({screenshots.length}/{maxScreenshots})
        </h2>
        <div className="flex items-center gap-3">
          {screenshots.length > 1 && (
            <span className="text-xs text-gray-400 font-jakarta">Drag to reorder</span>
          )}
        </div>
      </div>

      {/* Auto-fetch button */}
      {toolId && websiteUrl && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleFetchScreenshot}
            disabled={fetching || screenshots.length >= maxScreenshots}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {fetching ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Capturing...
              </>
            ) : (
              <>
                <Globe className="w-4 h-4" />
                {autoCount > 0 ? `Fetch another (${autoCount} auto)` : 'Fetch from website'}
              </>
            )}
          </button>
          <span className="text-xs text-gray-500 font-jakarta truncate max-w-xs">
            {websiteUrl}
          </span>
        </div>
      )}

      {/* Fetch error */}
      {fetchError && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-sm text-red-700 dark:text-red-400">{fetchError}</p>
        </div>
      )}

      {/* Fetch preview — admin confirms before saving */}
      {fetchPreview && (
        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-blue-800 dark:text-blue-300">
              Preview — confirm or discard
            </span>
            <span className="text-xs text-gray-500 font-jakarta">
              {(fetchPreview.sizeBytes / 1024).toFixed(0)} KB
            </span>
          </div>

          {fetchPreview.needsReview && (
            <div className="p-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-lg">
              <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">
                This file is suspiciously small — it may be a bot challenge or blank page. Please check carefully.
              </p>
            </div>
          )}

          <div className="relative aspect-video max-w-lg rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
            <img
              src={fetchPreview.url}
              alt="Captured screenshot preview"
              className="w-full h-full object-cover"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={confirmFetchedScreenshot}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Check className="w-4 h-4" />
              Confirm & Save
            </button>
            <button
              type="button"
              onClick={discardFetchedScreenshot}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
              Discard
            </button>
            <button
              type="button"
              onClick={handleFetchScreenshot}
              disabled={fetching}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-sm font-medium rounded-lg transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Drop zone */}
      <div
        onDrop={handleDropZone}
        onDragOver={handleDragOverZone}
        onDragLeave={() => setDragOverZone(false)}
        className={`border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer ${
          dragOverZone
            ? 'border-brand bg-brand/5 scale-[1.01]'
            : 'border-gray-300 dark:border-gray-700 hover:border-brand/50'
        }`}
        onClick={() => !uploading && fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleFileChange}
          disabled={uploading || screenshots.length >= maxScreenshots}
        />
        {uploading ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="w-8 h-8 text-brand animate-spin" />
            <p className="text-sm text-gray-500 font-jakarta">Uploading...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <ImagePlus className="w-8 h-8 text-gray-400" />
            <p className="text-sm text-gray-600 dark:text-gray-400 font-jakarta">
              <span className="text-brand font-semibold">Click to upload</span> or drag & drop images here
            </p>
            <p className="text-xs text-gray-400 font-jakarta">
              PNG, JPG, WebP — up to {maxScreenshots} screenshots
            </p>
          </div>
        )}
      </div>

      {/* Screenshots grid with drag-to-reorder */}
      {screenshots.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {screenshots.map((url, index) => (
            <div
              key={`${url}-${index}`}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={(e) => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
              className={`relative aspect-video rounded-lg overflow-hidden border-2 group cursor-grab active:cursor-grabbing transition-all ${
                dragIndex === index
                  ? 'opacity-40 scale-95 border-brand'
                  : dragOverIndex === index
                  ? 'border-brand shadow-lg scale-105'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              <img
                src={url}
                alt={`Screenshot ${index + 1}`}
                className="w-full h-full object-cover pointer-events-none"
              />

              {/* Source + order badge */}
              <div className="absolute bottom-1 left-1 flex items-center gap-1">
                <span className="bg-black/60 text-white text-[10px] font-bold px-1.5 py-0.5 rounded font-jakarta">
                  {index + 1}
                </span>
                {getSource(url) === 'auto' && (
                  <span className="bg-blue-600/80 text-white text-[9px] font-bold px-1.5 py-0.5 rounded font-jakarta">
                    AUTO
                  </span>
                )}
              </div>

              {/* Drag handle */}
              <div className="absolute top-1 left-1 opacity-0 group-hover:opacity-100 bg-black/50 p-0.5 rounded transition-opacity">
                <GripVertical className="w-3.5 h-3.5 text-white" />
              </div>

              {/* Remove button */}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); remove(index); }}
                className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 p-1 bg-red-500 rounded-full text-white hover:bg-red-600 transition-opacity"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}

          {/* Add more button in grid */}
          {screenshots.length < maxScreenshots && !uploading && (
            <label className="aspect-video border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg flex items-center justify-center cursor-pointer hover:border-brand transition-colors">
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleFileChange}
              />
              <Plus className="w-6 h-6 text-gray-400" />
            </label>
          )}
        </div>
      )}
    </div>
  );
}
