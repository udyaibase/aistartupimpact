/**
 * The Udyaibase WhatsApp jobs channel. Set in Admin → Settings → Social links; every prompt hides itself while it's empty.
 * Joining a channel shares nothing with us (no phone number), so no consent or storage is involved.
 * Links go through /go/whatsapp-jobs?from=… so joins can be counted by where they came from.
 */

/** Where a join came from. */
export const CHANNEL_SOURCES = ['apply', 'jobs', 'job', 'track'] as const;
export type ChannelSource = (typeof CHANNEL_SOURCES)[number];

/** A WhatsApp channel invite link: https://whatsapp.com/channel/<id> (with or without www). */
export function isWhatsappChannelUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url.trim());
    return u.protocol === 'https:' && (u.hostname === 'whatsapp.com' || u.hostname === 'www.whatsapp.com')
      && /^\/channel\/[A-Za-z0-9_-]{10,}\/?$/.test(u.pathname);
  } catch {
    return false;
  }
}

/** The counted link for a surface. */
export function channelHref(from: ChannelSource): string {
  return `/go/whatsapp-jobs?from=${from}`;
}
