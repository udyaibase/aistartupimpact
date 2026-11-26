"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@udyaibase/database";
import {
  r2,
  R2_BUCKET,
  ALLOWED_ROLES,
  getPublicUrl,
  uploadToMediaLibrary,
  deleteFromMediaLibrary,
  slugifyName,
} from "@/lib/media";
import { publicError } from '@/lib/public-error';
import { logAuditEvent } from '@/lib/audit-log';

// ── List media ──────────────────────────────────────────────────────────────

interface ListMediaOptions {
  cursor?: string;
  limit?: number;
  search?: string;
  prefix?: string;
  mimeType?: string;
  usageFilter?: "all" | "used" | "unused";
}

export async function listMediaAction(options: ListMediaOptions = {}) {
  const session: any = await getServerSession(authOptions);
  if (!session?.user || !ALLOWED_ROLES.includes(session.user.role)) {
    return { success: false as const, error: "Unauthorized", data: [], total: 0, nextCursor: null };
  }

  try {
    const { cursor, limit = 50, search, prefix, mimeType, usageFilter } = options;

    const where: any = {};
    if (search) {
      where.OR = [
        { originalName: { contains: search, mode: "insensitive" } },
        { alt: { contains: search, mode: "insensitive" } },
        { tags: { hasSome: [search.toLowerCase()] } },
      ];
    }
    if (prefix) where.prefix = prefix;
    if (mimeType) where.mimeType = { startsWith: mimeType };

    // Fetch extra when filtering by usage client-side (relation filters may not work with Neon adapter)
    const fetchLimit = usageFilter && usageFilter !== "all" ? 500 : limit + 1;

    const [rawFiles, total] = await Promise.all([
      prisma.mediaAsset.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: fetchLimit,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        include: { usages: { select: { id: true } } },
      }),
      prisma.mediaAsset.count({ where }),
    ]);

    // Apply usage filter client-side
    let files = rawFiles;
    if (usageFilter === "used") files = rawFiles.filter((f: any) => f.usages && f.usages.length > 0);
    else if (usageFilter === "unused") files = rawFiles.filter((f: any) => !f.usages || f.usages.length === 0);

    const hasMore = files.length > limit;
    const items = hasMore ? files.slice(0, limit) : files;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    const data = items.map((f: any) => ({
      id: f.id,
      key: f.key,
      name: f.originalName,
      slug: f.slug,
      mimeType: f.mimeType,
      size: formatSize(f.sizeBytes),
      sizeBytes: f.sizeBytes,
      width: f.width,
      height: f.height,
      alt: f.alt,
      tags: f.tags,
      url: f.url,
      prefix: f.prefix,
      backfilled: f.backfilled,
      usageCount: f.usages?.length ?? 0,
      uploadedAt: f.createdAt.toISOString(),
    }));

    const filteredTotal = usageFilter && usageFilter !== "all" ? files.length : total;
    return { success: true as const, data, total: filteredTotal, nextCursor };
  } catch (e: any) {
    console.error("listMediaAction error:", e);
    return { success: false as const, error: publicError(e), data: [], total: 0, nextCursor: null };
  }
}

// ── Upload ──────────────────────────────────────────────────────────────────

export async function uploadMediaFileAction(formData: FormData) {
  const session: any = await getServerSession(authOptions);
  if (!session?.user || !ALLOWED_ROLES.includes(session.user.role)) {
    return { success: false as const, error: "Unauthorized" };
  }
  try {
    const file = formData.get("file") as File;
    if (!file) return { success: false as const, error: "No file provided" };

    const prefix = (formData.get("prefix") as string) || "uploads";

    const result = await uploadToMediaLibrary(file, {
      prefix,
      uploadedById: session.user.id,
    });

    return {
      success: true as const,
      data: {
        id: result.id,
        key: result.key,
        name: result.originalName,
        slug: result.slug,
        mimeType: result.mimeType,
        size: formatSize(result.sizeBytes),
        sizeBytes: result.sizeBytes,
        url: result.url,
        alt: null,
        tags: [] as string[],
        prefix,
        backfilled: false,
        usageCount: 0,
        uploadedAt: new Date().toISOString(),
      },
    };
  } catch (e: any) {
    console.error("uploadMediaFileAction error:", e);
    return { success: false as const, error: publicError(e) };
  }
}

// ── Upload logo (used by tool/startup forms) ────────────────────────────────

export async function uploadLogoAction(formData: FormData) {
  const session: any = await getServerSession(authOptions);
  if (!session?.user || !ALLOWED_ROLES.includes(session.user.role)) {
    return { success: false as const, error: "Unauthorized" };
  }
  try {
    const file = formData.get("file") as File;
    if (!file) return { success: false as const, error: "No file provided" };

    const result = await uploadToMediaLibrary(file, {
      prefix: "logos",
      uploadedById: session.user.id,
    });

    return { success: true as const, url: result.url, mediaId: result.id };
  } catch (e: any) {
    console.error("uploadLogoAction error:", e);
    return { success: false as const, error: publicError(e) };
  }
}

// ── Delete ──────────────────────────────────────────────────────────────────

export async function deleteMediaAction(id: string) {
  const session: any = await getServerSession(authOptions);
  if (
    !session?.user ||
    !["SUPER_ADMIN", "EDITOR_IN_CHIEF"].includes(session.user.role)
  ) {
    return { success: false as const, error: "Unauthorized" };
  }
  try {
    const media = await prisma.mediaAsset.findUnique({ where: { id } });
    if (!media) return { success: false as const, error: "File not found" };

    await deleteFromMediaLibrary(media.key);
    await logAuditEvent({ action: 'DELETE', resourceType: 'MEDIA', resourceId: id, resourceName: 'deleteMediaAction' });
    return { success: true as const };
  } catch (e: any) {
    console.error("deleteMediaAction error:", e);
    return { success: false as const, error: publicError(e) };
  }
}

// ── Update metadata (rename, alt, tags) ─────────────────────────────────────

export async function updateMediaAction(
  id: string,
  data: { originalName?: string; alt?: string; tags?: string[] }
) {
  const session: any = await getServerSession(authOptions);
  if (!session?.user || !ALLOWED_ROLES.includes(session.user.role)) {
    return { success: false as const, error: "Unauthorized" };
  }
  try {
    const update: any = {};
    if (data.originalName !== undefined) {
      update.originalName = data.originalName;
      update.slug = slugifyName(data.originalName);
    }
    if (data.alt !== undefined) update.alt = data.alt;
    if (data.tags !== undefined) update.tags = data.tags;

    const media = await prisma.mediaAsset.update({ where: { id }, data: update });
    await logAuditEvent({ action: 'UPDATE', resourceType: 'MEDIA', resourceId: id, resourceName: 'updateMediaAction' });
    return { success: true as const, data: media };
  } catch (e: any) {
    console.error("updateMediaAction error:", e);
    return { success: false as const, error: publicError(e) };
  }
}

// ── Get usage for a single file ─────────────────────────────────────────────

export async function getMediaUsageAction(mediaId: string) {
  const session: any = await getServerSession(authOptions);
  if (!session?.user || !ALLOWED_ROLES.includes(session.user.role)) {
    return { success: false as const, error: "Unauthorized" };
  }
  try {
    const usages = await prisma.mediaUsage.findMany({
      where: { mediaId },
      orderBy: { createdAt: "desc" },
    });

    // Resolve entity names
    const resolved = await Promise.all(
      usages.map(async (u: any) => {
        let entityName = u.entityId;
        try {
          if (u.entityType === "ARTICLE") {
            const a = await prisma.article.findUnique({ where: { id: u.entityId }, select: { title: true } });
            if (a) entityName = a.title;
          } else if (u.entityType === "TOOL") {
            const t = await prisma.aiTool.findUnique({ where: { id: u.entityId }, select: { name: true } });
            if (t) entityName = t.name;
          } else if (u.entityType === "STARTUP") {
            const s = await prisma.startup.findUnique({ where: { id: u.entityId }, select: { name: true } });
            if (s) entityName = s.name;
          } else if (u.entityType === "INVESTOR") {
            const i = await prisma.investor.findUnique({ where: { id: u.entityId }, select: { name: true } });
            if (i) entityName = i.name;
          } else if (u.entityType === "EVENT") {
            const e = await prisma.event.findUnique({ where: { id: u.entityId }, select: { title: true } });
            if (e) entityName = e.title;
          }
        } catch {}
        return {
          id: u.id,
          entityType: u.entityType,
          entityId: u.entityId,
          entityName,
          field: u.field,
          createdAt: u.createdAt.toISOString(),
        };
      })
    );

    return { success: true as const, data: resolved };
  } catch (e: any) {
    return { success: false as const, error: publicError(e) };
  }
}

// ── Stats ───────────────────────────────────────────────────────────────────

export async function getMediaStatsAction() {
  const session: any = await getServerSession(authOptions);
  if (!session?.user || !ALLOWED_ROLES.includes(session.user.role)) {
    return { success: false as const, error: "Unauthorized" };
  }
  try {
    const allFiles = await prisma.mediaAsset.findMany({
      select: { mimeType: true, sizeBytes: true, usages: { select: { id: true } } },
    });

    const totalFiles = allFiles.length;
    const totalSizeBytes = allFiles.reduce((sum: number, f: any) => sum + (f.sizeBytes || 0), 0);
    const unusedCount = allFiles.filter((f: any) => !f.usages || f.usages.length === 0).length;

    const typeMap = new Map<string, { count: number; sizeBytes: number }>();
    for (const f of allFiles) {
      const entry = typeMap.get(f.mimeType) || { count: 0, sizeBytes: 0 };
      entry.count++;
      entry.sizeBytes += f.sizeBytes || 0;
      typeMap.set(f.mimeType, entry);
    }
    const byType = Array.from(typeMap.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .map(([mimeType, v]) => ({
        mimeType,
        count: v.count,
        sizeBytes: v.sizeBytes,
        size: formatSize(v.sizeBytes),
      }));

    return {
      success: true as const,
      data: {
        totalFiles,
        totalSizeBytes,
        totalSize: formatSize(totalSizeBytes),
        unusedCount,
        byType,
      },
    };
  } catch (e: any) {
    return { success: false as const, error: publicError(e) };
  }
}

// ── Folders ─────────────────────────────────────────────────────────────────

export async function getFoldersAction() {
  const session: any = await getServerSession(authOptions);
  if (!session?.user || !ALLOWED_ROLES.includes(session.user.role)) {
    return { success: false as const, error: "Unauthorized", data: [] };
  }
  try {
    const allFiles = await prisma.mediaAsset.findMany({
      select: { prefix: true, sizeBytes: true },
    });

    const folderMap = new Map<string, { count: number; sizeBytes: number }>();
    for (const f of allFiles) {
      const entry = folderMap.get(f.prefix) || { count: 0, sizeBytes: 0 };
      entry.count++;
      entry.sizeBytes += f.sizeBytes || 0;
      folderMap.set(f.prefix, entry);
    }

    const FOLDER_LABELS: Record<string, string> = {
      logos: "Tool & Startup Logos",
      events: "Event Covers",
      "founder-avatar": "Founder Profiles",
      "job-board": "Job Board",
      resumes: "Resumes",
      uploads: "Uploads",
    };

    // Ensure all predefined folders appear even if empty
    for (const prefix of Object.keys(FOLDER_LABELS)) {
      if (!folderMap.has(prefix)) {
        folderMap.set(prefix, { count: 0, sizeBytes: 0 });
      }
    }

    const folders = Array.from(folderMap.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .map(([prefix, v]) => ({
        prefix,
        label: FOLDER_LABELS[prefix] || prefix,
        count: v.count,
        size: formatSize(v.sizeBytes),
      }));

    return { success: true as const, data: folders };
  } catch (e: any) {
    return { success: false as const, error: publicError(e), data: [] };
  }
}

// ── Utility ─────────────────────────────────────────────────────────────────

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
