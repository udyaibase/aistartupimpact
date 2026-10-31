/**
 * Image loader for every next/image on the site. Vercel's image optimisation is never used (it bills per
 * transformation); images come from Cloudflare instead:
 * - Our media (R2 behind media.udyaibase.com): logos marked `?sz=1` use their ready-made 64/128/256px WebP
 *   copies (lib/media/logo-sizes.ts); anything else is resized by Cloudflare Image Transformations when
 *   NEXT_PUBLIC_CF_IMAGE_RESIZING=true, otherwise the original file straight from Cloudflare.
 * - Unsplash: Unsplash's own free resizing parameters.
 * - Files in /public and any other host: served as they are.
 * Must stay client-safe: next/image calls it in the browser too.
 */

const MEDIA_HOST = 'media.udyaibase.com';
// The production R2 bucket's development URL; same bucket as MEDIA_HOST, so the file is identical there
// and gets Cloudflare's cache instead of r2.dev's rate limits. (Stored URLs are rewritten separately.)
const MEDIA_BUCKET_DEV_HOST = 'pub-5a271e4327a5417daf0699e16055d515.r2.dev';
const CF_RESIZING = process.env.NEXT_PUBLIC_CF_IMAGE_RESIZING === 'true';
// Keep in step with lib/media/logo-sizes.ts (that module is server-only, this one runs in the browser).
const LOGO_SIZES = [64, 128, 256];

interface LoaderProps { src: string; width: number; quality?: number }

/**
 * Same file at every width. The #fragment tells next/image the width was considered (otherwise it warns
 * in development); browsers never send it, so it's one request and one cache entry per image.
 */
const asIs = (src: string, width: number) => `${src}#w=${width}`;

export default function cloudflareImageLoader({ src, width, quality }: LoaderProps): string {
  const q = quality ?? 75;

  // /public files: tiny static assets, served as they are.
  if (src.startsWith('/')) return asIs(src, width);

  let url: URL;
  try { url = new URL(src); } catch { return asIs(src, width); }

  if (url.hostname === MEDIA_BUCKET_DEV_HOST) url.hostname = MEDIA_HOST;

  if (url.hostname === MEDIA_HOST) {
    if (url.searchParams.get('sz') === '1') {
      const size = LOGO_SIZES.find((s) => s >= width);
      const key = url.pathname.replace(/^\/+/, '').replace(/\.[a-z0-9]+$/i, '');
      // Bigger than the largest copy: the original file (rare for a logo).
      if (size) return `https://${MEDIA_HOST}/sized/${size}/${key}.webp`;
      url.search = '';
      return asIs(url.toString(), width);
    }
    if (!CF_RESIZING) return asIs(url.toString(), width);
    const path = url.pathname.replace(/^\/+/, '');
    return `https://${MEDIA_HOST}/cdn-cgi/image/width=${width},quality=${q},format=auto,fit=scale-down/${path}`;
  }

  if (url.hostname === 'images.unsplash.com') {
    url.searchParams.set('w', String(width));
    url.searchParams.set('q', String(q));
    url.searchParams.set('auto', 'format');
    url.searchParams.set('fit', 'max');
    return url.toString();
  }

  return asIs(src, width);
}
