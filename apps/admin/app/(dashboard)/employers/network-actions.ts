'use server';

import { neon } from '@neondatabase/serverless';
import { requireActionAuth } from '@/lib/api-auth';
import { sectionRoles } from '@/lib/section-access';

// The Employers section is for editors and super admins; the default roles would also let a senior writer in.
const ROLES = sectionRoles('/employers');
import { logAuditEvent } from '@/lib/audit-log';

const sql = neon(process.env.DATABASE_URL!);

/**
 * "Open to opportunities" pilot (web app: lib/network/*): which companies can search the network, how it's going,
 * and the reports job seekers sent. A report pauses that company's requests until someone here resumes them.
 */
export async function getNetworkPilotAction() {
  const { error } = await requireActionAuth(ROLES);
  if (error) return { success: false as const, error };
  try {
    const [stats] = await sql`
      SELECT
        (SELECT COUNT(*)::int FROM "JobBoardOpenProfile" WHERE "visibleUntil" > NOW() AND "pausedAt" IS NULL) AS "visible",
        (SELECT COUNT(*)::int FROM "JobBoardOpenProfile") AS "profiles",
        (SELECT COUNT(*)::int FROM "JobBoardIntroRequest" WHERE "createdAt" > NOW() - INTERVAL '30 days') AS "sent30",
        (SELECT COUNT(*)::int FROM "JobBoardIntroRequest" WHERE "createdAt" > NOW() - INTERVAL '30 days' AND status = 'ACCEPTED') AS "accepted30",
        (SELECT COUNT(*)::int FROM "JobBoardIntroRequest" WHERE "createdAt" > NOW() - INTERVAL '30 days' AND status IN ('DECLINED', 'EXPIRED', 'REPORTED')) AS "answeredNo30",
        (SELECT COUNT(*)::int FROM "JobBoardIntroRequest" WHERE "createdAt" > NOW() - INTERVAL '30 days' AND status = 'REPORTED') AS "reported30",
        (SELECT COUNT(*)::int FROM "JobBoardIntroRequest" WHERE "createdAt" > NOW() - INTERVAL '30 days' AND "applicationId" IS NOT NULL) AS "applied30",
        (SELECT ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM ("respondedAt" - "createdAt")) / 3600))::numeric, 1)::float
           FROM "JobBoardIntroRequest" WHERE "respondedAt" IS NOT NULL AND "createdAt" > NOW() - INTERVAL '30 days') AS "medianReplyHours"
    `;
    const pilots = await sql`
      SELECT e.id, e."companyName", e.plan, e."networkPausedAt"::text,
             (SELECT COUNT(*)::int FROM "JobBoardIntroRequest" r WHERE r."employerId" = e.id AND r."createdAt" > NOW() - INTERVAL '30 days') AS "sent30",
             (SELECT COUNT(*)::int FROM "JobBoardIntroRequest" r WHERE r."employerId" = e.id AND r."createdAt" > NOW() - INTERVAL '30 days' AND r.status = 'ACCEPTED') AS "accepted30"
      FROM "JobBoardEmployer" e WHERE e."networkPilot" = true ORDER BY e."companyName"
    `;
    const others = await sql`
      SELECT id, "companyName" FROM "JobBoardEmployer"
      WHERE "networkPilot" = false AND "isActive" = true AND "deletedAt" IS NULL AND "passwordHash" <> ''
      ORDER BY "companyName" LIMIT 500
    `;
    const reports = await sql`
      SELECT r.id, r."createdAt"::text, r."respondedAt"::text, r.message, r."reportReason", r."sentByEmail",
             e.id AS "employerId", e."companyName", e."networkPausedAt"::text, l.title AS "jobTitle"
      FROM "JobBoardIntroRequest" r
      JOIN "JobBoardEmployer" e ON e.id = r."employerId"
      JOIN "JobBoardListing" l ON l.id = r."listingId"
      WHERE r.status = 'REPORTED' AND r."createdAt" > NOW() - INTERVAL '90 days'
      ORDER BY r."respondedAt" DESC NULLS LAST
      LIMIT 100
    `;
    return { success: true as const, stats, pilots, others, reports };
  } catch (err) {
    console.error('[Admin network pilot]', err);
    return { success: false as const, error: 'Failed to load the pilot' };
  }
}

/** Add a company to the pilot, or take it out. */
export async function setNetworkPilotAction(employerId: string, on: boolean) {
  const { error } = await requireActionAuth(ROLES);
  if (error) return { success: false, error };
  try {
    await sql`UPDATE "JobBoardEmployer" SET "networkPilot" = ${on}, "updatedAt" = NOW() WHERE id = ${employerId}`;
    await logAuditEvent({ action: 'UPDATE', resourceType: 'EMPLOYER', resourceId: employerId, resourceName: 'setNetworkPilotAction' });
    return { success: true };
  } catch {
    return { success: false, error: 'Failed to update' };
  }
}

/** After reviewing a report: let the company send requests again. */
export async function resumeNetworkAction(employerId: string) {
  const { error } = await requireActionAuth(ROLES);
  if (error) return { success: false, error };
  try {
    await sql`UPDATE "JobBoardEmployer" SET "networkPausedAt" = NULL, "updatedAt" = NOW() WHERE id = ${employerId}`;
    await logAuditEvent({ action: 'UPDATE', resourceType: 'EMPLOYER', resourceId: employerId, resourceName: 'resumeNetworkAction' });
    return { success: true };
  } catch {
    return { success: false, error: 'Failed to update' };
  }
}
