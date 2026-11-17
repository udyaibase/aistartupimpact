import { prisma } from '@udyaibase/database';
import { effectiveHostPlan, isPlatformOrganizer } from '@/lib/events/plans';
import { cleanHttpsUrl, isOwnMediaUrl } from './urls';

/**
 * After an event ends its page switches to recap mode: highlights, a photo gallery, recordings and slides, and
 * totals like "120 attended". Totals only: no names or lists of who came.
 */

export const GALLERY_LIMIT = { FREE: 10, PRO: 50 } as const;
export const MAX_RECAP_LINKS = 10;
export const MAX_RECAP_SUMMARY = 1000;

export type RecapLink = { kind: 'recording' | 'slides' | 'other'; title: string; url: string };

export async function galleryLimit(organizerId: string): Promise<number> {
  const o = await prisma.eventOrganizer.findUnique({ where: { id: organizerId }, select: { plan: true, planExpiresAt: true, email: true } });
  return o && (isPlatformOrganizer(o.email) || effectiveHostPlan(o).key === 'PRO') ? GALLERY_LIMIT.PRO : GALLERY_LIMIT.FREE;
}

export { cleanHttpsUrl };

export function cleanRecapLinks(raw: unknown): RecapLink[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: RecapLink[] = [];
  for (const item of list) {
    const r = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    const url = cleanHttpsUrl(r.url);
    if (!url) continue;
    const kind = r.kind === 'recording' || r.kind === 'slides' ? r.kind : 'other';
    const title = String(r.title ?? '').trim().slice(0, 100) || (kind === 'recording' ? 'Recording' : kind === 'slides' ? 'Slides' : 'Link');
    out.push({ kind, title, url });
    if (out.length >= MAX_RECAP_LINKS) break;
  }
  return out;
}

/** Gallery photos: our own uploads only (public page shows them), de-duplicated and capped at the plan limit. */
export function cleanGallery(raw: unknown, limit: number): string[] {
  const list = Array.isArray(raw) ? raw : [];
  return Array.from(new Set(list.filter((u): u is string => typeof u === 'string' && isOwnMediaUrl(u)))).slice(0, limit);
}

/** YouTube watch/short/embed links -> privacy-friendly embed URL; null for anything else. */
export function youTubeEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\.|^m\./, '');
    let id: string | null = null;
    if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
    else if (host === 'youtube.com') {
      if (u.pathname === '/watch') id = u.searchParams.get('v');
      else if (/^\/(embed|shorts|live)\//.test(u.pathname)) id = u.pathname.split('/')[2];
    }
    return id && /^[\w-]{6,20}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  } catch {
    return null;
  }
}

/** Show attendance only when it's meaningful (and says nothing about individuals). */
export const RECAP_MIN_ATTENDED = 5;
