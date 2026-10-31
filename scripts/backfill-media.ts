/**
 * Backfill MediaAsset rows from existing R2 objects and scan content models
 * for MediaUsage tracking.
 *
 * Usage:
 *   npx tsx scripts/backfill-media.ts
 */

import { PrismaClient } from '@prisma/client';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
  },
});

const BUCKET = process.env.R2_BUCKET_NAME!;

function getPublicUrl(key: string): string {
  if (!process.env.R2_PUBLIC_URL) throw new Error('R2_PUBLIC_URL is not configured');
  return `${process.env.R2_PUBLIC_URL.replace(/\/$/, '')}/${key}`;
}

function slugifyName(name: string): string {
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')) : '';
  const base = name.includes('.') ? name.slice(0, name.lastIndexOf('.')) : name;
  return base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/-{2,}/g, '-') + ext.toLowerCase();
}

function extractOriginalName(key: string): string {
  const filename = key.split('/').pop() || key;
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i;
  if (uuidPattern.test(filename)) {
    return filename.replace(uuidPattern, '').replace(/_/g, ' ') || filename;
  }
  const firstHyphen = filename.indexOf('-');
  if (firstHyphen > 8) {
    return filename.slice(firstHyphen + 1).replace(/_/g, ' ') || filename;
  }
  return filename;
}

function prefixFromKey(key: string): string {
  const slash = key.indexOf('/');
  return slash > 0 ? key.slice(0, slash) : 'uploads';
}

const MIME_MAP: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
  webp: 'image/webp', svg: 'image/svg+xml', avif: 'image/avif', pdf: 'application/pdf',
};

async function backfillAssets() {
  console.log('--- Backfilling MediaAsset rows from R2 ---');
  let created = 0, skipped = 0;
  let continuationToken: string | undefined;

  do {
    const res = await r2.send(new ListObjectsV2Command({
      Bucket: BUCKET,
      ContinuationToken: continuationToken,
    }));

    for (const obj of res.Contents || []) {
      if (!obj.Key || obj.Key.endsWith('/')) continue;

      const existing = await prisma.mediaAsset.findUnique({ where: { key: obj.Key } });
      if (existing) { skipped++; continue; }

      const originalName = extractOriginalName(obj.Key);
      const slug = slugifyName(originalName);
      const prefix = prefixFromKey(obj.Key);
      const url = getPublicUrl(obj.Key);
      const ext = obj.Key.split('.').pop()?.toLowerCase() || '';

      await prisma.mediaAsset.create({
        data: {
          key: obj.Key,
          prefix,
          url,
          originalName,
          slug,
          mimeType: MIME_MAP[ext] || 'application/octet-stream',
          sizeBytes: obj.Size || 0,
          backfilled: true,
        },
      });
      created++;
    }

    continuationToken = res.NextContinuationToken;
  } while (continuationToken);

  console.log(`  Created: ${created}, Skipped (already exist): ${skipped}`);
  return created;
}

async function backfillUsage() {
  console.log('--- Backfilling MediaUsage from content models ---');
  const publicUrl = process.env.R2_PUBLIC_URL?.replace(/\/$/, '');
  if (!publicUrl) {
    console.log('  Skipped: R2_PUBLIC_URL not set');
    return 0;
  }

  const allMedia = await prisma.mediaAsset.findMany({ select: { id: true, url: true } });
  const urlToId = new Map(allMedia.map(m => [m.url, m.id]));
  let created = 0;

  async function track(entityType: string, entityId: string, field: string, imageUrl: string | null) {
    if (!imageUrl || !imageUrl.startsWith(publicUrl!)) return;
    const mediaId = urlToId.get(imageUrl);
    if (!mediaId) return;
    try {
      await prisma.mediaUsage.create({ data: { mediaId, entityType, entityId, field } });
      created++;
    } catch {
      // unique constraint — already tracked
    }
  }

  // Articles
  const articles = await prisma.article.findMany({ select: { id: true, coverImage: true, thumbnailImage: true } });
  for (const a of articles) {
    await track('ARTICLE', a.id, 'coverImage', a.coverImage);
    await track('ARTICLE', a.id, 'thumbnailImage', a.thumbnailImage);
  }

  // AI Tools
  const tools = await prisma.aiTool.findMany({ select: { id: true, logoUrl: true } });
  for (const t of tools) {
    await track('TOOL', t.id, 'logoUrl', t.logoUrl);
  }

  // Startups
  const startups = await prisma.startup.findMany({ select: { id: true, logoUrl: true } });
  for (const s of startups) {
    await track('STARTUP', s.id, 'logoUrl', s.logoUrl);
  }

  // Investors
  const investors = await prisma.investor.findMany({ select: { id: true, logoUrl: true } });
  for (const i of investors) {
    await track('INVESTOR', i.id, 'logoUrl', i.logoUrl);
  }

  // Events
  const events = await prisma.event.findMany({ select: { id: true, coverImageUrl: true } });
  for (const e of events) {
    await track('EVENT', e.id, 'coverImageUrl', e.coverImageUrl);
  }

  console.log(`  Created: ${created} usage records`);
  return created;
}

async function main() {
  console.log('Media Library Backfill\n');
  try {
    await backfillAssets();
    await backfillUsage();
    console.log('\nDone.');
  } catch (e) {
    console.error('Backfill failed:', e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
