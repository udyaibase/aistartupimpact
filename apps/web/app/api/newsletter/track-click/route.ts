import { NextRequest, NextResponse } from "next/server";
import { clientIp } from '@/lib/client-ip';
import { prisma } from "@udyaibase/database";
import crypto from "crypto";
import { newsletterLinkValid } from "@/lib/newsletter-link";

function hashIp(ip: string): string {
  return crypto.createHash('sha256').update(ip).digest('hex').substring(0, 16);
}

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const campaignId = searchParams.get("c");
  const email = searchParams.get("e");
  const url = searchParams.get("url");
  const label = searchParams.get("label");

  if (!campaignId || !email || !url) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Only links we signed when sending the campaign are followed off-site or counted. An unsigned link (older
  // emails, or one somebody made up) goes to its page on this site, or to the homepage: never to another website.
  if (!newsletterLinkValid(campaignId, email, url, searchParams.get("s"))) {
    const home = new URL("/", request.url);
    try {
      const target = new URL(url, home);
      return NextResponse.redirect(target.origin === home.origin ? target : home);
    } catch {
      return NextResponse.redirect(home);
    }
  }

  // The signed address must be a web page (http or https); relative links point at this site.
  let destination: URL;
  try {
    destination = new URL(url, request.url);
    if (destination.protocol !== "https:" && destination.protocol !== "http:") throw new Error("not a web address");
  } catch {
    return NextResponse.redirect(new URL("/", request.url));
  }

  try {
    // searchParams values are already decoded.
    const decodedEmail = email;
    const decodedUrl = url;
    const decodedLabel = label || null;
    const rawIp = clientIp(request);
    const ipHashed = hashIp(rawIp);
    const userAgent = request.headers.get("user-agent") || "unknown";

    const existingClick = await prisma.$queryRaw<any[]>`
      SELECT id FROM "NewsletterClick"
      WHERE "campaignId" = ${campaignId} AND email = ${decodedEmail}
      LIMIT 1
    `;

    const isFirstClick = existingClick.length === 0;

    await prisma.$executeRaw`
      INSERT INTO "NewsletterClick" (id, "campaignId", email, "linkUrl", "linkLabel", "ipAddress", "userAgent", "clickedAt")
      VALUES (gen_random_uuid(), ${campaignId}, ${decodedEmail}, ${decodedUrl}, ${decodedLabel}, ${ipHashed}, ${userAgent}, NOW())
    `;

    // Update campaign stats
    if (isFirstClick) {
      await prisma.$executeRaw`
        UPDATE "NewsletterCampaign"
        SET clicks = clicks + 1, "uniqueClicks" = "uniqueClicks" + 1, "updatedAt" = NOW()
        WHERE id = ${campaignId}
      `;
    } else {
      await prisma.$executeRaw`
        UPDATE "NewsletterCampaign"
        SET clicks = clicks + 1, "updatedAt" = NOW()
        WHERE id = ${campaignId}
      `;
    }

    // Update subscriber last clicked
    await prisma.$executeRaw`
      UPDATE "NewsletterSubscriber"
      SET "lastClickedAt" = NOW()
      WHERE email = ${decodedEmail}
    `;

    // Redirect to the actual URL
    return NextResponse.redirect(destination);
  } catch (error) {
    console.error("Track click error:", error);
    return NextResponse.redirect(destination); // signature already checked above
  }
}
