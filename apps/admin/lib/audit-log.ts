import { neon } from '@neondatabase/serverless';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { headers } from 'next/headers';

const sql = neon(process.env.DATABASE_URL!);

export type AuditAction =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'RESTORE'
  | 'APPROVE'
  | 'REJECT'
  | 'PUBLISH'
  | 'UNPUBLISH'
  | 'FEATURE'
  | 'UNFEATURE'
  | 'EXPORT'
  | 'ACCESS'
  | 'SUSPEND'
  | 'UNSUSPEND'
  | 'UPLOAD'
  | 'CONFIG_CHANGE';

export type ResourceType =
  | 'STARTUP'
  | 'AI_TOOL'
  | 'ARTICLE'
  | 'EVENT'
  | 'NEWSLETTER'
  | 'USER'
  | 'FUNDING_ROUND'
  | 'TESTIMONIAL'
  | 'HERO_SLOT'
  | 'TICKER'
  | 'PLACEMENT'
  | 'SPONSOR'
  | 'CAMPAIGN'
  | 'EMPLOYER'
  | 'WEB_USER'
  | 'JOB_LISTING'
  | 'CITY'
  | 'BRAND'
  | 'SETTINGS'
  | 'PEOPLE_EXPORT'
  | 'EVENT_EXPORT'
  | 'INDIA_AI_STATS'
  | 'INDIAAI_MISSION_TRACKER'
  | 'INDIAAI_RESEARCH_HUB'
  | 'AI_RESEARCH_INSTITUTION'
  | 'ADV_PACKAGE'
  | 'ADV_ZONE_ACTIVATION'
  | 'ADV_SOCIAL_POST'
  | 'ADV_PAYMENT'
  | 'BILLING_PAYMENT';

interface AuditLogEntry {
  action: AuditAction;
  resourceType: ResourceType;
  resourceId?: string | null;
  resourceName?: string;
  before?: Record<string, any> | null;
  after?: Record<string, any> | null;
  ipAddress?: string | null;
}

async function getClientIp(): Promise<string | null> {
  try {
    const hdrs = await headers();
    return hdrs.get('x-forwarded-for')?.split(',')[0]?.trim()
      || hdrs.get('x-real-ip')
      || null;
  } catch {
    return null;
  }
}

export async function logAuditEvent(entry: AuditLogEntry): Promise<void> {
  try {
    const session: any = await getServerSession(authOptions);
    const userId = session?.user?.id;

    if (!userId) {
      console.warn('[AuditLog] No session user found — skipping audit log');
      return;
    }

    const beforeJson = entry.before ? JSON.stringify(entry.before) : null;
    const afterJson = entry.after ? JSON.stringify(entry.after) : null;
    const ip = entry.ipAddress || await getClientIp();

    await sql`
      INSERT INTO "AuditLog" (id, "userId", action, "resourceType", "resourceId", before, after, "ipAddress", "createdAt")
      VALUES (
        gen_random_uuid(),
        ${userId},
        ${entry.action},
        ${entry.resourceType},
        ${entry.resourceId || null},
        ${beforeJson}::jsonb,
        ${afterJson}::jsonb,
        ${ip},
        NOW()
      )
    `;
  } catch (error) {
    console.error('[AuditLog] Failed to write audit log:', error);
  }
}

export function snapshot(record: Record<string, any>, fields?: string[]): Record<string, any> {
  if (!record) return {};
  if (!fields) return { ...record };
  const result: Record<string, any> = {};
  for (const field of fields) {
    if (field in record) {
      result[field] = record[field];
    }
  }
  return result;
}

export async function canDelete(): Promise<{ allowed: boolean; error?: string; session?: any }> {
  const session: any = await getServerSession(authOptions);
  if (!session?.user) {
    return { allowed: false, error: 'Unauthorized' };
  }

  if (session.user.role === 'SUPER_ADMIN') {
    return { allowed: true, session };
  }

  try {
    const user = await sql`
      SELECT "canDeleteUntil" FROM "User" WHERE id = ${session.user.id} LIMIT 1
    `;

    if (user.length > 0 && user[0].canDeleteUntil) {
      const expiresAt = new Date(user[0].canDeleteUntil);
      if (expiresAt > new Date()) {
        return { allowed: true, session };
      }
    }
  } catch (e) {
    console.error('[canDelete] Error checking delegated permission:', e);
  }

  return {
    allowed: false,
    error: 'Delete access is restricted to Super Admins. If you need to delete a record, request temporary access from your Super Admin.',
    session,
  };
}
