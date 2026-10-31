import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { prisma } from "@udyaibase/database";

// ── Shared R2 client (single instance) ──────────────────────────────────────

export const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
  },
});

export const R2_BUCKET = process.env.R2_BUCKET_NAME!;

export const ALLOWED_ROLES = [
  "SUPER_ADMIN",
  "EDITOR_IN_CHIEF",
  "SENIOR_WRITER",
  "WRITER",
] as const;

const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "image/avif",
  "application/pdf",
];

const ALLOWED_EXTENSIONS = /\.(jpe?g|png|gif|webp|svg|avif|pdf)$/i;

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Public URL of an uploaded object. R2_PUBLIC_URL is required (the old apps/api media proxy is retired). */
export function getPublicUrl(key: string): string {
  if (!process.env.R2_PUBLIC_URL) throw new Error("R2_PUBLIC_URL is not configured");
  return `${process.env.R2_PUBLIC_URL.replace(/\/$/, "")}/${key}`;
}

export function slugifyName(name: string): string {
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")) : "";
  const base = name.includes(".")
    ? name.slice(0, name.lastIndexOf("."))
    : name;
  return base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .concat(ext.toLowerCase());
}

function extractOriginalName(key: string): string {
  const filename = key.split("/").pop() || key;
  // Keys look like: {uuid}-{original_name} or just {uuid}.ext
  // Try to split after the UUID (8-4-4-4-12 or cuid pattern)
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i;
  if (uuidPattern.test(filename)) {
    return filename.replace(uuidPattern, "").replace(/_/g, " ") || filename;
  }
  // cuid/nanoid prefix: take everything after the first hyphen
  const firstHyphen = filename.indexOf("-");
  if (firstHyphen > 8) {
    return filename.slice(firstHyphen + 1).replace(/_/g, " ") || filename;
  }
  return filename;
}

function prefixFromKey(key: string): string {
  const slash = key.indexOf("/");
  return slash > 0 ? key.slice(0, slash) : "uploads";
}

// ── Validation ───────────────────────────────────────────────────────────────

export function validateFile(file: File): string | null {
  if (file.size > MAX_FILE_SIZE) {
    return `File too large (${Math.round(file.size / 1024 / 1024)}MB). Maximum is ${MAX_FILE_SIZE / 1024 / 1024}MB.`;
  }
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return `File type "${file.type}" is not allowed. Accepted: JPEG, PNG, GIF, WebP, SVG, AVIF, PDF.`;
  }
  if (!ALLOWED_EXTENSIONS.test(file.name)) {
    return `File extension not allowed.`;
  }
  return null;
}

// ── Core operations ──────────────────────────────────────────────────────────

export interface UploadResult {
  id: string;
  key: string;
  url: string;
  originalName: string;
  slug: string;
  mimeType: string;
  sizeBytes: number;
}

export async function uploadToMediaLibrary(
  file: File,
  opts: { prefix?: string; uploadedById?: string } = {}
): Promise<UploadResult> {
  const validationError = validateFile(file);
  if (validationError) throw new Error(validationError);

  const prefix = opts.prefix || "uploads";
  const uniqueId = crypto.randomUUID();
  const cleanName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
  const key = `${prefix}/${uniqueId}-${cleanName}`;
  const url = getPublicUrl(key);
  const buffer = Buffer.from(await file.arrayBuffer());

  await r2.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      ContentType: file.type,
      Body: buffer,
    })
  );

  const originalName = file.name;
  const slug = slugifyName(originalName);

  const media = await prisma.mediaAsset.create({
    data: {
      key,
      prefix,
      url,
      originalName,
      slug,
      mimeType: file.type,
      sizeBytes: buffer.length,
      uploadedBy: opts.uploadedById || undefined,
    },
  });

  return {
    id: media.id,
    key: media.key,
    url: media.url,
    originalName: media.originalName,
    slug: media.slug,
    mimeType: media.mimeType,
    sizeBytes: media.sizeBytes,
  };
}

export async function deleteFromMediaLibrary(key: string): Promise<void> {
  await r2.send(
    new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key })
  );
  await prisma.mediaAsset.delete({ where: { key } }).catch(() => {
    // Row may not exist (pre-backfill files)
  });
}

// ── Backfill: sync R2 objects → MediaAsset rows ─────────────────────────────

export async function backfillMediaAssets(): Promise<{
  created: number;
  skipped: number;
}> {
  let created = 0;
  let skipped = 0;
  let continuationToken: string | undefined;

  do {
    const res = await r2.send(
      new ListObjectsV2Command({
        Bucket: R2_BUCKET,
        ContinuationToken: continuationToken,
      })
    );

    const objects = res.Contents || [];

    for (const obj of objects) {
      if (!obj.Key || obj.Key.endsWith("/")) continue;

      const existing = await prisma.mediaAsset.findUnique({
        where: { key: obj.Key },
      });
      if (existing) {
        skipped++;
        continue;
      }

      const originalName = extractOriginalName(obj.Key);
      const slug = slugifyName(originalName);
      const prefix = prefixFromKey(obj.Key);
      const url = getPublicUrl(obj.Key);
      const ext = obj.Key.split(".").pop()?.toLowerCase() || "";
      const mimeMap: Record<string, string> = {
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png",
        gif: "image/gif",
        webp: "image/webp",
        svg: "image/svg+xml",
        avif: "image/avif",
        pdf: "application/pdf",
      };

      await prisma.mediaAsset.create({
        data: {
          key: obj.Key,
          prefix,
          url,
          originalName,
          slug,
          mimeType: mimeMap[ext] || "application/octet-stream",
          sizeBytes: obj.Size || 0,
          backfilled: true,
        },
      });
      created++;
    }

    continuationToken = res.NextContinuationToken;
  } while (continuationToken);

  return { created, skipped };
}

// ── Backfill usage: scan content models for R2 URLs → MediaUsage rows ───────

export async function backfillMediaUsage(): Promise<number> {
  let created = 0;
  const publicUrl = process.env.R2_PUBLIC_URL?.replace(/\/$/, "");
  if (!publicUrl) return 0;

  // Build a map of url → mediaId for quick lookup
  const allMedia = await prisma.mediaAsset.findMany({
    select: { id: true, url: true },
  });
  const urlToId = new Map(allMedia.map((m: { id: string; url: string }) => [m.url, m.id]));

  async function trackUsage(
    entityType: string,
    entityId: string,
    field: string,
    imageUrl: string | null
  ) {
    if (!imageUrl || !imageUrl.startsWith(publicUrl!)) return;
    const mediaId = urlToId.get(imageUrl);
    if (!mediaId) return;

    await prisma.mediaUsage
      .create({
        data: { mediaId, entityType, entityId, field },
      })
      .catch(() => {
        // unique constraint — already tracked
      });
    created++;
  }

  // Articles
  const articles = await prisma.article.findMany({
    select: { id: true, coverImage: true, thumbnailImage: true },
  });
  for (const a of articles) {
    await trackUsage("ARTICLE", a.id, "coverImage", a.coverImage);
    await trackUsage("ARTICLE", a.id, "thumbnailImage", a.thumbnailImage);
  }

  // AI Tools
  const tools = await prisma.aiTool.findMany({
    select: { id: true, logoUrl: true },
  });
  for (const t of tools) {
    await trackUsage("TOOL", t.id, "logoUrl", t.logoUrl);
  }

  // Startups
  const startups = await prisma.startup.findMany({
    select: { id: true, logoUrl: true },
  });
  for (const s of startups) {
    await trackUsage("STARTUP", s.id, "logoUrl", s.logoUrl);
  }

  // Investors
  const investors = await prisma.investor.findMany({
    select: { id: true, logoUrl: true },
  });
  for (const i of investors) {
    await trackUsage("INVESTOR", i.id, "logoUrl", i.logoUrl);
  }

  // Events
  const events = await prisma.event.findMany({
    select: { id: true, coverImageUrl: true },
  });
  for (const e of events) {
    await trackUsage("EVENT", e.id, "coverImageUrl", e.coverImageUrl);
  }

  return created;
}
