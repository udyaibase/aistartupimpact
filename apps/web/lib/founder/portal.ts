import { sql } from '@/lib/db';

export interface FounderListing { id: string; name: string; slug: string; type: 'startup' | 'tool' }

/** What the founder portal's sidebar, header and phone menu show on every page. */
export interface FounderShell {
  workspaceName: string;
  logoUrl: string | null;
  /** The startup the workspace card stands for: verified first, then the newest. Null before they list one. */
  startupSlug: string | null;
  verified: boolean;
  listings: FounderListing[];
}

export async function getFounderShell(userId: string, founderName: string, ownerIds: string[] = [userId]): Promise<FounderShell> {
  const [startups, tools] = await Promise.all([
    sql`SELECT id, name, slug, "logoUrl", "isVerified" FROM "Startup"
        WHERE "ownerId" = ANY(${ownerIds}) AND "deletedAt" IS NULL
        ORDER BY "isVerified" DESC, "createdAt" DESC LIMIT 50`,
    sql`SELECT id, name, slug FROM "AiTool"
        WHERE "ownerId" = ANY(${ownerIds}) AND "deletedAt" IS NULL
        ORDER BY "createdAt" DESC LIMIT 50`,
  ]) as [{ id: string; name: string; slug: string; logoUrl: string | null; isVerified: boolean }[], { id: string; name: string; slug: string }[]];
  const primary = startups[0];
  return {
    workspaceName: primary?.name ?? founderName,
    logoUrl: primary?.logoUrl ?? null,
    startupSlug: primary?.slug ?? null,
    verified: !!primary?.isVerified,
    listings: [
      ...startups.map((s) => ({ id: s.id, name: s.name, slug: s.slug, type: 'startup' as const })),
      ...tools.map((t) => ({ id: t.id, name: t.name, slug: t.slug, type: 'tool' as const })),
    ],
  };
}
