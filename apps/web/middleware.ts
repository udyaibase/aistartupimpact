import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';
import { neon } from '@neondatabase/serverless';
import { Redis } from '@upstash/redis';

const JWT_SECRET = new TextEncoder().encode(
  process.env.FOUNDER_JWT_SECRET!
);

const USER_JWT_SECRET = new TextEncoder().encode(
  process.env.USER_JWT_SECRET!
);

let _sql: ReturnType<typeof neon> | undefined;
function getSql() {
  if (!_sql) _sql = neon(process.env.DATABASE_URL!);
  return _sql;
}

let _redis: Redis | undefined;
function getRedis(): Redis | null {
  if (_redis) return _redis;
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    _redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
    return _redis;
  }
  return null;
}

function buildEmbedCsp(frameAncestors: string): string {
  const isDev = process.env.NODE_ENV !== 'production';
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''} https://www.googletagmanager.com https://www.google-analytics.com https://va.vercel-scripts.com https://challenges.cloudflare.com https://checkout.razorpay.com`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' https://udyaibase.com https://media.udyaibase.com https://www.google-analytics.com https://vitals.vercel-insights.com https://va.vercel-scripts.com https://challenges.cloudflare.com https://api.razorpay.com https://lumberjack.razorpay.com",
    `frame-ancestors ${frameAncestors}`,
    "frame-src https://challenges.cloudflare.com https://api.razorpay.com https://checkout.razorpay.com",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ].join('; ');
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Embed pages: set per-widget CSP frame-ancestors from Redis (no DB lookup)
  if (pathname.startsWith('/embed/')) {
    const segments = pathname.split('/');
    // /embed/<id> is the events widget, /embed/jobs/<id> the careers (jobs) widget.
    const isJobs = segments[2] === 'jobs';
    const widgetId = isJobs ? segments[3] : segments[2];
    let frameAncestors = '*';

    if (widgetId) {
      try {
        const redis = getRedis();
        if (redis) {
          const domains = await redis.get<string>(isJobs ? `embed:csp:jobs:${widgetId}` : `embed:csp:${widgetId}`);
          if (domains && domains.trim()) {
            frameAncestors = domains.trim();
          }
        }
      } catch {
        // Redis unavailable — allow framing as fallback
      }
    }

    const response = NextResponse.next();
    response.headers.set('Content-Security-Policy', buildEmbedCsp(frameAncestors));
    response.headers.set('Cross-Origin-Opener-Policy', 'unsafe-none');
    response.headers.delete('X-Frame-Options');
    return response;
  }

  // CSRF protection: validate Origin/Referer on state-changing requests to API routes
  if (pathname.startsWith('/api/') && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(request.method)) {
    const origin = request.headers.get('origin');
    const referer = request.headers.get('referer');
    const allowedOrigins = [
      process.env.NEXT_PUBLIC_WEB_URL,
      process.env.NEXT_PUBLIC_SITE_URL,
      process.env.NEXT_PUBLIC_ADMIN_URL,
    ].filter(Boolean) as string[];
    if (process.env.NODE_ENV !== 'production') {
      allowedOrigins.push('http://localhost:3000', 'http://localhost:3001');
    }

    if (origin) {
      if (!allowedOrigins.includes(origin)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    } else if (referer) {
      const refererOrigin = new URL(referer).origin;
      if (!allowedOrigins.includes(refererOrigin)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    } else {
      // No Origin or Referer — block unless it's a server-to-server call (cron/webhook)
      const isCronOrWebhook = pathname.startsWith('/api/admin/daily-digest') ||
        pathname.startsWith('/api/admin/data-retention') ||
        pathname.startsWith('/api/webhook');
      // RFC 8058 one-click unsubscribe: mail providers POST server-to-server. The route verifies the signed token.
      const isSignedUnsubscribe = (pathname === '/api/events/unsubscribe' || pathname === '/api/newsletter/unsubscribe') &&
        request.nextUrl.searchParams.has('token');
      if (!isCronOrWebhook && !isSignedUnsubscribe) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }
  }

  // 1. Redirect checks for startups and tools on old slugs (301)
  const isStartupPath = pathname.startsWith('/startups/');
  const isToolPath = pathname.startsWith('/tools/');

  if (isStartupPath || isToolPath) {
    const parts = pathname.split('/');
    if (parts.length === 3) {
      const slug = parts[2];
      const ignoredSlugs = ['submit', 'category', 'compare', 'alternatives', 'sitemap.xml', 'robots.txt'];
      if (slug && !ignoredSlugs.includes(slug) && !slug.includes('.')) {
        try {
          if (isStartupPath) {
            const redirectCheck = await getSql()`
              SELECT slug, (slug = ${slug}) as "isCurrent" FROM "Startup"
              WHERE (slug = ${slug} OR ${slug} = ANY("previousSlugs")) AND "deletedAt" IS NULL
              LIMIT 1
            ` as any[];
            if (redirectCheck.length > 0) {
              const row = redirectCheck[0];
              if (!row.isCurrent) {
                return NextResponse.redirect(new URL(`/startups/${row.slug}`, request.url), 301);
              }
            }
          } else {
            const redirectCheck = await getSql()`
              SELECT slug, (slug = ${slug}) as "isCurrent" FROM "AiTool"
              WHERE (slug = ${slug} OR ${slug} = ANY("previousSlugs")) AND "deletedAt" IS NULL
              LIMIT 1
            ` as any[];
            if (redirectCheck.length > 0) {
              const row = redirectCheck[0];
              if (!row.isCurrent) {
                return NextResponse.redirect(new URL(`/tools/${row.slug}`, request.url), 301);
              }
            }
          }
        } catch (error) {
          console.error('[Middleware Dynamic Redirect Check Error]', error);
        }
      }
    }
  }

  // 2. Onboarding enforcement for founders only
  if (pathname.startsWith('/founder') && !pathname.startsWith('/founder/onboarding') && !pathname.startsWith('/founder/profile')) {
    const token = request.cookies.get('founder-token')?.value;
    if (token) {
      try {
        const { payload } = await jwtVerify(token, JWT_SECRET);
        if (payload.onboardingCompleted === false) {
          const onboardingUrl = new URL('/founder/onboarding', request.url);
          onboardingUrl.searchParams.set('returnTo', pathname);
          return NextResponse.redirect(onboardingUrl);
        }
      } catch {
        // Let page layouts handle auth
      }
    }
  }

  // 3. Onboarding enforcement for WebUsers
  if (!pathname.startsWith('/onboarding') && !pathname.startsWith('/api/') &&
      !pathname.startsWith('/auth/') && !pathname.startsWith('/founder/') &&
      !pathname.startsWith('/employer/') && !pathname.startsWith('/organizer/')) {
    const userToken = request.cookies.get('user-token')?.value;
    if (userToken) {
      try {
        const { payload } = await jwtVerify(userToken, USER_JWT_SECRET);
        if (payload.onboardingCompleted === false) {
          const onboardingUrl = new URL('/onboarding', request.url);
          onboardingUrl.searchParams.set('returnTo', pathname);
          return NextResponse.redirect(onboardingUrl);
        }
      } catch {
        // Invalid token — let page handle auth
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/',
    '/profile/:path*',
    '/settings/:path*',
    '/tools/:path*',
    '/startups/:path*',
    '/jobs/:path*',
    '/events/:path*',
    '/founder/:path*',
    '/onboarding',
    '/api/:path*',
    '/embed/:path*',
  ],
};

