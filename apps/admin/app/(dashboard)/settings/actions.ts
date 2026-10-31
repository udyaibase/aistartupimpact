"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma, Prisma } from "@udyaibase/database";
import { version as reactVersion } from "react";
import nextPackage from "next/package.json";
import appPackage from "../../../package.json";
import { runServiceChecks } from "./service-health";
import { refreshPublic } from '@/lib/refresh-public';

const ALLOWED = ["SUPER_ADMIN", "EDITOR_IN_CHIEF", "AD_MANAGER"];

export async function getSettingsAction() {
  const session: any = await getServerSession(authOptions);
  
  if (!session?.user || !ALLOWED.includes(session.user.role)) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    let settingsMap = {};
    try {
      const settings = await prisma.$queryRawUnsafe<Array<{ key: string; value: string }>>(
        `SELECT key, value::text FROM "SiteSetting"`
      );
      settingsMap = settings.reduce((acc: any, setting: any) => {
        try { acc[setting.key] = JSON.parse(setting.value); } catch { acc[setting.key] = setting.value; }
        return acc;
      }, {});
    } catch {
      // Continue with defaults if DB fails
    }

    // Default values if not set
    const defaults = {
      siteTitle: 'Udyaibase',
      tagline: "India's AI Startup Ecosystem",
      contactEmail: 'hello@udyaibase.com',
      socialTwitter: 'https://twitter.com/udyaibase',
      socialLinkedin: 'https://linkedin.com/company/udyaibase',
      socialInstagram: 'https://instagram.com/udyaibase',
      socialFacebook: 'https://facebook.com/udyaibase',
      metaTitle: "Udyaibase – AI Startup India News & Funding",
      metaDescription: "Udyaibase is the premier platform for Indian AI news. Discover top artificial intelligence startups, funding, tools, and founder stories.",
      autoSitemap: true,
      seo_twitterHandle: '@aikitstartup',
      seo_gaId: '',
      seo_gscVerification: '',
      canonicalDomain: 'https://udyaibase.com',
      seo_noindex: false,
      socialYoutube: 'https://www.youtube.com/@udyaibase',
      brandColor: '#FF3131',
      brandSecondary: '#1B3A5C',
      brandTertiary: '#F59E0B',
      darkDefault: false,
      notifArticle: true,
      notifPublish: true,
      notifSubscriber: true,
      notifPlacement: true,
      require2FA: false,
      sessionTimeout: 60,
    };

    return {
      success: true,
      data: { ...defaults, ...settingsMap },
    };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function saveSettingsAction(settings: Record<string, any>) {
  const session: any = await getServerSession(authOptions);
  if (!session?.user || !ALLOWED.includes(session.user.role))
    return { success: false, error: "Unauthorized" };

  try {
    for (const [key, value] of Object.entries(settings)) {
      if (key === 'require2FA' && session.user.role !== 'SUPER_ADMIN') continue;
      const jsonValue = JSON.stringify(value);
      const id = `setting_${key}_${crypto.randomUUID()}`;
      await prisma.$executeRaw`
        INSERT INTO "SiteSetting" (id, key, value, "updatedAt")
        VALUES (${id}, ${key}, ${jsonValue}::jsonb, NOW())
        ON CONFLICT (key) DO UPDATE SET value = ${jsonValue}::jsonb, "updatedAt" = NOW()
      `;
    }

    await refreshPublic(['all']); return { success: true };
  } catch (e: any) {
    console.error('Save settings error:', e);
    return { success: false, error: e.message };
  }
}

export async function getSystemStatsAction() {
  const session: any = await getServerSession(authOptions);
  if (!session?.user || !ALLOWED.includes(session.user.role))
    return { success: false, error: "Unauthorized" };

  try {
    const [
      articleCount,
      toolCount,
      startupCount,
      fundingRoundCount,
      webUserCount,
      subscriberCount,
      teamCount,
      campaignCount,
    ] = await Promise.all([
      prisma.article.count({ where: { deletedAt: null } }),
      prisma.aiTool.count({ where: { deletedAt: null, status: { in: ["APPROVED", "FEATURED"] } } }),
      prisma.startup.count({ where: { deletedAt: null, isApproved: true } }),
      prisma.fundingRound.count(),
      prisma.webUser.count({ where: { deletedAt: null, isActive: true } }),
      prisma.newsletterSubscriber.count({ where: { isActive: true } }),
      prisma.user.count({ where: { deletedAt: null, isActive: true } }),
      prisma.adCampaign.count(),
    ]);

    // Live database check — reports the real server version and round-trip time
    let database: { connected: boolean; version: string | null; latencyMs: number | null } = {
      connected: false, version: null, latencyMs: null,
    };
    try {
      const started = Date.now();
      const rows = await prisma.$queryRaw<Array<{ server_version: string }>>`SHOW server_version`;
      database = {
        connected: true,
        version: rows[0]?.server_version?.split(" ")[0] ?? null,
        latencyMs: Date.now() - started,
      };
    } catch (err) {
      console.error("getSystemStatsAction: database check failed", err);
    }

    return {
      success: true,
      data: {
        articles: articleCount,
        tools: toolCount,
        startups: startupCount,
        fundingRounds: fundingRoundCount,
        webUsers: webUserCount,
        subscribers: subscriberCount,
        team: teamCount,
        campaigns: campaignCount,
        database,
        versions: {
          app: appPackage.version,
          next: nextPackage.version,
          react: reactVersion,
          node: process.version,
          prisma: Prisma.prismaVersion.client,
          environment: process.env.NODE_ENV,
        },
        deployment: getDeploymentInfo(),
      },
    };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}
// Vercel exposes the deployed commit at runtime; BUILD_* come from next.config for other hosts and local builds
function getDeploymentInfo() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.BUILD_COMMIT_SHA || null;
  const owner = process.env.VERCEL_GIT_REPO_OWNER;
  const repo = process.env.VERCEL_GIT_REPO_SLUG;
  return {
    platform: process.env.VERCEL ? `Vercel (${process.env.VERCEL_ENV || "unknown"})` : "Local / self-hosted",
    commit: sha,
    commitUrl: sha && owner && repo ? `https://github.com/${owner}/${repo}/commit/${sha}` : null,
    branch: process.env.VERCEL_GIT_COMMIT_REF || process.env.BUILD_COMMIT_REF || null,
    message: process.env.VERCEL_GIT_COMMIT_MESSAGE || null,
    builtAt: process.env.BUILD_TIME || null,
  };
}

export async function getServiceHealthAction() {
  const session: any = await getServerSession(authOptions);
  if (!session?.user || !ALLOWED.includes(session.user.role))
    return { success: false as const, error: "Unauthorized" };

  try {
    return { success: true as const, data: { checks: await runServiceChecks(), checkedAt: new Date().toISOString() } };
  } catch (e: any) {
    return { success: false as const, error: e.message };
  }
}
