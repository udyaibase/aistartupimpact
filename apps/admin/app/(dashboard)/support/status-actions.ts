'use server';

import { neon } from '@neondatabase/serverless';
import { requireActionAuth } from '@/lib/api-auth';

const sql = neon(process.env.DATABASE_URL!);
/** Same key the web app reads (apps/web/lib/support/portal-status.ts). */
const KEY = 'employer_portal_status';
const ROLES = ['SUPER_ADMIN', 'EDITOR_IN_CHIEF'];

export async function getPortalStatusAction() {
  const { error } = await requireActionAuth(ROLES);
  if (error) return { success: false, error };
  const rows = await sql`SELECT value FROM "SiteSetting" WHERE key = ${KEY}`;
  return { success: true, status: (rows[0]?.value ?? null) as { message?: string; level?: string; until?: string | null } | null };
}

/** Show (or with an empty message, clear) the banner on every employer portal page. `hours` 0 means until cleared. */
export async function setPortalStatusAction(input: { message: string; level: string; hours: number }) {
  const { session, error } = await requireActionAuth(ROLES);
  if (error) return { success: false, error };
  const message = input.message.trim().replace(/\s+/g, ' ').slice(0, 300);
  const level = ['info', 'warning', 'outage'].includes(input.level) ? input.level : 'info';
  const hours = Math.min(Math.max(Math.round(input.hours) || 0, 0), 24 * 14);
  const value = message
    ? { message, level, until: hours ? new Date(Date.now() + hours * 36e5).toISOString() : null, updatedAt: new Date().toISOString(), by: (session as any)?.user?.email ?? 'admin' }
    : { message: '', level: 'info', until: null, updatedAt: new Date().toISOString() };
  await sql`
    INSERT INTO "SiteSetting" (id, key, value, "updatedAt") VALUES (gen_random_uuid()::text, ${KEY}, ${JSON.stringify(value)}::jsonb, NOW())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, "updatedAt" = NOW()
  `;
  return { success: true };
}
