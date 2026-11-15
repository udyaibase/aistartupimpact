import { NextRequest, NextResponse } from "next/server";
import { clientIp } from '@/lib/client-ip';
import { prisma } from "@udyaibase/database";
import { signEventUnsubscribeToken, verifyEventUnsubscribeToken } from "@udyaibase/utils/event-campaigns";
import { checkRateLimit, strictRateLimit } from "@/lib/rate-limit";
import { sendEmailFireAndForget } from "@/lib/email/send";
import crypto from "crypto";

function hashIp(ip: string): string {
  return crypto.createHash('sha256').update(ip).digest('hex').substring(0, 16);
}

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // Mail providers' one-click unsubscribe (RFC 8058) posts form data to the signed URL in the
    // List-Unsubscribe header; the site's unsubscribe page posts JSON.
    const isJson = (request.headers.get('content-type') ?? '').includes('application/json');
    const body = isJson ? await request.json().catch(() => ({})) : {};
    const { email: rawEmail, campaignId, reason, feedback } = body;
    const token = request.nextUrl.searchParams.get('token') ?? body.token;

    let decodedEmail: string | null = null;

    // Prefer signed token over raw email
    if (token) {
      const payload = verifyEventUnsubscribeToken(String(token));
      if (!payload) {
        return NextResponse.json({ success: false, error: "Invalid or expired unsubscribe link" }, { status: 401 });
      }
      decodedEmail = payload.email;
    } else if (typeof rawEmail === "string" && rawEmail.includes("@")) {
      // An address alone proves nothing (anyone can type someone else's), so nothing changes here. We email that
      // address a signed link instead, and the answer is the same whether or not it is on the list.
      const address = rawEmail.trim().toLowerCase().slice(0, 255);
      const { success: allowed } = await checkRateLimit(strictRateLimit, `newsletter-unsub:${clientIp(request)}`);
      if (allowed) {
        const rows = await prisma.$queryRaw<{ id: string; email: string }[]>`
          SELECT id, email FROM "NewsletterSubscriber" WHERE LOWER(email) = ${address} AND "isActive" = true LIMIT 1
        `;
        if (rows[0]) {
          const site = (process.env.NEXT_PUBLIC_SITE_URL || "https://udyaibase.com").replace(/\/$/, "");
          const link = `${site}/unsubscribe?email=${encodeURIComponent(rows[0].email)}&token=${encodeURIComponent(signEventUnsubscribeToken(rows[0].id, rows[0].email))}`;
          sendEmailFireAndForget({
            to: rows[0].email,
            subject: "Confirm you want to unsubscribe from Udyaibase",
            type: "newsletter_unsubscribe_confirm",
            html: `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111827;max-width:480px;margin:0 auto;padding:24px">
<h1 style="font-size:20px;margin:0 0 8px">Unsubscribe from the Udyaibase newsletter</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#374151">Someone asked to unsubscribe this address. If that was you, confirm below. If not, ignore this email and nothing changes.</p>
<p style="margin:0"><a href="${link}" style="display:inline-block;background:#A50F15;color:#fff;text-decoration:none;font-weight:600;padding:10px 18px;border-radius:10px">Unsubscribe</a></p></div>`,
          });
        }
      }
      return NextResponse.json({ success: true, emailed: true, message: "If that address is subscribed, we’ve emailed it a link to confirm." });
    }

    if (!decodedEmail) {
      return NextResponse.json({ success: false, error: "Use the unsubscribe link from one of our emails." }, { status: 400 });
    }
    const rawIp = clientIp(request);
    const ipAddress = hashIp(rawIp);

    // Check if subscriber exists
    const subscriber = await prisma.$queryRaw<any[]>`
      SELECT id, "isActive" FROM "NewsletterSubscriber"
      WHERE email = ${decodedEmail}
      LIMIT 1
    `;

    if (subscriber.length === 0) {
      return NextResponse.json({ success: true, message: "Already unsubscribed" });
    }

    if (!subscriber[0].isActive) {
      return NextResponse.json({ success: true, message: "Already unsubscribed" });
    }

    // Mark as inactive
    await prisma.$executeRaw`
      UPDATE "NewsletterSubscriber"
      SET "isActive" = false, "unsubscribedAt" = NOW()
      WHERE email = ${decodedEmail}
    `;

    // Record unsubscribe event
    await prisma.$executeRaw`
      INSERT INTO "NewsletterUnsubscribe" (id, "campaignId", email, reason, feedback, "ipAddress", "unsubscribedAt")
      VALUES (gen_random_uuid(), ${campaignId || null}, ${decodedEmail}, ${reason || null}, ${feedback || null}, ${ipAddress}, NOW())
    `;

    // Update campaign unsubscribe count if campaignId provided
    if (campaignId) {
      await prisma.$executeRaw`
        UPDATE "NewsletterCampaign"
        SET unsubscribes = unsubscribes + 1, "updatedAt" = NOW()
        WHERE id = ${campaignId}
      `;
    }

    return NextResponse.json({ success: true, message: "Successfully unsubscribed" });
  } catch (error: any) {
    console.error("Unsubscribe error:", error);
    return NextResponse.json({ success: false, error: 'Failed to unsubscribe' }, { status: 500 });
  }
}
