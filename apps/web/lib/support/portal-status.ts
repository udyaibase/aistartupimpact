import { cache } from 'react';
import { prisma } from '@udyaibase/database';

/**
 * The status banner our team sets in the admin app (Support → Status banner) when something is broken or slow,
 * e.g. "Emails to candidates are delayed; we're on it". Stored as SiteSetting `employer_portal_status`.
 */
export const PORTAL_STATUS_KEY = 'employer_portal_status';
export type StatusLevel = 'info' | 'warning' | 'outage';
export interface PortalStatus { message: string; level: StatusLevel; until: string | null; updatedAt: string }

export function readStatus(value: unknown, now = new Date()): PortalStatus | null {
  const v = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const message = typeof v.message === 'string' ? v.message.trim().slice(0, 300) : '';
  if (!message) return null;
  const until = typeof v.until === 'string' && !Number.isNaN(Date.parse(v.until)) ? v.until : null;
  if (until && Date.parse(until) <= now.getTime()) return null;
  const level: StatusLevel = v.level === 'warning' || v.level === 'outage' ? v.level : 'info';
  return { message, level, until, updatedAt: typeof v.updatedAt === 'string' ? v.updatedAt : '' };
}

/** Once per request; never breaks the page if the read fails. */
export const getPortalStatus = cache(async (): Promise<PortalStatus | null> => {
  try {
    const row = await prisma.siteSetting.findUnique({ where: { key: PORTAL_STATUS_KEY }, select: { value: true } });
    return row ? readStatus(row.value) : null;
  } catch {
    return null;
  }
});
