'use server';

import { neon } from '@neondatabase/serverless';
import { requireActionAuth } from '@/lib/api-auth';
import { refreshPublic } from '@/lib/refresh-public';

const sql = neon(process.env.DATABASE_URL!);

export async function getEmployersAction() {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };

  try {
    const employers = await sql`
      SELECT e.id, e."companyName", e.slug, e.email, e."logoUrl", e."websiteUrl",
             e.plan, e."isVerified", e."isActive", e."companySize", e.industry,
             e."createdAt"::text,
             (SELECT COUNT(*)::int FROM "JobBoardListing" WHERE "employerId" = e.id AND "deletedAt" IS NULL) AS "jobCount"
      FROM "JobBoardEmployer" e
      ORDER BY e."createdAt" DESC
      LIMIT 200
    `;
    return { success: true, data: employers };
  } catch (error: any) {
    console.error('[Admin Employers]', error);
    return { success: false, error: 'Failed to load employers' };
  }
}

export async function toggleEmployerVerifyAction(id: string, isVerified: boolean) {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };

  try {
    await sql`UPDATE "JobBoardEmployer" SET "isVerified" = ${isVerified}, "updatedAt" = NOW() WHERE id = ${id}`;
    await refreshPublic(['jobs']); return { success: true };
  } catch (error: any) {
    return { success: false, error: 'Failed to update' };
  }
}

export async function toggleEmployerActiveAction(id: string, isActive: boolean) {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };

  try {
    await sql`UPDATE "JobBoardEmployer" SET "isActive" = ${isActive}, "updatedAt" = NOW() WHERE id = ${id}`;
    await refreshPublic(['jobs']); return { success: true };
  } catch (error: any) {
    return { success: false, error: 'Failed to update' };
  }
}

/** Company checks: workspaces without a founder-verified startup that asked to publish (pending first, then recent decisions). */
export async function getCompanyChecksAction() {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };
  try {
    const rows = await sql`
      SELECT e.id, e."companyName", e.email, e."websiteUrl", e."linkedinUrl", e."companyCin", e."companyReview",
             e."companyReviewRequestedAt"::text, e."companyReviewRequestedBy", e."companyReviewedAt"::text, e."companyReviewedBy", e."companyReviewNote",
             s.name AS "startupName", s.slug AS "startupSlug",
             (SELECT string_agg(l.title, ', ') FROM "JobBoardListing" l WHERE l."employerId" = e.id AND l."publishWaitingAt" IS NOT NULL AND l."deletedAt" IS NULL) AS "waitingJobs"
      FROM "JobBoardEmployer" e
      LEFT JOIN "Startup" s ON s.id = e."startupId"
      WHERE e."companyReview" = 'PENDING' OR (e."companyReviewedAt" > NOW() - INTERVAL '14 days')
      ORDER BY (e."companyReview" = 'PENDING') DESC, e."companyReviewRequestedAt" ASC
      LIMIT 100
    `;
    return { success: true, data: rows };
  } catch (err) {
    console.error('[Admin company checks]', err);
    return { success: false, error: 'Failed to load company checks' };
  }
}

/** Pass or fail a company check. The web app records it, publishes waiting jobs (pass) or emails the team (fail). */
export async function decideCompanyCheckAction(employerId: string, approve: boolean, note: string) {
  const { session, error } = await requireActionAuth();
  if (error) return { success: false, error };
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) return { success: false, error: 'INTERNAL_API_SECRET is not set, so the web app can’t be told.' };
  const base = (process.env.WEB_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://udyaibase.com').replace(/\/$/, '');
  try {
    const res = await fetch(`${base}/api/webhooks/company-check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ employerId, approve, note, reviewer: session?.user?.email || session?.user?.name || 'admin' }),
      signal: AbortSignal.timeout(20000),
    });
    const data = await res.json().catch(() => ({}));
    return res.ok ? { success: true, published: data.published ?? 0 } : { success: false, error: data.error || `Web app answered ${res.status}` };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Couldn’t reach the web app' };
  }
}

/**
 * Onboarding funnel for workspaces created in the last `days` days: how many reached each step, the median minutes
 * from workspace creation, and how many got their first job live within 5 minutes. Split by how they started.
 */
export async function getOnboardingFunnelAction(days = 30) {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };
  const d = Math.min(Math.max(Math.round(days), 1), 365);
  try {
    const rows = await sql`
      WITH ws AS (
        SELECT "employerId", at AS created, COALESCE(meta->>'path', 'signup') AS path
        FROM "JobBoardOnboardingStep"
        WHERE step = 'WORKSPACE_CREATED' AND at >= NOW() - make_interval(days => ${d})
      )
      SELECT ws.path, s.step, COUNT(*)::int AS reached,
             ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (s.at - ws.created)) / 60))::numeric, 1)::float AS "medianMinutes",
             COUNT(*) FILTER (WHERE s.at - ws.created <= INTERVAL '5 minutes')::int AS "within5"
      FROM ws JOIN "JobBoardOnboardingStep" s ON s."employerId" = ws."employerId"
      GROUP BY ws.path, s.step
    `;
    return { success: true, data: rows as { path: string; step: string; reached: number; medianMinutes: number; within5: number }[], days: d };
  } catch (err) {
    console.error('[Admin onboarding funnel]', err);
    return { success: false, error: 'Failed to load the funnel' };
  }
}
