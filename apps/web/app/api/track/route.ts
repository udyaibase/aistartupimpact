import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

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

    // Find owner for FounderAnalytics
    let ownerId: string | null = null;

    if (entityType === 'TOOL') {
      const result = await sql`SELECT "ownerId" FROM "AiTool" WHERE id = ${entityId} LIMIT 1`;
      ownerId = result[0]?.ownerId ?? null;
    } else if (entityType === 'STARTUP') {
      const result = await sql`SELECT "ownerId" FROM "Startup" WHERE id = ${entityId} LIMIT 1`;
      ownerId = result[0]?.ownerId ?? null;
    }

    // For jobs and events, we track in a different table (no FounderUser owner)
    // Log UTM data to the analytics log table
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

    // Update FounderAnalytics for tools and startups
    if (ownerId) {
      const existing = await sql`
        SELECT id FROM "FounderAnalytics"
        WHERE "userId" = ${ownerId} AND "entityType" = ${entityType}
          AND "entityId" = ${entityId} AND date = ${today}
      `;

      if (existing.length > 0) {
        const col = eventType === 'VIEW' ? 'views' : eventType === 'CLICK' ? 'clicks' : eventType === 'SHARE' ? 'shares' : 'favorites';
        await sql`
          UPDATE "FounderAnalytics"
          SET ${sql.unsafe(col)} = ${sql.unsafe(col)} + 1, "updatedAt" = NOW()
          WHERE id = ${existing[0].id}
        `;

        if (eventType === 'VIEW') {
          const srcCol = source === 'DIRECT' ? 'directViews'
            : source === 'SEARCH' ? 'searchViews'
            : source === 'SOCIAL' ? 'socialViews'
            : 'referralViews';
          await sql`
            UPDATE "FounderAnalytics"
            SET ${sql.unsafe(`"${srcCol}"`)} = ${sql.unsafe(`"${srcCol}"`)} + 1
            WHERE id = ${existing[0].id}
          `.catch(() => {});
        }
      } else {
        await sql`
          INSERT INTO "FounderAnalytics" (
            "userId", "entityType", "entityId", date,
            views, clicks, inquiries, favorites, shares,
            "directViews", "searchViews", "socialViews", "referralViews",
            "createdAt", "updatedAt"
          ) VALUES (
            ${ownerId}, ${entityType}, ${entityId}, ${today},
            ${eventType === 'VIEW' ? 1 : 0},
            ${eventType === 'CLICK' ? 1 : 0},
            0,
            ${eventType === 'SAVE' ? 1 : 0},
            ${eventType === 'SHARE' ? 1 : 0},
            ${source === 'DIRECT' && eventType === 'VIEW' ? 1 : 0},
            ${source === 'SEARCH' && eventType === 'VIEW' ? 1 : 0},
            ${source === 'SOCIAL' && eventType === 'VIEW' ? 1 : 0},
            ${(source === 'REFERRAL' || source === 'EMAIL') && eventType === 'VIEW' ? 1 : 0},
            NOW(), NOW()
          )
        `;
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error tracking event:', error);
    return NextResponse.json({ success: false, error: 'Failed to track event' }, { status: 500 });
  }
}
