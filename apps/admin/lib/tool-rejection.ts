import { neon } from '@neondatabase/serverless';
import { toolRejectionHtml } from '@udyaibase/utils';
import { sendEmailFireAndForget } from '@/lib/email-send';
import { logAuditEvent } from '@/lib/audit-log';
import { notifyFounder } from '@/lib/founder-notify';

const sql = neon(process.env.DATABASE_URL!);

/** Rejects a tool and emails its founder the reason. The one path for every place an admin can reject a tool. */
export async function rejectTool(id: string, reason: string): Promise<{ found: boolean }> {
  const rows = await sql`
    SELECT t.name, t."ownerId", fu.email AS "founderEmail", fu.name AS "founderName"
    FROM "AiTool" t
    LEFT JOIN "FounderUser" fu ON fu.id = t."ownerId"
    WHERE t.id = ${id}
    LIMIT 1
  `;
  const tool = rows[0] as { name: string; founderEmail: string | null; founderName: string | null; ownerId: string | null } | undefined;
  if (!tool) return { found: false };

  // A tool that's already live stays live: this path is only for one waiting for its first approval.
  await sql`
    UPDATE "AiTool"
    SET status = 'ARCHIVED'::"ToolApprovalStatus", "claimStatus" = 'REJECTED', "updatedAt" = NOW()
    WHERE id = ${id} AND status = 'PENDING'::"ToolApprovalStatus"
  `;

  if (tool.founderEmail) {
    sendEmailFireAndForget({
      to: tool.founderEmail,
      subject: `Action required: your tool "${tool.name}" needs changes`,
      html: toolRejectionHtml(tool.name, tool.founderName || 'there', reason),
      type: 'rejection',
    });
  }

  await notifyFounder(tool.ownerId, { type: 'listing_rejected', title: `${tool.name} wasn’t approved`, message: reason, link: '/founder/tools' });
  logAuditEvent({ action: 'REJECT', resourceType: 'AI_TOOL', resourceId: id, resourceName: tool.name, after: { reason } });
  return { found: true };
}
