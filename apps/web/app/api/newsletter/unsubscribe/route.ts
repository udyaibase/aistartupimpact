import { NextRequest, NextResponse } from "next/server";
import { clientIp } from '@/lib/client-ip';
import { prisma } from "@udyaibase/database";
import { verifyEventUnsubscribeToken } from "@udyaibase/utils/event-campaigns";
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
    } else if (rawEmail) {
      decodedEmail = decodeURIComponent(rawEmail);
    }

    if (!decodedEmail) {
      return NextResponse.json({ success: false, error: "Email is required" }, { status: 400 });
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
      return NextResponse.json({ success: false, error: "Email not found" }, { status: 404 });
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
