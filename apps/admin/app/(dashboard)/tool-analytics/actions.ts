"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@udyaibase/database";

const ALLOWED = ["SUPER_ADMIN", "EDITOR_IN_CHIEF", "SENIOR_WRITER", "AD_MANAGER"];

function getDaysBack(period: string): number {
  switch (period) {
    case '30 days': return 30;
    case '90 days': return 90;
    case 'This year': return 365;
    default: return 7;
  }
}

export async function getToolClickAnalyticsAction(period: string = '7 days') {
  const session: any = await getServerSession(authOptions);
  if (!session?.user || !ALLOWED.includes(session.user.role)) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    const daysBack = getDaysBack(period);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    // Neon HTTP adapter fix:
    // - $queryRaw with ${param} interpolation fails (Code: N/A)
    // - Prisma findMany with Date in where fails (found {})
    // Solution: embed the ISO date string directly in SQL using Prisma.sql
    const startDateStr = startDate.toISOString();

    // ── 1. Fetch all clicks using $queryRaw template literal (Neon-safe) ────────
    // Using the same pattern as placements/actions.ts which works with Neon adapter
    const allClicks = await prisma.$queryRaw<Array<{
      toolId: string;
      sessionHash: string;
      sourcePage: string;
      device: string | null;
      browser: string | null;
      country: string | null;
      createdAt: string;
    }>>`
      SELECT "toolId", "sessionHash", "sourcePage", "device", "browser", "country", "createdAt"::text AS "createdAt"
      FROM "AffiliateClick"
      WHERE "createdAt" >= ${startDate}
      ORDER BY "createdAt" DESC
    `;

    const totalClicks = allClicks.length;

    // ── 2. Overview metrics ───────────────────────────────────────────────────
    const uniqueSessionsSet = new Set(allClicks.map(c => c.sessionHash));
    const uniqueToolsSet = new Set(allClicks.map(c => c.toolId));

    const overview = {
      totalClicks,
      uniqueSessions: uniqueSessionsSet.size,
      uniqueTools: uniqueToolsSet.size,
      avgClicksPerSession: uniqueSessionsSet.size > 0
        ? (totalClicks / uniqueSessionsSet.size).toFixed(1)
        : '0',
    };

    // ── 3. Helper: count by field ─────────────────────────────────────────────
    function countBy<T extends Record<string, any>>(
      rows: T[],
      key: keyof T,
      limit?: number
    ): Array<{ value: string; count: number }> {
      const map = new Map<string, number>();
      for (const row of rows) {
        const val = String(row[key] ?? 'Unknown');
        map.set(val, (map.get(val) ?? 0) + 1);
      }
      const sorted = [...map.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([value, count]) => ({ value, count }));
      return limit ? sorted.slice(0, limit) : sorted;
    }

    // ── 4. Source performance ─────────────────────────────────────────────────
    const sourcePerformance = countBy(allClicks, 'sourcePage').map(s => ({
      source: s.value,
      clicks: s.count,
      percentage: totalClicks > 0 ? Math.round((s.count / totalClicks) * 100) : 0,
    }));

    // ── 5. Device breakdown ───────────────────────────────────────────────────
    const deviceBreakdown = countBy(
      allClicks.filter(c => c.device),
      'device'
    ).map(d => ({
      device: d.value,
      clicks: d.count,
      percentage: totalClicks > 0 ? Math.round((d.count / totalClicks) * 100) : 0,
    }));

    // ── 6. Browser breakdown (top 5) ──────────────────────────────────────────
    const browserBreakdown = countBy(
      allClicks.filter(c => c.browser),
      'browser',
      5
    ).map(b => ({
      browser: b.value,
      clicks: b.count,
      percentage: totalClicks > 0 ? Math.round((b.count / totalClicks) * 100) : 0,
    }));

    // ── 7. Country breakdown (top 10) ─────────────────────────────────────────
    const countryBreakdown = countBy(
      allClicks.filter(c => c.country),
      'country',
      10
    ).map(c => ({
      country: c.value,
      clicks: c.count,
      percentage: totalClicks > 0 ? Math.round((c.count / totalClicks) * 100) : 0,
    }));

    // ── 8. Top tools (top 15) ─────────────────────────────────────────────────
    const toolCounts = countBy(allClicks, 'toolId', 15);
    const topToolIds = toolCounts.map(t => t.value);

    const toolDetails = topToolIds.length > 0
      ? await prisma.aiTool.findMany({
          where: { id: { in: topToolIds } },
          select: {
            id: true,
            name: true,
            slug: true,
            logoUrl: true,
            ToolCategory: { select: { name: true } },
          },
        })
      : [];

    // Get profile views for top tools
    const topToolSlugs = toolDetails.map(t => `/tools/${t.slug}`);
    const profileViews = topToolSlugs.length > 0
      ? await prisma.$queryRaw<Array<{ pathname: string; views: bigint }>>`
          SELECT pathname, COUNT(*) AS views
          FROM "PageView"
          WHERE pathname = ANY(${topToolSlugs})
            AND "createdAt" >= ${startDate}
          GROUP BY pathname
        `
      : [];
    const viewMap = new Map(profileViews.map(v => [v.pathname, Number(v.views)]));

    // CTR = clicks made on the tool's own page ÷ views of that page. Clicks from the homepage, search etc.
    // never had a profile view, so dividing all clicks by profile views overstated it (often above 100%).
    const detailClicks = new Map<string, number>();
    for (const c of allClicks) {
      if (c.sourcePage === 'TOOL_DETAIL') detailClicks.set(c.toolId, (detailClicks.get(c.toolId) ?? 0) + 1);
    }

    const toolMap = new Map(toolDetails.map(t => [t.id, t]));
    const topTools = toolCounts.map(t => {
      const tool = toolMap.get(t.value);
      const views = tool ? (viewMap.get(`/tools/${tool.slug}`) ?? 0) : 0;
      const fromProfile = detailClicks.get(t.value) ?? 0;
      const ctr = views > 0 ? (Math.min(fromProfile / views, 1) * 100).toFixed(1) : null;
      return {
        id: t.value,
        name: tool?.name ?? 'Unknown',
        slug: tool?.slug ?? '',
        logoUrl: tool?.logoUrl ?? null,
        category: tool?.ToolCategory?.name ?? 'Uncategorized',
        clicks: t.count,
        profileClicks: fromProfile,
        profileViews: views,
        ctr,
      };
    });

    // ── 9. Traffic Sent summary ─────────────────────────────────────────────
    const [allTimeClicks] = await prisma.$queryRaw<Array<{
      total: bigint;
      tools: bigint;
    }>>`
      SELECT COUNT(*) AS total, COUNT(DISTINCT "toolId") AS tools
      FROM "AffiliateClick"
    `;

    const trafficSent = {
      totalOutboundClicks: Number(allTimeClicks.total),
      toolsReceivingTraffic: Number(allTimeClicks.tools),
      topReferredTool: topTools.length > 0 ? topTools[0].name : '—',
    };

    // ── 10. Daily trend ────────────────────────────────────────────────────────
    const dayMap = new Map<string, number>();
    for (const click of allClicks) {
      const day = click.createdAt.substring(0, 10); // "YYYY-MM-DD"
      dayMap.set(day, (dayMap.get(day) ?? 0) + 1);
    }
    const dailyTrend = [...dayMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, clicks]) => ({ date, clicks }));

    return {
      success: true,
      data: {
        overview,
        trafficSent,
        topTools,
        sourcePerformance,
        deviceBreakdown,
        browserBreakdown,
        countryBreakdown,
        dailyTrend,
      },
    };
  } catch (error: any) {
    console.error('[tool-analytics] Error:', error);
    return { success: false, error: error.message };
  }
}

export async function exportToolClicksAction(period: string = '7 days') {
  const session: any = await getServerSession(authOptions);
  if (!session?.user || !ALLOWED.includes(session.user.role)) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    const daysBack = getDaysBack(period);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);
    const startDateStr = startDate.toISOString();

    const clicks = await prisma.$queryRaw<Array<{
      createdAt: string;
      toolName: string;
      categoryName: string | null;
      sourcePage: string;
      device: string | null;
      browser: string | null;
      os: string | null;
      country: string | null;
    }>>`
      SELECT
        ac."createdAt"::text AS "createdAt",
        t."name" AS "toolName",
        tc."name" AS "categoryName",
        ac."sourcePage",
        ac."device",
        ac."browser",
        ac."os",
        ac."country"
      FROM "AffiliateClick" ac
      JOIN "AiTool" t ON t."id" = ac."toolId"
      LEFT JOIN "ToolCategory" tc ON tc."id" = t."categoryId"
      WHERE ac."createdAt" >= ${startDate}
      ORDER BY ac."createdAt" DESC
    `;

    const csvData = clicks.map(click => ({
      date: click.createdAt,
      tool: click.toolName,
      category: click.categoryName ?? 'Uncategorized',
      source: click.sourcePage,
      device: click.device ?? 'Unknown',
      browser: click.browser ?? 'Unknown',
      os: click.os ?? 'Unknown',
      country: click.country ?? 'Unknown',
    }));

    return { success: true, data: csvData };
  } catch (error: any) {
    console.error('[export-clicks] Error:', error);
    return { success: false, error: error.message };
  }
}
