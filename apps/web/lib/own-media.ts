import { isOwnMediaUrl as isOnOwnMediaHost } from './events/urls';

/**
 * Pictures in a founder's story must be ones uploaded through our own media upload: an https link on our media host
 * (the same rule as event logos and photos, lib/events/urls.ts), or the local /uploads folder used when no media
 * bucket is set up (development). Shared by the story editor and the server's cleaner.
 */
export function isOwnMediaUrl(src: string | undefined | null): boolean {
  if (!src) return false;
  if (/^\/uploads\/[\w.-]+$/.test(src)) return true;
  // Nothing that could end an HTML attribute or a CSS url(), even though the address parser would accept it.
  if (/[\s"'<>\\]/.test(src)) return false;
  return isOnOwnMediaHost(src);
}
