import { prisma } from '@udyaibase/database';
import { effectiveHostPlan, isPlatformOrganizer } from '@/lib/events/plans';
import { isOwnMediaUrl } from '@/lib/events/urls';
import { cleanBadgeSettings, type BadgeSettings } from './badge-settings';
import type { BadgeDesign } from './badges';

/**
 * Everything a badge design needs for one event, in one place for the Badges page, the preview and the PDF:
 * whether the host is on Pro (custom badges are Pro-only), the saved design (cleaned, so Free hosts never get Pro
 * options even if they were saved while on Pro), the ticket types and questions to choose from, and the images.
 */
export interface BadgeContext {
  pro: boolean;
  settings: BadgeSettings;
  tiers: { id: string; name: string }[];
  questions: { id: string; label: string }[];
  sponsorCount: number;
  hasLogo: boolean;
  design: BadgeDesign;
}

export async function badgeContext(eventId: string, proposed?: unknown): Promise<BadgeContext | null> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      badgeSettings: true,
      organizer: { select: { plan: true, planExpiresAt: true, email: true, avatar: true } },
      ticketTiers: { select: { id: true, name: true }, orderBy: { createdAt: 'asc' } },
      customQuestions: { where: { hiddenAt: null }, select: { id: true, questionText: true }, orderBy: { sortOrder: 'asc' } },
      sponsors: { where: { logoUrl: { not: null } }, select: { logoUrl: true }, orderBy: { sortOrder: 'asc' }, take: 4 },
    },
  });
  if (!event) return null;
  const pro = isPlatformOrganizer(event.organizer.email) || effectiveHostPlan(event.organizer).key === 'PRO';
  const settings = cleanBadgeSettings(proposed === undefined ? event.badgeSettings : proposed, { pro, isOwnMedia: isOwnMediaUrl });
  const questions = event.customQuestions.map((q) => ({ id: q.id, label: q.questionText.slice(0, 40) }));
  const logoUrl = isOwnMediaUrl(event.organizer.avatar) ? event.organizer.avatar : null;
  return {
    pro,
    settings,
    tiers: event.ticketTiers,
    questions,
    sponsorCount: event.sponsors.length,
    hasLogo: !!logoUrl,
    design: {
      settings,
      logoUrl,
      sponsorLogoUrls: event.sponsors.map((s) => s.logoUrl!).filter((u) => isOwnMediaUrl(u)),
      questionLabels: Object.fromEntries(questions.filter((q) => settings.questionIds.includes(q.id)).map((q) => [q.id, q.label])),
    },
  };
}
