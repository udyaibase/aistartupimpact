'use client';

import { useState } from 'react';
import { Pencil, Check, X, ExternalLink, Lock, AlertCircle } from 'lucide-react';
import { clsx } from 'clsx';

interface SlugEditorProps {
  currentSlug: string;
  slugChangedAt?: string | null; // ISO date string from DB
  entityType: 'startup' | 'tool';
  entityId: string;
  baseUrl: string; // e.g. "https://udyaibase.com/startups"
  isAdmin?: boolean; // Admins bypass cooldown
  onSuccess?: (newSlug: string) => void;
}

const COOLDOWN_DAYS = 45;
const API_PATHS = {
  startup: (id: string) => `/api/founder/startups/${id}/slug`,
  tool: (id: string) => `/api/founder/tools/${id}/slug`,
};
const ADMIN_API_PATHS = {
  startup: (id: string) => `/api/admin/startups/${id}/slug`,
  tool: (id: string) => `/api/admin/tools/${id}/slug`,
};

function formatSlug(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export default function SlugEditor({
  currentSlug,
  slugChangedAt,
  entityType,
  entityId,
  baseUrl,
  isAdmin = false,
  onSuccess,
}: SlugEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState(currentSlug);
  const [slug, setSlug] = useState(currentSlug);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Cooldown logic (founders only)
  const canEdit = isAdmin || !slugChangedAt || (() => {
    const lastChanged = new Date(slugChangedAt + 'Z');
    const cooldownEnd = new Date(lastChanged.getTime() + COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
    return new Date() >= cooldownEnd;
  })();

  const nextChangeDate = !isAdmin && slugChangedAt ? (() => {
    const lastChanged = new Date(slugChangedAt + 'Z');
    return new Date(lastChanged.getTime() + COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
  })() : null;

  const daysLeft = nextChangeDate && new Date() < nextChangeDate
    ? Math.ceil((nextChangeDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
    : 0;

  const handleSave = async () => {
    setError('');
    setSuccess('');
    const newSlug = formatSlug(inputValue);

    if (newSlug === slug) {
      setIsEditing(false);
      return;
    }

    // Validate
    if (newSlug.length < 3) { setError('Must be at least 3 characters'); return; }
    if (newSlug.length > 80) { setError('Must be under 80 characters'); return; }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(newSlug)) {
      setError('Only lowercase letters, numbers, and hyphens allowed');
      return;
    }

    setLoading(true);
    try {
      const apiPath = isAdmin
        ? ADMIN_API_PATHS[entityType](entityId)
        : API_PATHS[entityType](entityId);

      const res = await fetch(apiPath, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: newSlug }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to update URL');
        return;
      }

      setSlug(newSlug);
      setInputValue(newSlug);
      setIsEditing(false);
      setSuccess('URL updated successfully! Old URL will redirect here.');
      onSuccess?.(newSlug);
    } catch {
      setError('Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setInputValue(slug);
    setIsEditing(false);
    setError('');
  };

  return (
    <div className="space-y-2">
      <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 font-jakarta">
        Profile URL
      </label>

      {!isEditing ? (
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 flex-1 min-w-0">
            <span className="text-xs text-gray-400 font-jakarta shrink-0">{baseUrl}/</span>
            <span className="text-sm font-semibold text-navy dark:text-white font-jakarta truncate">{slug}</span>
            <a href={`${baseUrl}/${slug}`} target="_blank" rel="noopener noreferrer" className="ml-auto shrink-0">
              <ExternalLink className="w-3.5 h-3.5 text-gray-400 hover:text-brand" />
            </a>
          </div>

          {canEdit ? (
            <button
              type="button"
              onClick={() => { setIsEditing(true); setError(''); setSuccess(''); }}
              className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-brand hover:bg-brand/5 transition-colors"
              title="Edit URL"
            >
              <Pencil className="w-3.5 h-3.5 text-gray-400 hover:text-brand" />
            </button>
          ) : (
            <button
              type="button"
              disabled
              className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 opacity-50 cursor-not-allowed"
              title={`Can change in ${daysLeft} days`}
            >
              <Lock className="w-3.5 h-3.5 text-gray-400" />
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="flex items-center flex-1 gap-0 border border-brand rounded-lg overflow-hidden bg-white dark:bg-gray-900">
              <span className="px-2.5 py-2 text-xs text-gray-400 font-jakarta bg-gray-50 dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 shrink-0">
                {baseUrl}/
              </span>
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(formatSlug(e.target.value))}
                placeholder="your-startup-name"
                className="flex-1 px-2.5 py-2 text-sm font-jakarta text-navy dark:text-white bg-transparent focus:outline-none"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSave();
                  if (e.key === 'Escape') handleCancel();
                }}
              />
            </div>
            <button
              type="button"
              onClick={handleSave}
              disabled={loading}
              className="p-2 rounded-lg bg-brand text-white hover:bg-brand/90 disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <X className="w-3.5 h-3.5 text-gray-500" />
            </button>
          </div>

          {error && (
            <p className="text-xs text-red-600 font-jakarta flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />{error}
            </p>
          )}
          <p className="text-xs text-gray-400 font-jakarta">
            Lowercase letters, numbers, and hyphens only. Min 3 chars.
          </p>
        </div>
      )}

      {success && (
        <p className="text-xs text-green-600 font-jakarta flex items-center gap-1">
          <Check className="w-3 h-3" />{success}
        </p>
      )}

      {/* Cooldown notice for founders */}
      {!isAdmin && (
        <div className={clsx('text-xs font-jakarta', daysLeft > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400')}>
          {daysLeft > 0
            ? `URL can be changed again in ${daysLeft} day${daysLeft !== 1 ? 's' : ''} (${nextChangeDate?.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' })})`
            : 'You can change this URL once every 45 days'}
        </div>
      )}
    </div>
  );
}
