/**
 * Pictures in a founder's story must be ones uploaded through our own media upload: our media host, or the local
 * /uploads folder used when no media bucket is set up (development). Shared by the editor and the server's cleaner.
 */
export function isOwnMediaUrl(src: string | undefined | null): boolean {
  if (!src) return false;
  if (/^\/uploads\/[\w.-]+$/.test(src)) return true;
  if (/[\s"'<>]/.test(src)) return false;
  const hosts = ['https://media.udyaibase.com/'];
  const configured = (typeof process !== 'undefined' && (process.env.R2_PUBLIC_URL || process.env.NEXT_PUBLIC_MEDIA_URL)) || '';
  if (/^https:\/\/[^/]+/.test(configured)) hosts.push(configured.replace(/\/?$/, '/'));
  return hosts.some((h) => src.startsWith(h));
}
