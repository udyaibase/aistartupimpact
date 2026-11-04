/** Sizes of the ready-made logo copies kept next to each uploaded logo. */
export const LOGO_SIZES = [64, 128, 256] as const;

export const sizedKey = (key: string, width: number) => `sized/${width}/${key.replace(/\.[a-z0-9]+$/i, '')}.webp`;

/** A file's storage key and the keys of its resized copies. */
export const mediaVariantKeys = (key: string) => [key, ...LOGO_SIZES.map((w) => sizedKey(key, w))];

/** The storage key of a file in our own public bucket, or null for anything else (a Google photo, another site). */
export function ownMediaKey(url: string | null | undefined, publicBase = process.env.R2_PUBLIC_URL): string | null {
  if (!url || !publicBase) return null;
  const base = publicBase.replace(/\/+$/, '');
  if (!url.startsWith(`${base}/`)) return null;
  let key: string;
  try {
    key = decodeURIComponent(url.slice(base.length + 1).split(/[?#]/)[0]);
  } catch {
    return null;
  }
  return key && !key.includes('..') ? key : null;
}
