import { NextRequest } from 'next/server';
import { clientIp } from '@/lib/client-ip';
import { prisma } from '@udyaibase/database';
import { createHash } from 'crypto';

export type ClickSource = 
  | 'TOOL_DETAIL'
  | 'DIRECTORY'
  | 'HOMEPAGE'
  | 'SEARCH'
  | 'RELATED'
  | 'COMPARISON'
  | 'OTHER';

interface TrackClickParams {
  toolId: string;
  source: ClickSource;
  request: NextRequest;
}

// Parse user agent to detect device (don't store raw UA)
function getDeviceType(userAgent: string): string {
  const ua = userAgent.toLowerCase();
  if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) {
    return 'TABLET';
  }
  if (/mobile|iphone|ipod|blackberry|opera mini|iemobile/i.test(ua)) {
    return 'MOBILE';
  }
  return 'DESKTOP';
}

// Parse user agent to detect browser (don't store raw UA)
function getBrowser(userAgent: string): string {
  const ua = userAgent.toLowerCase();
  if (ua.includes('edg/')) return 'Edge';
  if (ua.includes('chrome/')) return 'Chrome';
  if (ua.includes('safari/') && !ua.includes('chrome')) return 'Safari';
  if (ua.includes('firefox/')) return 'Firefox';
  if (ua.includes('opera/') || ua.includes('opr/')) return 'Opera';
  return 'Other';
}

// Parse user agent to detect OS (don't store raw UA)
function getOS(userAgent: string): string {
  const ua = userAgent.toLowerCase();
  if (ua.includes('win')) return 'Windows';
  if (ua.includes('mac')) return 'macOS';
  if (ua.includes('linux')) return 'Linux';
  if (ua.includes('android')) return 'Android';
  if (ua.includes('iphone') || ua.includes('ipad')) return 'iOS';
  return 'Other';
}

function createHash256(value: string): string {
  return createHash('sha256').update(value).digest('hex').substring(0, 16);
}

export async function trackToolClick({
  toolId,
  source,
  request,
}: TrackClickParams): Promise<void> {
  try {
    // Extract data from request
    const userAgent = request.headers.get('user-agent') || '';
    const referrer = request.headers.get('referer') || request.headers.get('referrer') || null;
    const ip = clientIp(request);

    // Create hashes for privacy
    const ipHash = createHash256(ip);
    const sessionHash = createHash256(`${ip}-${userAgent}`);

    // Extract device info (don't store raw userAgent - GDPR compliant)
    const device = getDeviceType(userAgent);
    const browser = getBrowser(userAgent);
    const os = getOS(userAgent);
    
    // Cloudflare provides country code for free (on Vercel/Cloudflare)
    // Returns two-letter country code (e.g., 'US', 'IN', 'GB')
    const country = request.headers.get('cf-ipcountry') || null;

    // Create click record (Prisma auto-generates id with cuid())
    await prisma.affiliateClick.create({
      data: {
        toolId,
        sessionHash,
        ipHash,
        referrer,
        sourcePage: source,
        device,
        browser,
        os,
        country,
      },
    });
  } catch (error) {
    // Log error but don't throw (tracking failure shouldn't break redirect)
    console.error('Tool click tracking error:', error);
  }
}
