import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { apiRateLimit, checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';

const BOT = /bot|crawl|spider|slurp|headless|lighthouse|preview|facebookexternalhit|whatsapp|pingdom|monitor/i;

export const dynamic = 'force-dynamic';

function classifySource(utmMedium?: string, utmSource?: string, referrer?: string): string {
  if (utmMedium) {
    const m = utmMedium.toLowerCase();
    if (['twitter', 'linkedin', 'whatsapp', 'social'].includes(m)) return 'SOCIAL';
    if (['email'].includes(m)) return 'EMAIL';
    if (['link', 'referral'].includes(m)) return 'REFERRAL';
  }
  if (utmSource) return 'REFERRAL';
  if (!referrer) return 'DIRECT';

  const ref = referrer.toLowerCase();
  if (ref.includes('google.') || ref.includes('bing.') || ref.includes('yahoo.') ||
      ref.includes('duckduckgo.') || ref.includes('baidu.')) return 'SEARCH';
  if (ref.includes('facebook.') || ref.includes('twitter.') || /(\.|\/\/)x\.com(\/|$)/.test(ref) ||
      ref.includes('linkedin.') || ref.includes('instagram.') || ref.includes('reddit.') ||
      ref.includes('youtube.') || ref.includes('tiktok.') || ref.includes('whatsapp.')) return 'SOCIAL';
  if (ref.includes('mail.') || ref.includes('email.') || ref.includes('newsletter')) return 'EMAIL';
  return 'REFERRAL';
}

export async function POST(request: NextRequest) {
  try {
    // Bots and scripts don't count as visitors. Answer normally so nothing retries.
    if (BOT.test(request.headers.get('user-agent') ?? '')) return NextResponse.json({ success: true });
    const { success: withinLimit } = await checkRateLimit(apiRateLimit, getClientIdentifier(request));
    if (!withinLimit) return NextResponse.json({ success: true });

    const body = await request.json();
    const { entityType, entityId, eventType, utmSource, utmMedium, utmCampaign, referrer } = body;

    if (!entityType || !entityId || !eventType) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }

    if (!['TOOL', 'STARTUP', 'JOB', 'EVENT', 'ARTICLE'].includes(entityType)) {
      return NextResponse.json({ success: false, error: 'Invalid entity type' }, { status: 400 });
    }

    if (!['VIEW', 'CLICK', 'SHARE', 'SAVE'].includes(eventType)) {
      return NextResponse.json({ success: false, error: 'Invalid event type' }, { status: 400 });
    }

    // Update inline counters for jobs
    if (entityType === 'JOB') {
      if (eventType === 'VIEW') {
        await sql`UPDATE "JobBoardListing" SET "viewsCount" = "viewsCount" + 1 WHERE id = ${entityId}`.catch(() => {});
      } else if (eventType === 'CLICK') {
        await sql`UPDATE "JobBoardListing" SET "clicksCount" = "clicksCount" + 1 WHERE id = ${entityId}`.catch(() => {});
      } else if (eventType === 'SAVE') {
        await sql`UPDATE "JobBoardListing" SET "savedCount" = "savedCount" + 1 WHERE id = ${entityId}`.catch(() => {});
      }
    }

    const source = classifySource(utmMedium, utmSource, referrer);
    const today = new Date().toISOString().split('T')[0];

    // Insert or update AnalyticsDaily for all entity types
    if (['JOB', 'EVENT', 'TOOL', 'STARTUP', 'ARTICLE'].includes(entityType)) {
      const existing = await sql`
        SELECT id, views, clicks, shares, "directViews", "searchViews", "socialViews", "referralViews"
        FROM "AnalyticsDaily"
        WHERE "entityType" = ${entityType} AND "entityId" = ${entityId} AND date = ${today}
      `.catch(() => []);

      const sourceColumn = source === 'DIRECT' ? 'directViews'
        : source === 'SEARCH' ? 'searchViews'
        : source === 'SOCIAL' ? 'socialViews'
        : source === 'EMAIL' ? 'emailViews'
        : 'referralViews';

      if (existing.length > 0) {
        if (eventType === 'VIEW') {
          await sql`
            UPDATE "AnalyticsDaily"
            SET views = views + 1,
                ${sql.unsafe(`"${sourceColumn}"`)} = ${sql.unsafe(`"${sourceColumn}"`)} + 1,
                "updatedAt" = NOW()
            WHERE id = ${existing[0].id}
          `.catch(() => {});
        } else if (eventType === 'CLICK') {
          await sql`UPDATE "AnalyticsDaily" SET clicks = clicks + 1, "updatedAt" = NOW() WHERE id = ${existing[0].id}`.catch(() => {});
        } else if (eventType === 'SHARE') {
          await sql`UPDATE "AnalyticsDaily" SET shares = shares + 1, "updatedAt" = NOW() WHERE id = ${existing[0].id}`.catch(() => {});
        }
      } else if (eventType === 'VIEW') {
        await sql`
          INSERT INTO "AnalyticsDaily" (
            id, "entityType", "entityId", date,
            views, clicks, shares,
            "directViews", "searchViews", "socialViews", "emailViews", "referralViews",
            "utmSource", "utmMedium", "utmCampaign",
            "createdAt", "updatedAt"
          ) VALUES (
            gen_random_uuid()::text, ${entityType}, ${entityId}, ${today},
            1, 0, 0,
            ${source === 'DIRECT' ? 1 : 0},
            ${source === 'SEARCH' ? 1 : 0},
            ${source === 'SOCIAL' ? 1 : 0},
            ${source === 'EMAIL' ? 1 : 0},
            ${source === 'REFERRAL' ? 1 : 0},
            ${utmSource || null}, ${utmMedium || null}, ${utmCampaign || null},
            NOW(), NOW()
          )
        `.catch(() => {});
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error tracking event:', error);
    return NextResponse.json({ success: false, error: 'Failed to track event' }, { status: 500 });
  }
}
