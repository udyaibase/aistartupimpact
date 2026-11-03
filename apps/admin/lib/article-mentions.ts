import { prisma } from '@udyaibase/database';

/**
 * Which startups and AI tools an article tags. The editor's @-tags are links carrying data-mention-type/-id; plain
 * links to /startups/<slug> or /tools/<slug> (typed by hand or pasted) count too. The result is stored in
 * ArticleStartupMention / ArticleToolMention so startup and tool profiles can list the articles that tag them.
 */

const SITE_HOSTS = /^(?:https?:\/\/(?:www\.)?(?:udyaibase\.com|aistartupimpact\.com))?$/i;

export interface ArticleMentions { startupIds: string[]; toolIds: string[]; startupSlugs: string[]; toolSlugs: string[] }

export function extractMentions(html: string): ArticleMentions {
  const startupIds = new Set<string>(), toolIds = new Set<string>(), startupSlugs = new Set<string>(), toolSlugs = new Set<string>();
  for (const [tag] of String(html ?? '').matchAll(/<a\b[^>]*>/gi)) {
    const attr = (name: string) => tag.match(new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"`, 'i'))?.[1] ?? null;
    const type = attr('data-mention-type');
    const id = attr('data-mention-id');
    if (id && (type === 'startup' || type === 'tool')) {
      (type === 'tool' ? toolIds : startupIds).add(id);
      continue;
    }
    const href = attr('href');
    const m = href?.match(/^(.*?)\/(startups|tools)\/([a-z0-9-]+)\/?(?:[?#].*)?$/i);
    if (!m || !SITE_HOSTS.test(m[1])) continue;
    const slug = decodeURIComponent(m[3]).toLowerCase();
    (m[2].toLowerCase() === 'tools' ? toolSlugs : startupSlugs).add(slug);
  }
  return { startupIds: [...startupIds], toolIds: [...toolIds], startupSlugs: [...startupSlugs], toolSlugs: [...toolSlugs] };
}

/** Resolve tags to live startups/tools (ids or slugs, including a startup's old slugs). */
export async function resolveMentions(html: string) {
  const m = extractMentions(html);
  const [startups, tools] = await Promise.all([
    m.startupIds.length || m.startupSlugs.length
      ? prisma.startup.findMany({
          where: { deletedAt: null, OR: [{ id: { in: m.startupIds } }, { slug: { in: m.startupSlugs } }, { previousSlugs: { hasSome: m.startupSlugs } }] },
          select: { id: true, slug: true },
        })
      : [],
    m.toolIds.length || m.toolSlugs.length
      ? prisma.aiTool.findMany({ where: { deletedAt: null, OR: [{ id: { in: m.toolIds } }, { slug: { in: m.toolSlugs } }] }, select: { id: true, slug: true } })
      : [],
  ]);
  return { startups, tools };
}

/**
 * Replace an article's tags with what its HTML tags now. Returns the profile pages whose article lists changed
 * (tagged before or after), so they can be refreshed.
 */
export async function syncArticleMentions(articleId: string, html: string): Promise<string[]> {
  const { startups, tools } = await resolveMentions(html);
  const [before] = await prisma.$transaction([
    prisma.article.findUnique({
      where: { id: articleId },
      select: { StartupMentions: { select: { Startup: { select: { slug: true } } } }, ToolMentions: { select: { Tool: { select: { slug: true } } } } },
    }),
    prisma.articleStartupMention.deleteMany({ where: { articleId, startupId: { notIn: startups.map((s) => s.id) } } }),
    prisma.articleToolMention.deleteMany({ where: { articleId, toolId: { notIn: tools.map((t) => t.id) } } }),
    prisma.articleStartupMention.createMany({ data: startups.map((s) => ({ articleId, startupId: s.id })), skipDuplicates: true }),
    prisma.articleToolMention.createMany({ data: tools.map((t) => ({ articleId, toolId: t.id })), skipDuplicates: true }),
  ]);
  const paths = new Set<string>([
    ...startups.map((s) => `/startups/${s.slug}`),
    ...tools.map((t) => `/tools/${t.slug}`),
    ...(before?.StartupMentions ?? []).map((x) => `/startups/${x.Startup.slug}`),
    ...(before?.ToolMentions ?? []).map((x) => `/tools/${x.Tool.slug}`),
  ]);
  return [...paths];
}

/** Profile pages listing this article (for refreshing them when it goes live, comes down or is deleted). */
export async function mentionPaths(articleId: string): Promise<string[]> {
  const a = await prisma.article.findUnique({
    where: { id: articleId },
    select: { StartupMentions: { select: { Startup: { select: { slug: true } } } }, ToolMentions: { select: { Tool: { select: { slug: true } } } } },
  });
  return [...(a?.StartupMentions ?? []).map((x) => `/startups/${x.Startup.slug}`), ...(a?.ToolMentions ?? []).map((x) => `/tools/${x.Tool.slug}`)];
}
