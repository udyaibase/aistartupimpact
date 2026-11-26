'use client';

import { notify } from '@/components/Toast';
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Image as ImageIcon, Upload, Trash2, Search, X, Copy, Check, Loader2,
  Filter, Tag, ExternalLink, Edit3, ChevronRight, BarChart3, AlertTriangle,
  FileText, RefreshCw,
} from 'lucide-react';
import {
  listMediaAction, uploadMediaFileAction, deleteMediaAction,
  updateMediaAction, getMediaUsageAction, getMediaStatsAction,
  getFoldersAction,
} from './actions';

// ── Types ───────────────────────────────────────────────────────────────────

interface MediaFile {
  id: string;
  key: string;
  name: string;
  slug: string;
  mimeType: string;
  size: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  alt: string | null;
  tags: string[];
  url: string;
  prefix: string;
  backfilled: boolean;
  usageCount: number;
  uploadedAt: string;
}

interface MediaStats {
  totalFiles: number;
  totalSize: string;
  totalSizeBytes: number;
  unusedCount: number;
  byType: Array<{ mimeType: string; count: number; size: string }>;
}

interface UsageEntry {
  id: string;
  entityType: string;
  entityId: string;
  entityName: string;
  field: string | null;
}

interface Folder {
  prefix: string;
  label: string;
  count: number;
  size: string;
}

type UsageFilter = 'all' | 'used' | 'unused';

// ── Component ───────────────────────────────────────────────────────────────

export default function MediaPage() {
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [prefixFilter, setPrefixFilter] = useState('');
  const [usageFilter, setUsageFilter] = useState<UsageFilter>('all');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<MediaStats | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detailFile, setDetailFile] = useState<MediaFile | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);

  // Fetch folders
  useEffect(() => {
    getFoldersAction().then(res => {
      if (res.success) setFolders(res.data);
    });
  }, []);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Fetch files
  const fetchMedia = useCallback(async (append = false) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await listMediaAction({
        cursor: append ? nextCursor ?? undefined : undefined,
        search: searchDebounced || undefined,
        prefix: prefixFilter || undefined,
        usageFilter: usageFilter || undefined,
      });
      if (res.success) {
        setFiles(prev => append ? [...prev, ...res.data] : res.data);
        setTotal(res.total);
        setNextCursor(res.nextCursor);
      } else {
        setError(res.error || 'Failed to load media');
      }
    } catch {
      setError('Failed to connect to media storage');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [searchDebounced, prefixFilter, usageFilter, nextCursor]);

  // Refetch on filter change
  useEffect(() => {
    setSelected(new Set());
    fetchMedia(false);
  }, [searchDebounced, prefixFilter, usageFilter]);

  // Fetch stats
  useEffect(() => {
    getMediaStatsAction().then(res => {
      if (res.success) setStats(res.data);
    });
  }, [files.length]);

  // ── Upload handler ──────────────────────────────────────────────────────

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    const names: string[] = [];

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      names.push(file.name);
      setUploadProgress([...names]);

      try {
        const formData = new FormData();
        formData.append('file', file);
        if (prefixFilter) formData.append('prefix', prefixFilter);
        const res = await uploadMediaFileAction(formData);
        if (res.success && res.data) {
          setFiles(prev => [res.data as MediaFile, ...prev]);
          setTotal(prev => prev + 1);
        } else {
          notify(`Failed to upload ${file.name}: ${res.error || 'Unknown error'}`);
        }
      } catch {
        notify(`Failed to upload ${file.name}`);
      }
    }

    setUploading(false);
    setUploadProgress([]);
  };

  // ── Delete handler ────────────────────────────────────────────────────

  const handleDelete = async (id: string) => {
    try {
      const res = await deleteMediaAction(id);
      if (res.success) {
        setFiles(prev => prev.filter(f => f.id !== id));
        setTotal(prev => prev - 1);
        if (detailFile?.id === id) setDetailFile(null);
      } else {
        notify(res.error || 'Delete failed');
      }
    } catch {
      notify('Delete failed');
    } finally {
      setDeleteConfirm(null);
    }
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selected);
    for (const id of ids) {
      await handleDelete(id);
    }
    setSelected(new Set());
    setBulkDeleteConfirm(false);
  };

  // ── Copy URL ──────────────────────────────────────────────────────────

  const copyUrl = (id: string, url: string) => {
    navigator.clipboard?.writeText(url);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  // ── Toggle select ─────────────────────────────────────────────────────

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === files.length) setSelected(new Set());
    else setSelected(new Set(files.map(f => f.id)));
  };

  // ── Drag-drop ─────────────────────────────────────────────────────────

  const dropRef = useRef<HTMLDivElement>(null);

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragOver(true); };
  const onDragLeave = () => setDragOver(false);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  const isImage = (mime: string) => mime.startsWith('image/');

  return (
    <div className="space-y-5">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="portal-title">Media Library</h1>
          <p className="portal-subtitle">
            {loading ? 'Loading...' : `${total.toLocaleString()} file${total === 1 ? '' : 's'}`}
            {stats ? ` · ${stats.totalSize}` : ''}
            {stats && stats.unusedCount > 0 ? ` · ${stats.unusedCount} unused` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <button
              onClick={() => setBulkDeleteConfirm(true)}
              className="px-3 py-2 text-sm font-medium bg-red-500 hover:bg-red-600 text-white rounded-xl flex items-center gap-1.5 font-jakarta"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete {selected.size}
            </button>
          )}
          <input type="file" onChange={e => { handleFiles(e.target.files); e.target.value = ''; }} id="media-upload" className="hidden" accept="image/*,video/*,.pdf" multiple disabled={uploading} />
          <label htmlFor="media-upload" className={`btn-brand text-sm flex items-center gap-2 cursor-pointer ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploading ? `Uploading (${uploadProgress.length})...` : 'Upload'}
          </label>
        </div>
      </div>

      {/* ── Drop zone ──────────────────────────────────────────────────── */}
      <div
        ref={dropRef}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer bg-white dark:bg-gray-900 ${
          dragOver
            ? 'border-brand bg-brand/5'
            : 'border-gray-300 dark:border-gray-700 hover:border-brand'
        }`}
        onClick={() => document.getElementById('media-upload')?.click()}
      >
        <Upload className={`w-7 h-7 mx-auto mb-1.5 ${dragOver ? 'text-brand animate-bounce' : 'text-gray-300 dark:text-gray-600'}`} />
        <p className="text-sm text-gray-500 dark:text-gray-400 font-jakarta">
          {uploading
            ? `Uploading ${uploadProgress[uploadProgress.length - 1]}...`
            : `Drop files here or click to upload${prefixFilter ? ` to ${folders.find(f => f.prefix === prefixFilter)?.label || prefixFilter}` : ''}`}
        </p>
        <p className="text-xs text-gray-300 dark:text-gray-600 font-jakarta mt-0.5">PNG, JPG, WebP, SVG, AVIF, PDF up to 20MB · Multiple files supported</p>
      </div>

      {/* ── Folder tabs ──────────────────────────────────────────────── */}
      {folders.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-1 -mx-1 px-1">
          <button
            onClick={() => setPrefixFilter('')}
            className={`shrink-0 px-4 py-2 rounded-xl text-sm font-semibold font-jakarta transition-all flex items-center gap-2 ${
              prefixFilter === ''
                ? 'bg-brand text-white shadow-sm'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            All Files
            <span className={`text-xs px-1.5 py-0.5 rounded-full ${prefixFilter === '' ? 'bg-white/20' : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>
              {folders.reduce((sum, f) => sum + f.count, 0).toLocaleString()}
            </span>
          </button>
          {folders.map((folder) => (
            <button
              key={folder.prefix}
              onClick={() => setPrefixFilter(folder.prefix)}
              className={`shrink-0 px-4 py-2 rounded-xl text-sm font-semibold font-jakarta transition-all flex items-center gap-2 ${
                prefixFilter === folder.prefix
                  ? 'bg-brand text-white shadow-sm'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              {folder.label}
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${prefixFilter === folder.prefix ? 'bg-white/20' : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>
                {folder.count.toLocaleString()}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* ── Search + Usage filter ──────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name, alt text, or tags..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field pl-10"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full">
              <X className="w-3.5 h-3.5 text-gray-400" />
            </button>
          )}
        </div>
        <select
          value={usageFilter}
          onChange={(e) => setUsageFilter(e.target.value as UsageFilter)}
          className="input-field text-sm w-auto min-w-[120px]"
        >
          <option value="all">All Files</option>
          <option value="used">Used</option>
          <option value="unused">Unused</option>
        </select>
      </div>

      {/* ── Select all bar ─────────────────────────────────────────────── */}
      {files.length > 0 && (
        <div className="flex items-center gap-3">
          <button onClick={selectAll} className="text-xs text-brand hover:underline font-jakarta font-semibold">
            {selected.size === files.length ? 'Deselect all' : 'Select all'}
          </button>
          {selected.size > 0 && (
            <span className="text-xs text-gray-400 font-jakarta">{selected.size} selected</span>
          )}
        </div>
      )}

      {/* ── Error ──────────────────────────────────────────────────────── */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 text-sm text-red-600 dark:text-red-400 font-jakarta flex items-center justify-between">
          {error}
          <button onClick={() => fetchMedia(false)} className="text-red-600 dark:text-red-400 hover:underline text-xs font-semibold ml-4">Retry</button>
        </div>
      )}

      {/* ── Grid ───────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="py-20 flex justify-center"><Loader2 className="w-8 h-8 text-brand animate-spin" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
            {files.length === 0 && (
              <div className="col-span-full py-10 text-center text-sm text-gray-400 font-jakarta">
                {search || prefixFilter || usageFilter !== 'all'
                  ? 'No files match your filters.'
                  : 'No media files yet. Upload your first file above.'}
              </div>
            )}
            {files.map((file) => (
              <div
                key={file.id}
                className={`bg-white dark:bg-gray-900 rounded-xl border overflow-hidden group transition-colors cursor-pointer ${
                  selected.has(file.id)
                    ? 'border-brand ring-2 ring-brand/20'
                    : 'border-gray-100 dark:border-gray-800 hover:border-brand/30'
                }`}
                onClick={() => setDetailFile(file)}
              >
                <div className="aspect-square bg-gray-100 dark:bg-gray-800 flex items-center justify-center relative overflow-hidden">
                  {/* Checkbox */}
                  <div
                    className={`absolute top-2 left-2 z-10 w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                      selected.has(file.id)
                        ? 'bg-brand border-brand'
                        : 'border-gray-300 dark:border-gray-600 opacity-0 group-hover:opacity-100 bg-white/80 dark:bg-gray-900/80'
                    }`}
                    onClick={(e) => { e.stopPropagation(); toggleSelect(file.id); }}
                  >
                    {selected.has(file.id) && <Check className="w-3 h-3 text-white" />}
                  </div>

                  {isImage(file.mimeType) && file.url ? (
                    <img src={file.url} alt={file.alt || file.name} className="object-cover w-full h-full" loading="lazy" />
                  ) : (
                    <FileText className="w-8 h-8 text-gray-300 dark:text-gray-600" />
                  )}

                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); copyUrl(file.id, file.url); }}
                      className="p-2 bg-white/20 rounded-lg hover:bg-white/40 transition-colors"
                      title="Copy URL"
                    >
                      {copied === file.id ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-white" />}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteConfirm(file.id); }}
                      className="p-2 bg-white/20 rounded-lg hover:bg-red-500/50 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4 text-white" />
                    </button>
                  </div>
                </div>
                <div className="p-2.5">
                  <p className="font-jakarta text-xs font-medium text-navy dark:text-white truncate" title={file.name}>{file.name}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[10px] text-gray-400 font-jakarta">{file.size}</span>
                    {file.width && file.height && (
                      <span className="text-[10px] text-gray-400 font-jakarta">· {file.width}×{file.height}</span>
                    )}
                  </div>
                  {file.usageCount > 0 ? (
                    <p className="text-[10px] text-green-600 dark:text-green-400 font-jakarta mt-0.5">Used in {file.usageCount} place{file.usageCount === 1 ? '' : 's'}</p>
                  ) : (
                    <p className="text-[10px] text-gray-300 dark:text-gray-600 font-jakarta mt-0.5">Unused</p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Load more */}
          {nextCursor && (
            <div className="flex justify-center pt-2">
              <button
                onClick={() => fetchMedia(true)}
                disabled={loadingMore}
                className="px-5 py-2.5 text-sm font-medium border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 font-jakarta flex items-center gap-2"
              >
                {loadingMore ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
                {loadingMore ? 'Loading...' : 'Load more'}
              </button>
            </div>
          )}
        </>
      )}

      {/* ── Detail slide-over ──────────────────────────────────────────── */}
      {detailFile && (
        <MediaDetailPanel
          file={detailFile}
          onClose={() => setDetailFile(null)}
          onCopyUrl={copyUrl}
          copied={copied}
          onDelete={(id) => setDeleteConfirm(id)}
          onUpdate={(id, data) => {
            updateMediaAction(id, data).then(res => {
              if (res.success) {
                setFiles(prev => prev.map(f => f.id === id ? {
                  ...f,
                  name: data.originalName ?? f.name,
                  slug: data.originalName ? slugifyLocal(data.originalName) : f.slug,
                  alt: data.alt !== undefined ? data.alt : f.alt,
                  tags: data.tags ?? f.tags,
                } : f));
                setDetailFile(prev => prev && prev.id === id ? {
                  ...prev,
                  name: data.originalName ?? prev.name,
                  slug: data.originalName ? slugifyLocal(data.originalName) : prev.slug,
                  alt: data.alt !== undefined ? data.alt : prev.alt,
                  tags: data.tags ?? prev.tags,
                } : prev);
              }
            });
          }}
        />
      )}

      {/* ── Delete confirm modal ───────────────────────────────────────── */}
      {(deleteConfirm || bulkDeleteConfirm) && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-sm shadow-2xl border border-gray-200 dark:border-gray-800 p-6 text-center">
            <Trash2 className="w-10 h-10 text-red-500 mx-auto mb-3" />
            <h3 className="font-sora font-bold text-lg text-navy dark:text-white">
              {bulkDeleteConfirm ? `Delete ${selected.size} file${selected.size === 1 ? '' : 's'}?` : 'Delete file?'}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 font-jakarta mt-1">
              {bulkDeleteConfirm ? 'These files will be permanently removed from storage.' : 'This file will be permanently removed from storage.'}
            </p>
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => { setDeleteConfirm(null); setBulkDeleteConfirm(false); }}
                className="flex-1 px-4 py-2.5 text-sm font-medium border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={() => bulkDeleteConfirm ? handleBulkDelete() : deleteConfirm && handleDelete(deleteConfirm)}
                className="flex-1 px-4 py-2.5 text-sm font-medium bg-red-500 hover:bg-red-600 text-white rounded-xl"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Detail panel ──────────────────────────────────────────────────────────────

function MediaDetailPanel({
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

function slugifyLocal(name: string): string {
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')) : '';
  const base = name.includes('.') ? name.slice(0, name.lastIndexOf('.')) : name;
  return base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/-{2,}/g, '-') + ext.toLowerCase();
}
