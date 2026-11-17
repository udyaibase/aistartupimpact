import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

/**
 * Store an event-related image (speaker photo, sponsor logo) on our media bucket. Same rules as the organizer
 * upload route: JPEG/PNG/WebP only, 5MB, content must match its type, random name with the checked extension.
 */

const TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
export const MAX_EVENT_IMAGE_BYTES = 5 * 1024 * 1024;

function magicOk(b: Buffer, type: string): boolean {
  if (b.length < 12) return false;
  if (type === 'image/jpeg') return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (type === 'image/png') return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  if (type === 'image/webp') return b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50;
  return false;
}

export type ImageUploadResult = { ok: true; url: string } | { ok: false; error: string; status: number };

export async function putEventImage(file: File | null, folder: string): Promise<ImageUploadResult> {
  if (!file || typeof file === 'string') return { ok: false, error: 'Choose an image.', status: 400 };
  const ext = TYPES[file.type];
  if (!ext) return { ok: false, error: 'Use a JPG, PNG or WebP image.', status: 400 };
  if (file.size > MAX_EVENT_IMAGE_BYTES) return { ok: false, error: 'Images can be up to 5MB.', status: 400 };
  const { R2_BUCKET_NAME: bucket, R2_ACCOUNT_ID: account, R2_ACCESS_KEY_ID: key, R2_SECRET_ACCESS_KEY: secret, R2_PUBLIC_URL: publicBase } = process.env;
  if (!bucket || !account || !key || !secret || !publicBase) return { ok: false, error: 'Uploads aren’t set up yet.', status: 503 };
  const body = Buffer.from(await file.arrayBuffer());
  if (!magicOk(body, file.type)) return { ok: false, error: 'That file isn’t a valid image.', status: 400 };
  const name = `${folder.replace(/[^a-z0-9/_-]/gi, '')}/${crypto.randomUUID()}.${ext}`;
  const s3 = new S3Client({ region: 'auto', endpoint: `https://${account}.r2.cloudflarestorage.com`, credentials: { accessKeyId: key, secretAccessKey: secret } });
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: name, ContentType: file.type, Body: body, CacheControl: 'public, max-age=31536000, immutable' }));
  return { ok: true, url: `${publicBase.replace(/\/$/, '')}/${name}` };
}
