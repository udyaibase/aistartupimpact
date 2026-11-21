import { jwtSecret } from '@/lib/jwt-secret';
import { assertNotProductionInDev } from '@udyaibase/database/dev-guard';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';
import { neon } from '@neondatabase/serverless';
import { Redis } from '@upstash/redis';
import { canonicalCompareSlug } from '@/lib/tools/compare-slug';

const JWT_SECRET = jwtSecret(process.env.FOUNDER_JWT_SECRET, 'FOUNDER_JWT_SECRET');

const USER_JWT_SECRET = jwtSecret(process.env.USER_JWT_SECRET, 'USER_JWT_SECRET');

let _sql: ReturnType<typeof neon> | undefined;
function getSql() {
  if (!_sql) { assertNotProductionInDev(process.env.DATABASE_URL); _sql = neon(process.env.DATABASE_URL!); }
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
      const redis = getRedis();
      let fromRedis = false;
      if (redis) {
        try {
          const domains = await redis.get<string>(isJobs ? `embed:csp:jobs:${widgetId}` : `embed:csp:${widgetId}`);
          fromRedis = true;
          if (domains && domains.trim()) frameAncestors = domains.trim();
        } catch {
          // Redis unavailable: the database below has the same answer.
        }
      }
      // Redis missing or down used to mean "any site may frame this widget". The widget's own allowed sites are in
      // the database, so they still apply; only a widget with no sites set (or a database error) stays open.
      if (!fromRedis && /^[0-9a-f-]{36}$/i.test(widgetId)) {
        try {
          const rows = (isJobs
            ? await getSql()`SELECT "allowedDomains" FROM "JobBoardCareersWidget" WHERE id = ${widgetId} AND active = true LIMIT 1`
            : await getSql()`SELECT "allowedDomains" FROM "EmbedWidget" WHERE id = ${widgetId} AND active = true LIMIT 1`) as { allowedDomains: string[] | null }[];
          const allowed = rows[0]?.allowedDomains ?? [];
          // Same form as frameAncestorsFor (lib/embed/widgets.ts).
          if (allowed.length) frameAncestors = ["'self'", 'http://localhost:*', 'http://127.0.0.1:*', ...allowed].join(' ');
        } catch {
          // Leave framing open rather than break every installed widget.
        }
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
      // A Referer that isn't a URL is treated like one from another site (it used to crash this check).
      let refererOrigin: string | null = null;
      try { refererOrigin = new URL(referer).origin; } catch { /* not a URL */ }
      if (!refererOrigin || !allowedOrigins.includes(refererOrigin)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    } else {
      // No Origin or Referer — block unless it's a server-to-server call (cron/webhook)
      const isCronOrWebhook = pathname.startsWith('/api/admin/daily-digest') ||
        pathname.startsWith('/api/admin/data-retention') ||
        pathname.startsWith('/api/webhook');
      // RFC 8058 one-click unsubscribe: mail providers POST server-to-server. The route verifies the signed token.
      const isSignedUnsubscribe = ((pathname === '/api/founder/email-preferences' || pathname === '/api/events/unsubscribe' || pathname === '/api/newsletter/unsubscribe') &&
        request.nextUrl.searchParams.has('token')) || ((pathname === '/api/events/stop-emails' || pathname === '/api/series/follow/stop' || pathname === '/api/jobs/alerts/unsubscribe') && request.nextUrl.searchParams.has('t'));
      // Talent pool one-click leave (List-Unsubscribe-Post): signed id + t, verified by the route.
      const isTalentPoolLeave = (pathname === '/api/talent-pool/leave' || pathname === '/api/employer/weekly-report/unsubscribe') &&
        request.nextUrl.searchParams.has('id') && request.nextUrl.searchParams.has('t');
      if (!isCronOrWebhook && !isSignedUnsubscribe && !isTalentPoolLeave) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }
  }

  // Comparisons: one URL per set of tools. "b-vs-a" and "a-vs-b" were separate cached pages, so crawlers
  // following compare links rebuilt the same comparison under every order. Alphabetical order is the canonical one.
  if (pathname.startsWith('/tools/compare/')) {
    const raw = pathname.slice('/tools/compare/'.length);
    const canonical = canonicalCompareSlug(raw);
    if (canonical && canonical !== raw) {
      return NextResponse.redirect(new URL(`/tools/compare/${canonical}`, request.url), 301);
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

  // 2a. Founder portal with no sign-in at all: go to sign-in and come back to this page afterwards.
  // (An expired or ended session still has a cookie; the portal layout sends those to sign-in.)
  if (pathname.startsWith('/founder') && request.method === 'GET' &&
      !request.cookies.has('founder-token') && !request.cookies.has('user-token') && !request.cookies.has('unified_session')) {
    const login = new URL('/auth/login', request.url);
    login.searchParams.set('returnTo', pathname + request.nextUrl.search);
    return NextResponse.redirect(login);
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

