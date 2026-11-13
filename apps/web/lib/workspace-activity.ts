import type { NextRequest } from 'next/server';
import { headers } from 'next/headers';
import { prisma } from '@udyaibase/database';
import type { EmployerActivity, OrganizerActivity, WorkspaceKind } from '@udyaibase/utils';
import { clientIpFromHeaders } from '@/lib/client-ip';
import { maskEmail } from '@/lib/mask';

/** Who did it. Null for the system (a payment webhook, a scheduled job). */
export type Actor = { name?: string | null; email?: string | null } | null;
type Opts = { actor?: Actor; request?: NextRequest | Request; metadata?: Record<string, string | number | boolean> };

/** The current request's headers, or null outside a request (webhooks pass none; scripts and tests have none). */
async function currentHeaders(): Promise<Headers | null> {
  try { return await headers(); } catch { return null; }
}

/**
 * Record one entry in a workspace's activity log (employer or event host), shown to its owners and admins.
 * Kept for one year. Never put passwords, codes or tokens in metadata; other people's emails go in masked.
 * A logging failure must never break the action itself, so this never throws.
 */
async function log(kind: WorkspaceKind, workspaceId: string, action: string, opts: Opts = {}): Promise<void> {
  try {
    const h = opts.request?.headers ?? (opts.actor ? await currentHeaders() : null);
    await prisma.workspaceActivityLog.create({
      data: {
        workspace: kind,
        workspaceId,
        action,
        actorName: opts.actor?.name?.slice(0, 120) || null,
        actorEmail: opts.actor?.email ? maskEmail(opts.actor.email) : null,
        ipAddress: h ? clientIpFromHeaders(h) : null,
        userAgent: h?.get('user-agent')?.slice(0, 300) ?? null,
        metadata: opts.metadata,
      },
    });
  } catch (err) {
    console.error('[workspace-activity] could not record', kind, action, err instanceof Error ? err.message : 'unknown error');
  }
}

export const logEmployerActivity = (employerId: string, action: EmployerActivity, opts?: Opts) => log('EMPLOYER', employerId, action, opts);
export const logOrganizerActivity = (organizerId: string, action: OrganizerActivity, opts?: Opts) => log('ORGANIZER', organizerId, action, opts);

/** The signed-in person on an employer session: a teammate's name, or the workspace account itself. */
export const employerActor = (s: { email: string; memberName: string | null; companyName?: string }) => ({ name: s.memberName ?? s.companyName ?? null, email: s.email });
/** The signed-in person on an organizer session. */
export const organizerActor = (s: { email: string; name?: string | null }) => ({ name: s.name ?? null, email: s.email });

/** "₹2,359" for an amount in paise, for log entries. */
export const paiseLabel = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
