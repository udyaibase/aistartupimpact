import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { getSeoConfig } from '@/lib/seo-config';
import { CHANNEL_SOURCES, type ChannelSource } from '@/lib/whatsapp-channel';
import { apiRateLimit, checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const BOT = /bot|crawl|spider|slurp|headless|lighthouse|preview|facebookexternalhit|whatsapp|pingdom|monitor/i;

/**
 * "Join on WhatsApp": counts the join by where it came from (one AnalyticsDaily row per source per day,
 * entityType CHANNEL), then sends the visitor to the channel. Nothing about the visitor is stored.
 */
export async function GET(req: NextRequest) {
  const { socialWhatsappChannel } = await getSeoConfig();
  if (!socialWhatsappChannel) return NextResponse.redirect(new URL('/jobs', req.url), 302);

  const raw = req.nextUrl.searchParams.get('from') ?? '';
  const from: ChannelSource | 'other' = (CHANNEL_SOURCES as readonly string[]).includes(raw) ? (raw as ChannelSource) : 'other';
  const human = !BOT.test(req.headers.get('user-agent') ?? '');
  if (human) {
    const { success } = await checkRateLimit(apiRateLimit, `wa-channel:${getClientIdentifier(req)}`);
    if (success) {
      const date = new Date(new Date().toISOString().slice(0, 10));
      await prisma.analyticsDaily.upsert({
        where: { entityType_entityId_date: { entityType: 'CHANNEL', entityId: `whatsapp-jobs:${from}`, date } },
        create: { entityType: 'CHANNEL', entityId: `whatsapp-jobs:${from}`, date, clicks: 1 },
        update: { clicks: { increment: 1 } },
      }).catch(() => {});
    }
  }
  return NextResponse.redirect(socialWhatsappChannel, 302);
}
