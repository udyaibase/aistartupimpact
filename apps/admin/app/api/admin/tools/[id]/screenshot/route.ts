import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { requireApiAuth } from "@/lib/api-auth";
import { r2, R2_BUCKET, getPublicUrl } from "@/lib/media";

const sql = neon(process.env.DATABASE_URL!);

const SCREENSHOTONE_API_KEY = process.env.SCREENSHOTONE_API_KEY;
const MIN_VALID_SIZE = 15 * 1024;
const MAX_SCREENSHOTS = 5;
const ALLOWED_SCHEMES = new Set(["http:", "https:"]);
const BLOCKED_HOSTS = [
  "localhost", "127.0.0.1", "0.0.0.0", "[::1]",
  "169.254.", "10.", "172.16.", "172.17.", "172.18.", "172.19.",
  "172.20.", "172.21.", "172.22.", "172.23.", "172.24.", "172.25.",
  "172.26.", "172.27.", "172.28.", "172.29.", "172.30.", "172.31.",
  "192.168.",
];

function isBlockedUrl(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    if (!ALLOWED_SCHEMES.has(parsed.protocol)) return true;
    const host = parsed.hostname.toLowerCase();
    if (host.endsWith(".localhost") || host.endsWith(".local")) return true;
    return BLOCKED_HOSTS.some(h => host === h || host.startsWith(h));
  } catch {
    return true;
  }
}

export const maxDuration = 120;

const CAPTURE_VARIATIONS = [
  { delay: "3", scrollY: "0" },
  { delay: "3", scrollY: "700" },
  { delay: "4", scrollY: "1400" },
  { delay: "4", scrollY: "2100" },
  { delay: "5", scrollY: "2800" },
];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireApiAuth();
  if (error) return error;

  const { id } = await params;
  const variation = parseInt(
    request.nextUrl.searchParams.get("variation") || "0",
    10
  );

  if (!SCREENSHOTONE_API_KEY) {
    return NextResponse.json(
      { error: "SCREENSHOTONE_API_KEY is not configured" },
      { status: 500 }
    );
  }

  try {
    const tools = await sql`
      SELECT id, slug, "websiteUrl", "screenshotUrls", "screenshotMeta"
      FROM "AiTool"
      WHERE id = ${id} AND "deletedAt" IS NULL
      LIMIT 1
    `;

    if (tools.length === 0) {
      return NextResponse.json({ error: "Tool not found" }, { status: 404 });
    }

    const tool = tools[0] as any;
    if (!tool.websiteUrl || isBlockedUrl(tool.websiteUrl)) {
      return NextResponse.json(
        { error: "Tool has no valid website URL" },
        { status: 400 }
      );
    }

    const existingUrls: string[] = tool.screenshotUrls || [];
    const existingMeta: Record<string, any> = tool.screenshotMeta || {};

    if (existingUrls.length >= MAX_SCREENSHOTS) {
      return NextResponse.json(
        { error: `Maximum ${MAX_SCREENSHOTS} screenshots reached. Remove one first.` },
        { status: 400 }
      );
    }

    const v = CAPTURE_VARIATIONS[variation % CAPTURE_VARIATIONS.length];

    const screenshotUrl = new URL("https://api.screenshotone.com/take");
    screenshotUrl.searchParams.set("access_key", SCREENSHOTONE_API_KEY);
    screenshotUrl.searchParams.set("url", tool.websiteUrl);
    screenshotUrl.searchParams.set("viewport_width", "1280");
    screenshotUrl.searchParams.set("viewport_height", "800");
    screenshotUrl.searchParams.set("device_scale_factor", "2");
    screenshotUrl.searchParams.set("image_width", "1600");
    screenshotUrl.searchParams.set("format", "webp");
    screenshotUrl.searchParams.set("image_quality", "85");
    screenshotUrl.searchParams.set("block_cookie_banners", "true");
    screenshotUrl.searchParams.set("block_ads", "true");
    screenshotUrl.searchParams.set("wait_until", "domcontentloaded");
    screenshotUrl.searchParams.set("timeout", "90");
    screenshotUrl.searchParams.set("navigation_timeout", "30");
    screenshotUrl.searchParams.set("delay", v.delay);
    screenshotUrl.searchParams.set("cache", "false");

    if (parseInt(v.scrollY) > 0) {
      screenshotUrl.searchParams.set(
        "scripts",
        `window.scrollTo(0, ${v.scrollY})`
      );
      screenshotUrl.searchParams.set("scripts_wait_until", "networkidle0");
    }

    const response = await fetch(screenshotUrl.toString());

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      let friendlyError = `Screenshot API failed (${response.status})`;
      try {
        const parsed = JSON.parse(errorText);
        if (parsed.error_code === "timeout_error") {
          friendlyError = "Site too slow or blocks screenshots — skipped";
        } else if (parsed.error_message) {
          friendlyError = parsed.error_message;
        }
      } catch {}
      return NextResponse.json(
        { error: friendlyError },
        { status: 502 }
      );
    }

    const imageBuffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get("content-type") || "image/webp";

    const needsReview = imageBuffer.length < MIN_VALID_SIZE;

    const timestamp = Date.now();
    const r2Key = `screenshots/${tool.slug}-auto-${timestamp}.webp`;
    const publicUrl = getPublicUrl(r2Key);

    await r2.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: r2Key,
        ContentType: contentType,
        Body: imageBuffer,
      })
    );

    const updatedUrls = [...existingUrls, publicUrl];
    const updatedMeta = {
      ...existingMeta,
      [publicUrl]: {
        source: "auto",
        createdAt: new Date().toISOString(),
      },
    };

    await sql`
      UPDATE "AiTool"
      SET
        "screenshotUrls" = ${updatedUrls}::text[],
        "screenshotMeta" = ${JSON.stringify(updatedMeta)}::jsonb,
        "updatedAt" = NOW()
      WHERE id = ${id}
    `;

    return NextResponse.json({
      success: true,
      url: publicUrl,
      needsReview,
      sizeBytes: imageBuffer.length,
      screenshotUrls: updatedUrls,
      totalScreenshots: updatedUrls.length,
    });
  } catch (err: any) {
    console.error("Screenshot capture error:", err);
    return NextResponse.json(
      { error: err.message || "Screenshot capture failed" },
      { status: 500 }
    );
  }
}
