"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@udyaibase/database";
import { Resend } from "resend";
import { generateNewsletterHtml } from "@/lib/newsletter-templates";
import { logAuditEvent, canDelete } from '@/lib/audit-log';
import { signEventUnsubscribeToken } from "@udyaibase/utils/event-campaigns";

const resend = new Resend(process.env.RESEND_API_KEY);

// Newsletter-specific email configuration
const FROM_EMAIL = process.env.RESEND_NEWSLETTER_EMAIL || "newsletter-noreply@udyaibase.com";
const FROM_NAME = process.env.RESEND_NEWSLETTER_NAME || "Udyaibase Weekly";
const REPLY_TO = process.env.RESEND_REPLY_TO || "hello@udyaibase.com";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || process.env.WEB_URL || "https://udyaibase.com";

const ALLOWED = ["SUPER_ADMIN", "EDITOR_IN_CHIEF", "SENIOR_WRITER"];

// ── Stats ────────────────────────────────────────────────────────────────────


/** Preview text goes inside HTML, so escape it like any other text. */
const escapePreview = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export async function getNewsletterStatsAction() {
  const session: any = await getServerSession(authOptions);
  if (!session?.user || !ALLOWED.includes(session.user.role))
    return { success: false, error: "Unauthorized" };

  try {
    const [totalRows, activeRows, campaignRows] = await Promise.all([
      prisma.$queryRaw<any[]>`SELECT COUNT(*) as count FROM "NewsletterSubscriber"`,
      prisma.$queryRaw<any[]>`SELECT COUNT(*) as count FROM "NewsletterSubscriber" WHERE "isActive" = true`,
      prisma.$queryRaw<any[]>`
        SELECT
          COUNT(*) as total,
          COALESCE(SUM("uniqueOpens"), 0) as total_opens,
          COALESCE(SUM("uniqueClicks"), 0) as total_clicks,
          COALESCE(SUM("totalSent"), 0) as total_sent
        FROM "NewsletterCampaign" WHERE status = 'SENT'
      `,
    ]);

    const total = Number(totalRows[0]?.count || 0);
    const active = Number(activeRows[0]?.count || 0);
    const sentCount = Number(campaignRows[0]?.total || 0);
    const totalOpens = Number(campaignRows[0]?.total_opens || 0);
    const totalClicks = Number(campaignRows[0]?.total_clicks || 0);
    const totalSent = Number(campaignRows[0]?.total_sent || 0);

    const openRate = totalSent > 0 ? ((totalOpens / totalSent) * 100).toFixed(1) : "0";
    const ctr = totalSent > 0 ? ((totalClicks / totalSent) * 100).toFixed(1) : "0";

    return {
      success: true,
      data: { total, active, sentCount, openRate, ctr },
    };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// ── Campaigns ────────────────────────────────────────────────────────────────

export async function getCampaignsAction() {
  const session: any = await getServerSession(authOptions);
  if (!session?.user || !ALLOWED.includes(session.user.role))
    return { success: false, error: "Unauthorized", data: [] };

  try {
    const rows = await prisma.$queryRaw<any[]>`
      SELECT id, subject, "previewText", "contentJson", status, "sentAt"::text AS "sentAt",
             "scheduledAt"::text AS "scheduledAt",
             "totalSent", opens, "uniqueOpens", clicks, "uniqueClicks", unsubscribes, "createdAt"::text AS "createdAt"
      FROM "NewsletterCampaign"
      ORDER BY "createdAt" DESC
    `;
    return { success: true, data: rows };
  } catch (e: any) {
    return { success: false, error: e.message, data: [] };
  }
}

export async function saveCampaignAction(payload: {
  id?: string;
  subject: string;
  previewText: string;
  body: string; // HTML body
  scheduledAt?: string;
  templateId?: string;
}) {
  const session: any = await getServerSession(authOptions);
  if (!session?.user || !["SUPER_ADMIN", "EDITOR_IN_CHIEF"].includes(session.user.role))
    return { success: false, error: "Unauthorized" };

  const { id, subject, previewText, body, scheduledAt, templateId } = payload;
  const contentJson = JSON.stringify({ html: body, templateId: templateId || 'modern' });

  try {
    if (id) {
      await prisma.$executeRaw`
        UPDATE "NewsletterCampaign"
        SET subject = ${subject}, "previewText" = ${previewText},
            "contentJson" = ${contentJson}::jsonb,
            "scheduledAt" = ${scheduledAt ? new Date(scheduledAt) : null},
            "updatedAt" = NOW()
        WHERE id = ${id}
      `;

      // Audit log
      await logAuditEvent({
        action: 'UPDATE',
        resourceType: 'NEWSLETTER',
        resourceId: id,
        after: { subject },
      });

      return { success: true, id };
    } else {
      const rows = await prisma.$queryRaw<any[]>`
        INSERT INTO "NewsletterCampaign" (id, subject, "previewText", "contentJson", status, "scheduledAt", "createdAt", "updatedAt")
        VALUES (gen_random_uuid(), ${subject}, ${previewText}, ${contentJson}::jsonb, 'DRAFT', ${scheduledAt ? new Date(scheduledAt) : null}, NOW(), NOW())
        RETURNING id
      `;

      // Audit log
      await logAuditEvent({
        action: 'CREATE',
        resourceType: 'NEWSLETTER',
        resourceId: rows[0]?.id,
        after: { subject },
      });

      return { success: true, id: rows[0]?.id };
    }
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function deleteCampaignAction(id: string) {
  // Only SUPER_ADMIN can delete
  const { allowed, error } = await canDelete();
  if (!allowed) {
    return { success: false, error: error || 'Unauthorized' };
  }

  try {
    // Capture before state
    const campaign: any[] = await prisma.$queryRaw`SELECT id, subject FROM "NewsletterCampaign" WHERE id = ${id} LIMIT 1`;
    const before = campaign[0] || null;

    await prisma.$executeRaw`DELETE FROM "NewsletterCampaign" WHERE id = ${id}`;

    // Audit log
    await logAuditEvent({
      action: 'DELETE',
      resourceType: 'NEWSLETTER',
      resourceId: id,
      before: before ? { subject: before.subject } : undefined,
    });

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// ── Send ─────────────────────────────────────────────────────────────────────

export async function sendCampaignAction(id: string) {
  const session: any = await getServerSession(authOptions);
  if (!session?.user || !["SUPER_ADMIN", "EDITOR_IN_CHIEF"].includes(session.user.role))
    return { success: false, error: "Unauthorized" };

  try {
    const campaigns = await prisma.$queryRaw<any[]>`
      SELECT id, subject, "previewText", "contentJson" FROM "NewsletterCampaign"
      WHERE id = ${id} AND status IN ('DRAFT', 'SCHEDULED')
    `;
    if (!campaigns.length) return { success: false, error: "Campaign not found or already sent" };

    const campaign = campaigns[0];
    const htmlBody = (campaign.contentJson as any)?.html || "";
    const templateId = (campaign.contentJson as any)?.templateId || "modern";

    // Mark as SENDING
    await prisma.$executeRaw`
      UPDATE "NewsletterCampaign" SET status = 'SENDING', "updatedAt" = NOW() WHERE id = ${id}
    `;

    // Fetch active subscribers
    const subscribers = await prisma.$queryRaw<any[]>`
      SELECT id, email, name FROM "NewsletterSubscriber" WHERE "isActive" = true AND "emailVerified" = true
    `;

    if (subscribers.length === 0) {
      await prisma.$executeRaw`
        UPDATE "NewsletterCampaign"
        SET status = 'SENT', "sentAt" = NOW(), "totalSent" = 0, "updatedAt" = NOW()
        WHERE id = ${id}
      `;
      return { success: true, sent: 0 };
    }

    // Wrap links with tracking
    const wrapLinksWithTracking = (html: string, email: string, campaignId: string) => {
      return html.replace(
        /<a\s+([^>]*href=["']([^"']+)["'][^>]*)>([^<]*)<\/a>/gi,
        (match, attrs, url, text) => {
          if (url.includes('/api/newsletter/track-click') || url.includes('/unsubscribe')) {
            return match;
          }
          const trackingUrl = `${SITE_URL}/api/newsletter/track-click?c=${encodeURIComponent(campaignId)}&e=${encodeURIComponent(email)}&url=${encodeURIComponent(url)}&label=${encodeURIComponent(text)}`;
          return `<a ${attrs.replace(/href=["'][^"']+["']/, `href="${trackingUrl}"`)}>${text}</a>`;
        }
      );
    };

    // Build final HTML using the same template as preview
    const buildHtml = (email: string, campaignId: string) => {
      const trackedBody = wrapLinksWithTracking(htmlBody, email, campaignId);
      const trackingPixel = `${SITE_URL}/api/newsletter/track-open?c=${encodeURIComponent(campaignId)}&e=${encodeURIComponent(email)}`;
      
      // Use the same template system as the live preview
      const fullHtml = generateNewsletterHtml(templateId, campaign.subject, trackedBody);
      
      // Inject tracking pixel and preview text before closing </body>
      const previewDiv = `<div style="display:none;font-size:1px;color:#f4f7fa;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden">${escapePreview(campaign.previewText || campaign.subject)}</div>`;
      const pixel = `<img src="${trackingPixel}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0" />`;
      
      return fullHtml
        .replace('</body>', `${pixel}</body>`)
        .replace(/<body([^>]*)>/, `<body$1>${previewDiv}`)
        // Replace unsubscribe placeholder with actual email
        .replace(/\{\{email\}\}/g, encodeURIComponent(email));
    };

    // Send in batches of 100 (Resend limit)
    let totalSent = 0;
    const CHUNK = 100;
    for (let i = 0; i < subscribers.length; i += CHUNK) {
      const chunk = subscribers.slice(i, i + CHUNK);
      const batch = chunk.map((sub: any) => ({
        from: `${FROM_NAME} <${FROM_EMAIL}>`,
        replyTo: REPLY_TO,
        to: [sub.email],
        subject: campaign.subject,
        html: buildHtml(sub.email, id),
        headers: {
          'List-Unsubscribe': `<${SITE_URL}/api/newsletter/unsubscribe?token=${signEventUnsubscribeToken(sub.id, sub.email)}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      }));
      await resend.batch.send(batch);
      totalSent += chunk.length;
    }

    await prisma.$executeRaw`
      UPDATE "NewsletterCampaign"
      SET status = 'SENT', "sentAt" = NOW(), "totalSent" = ${totalSent}, "updatedAt" = NOW()
      WHERE id = ${id}
    `;

    // Audit log for newsletter send
    await logAuditEvent({
      action: 'PUBLISH',
      resourceType: 'NEWSLETTER',
      resourceId: id,
      after: { subject: campaign.subject, totalSent },
    });

    return { success: true, sent: totalSent };
  } catch (e: any) {
    await prisma.$executeRaw`
      UPDATE "NewsletterCampaign" SET status = 'FAILED', "updatedAt" = NOW() WHERE id = ${id}
    `;
    return { success: false, error: e.message };
  }
}

export async function sendTestEmailAction(id: string, testEmail: string) {
  const session: any = await getServerSession(authOptions);
  if (!session?.user || !["SUPER_ADMIN", "EDITOR_IN_CHIEF"].includes(session.user.role))
    return { success: false, error: "Unauthorized" };

  try {
    const campaigns = await prisma.$queryRaw<any[]>`
      SELECT subject, "previewText", "contentJson" FROM "NewsletterCampaign" WHERE id = ${id}
    `;
    if (!campaigns.length) return { success: false, error: "Campaign not found" };

    const campaign = campaigns[0];
    const htmlBody = (campaign.contentJson as any)?.html || "";
    const templateId = (campaign.contentJson as any)?.templateId || "modern";

    // Use the SAME template system as the live preview — no separate HTML
    const fullHtml = generateNewsletterHtml(templateId, campaign.subject, htmlBody)
      .replace(/\{\{email\}\}/g, encodeURIComponent(testEmail));

    await resend.emails.send({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      replyTo: REPLY_TO,
      to: [testEmail],
      subject: `[TEST] ${campaign.subject}`,
      html: fullHtml,
      headers: {
        'List-Unsubscribe': `<${SITE_URL}/api/newsletter/unsubscribe?token=${signEventUnsubscribeToken('test', testEmail)}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    });

    return { success: true };
  } catch (e: any) {
    console.error('Test email error:', e);
    return { success: false, error: e.message };
  }
}
