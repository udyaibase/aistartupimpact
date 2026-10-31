import { prisma } from '@udyaibase/database';

/** URL slug for a job title; adds a short suffix only when the plain slug is taken. */
export async function uniqueJobSlug(title: string, exceptId?: string): Promise<string> {
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'job';
  const taken = await prisma.jobBoardListing.findFirst({ where: { slug: base, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { id: true } });
  return taken ? `${base}-${Math.random().toString(36).slice(2, 7)}` : base;
}
