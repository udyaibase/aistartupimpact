'use server';

import { neon } from '@neondatabase/serverless';
import { requireActionAuth } from '@/lib/api-auth';
import { sectionRoles } from '@/lib/section-access';
import { logAuditEvent } from '@/lib/audit-log';

const sql = neon(process.env.DATABASE_URL!);

export async function getAnnouncementsAction() {
  const { error } = await requireActionAuth(sectionRoles('/announcements'));
  if (error) return { success: false, error };

  const rows = await sql`
    SELECT id, type, text, "mobileText", emoji, link,
           "startupId", "fundingRoundId", "eventId", "jobListingId", "toolId",
           "isActive", "sortOrder",
           "startsAt"::text, "endsAt"::text,
           "createdAt"::text, "updatedAt"::text
    FROM "SiteAnnouncement"
    ORDER BY "sortOrder", "createdAt"
  `;

  return { success: true, announcements: rows };
}

export async function createAnnouncementAction(data: {
  type: string;
  text: string;
  mobileText?: string;
  emoji: string;
  link: string;
  startupId?: string;
  fundingRoundId?: string;
  eventId?: string;
  jobListingId?: string;
  toolId?: string;
  isActive: boolean;
  startsAt?: string;
  endsAt?: string;
}) {
  const { error } = await requireActionAuth(sectionRoles('/announcements'));
  if (error) return { success: false, error };

  const maxOrder = await sql`SELECT COALESCE(MAX("sortOrder"), -1) + 1 AS next FROM "SiteAnnouncement"`;
  const sortOrder = maxOrder[0].next;

  await sql`
    INSERT INTO "SiteAnnouncement" (
      id, type, text, "mobileText", emoji, link,
      "startupId", "fundingRoundId", "eventId", "jobListingId", "toolId",
      "isActive", "sortOrder", "startsAt", "endsAt", "updatedAt"
    ) VALUES (
      gen_random_uuid()::text,
      ${data.type}::"AnnouncementType",
      ${data.text},
      ${data.mobileText || null},
      ${data.emoji},
      ${data.link},
      ${data.startupId || null},
      ${data.fundingRoundId || null},
      ${data.eventId || null},
      ${data.jobListingId || null},
      ${data.toolId || null},
      ${data.isActive},
      ${sortOrder},
      ${data.startsAt ? new Date(data.startsAt).toISOString() : null},
      ${data.endsAt ? new Date(data.endsAt).toISOString() : null},
      NOW()
    )
  `;

  await logAuditEvent({ action: 'CREATE', resourceType: 'ANNOUNCEMENT', resourceName: 'createAnnouncementAction' });
  return { success: true };
}

export async function updateAnnouncementAction(id: string, data: {
  type?: string;
  text?: string;
  mobileText?: string;
  emoji?: string;
  link?: string;
  startupId?: string | null;
  fundingRoundId?: string | null;
  eventId?: string | null;
  jobListingId?: string | null;
  toolId?: string | null;
  isActive?: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
}) {
  const { error } = await requireActionAuth(sectionRoles('/announcements'));
  if (error) return { success: false, error };

  await sql`
    UPDATE "SiteAnnouncement" SET
      type = COALESCE(${data.type ?? null}::"AnnouncementType", type),
      text = COALESCE(${data.text ?? null}, text),
      "mobileText" = ${data.mobileText !== undefined ? (data.mobileText || null) : null},
      emoji = COALESCE(${data.emoji ?? null}, emoji),
      link = COALESCE(${data.link ?? null}, link),
      "startupId" = ${data.startupId !== undefined ? data.startupId : null},
      "fundingRoundId" = ${data.fundingRoundId !== undefined ? data.fundingRoundId : null},
      "eventId" = ${data.eventId !== undefined ? data.eventId : null},
      "jobListingId" = ${data.jobListingId !== undefined ? data.jobListingId : null},
      "toolId" = ${data.toolId !== undefined ? data.toolId : null},
      "isActive" = COALESCE(${data.isActive ?? null}, "isActive"),
      "startsAt" = ${data.startsAt ? new Date(data.startsAt).toISOString() : null},
      "endsAt" = ${data.endsAt ? new Date(data.endsAt).toISOString() : null},
      "updatedAt" = NOW()
    WHERE id = ${id}
  `;

  await logAuditEvent({ action: 'UPDATE', resourceType: 'ANNOUNCEMENT', resourceId: id, resourceName: 'updateAnnouncementAction' });
  return { success: true };
}

export async function deleteAnnouncementAction(id: string) {
  const { error } = await requireActionAuth(['SUPER_ADMIN']);
  if (error) return { success: false, error };

  await sql`DELETE FROM "SiteAnnouncement" WHERE id = ${id}`;
  await logAuditEvent({ action: 'DELETE', resourceType: 'ANNOUNCEMENT', resourceId: id, resourceName: 'deleteAnnouncementAction' });
  return { success: true };
}

export async function toggleAnnouncementAction(id: string) {
  const { error } = await requireActionAuth(sectionRoles('/announcements'));
  if (error) return { success: false, error };

  await sql`
    UPDATE "SiteAnnouncement"
    SET "isActive" = NOT "isActive", "updatedAt" = NOW()
    WHERE id = ${id}
  `;

  await logAuditEvent({ action: 'UPDATE', resourceType: 'ANNOUNCEMENT', resourceId: id, resourceName: 'toggleAnnouncementAction' });
  return { success: true };
}

export async function reorderAnnouncementsAction(ids: string[]) {
  const { error } = await requireActionAuth(sectionRoles('/announcements'));
  if (error) return { success: false, error };

  for (let i = 0; i < ids.length; i++) {
    await sql`
      UPDATE "SiteAnnouncement"
      SET "sortOrder" = ${i}, "updatedAt" = NOW()
      WHERE id = ${ids[i]}
    `;
  }

  await logAuditEvent({ action: 'UPDATE', resourceType: 'ANNOUNCEMENT', resourceName: 'reorderAnnouncementsAction' });
  return { success: true };
}

export async function searchExistingDataAction(type: string, query: string) {
  const { error } = await requireActionAuth(sectionRoles('/announcements'));
  if (error) return { success: false, error };

  const searchTerm = `%${query}%`;
  let results: any[] = [];

  switch (type) {
    case 'STARTUP':
      results = await sql`
        SELECT id, name, slug, "logoUrl", tagline
        FROM "Startup"
        WHERE name ILIKE ${searchTerm} AND "deletedAt" IS NULL
        LIMIT 10
      `;
      break;
    case 'FUNDING':
      results = await sql`
        SELECT fr.id, s.name, fr."roundType", fr."amountInr",
               fr."announcedAt"::text, s.slug
        FROM "FundingRound" fr
        JOIN "Startup" s ON fr."startupId" = s.id
        WHERE s.name ILIKE ${searchTerm}
        LIMIT 10
      `;
      break;
    case 'EVENT':
      results = await sql`
        SELECT id, title, slug, "startAt"::text, "coverImageUrl"
        FROM "Event"
        WHERE title ILIKE ${searchTerm} AND "deletedAt" IS NULL
        LIMIT 10
      `;
      break;
    case 'JOB':
      results = await sql`
        SELECT jl.id, jl.title, jl.slug, e."companyName"
        FROM "JobBoardListing" jl
        JOIN "JobBoardEmployer" e ON jl."employerId" = e.id
        WHERE jl.title ILIKE ${searchTerm} AND jl."deletedAt" IS NULL
        LIMIT 10
      `;
      break;
    case 'TOOL':
      results = await sql`
        SELECT id, name, slug, "logoUrl", tagline
        FROM "AiTool"
        WHERE name ILIKE ${searchTerm} AND "deletedAt" IS NULL
        LIMIT 10
      `;
      break;
  }

  return { success: true, results };
}
