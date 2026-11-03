import { prisma } from '@udyaibase/database';
import { refreshSections } from '@/lib/revalidate';

/**
 * Scheduled articles go live once their time comes (the admin sets status SCHEDULED + scheduledAt). Runs every
 * 10 minutes. Also gives a publish date to any published article missing one, so lists sort it correctly.
 */
export async function publishScheduledArticles(now = new Date()) {
  const published = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE "Article"
    SET status = 'PUBLISHED', "publishedAt" = COALESCE("publishedAt", "scheduledAt", ${now}), "updatedAt" = ${now}
    WHERE status = 'SCHEDULED' AND "deletedAt" IS NULL AND "scheduledAt" <= ${now}
    RETURNING id`;
  const datesFixed = await prisma.$executeRaw`
    UPDATE "Article" SET "publishedAt" = COALESCE("scheduledAt", "createdAt")
    WHERE status = 'PUBLISHED' AND "publishedAt" IS NULL AND "deletedAt" IS NULL`;
  if (published.length || datesFixed) refreshSections(['news', 'stories', 'opinions', 'authors', 'home']);
  return { published: published.length, datesFixed };
}
