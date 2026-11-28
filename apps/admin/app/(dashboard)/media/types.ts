

export interface MediaFile {
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

export interface MediaStats {
  totalFiles: number;
  totalSize: string;
  totalSizeBytes: number;
  unusedCount: number;
  byType: Array<{ mimeType: string; count: number; size: string }>;
}

export interface UsageEntry {
  id: string;
  entityType: string;
  entityId: string;
  entityName: string;
  field: string | null;
}

export interface Folder {
  prefix: string;
  label: string;
  count: number;
  size: string;
}

export type UsageFilter = 'all' | 'used' | 'unused';

// ── Component ───────────────────────────────────────────────────────────────

export function slugifyLocal(name: string): string {
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')) : '';
  const base = name.includes('.') ? name.slice(0, name.lastIndexOf('.')) : name;
  return base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/-{2,}/g, '-') + ext.toLowerCase();
}
