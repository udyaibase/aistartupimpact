import { NextRequest, NextResponse } from "next/server";
import { clientIp } from '@/lib/client-ip';
import { prisma } from "@udyaibase/database";
import crypto from "crypto";

function hashIp(ip: string): string {
  return crypto.createHash('sha256').update(ip).digest('hex').substring(0, 16);
}

export const dynamic = 'force-dynamic';

// 1x1 transparent tracking pixel
const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const campaignId = searchParams.get("c");
  const email = searchParams.get("e");

  if (!campaignId || !email) {
    return new NextResponse(PIXEL, {
      status: 200,
      headers: {
        "Content-Type": "image/gif",
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    });
  }

  try {
    const decodedEmail = decodeURIComponent(email);
    const rawIp = clientIp(request);
    const ipHashed = hashIp(rawIp);
    const userAgent = request.headers.get("user-agent") || "unknown";

    const existingOpen = await prisma.$queryRaw<any[]>`
      SELECT id FROM "NewsletterOpen"
      WHERE "campaignId" = ${campaignId} AND email = ${decodedEmail}
      LIMIT 1
    `;

    const isFirstOpen = existingOpen.length === 0;

    await prisma.$executeRaw`
      INSERT INTO "NewsletterOpen" (id, "campaignId", email, "ipAddress", "userAgent", "openedAt")
      VALUES (gen_random_uuid(), ${campaignId}, ${decodedEmail}, ${ipHashed}, ${userAgent}, NOW())
    `;

    // Update campaign stats
    if (isFirstOpen) {
      await prisma.$executeRaw`
        UPDATE "NewsletterCampaign"
        SET opens = opens + 1, "uniqueOpens" = "uniqueOpens" + 1, "updatedAt" = NOW()
        WHERE id = ${campaignId}
      `;
    } else {
      await prisma.$executeRaw`
        UPDATE "NewsletterCampaign"
        SET opens = opens + 1, "updatedAt" = NOW()
        WHERE id = ${campaignId}
      `;
    }

    // Update subscriber last opened
    await prisma.$executeRaw`
      UPDATE "NewsletterSubscriber"
      SET "lastOpenedAt" = NOW()
      WHERE email = ${decodedEmail}
    `;
  } catch (error) {
    console.error("Track open error:", error);
  }

  return new NextResponse(PIXEL, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
    },
  });
}
