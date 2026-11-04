import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { findUnusedMedia, prisma } from '@udyaibase/database';
import { mediaVariantKeys, ownMediaKey } from '@udyaibase/utils';

let client: S3Client | null = null;
function r2(): S3Client {
  client ??= new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID!, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY! },
  });
  return client;
}

/**
 * Removes files from storage after their records are gone (and the logo's resized copies). Only our own files that
 * nothing else shows. Best effort: the erasure has already happened, so a storage failure is logged by key for a
 * retry and never undoes or fails it.
 */
export async function deleteUnusedMedia(urls: (string | null | undefined)[]): Promise<void> {
  const own = urls.filter((u) => ownMediaKey(u));
  for (const url of await findUnusedMedia(own).catch(() => [] as string[])) {
    const key = ownMediaKey(url)!;
    try {
      for (const k of mediaVariantKeys(key)) {
        await r2().send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_NAME!, Key: k }));
      }
      await prisma.mediaAsset.deleteMany({ where: { key } });
    } catch (err) {
      console.error('[media] could not delete', key, err instanceof Error ? err.message : 'unknown error');
    }
  }
}
