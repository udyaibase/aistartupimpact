import { prisma } from '@udyaibase/database';

/** A founder account manages one startup and one AI tool. Change these numbers to allow more. */
export const MAX_STARTUPS_PER_FOUNDER = 1;
export const MAX_TOOLS_PER_FOUNDER = 1;

export const STARTUP_LIMIT_MESSAGE = 'Your account can have one startup, and you already have one. Need to manage another? Contact Support.';
export const TOOL_LIMIT_MESSAGE = 'Your account can have one AI tool, and you already have one. Need to list another? Contact Support.';

export async function founderAtStartupLimit(founderUserId: string, exceptStartupId?: string): Promise<boolean> {
  const count = await prisma.startup.count({
    where: { ownerId: founderUserId, deletedAt: null, ...(exceptStartupId ? { id: { not: exceptStartupId } } : {}) },
  });
  return count >= MAX_STARTUPS_PER_FOUNDER;
}

export async function founderAtToolLimit(founderUserId: string): Promise<boolean> {
  const count = await prisma.aiTool.count({ where: { ownerId: founderUserId, deletedAt: null } });
  return count >= MAX_TOOLS_PER_FOUNDER;
}
