import OpenAI from 'openai';
import { prisma } from '@udyaibase/database';
import { aiCostMicroUsd } from '@udyaibase/utils/ai-cost';

/**
 * OpenAI client for the admin app that records every chat completion (tokens, estimated cost, failures;
 * never prompts or answers) into OpsAiCall, the same table the web app uses. Budget and failure alerts
 * are raised by the web app's checks, which read this table too.
 */
export function monitoredOpenAI(feature: string) {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const record = (model: string, ok: boolean, usage?: { prompt_tokens?: number; completion_tokens?: number } | null, error?: string) => {
    const promptTokens = usage?.prompt_tokens ?? 0, completionTokens = usage?.completion_tokens ?? 0;
    return prisma.opsAiCall.create({
      data: { feature, model, promptTokens, completionTokens, costMicroUsd: aiCostMicroUsd(model, promptTokens, completionTokens), ok, error: error?.slice(0, 300) },
    }).catch(() => {});
  };
  return {
    chat: {
      completions: {
        async create(body: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming): Promise<OpenAI.Chat.ChatCompletion> {
          try {
            const completion = await client.chat.completions.create(body);
            await record(body.model, true, completion.usage);
            return completion;
          } catch (err) {
            await record(body.model, false, null, err instanceof Error ? err.message : String(err));
            throw err;
          }
        },
      },
    },
  };
}
