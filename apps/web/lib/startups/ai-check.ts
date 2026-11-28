import { prisma } from '@udyaibase/database';
import { AI_CHECK_FEATURE, AI_CHECK_SCHEMA, aiCheckHasText, aiCheckMessages, parseAiCheck } from '@udyaibase/utils/startup-ai-check';
import { AI_MODELS } from '@/lib/ops/ai-models';
import { modelOptions, openaiChat } from '@/lib/ops/ai';

/**
 * Run the automatic first look for one startup and save the label for the reviewer. Called after a founder
 * submits or resubmits. It must never get in the founder's way: no key, no budget, a slow or failed call and a
 * strange answer all end the same way, with nothing saved and the submission in the queue as usual.
 */
export async function runStartupAiCheck(startupId: string): Promise<boolean> {
  try {
    if (!process.env.OPENAI_API_KEY) return false;
    const s = await prisma.startup.findUnique({
      where: { id: startupId },
      select: { name: true, tagline: true, description: true, aiUseCase: true, category: true, businessType: true, websiteUrl: true, isApproved: true },
    });
    // Only submissions still waiting: a live startup has already been judged by a person.
    if (!s || s.isApproved || !aiCheckHasText(s)) return false;
    const model = AI_MODELS.startupCheck;
    const data = await openaiChat(AI_CHECK_FEATURE, {
      model, ...modelOptions(model),
      response_format: { type: 'json_schema', json_schema: AI_CHECK_SCHEMA },
      messages: aiCheckMessages(s),
    }, 20_000);
    const result = parseAiCheck(data.choices?.[0]?.message?.content);
    if (!result) return false;
    await prisma.startup.update({
      where: { id: startupId },
      data: { aiCheckLabel: result.label, aiCheckReason: result.reason, aiCheckedAt: new Date(), aiCheckModel: model },
      select: { id: true },
    });
    return true;
  } catch (err) {
    console.error('[startup-ai-check] skipped:', err instanceof Error ? err.message : 'unknown error');
    return false;
  }
}

/** The same first look for an AI tool waiting for approval. Same promise: it never gets in the founder's way. */
export async function runToolAiCheck(toolId: string): Promise<boolean> {
  try {
    if (!process.env.OPENAI_API_KEY) return false;
    const t = await prisma.aiTool.findUnique({
      where: { id: toolId },
      select: { name: true, tagline: true, description: true, websiteUrl: true, status: true, ToolCategory: { select: { name: true } } },
    });
    if (!t || t.status !== 'PENDING') return false;
    const lines = await prisma.$queryRaw<Array<{ text: string }>>`SELECT text FROM "ToolUseCase" WHERE "toolId" = ${toolId} ORDER BY id LIMIT 30`;
    const input = { kind: 'tool' as const, name: t.name, tagline: t.tagline, description: t.description, websiteUrl: t.websiteUrl, category: t.ToolCategory?.name ?? null, features: lines.map((l) => l.text) };
    if (!aiCheckHasText(input)) return false;
    const model = AI_MODELS.startupCheck;
    const data = await openaiChat(AI_CHECK_FEATURE, {
      model, ...modelOptions(model),
      response_format: { type: 'json_schema', json_schema: AI_CHECK_SCHEMA },
      messages: aiCheckMessages(input),
    }, 20_000);
    const result = parseAiCheck(data.choices?.[0]?.message?.content);
    if (!result) return false;
    await prisma.aiTool.update({
      where: { id: toolId },
      data: { aiCheckLabel: result.label, aiCheckReason: result.reason, aiCheckedAt: new Date(), aiCheckModel: model },
      select: { id: true },
    });
    return true;
  } catch (err) {
    console.error('[tool-ai-check] skipped:', err instanceof Error ? err.message : 'unknown error');
    return false;
  }
}
