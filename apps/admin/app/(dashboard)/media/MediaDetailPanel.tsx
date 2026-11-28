'use client';

import { useState, useEffect } from 'react';
import { Trash2, X, Copy, Check, Loader2, AlertTriangle, FileText } from 'lucide-react';
import { getMediaUsageAction } from './actions';
import { MediaFile, UsageEntry } from './types';

export function MediaDetailPanel({
  file, onClose, onCopyUrl, copied, onDelete, onUpdate,
}: {
  file: MediaFile;
  onClose: () => void;
  onCopyUrl: (id: string, url: string) => void;
  copied: string | null;
  onDelete: (id: string) => void;
  onUpdate: (id: string, data: { originalName?: string; alt?: string; tags?: string[] }) => void;
}) {
  const [editName, setEditName] = useState(file.name);
  const [editAlt, setEditAlt] = useState(file.alt || '');
  const [editTags, setEditTags] = useState(file.tags.join(', '));
  const [usages, setUsages] = useState<UsageEntry[]>([]);
  const [loadingUsage, setLoadingUsage] = useState(true);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setEditName(file.name);
    setEditAlt(file.alt || '');
    setEditTags(file.tags.join(', '));
    setDirty(false);
    setLoadingUsage(true);
    getMediaUsageAction(file.id).then(res => {
      if (res.success) setUsages(res.data);
      setLoadingUsage(false);
    });
  }, [file.id]);

  const handleSave = () => {
    const tags = editTags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
    onUpdate(file.id, {
      originalName: editName !== file.name ? editName : undefined,
      alt: editAlt !== (file.alt || '') ? editAlt : undefined,
      tags,
    });
    setDirty(false);
  };

  const isImage = file.mimeType.startsWith('image/');
  const entityTypeLabel: Record<string, string> = {
    ARTICLE: 'Article',
    TOOL: 'AI Tool',
    STARTUP: 'Startup',
    INVESTOR: 'Investor',
    EVENT: 'Event',
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex justify-end" onClick={onClose}>
      <div
        className="w-full max-w-md bg-white dark:bg-gray-900 h-full overflow-y-auto shadow-2xl border-l border-gray-200 dark:border-gray-800 animate-slide-in"
        onClick={e => e.stopPropagation()}
      >
        {/* Close */}
        <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 px-5 py-3 flex items-center justify-between z-10">
          <h2 className="font-sora font-bold text-sm text-navy dark:text-white truncate">{file.name}</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Preview */}
          <div className="rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800 flex items-center justify-center min-h-[200px]">
            {isImage && file.url ? (
              <img src={file.url} alt={file.alt || file.name} className="max-w-full max-h-[300px] object-contain" />
            ) : (
              <FileText className="w-12 h-12 text-gray-300 dark:text-gray-600" />
            )}
          </div>

          {/* Info */}
          <div className="space-y-1 text-sm font-jakarta">
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Type</span>
              <span className="text-gray-700 dark:text-gray-300">{file.mimeType}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Size</span>
              <span className="text-gray-700 dark:text-gray-300">{file.size}</span>
            </div>
            {file.width && file.height && (
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Dimensions</span>
                <span className="text-gray-700 dark:text-gray-300">{file.width} × {file.height}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Uploaded</span>
              <span className="text-gray-700 dark:text-gray-300">{new Date(file.uploadedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Category</span>
              <span className="text-gray-700 dark:text-gray-300 capitalize">{file.prefix}</span>
            </div>
            {file.backfilled && (
              <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 mt-1">
                <AlertTriangle className="w-3 h-3" />
                Backfilled — name may be approximate
              </div>
            )}
          </div>

          {/* Editable fields */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 font-jakarta mb-1">Filename</label>
              <input
                type="text"
                value={editName}
                onChange={e => { setEditName(e.target.value); setDirty(true); }}
                className="input-field text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 font-jakarta mb-1">Alt text</label>
              <input
                type="text"
                value={editAlt}
                onChange={e => { setEditAlt(e.target.value); setDirty(true); }}
                placeholder="Describe this image..."
                className="input-field text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 font-jakarta mb-1">Tags (comma-separated)</label>
              <input
                type="text"
                value={editTags}
                onChange={e => { setEditTags(e.target.value); setDirty(true); }}
                placeholder="funding, startup, chart"
                className="input-field text-sm"
              />
            </div>
            {dirty && (
              <button onClick={handleSave} className="btn-brand text-sm w-full">
                Save Changes
              </button>
            )}
          </div>

          {/* Usage */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 font-jakarta mb-2 uppercase tracking-wider">Usage</h3>
            {loadingUsage ? (
              <div className="py-4 flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-gray-400" /></div>
            ) : usages.length === 0 ? (
              <p className="text-xs text-gray-400 font-jakarta py-2">Not used in any content</p>
            ) : (
              <ul className="space-y-1.5">
                {usages.map(u => (
                  <li key={u.id} className="flex items-center gap-2 text-sm font-jakarta">
                    <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 rounded">
                      {entityTypeLabel[u.entityType] || u.entityType}
                    </span>
                    <span className="text-gray-700 dark:text-gray-300 truncate">{u.entityName}</span>
                    {u.field && <span className="text-[10px] text-gray-400">({u.field})</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
            <button
              onClick={() => onCopyUrl(file.id, file.url)}
              className="flex-1 px-3 py-2 text-sm font-medium border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 flex items-center justify-center gap-1.5 font-jakarta"
            >
              {copied === file.id ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
              {copied === file.id ? 'Copied' : 'Copy URL'}
            </button>
            <button
              onClick={() => onDelete(file.id)}
              className="px-3 py-2 text-sm font-medium bg-red-500 hover:bg-red-600 text-white rounded-xl flex items-center justify-center gap-1.5 font-jakarta"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Client-side slug helper (mirrors server) ────────────────────────────────
