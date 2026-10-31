import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * Private storage for candidate resumes. Resumes are personal data: they only ever go to the
 * private bucket R2_RESUMES_BUCKET (never the public media bucket) and are read through
 * short-lived signed links. In development without that bucket, files go to a git-ignored
 * local folder instead; in production without it, uploads are refused.
 */

const LOCAL_DIR = path.join(process.cwd(), '.data', 'resumes');

let client: S3Client | null | undefined;
function r2(): S3Client | null {
  if (client !== undefined) return client;
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_RESUMES_BUCKET } = process.env;
  client = R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_RESUMES_BUCKET
    ? new S3Client({
        region: 'auto',
        endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
      })
    : null;
  return client;
}

const localFallback = () => !r2() && process.env.NODE_ENV !== 'production';

export function resumeStorageReady(): boolean {
  return !!r2() || localFallback();
}

function localPath(key: string) {
  const p = path.join(LOCAL_DIR, key);
  if (!p.startsWith(LOCAL_DIR + path.sep)) throw new Error('Invalid key');
  return p;
}

export async function putResume(key: string, body: Uint8Array, mime: string): Promise<void> {
  const s3 = r2();
  if (s3) {
    await s3.send(new PutObjectCommand({
      Bucket: process.env.R2_RESUMES_BUCKET!, Key: key, Body: body, ContentType: mime,
      ContentDisposition: 'attachment', CacheControl: 'private, no-store',
    }));
    return;
  }
  if (!localFallback()) throw new Error('Resume storage is not configured');
  const p = localPath(key);
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, body);
}

/** Reads a stored resume (used for text extraction right after upload). */
export async function readResume(key: string): Promise<Uint8Array> {
  const s3 = r2();
  if (s3) {
    const res = await s3.send(new GetObjectCommand({ Bucket: process.env.R2_RESUMES_BUCKET!, Key: key }));
    return new Uint8Array(await res.Body!.transformToByteArray());
  }
  return new Uint8Array(await readFile(localPath(key)));
}

/** A link valid for 5 minutes. Locally, the caller streams the file through an authenticated route instead. */
export async function resumeDownloadUrl(key: string, filename: string): Promise<string | null> {
  const s3 = r2();
  if (!s3) return null;
  return getSignedUrl(s3, new GetObjectCommand({
    Bucket: process.env.R2_RESUMES_BUCKET!, Key: key,
    ResponseContentDisposition: `attachment; filename="${filename.replace(/[^\w.\- ]/g, '_')}"`,
  }), { expiresIn: 300 });
}

export async function deleteResume(key: string): Promise<void> {
  const s3 = r2();
  if (s3) {
    await s3.send(new DeleteObjectCommand({ Bucket: process.env.R2_RESUMES_BUCKET!, Key: key }));
    return;
  }
  if (localFallback()) await rm(localPath(key), { force: true });
}
