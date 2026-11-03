/**
 * Browser-only. Uploads go through a Server Action, whose request body is capped (next.config bodySizeLimit,
 * and 4.5 MB on Vercel), while phone and camera photos are often 3–12 MB. Large images are resized to at most
 * MAX_EDGE px on the long side and re-encoded, which keeps covers sharp at a few hundred KB.
 * GIFs (may be animated) and files already small enough are returned unchanged.
 */

const MAX_EDGE = 2400;
const SKIP_BELOW_BYTES = 900 * 1024;
export const MAX_UPLOAD_BYTES = 3.5 * 1024 * 1024;

export async function shrinkImage(file: File): Promise<File> {
  if (file.type === 'image/gif' || file.size <= SKIP_BELOW_BYTES) return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file; // the browser can't decode it (e.g. AVIF in an older browser): let the server decide
  }

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) { bitmap.close(); return file; }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  // WebP keeps PNG transparency; fall back to JPEG where the browser can't encode WebP.
  for (const [type, quality] of [['image/webp', 0.86], ['image/webp', 0.75], ['image/jpeg', 0.82]] as const) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
    if (blob && blob.type === type && blob.size <= MAX_UPLOAD_BYTES) {
      if (blob.size >= file.size) return file;
      const name = file.name.replace(/\.[^.]+$/, '') + (type === 'image/webp' ? '.webp' : '.jpg');
      return new File([blob], name, { type, lastModified: Date.now() });
    }
  }
  return file;
}
