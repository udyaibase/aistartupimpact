import sharp from 'sharp';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { prisma } from '@udyaibase/database';

/**
 * Ready-made logo sizes, so Cloudflare serves small WebP files instead of resizing logos on every view.
 * For each logo on media.udyaibase.com: 64, 128 and 256px WebP copies at sized/<w>/<key>.webp, then the
 * stored URL gets `?sz=1`. lib/image-loader.ts only uses the copies for marked URLs, so a logo is never
 * pointed at a file that doesn't exist. Runs daily (data-retention cron) and from scripts/size-logos.ts.
 */

export const LOGO_SIZES = [64, 128, 256] as const;
export const SIZED_MARKER = 'sz';
const MEDIA = 'https://media.udyaibase.com/';
const CACHE = 'public, max-age=31536000, immutable';

/** Logo columns; the same file can appear in several (a startup's logo is often its company logo too). */
const LOGO_COLUMNS: { table: 'Startup' | 'AiTool' | 'JobBoardEmployer'; column: 'logoUrl' }[] = [
  { table: 'Startup', column: 'logoUrl' }, { table: 'AiTool', column: 'logoUrl' }, { table: 'JobBoardEmployer', column: 'logoUrl' },
];

export const sizedKey = (key: string, width: number) => `sized/${width}/${key.replace(/\.[a-z0-9]+$/i, '')}.webp`;

let client: S3Client | null = null;
function r2() {
  client ??= new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID!, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY! },
  });
  return client;
}

/** Make the three sizes for one stored logo URL. Returns the marked URL, or null when it can't be sized. */
export async function sizeLogo(url: string): Promise<string | null> {
  if (!url.startsWith(MEDIA)) return null;
  const u = new URL(url);
  if (u.searchParams.get(SIZED_MARKER) === '1') return url;
  const key = decodeURIComponent(u.pathname.replace(/^\/+/, ''));
  if (/\.(svg|ico|gif)$/i.test(key)) return null; // vectors scale on their own; icons and animations stay as they are

  const res = await fetch(`${MEDIA}${encodeURI(key)}`, { signal: AbortSignal.timeout(20000) }).catch(() => null);
  if (!res?.ok) return null;
  const input = Buffer.from(await res.arrayBuffer());
  if (input.length === 0 || input.length > 10 * 1024 * 1024) return null;

  try {
    for (const w of LOGO_SIZES) {
      const body = await sharp(input, { animated: false }).rotate().resize({ width: w, height: w, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
      await r2().send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET_NAME!, Key: sizedKey(key, w), Body: body, ContentType: 'image/webp', CacheControl: CACHE }));
    }
  } catch {
    return null; // not an image sharp can read: leave the original as is
  }
  u.searchParams.set(SIZED_MARKER, '1');
  return u.toString();
}

/**
 * Size up to `limit` logos that aren't marked yet and point every row using them at the marked URL.
 * Logos that can't be sized are remembered for this run only (they're retried next time).
 */
export async function sizePendingLogos(limit = 150): Promise<{ sized: number; skipped: number; rowsUpdated: number }> {
  const pending = new Set<string>();
  for (const { table, column } of LOGO_COLUMNS) {
    const rows = await prisma.$queryRawUnsafe<{ u: string }[]>(
      `SELECT u FROM (
         SELECT DISTINCT "${column}" u FROM "${table}"
         WHERE "${column}" LIKE '${MEDIA}%' AND "${column}" NOT LIKE '%${SIZED_MARKER}=1%'
           AND "${column}" !~* '\\.(svg|ico|gif)(\\?|$)'
       ) pending
       ORDER BY random()
       LIMIT ${limit}`,
    );
    rows.forEach((r) => pending.add(r.u));
    if (pending.size >= limit) break;
  }

  let sized = 0, skipped = 0, rowsUpdated = 0;
  for (const url of [...pending].slice(0, limit)) {
    const marked = await sizeLogo(url);
    if (!marked || marked === url) { skipped++; continue; }
    sized++;
    for (const { table, column } of LOGO_COLUMNS) {
      rowsUpdated += await prisma.$executeRawUnsafe(`UPDATE "${table}" SET "${column}" = $2 WHERE "${column}" = $1`, url, marked);
    }
  }
  return { sized, skipped, rowsUpdated };
}
