import { prisma } from '@udyaibase/database';
import {
  AI_CHECK_DEFAULT_MODEL, AI_CHECK_FEATURE, AI_CHECK_SCHEMA, aiCheckHasText, aiCheckMessages, parseAiCheck, type AiCheckResult,
} from '@udyaibase/utils/startup-ai-check';
import { monitoredOpenAI } from '@/lib/ops-ai';

/**
 * The automatic first look, run from the admin: for submissions from before the check existed, or to check again
 * after a founder's edit. Same question and same reading of the answer as the website's own run on submit.
 */
export async function checkStartupForAi(startupId: string): Promise<{ ok: true; result: AiCheckResult } | { ok: false; error: string }> {
  if (!process.env.OPENAI_API_KEY) return { ok: false, error: 'The automatic check is not set up on this server (no AI key).' };
  const s = await prisma.startup.findFirst({
    where: { id: startupId, deletedAt: null },
    select: { name: true, tagline: true, description: true, aiUseCase: true, category: true, businessType: true, websiteUrl: true },
  });
  if (!s) return { ok: false, error: 'This startup no longer exists.' };
  if (!aiCheckHasText(s)) return { ok: false, error: 'There is too little text in this submission to check.' };

  const model = process.env.STARTUP_AI_CHECK_MODEL || AI_CHECK_DEFAULT_MODEL;
  const completion = await monitoredOpenAI(AI_CHECK_FEATURE, { timeoutMs: 20_000, maxRetries: 1 }).chat.completions.create({
    model, temperature: 0,
    response_format: { type: 'json_schema', json_schema: AI_CHECK_SCHEMA as never },
    messages: aiCheckMessages(s),
  });
  const result = parseAiCheck(completion.choices?.[0]?.message?.content);
  if (!result) return { ok: false, error: "The check didn't return a usable answer. Try again." };
  await prisma.startup.update({
    where: { id: startupId },
    data: { aiCheckLabel: result.label, aiCheckReason: result.reason, aiCheckedAt: new Date(), aiCheckModel: model },
    select: { id: true },
  });
  return { ok: true, result };
}

/** The same first look for an AI tool: for tools from before the check existed, or to check again after an edit. */
export async function checkToolForAi(toolId: string): Promise<{ ok: true; result: AiCheckResult } | { ok: false; error: string }> {
  if (!process.env.OPENAI_API_KEY) return { ok: false, error: 'The automatic check is not set up on this server (no AI key).' };
  const t = await prisma.aiTool.findFirst({
    where: { id: toolId, deletedAt: null },
    select: { name: true, tagline: true, description: true, websiteUrl: true, ToolCategory: { select: { name: true } } },
  });
  if (!t) return { ok: false, error: 'This tool no longer exists.' };
  const lines = await prisma.$queryRaw<Array<{ text: string }>>`SELECT text FROM "ToolUseCase" WHERE "toolId" = ${toolId} ORDER BY id LIMIT 30`;
  const input = { kind: 'tool' as const, name: t.name, tagline: t.tagline, description: t.description, websiteUrl: t.websiteUrl, category: t.ToolCategory?.name ?? null, features: lines.map((l) => l.text) };
  if (!aiCheckHasText(input)) return { ok: false, error: 'There is too little text in this submission to check.' };

  const model = process.env.STARTUP_AI_CHECK_MODEL || AI_CHECK_DEFAULT_MODEL;
  const completion = await monitoredOpenAI(AI_CHECK_FEATURE, { timeoutMs: 20_000, maxRetries: 1 }).chat.completions.create({
    model, temperature: 0,
    response_format: { type: 'json_schema', json_schema: AI_CHECK_SCHEMA as never },
    messages: aiCheckMessages(input),
  });
  const result = parseAiCheck(completion.choices?.[0]?.message?.content);
  if (!result) return { ok: false, error: "The check didn't return a usable answer. Try again." };
  await prisma.aiTool.update({
    where: { id: toolId },
    data: { aiCheckLabel: result.label, aiCheckReason: result.reason, aiCheckedAt: new Date(), aiCheckModel: model },
    select: { id: true },
  });
  return { ok: true, result };
}
