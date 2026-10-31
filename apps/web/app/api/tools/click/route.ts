import { NextRequest, NextResponse } from 'next/server';
import { clientIp } from '@/lib/client-ip';
import { prisma } from '@udyaibase/database';
import { createHash } from 'crypto';
import { appendUtmParams } from '@/lib/utm';

export const dynamic = 'force-dynamic';

function hashValue(value: string): string {
  return createHash('sha256').update(value).digest('hex').substring(0, 16);
}

function getDeviceType(userAgent: string): string {
  const ua = userAgent.toLowerCase();
  if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) return 'TABLET';
  if (/mobile|iphone|ipod|blackberry|opera mini|iemobile/i.test(ua)) return 'MOBILE';
  return 'DESKTOP';
}

function getBrowser(userAgent: string): string {
  const ua = userAgent.toLowerCase();
  if (ua.includes('edg/')) return 'Edge';
  if (ua.includes('chrome/')) return 'Chrome';
  if (ua.includes('safari/') && !ua.includes('chrome')) return 'Safari';
  if (ua.includes('firefox/')) return 'Firefox';
  if (ua.includes('opera/') || ua.includes('opr/')) return 'Opera';
  return 'Other';
}

function getOS(userAgent: string): string {
  const ua = userAgent.toLowerCase();
  if (ua.includes('win')) return 'Windows';
  if (ua.includes('mac')) return 'macOS';
  if (ua.includes('linux')) return 'Linux';
  if (ua.includes('android')) return 'Android';
  if (ua.includes('iphone') || ua.includes('ipad')) return 'iOS';
  return 'Other';
}

const BOT_PATTERNS = ['googlebot', 'bingbot', 'slurp', 'duckduckbot', 'baiduspider',
  'yandexbot', 'facebookexternalhit', 'twitterbot', 'linkedinbot', 'bot', 'crawler', 'spider'];

function isBot(userAgent: string): boolean {
  const ua = userAgent.toLowerCase();
  return BOT_PATTERNS.some(p => ua.includes(p));
}

const VALID_SOURCES = ['TOOL_DETAIL', 'DIRECTORY', 'HOMEPAGE', 'SEARCH', 'RELATED', 'COMPARISON', 'OTHER'];

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const toolId = searchParams.get('toolId');
  const source = searchParams.get('source') || 'OTHER';

  // Basic validation
  if (!toolId) {
    return NextResponse.json({ error: 'Missing toolId' }, { status: 400 });
  }

  const validSource = VALID_SOURCES.includes(source) ? source : 'OTHER';

  try {
    // Fetch tool URL
    const tool = await prisma.aiTool.findUnique({
      where: { id: toolId },
      select: { websiteUrl: true, affiliateUrl: true, name: true, slug: true },
    });

    if (!tool) {
      return NextResponse.json({ error: 'Tool not found' }, { status: 404 });
    }

    // Build redirect URL
    let redirectUrl = (tool.affiliateUrl || tool.websiteUrl || '').trim();
    if (!redirectUrl) {
      return NextResponse.json({ error: 'Tool has no URL' }, { status: 400 });
    }
    if (!redirectUrl.startsWith('http://') && !redirectUrl.startsWith('https://')) {
      redirectUrl = 'https://' + redirectUrl;
    }

    // Validate URL
    try { new URL(redirectUrl); } catch {
      return NextResponse.json({ error: 'Invalid tool URL' }, { status: 400 });
    }

    // Skip tracking for bots
    const userAgent = request.headers.get('user-agent') || '';
    if (!isBot(userAgent)) {
      // Track click BEFORE redirect (await it — setImmediate doesn't work in serverless)
      try {
        const ip = clientIp(request);
        const ipHash = hashValue(ip);
        const sessionHash = hashValue(`${ip}-${userAgent}`);
        const referrer = request.headers.get('referer') || null;
        const country = request.headers.get('cf-ipcountry') || null;

        await prisma.affiliateClick.create({
          data: {
            toolId,
            sessionHash,
            ipHash,
            referrer,
            sourcePage: validSource as any,
            device: getDeviceType(userAgent),
            browser: getBrowser(userAgent),
            os: getOS(userAgent),
            country,
          },
        });
      } catch (trackErr) {
        console.error('[click-tracking] Failed to save click:', trackErr);
      }
    }

    redirectUrl = appendUtmParams(redirectUrl, 'ai_tools_directory', tool.slug);

    return NextResponse.redirect(redirectUrl, 302);
  } catch (err: any) {
    console.error('[click-api] Error:', err);
    return NextResponse.json(
      { error: 'Server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
