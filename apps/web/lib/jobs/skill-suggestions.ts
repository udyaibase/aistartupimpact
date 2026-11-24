import { AI_MODELS } from '@/lib/ops/ai-models';
import { prisma } from '@udyaibase/database';
import { SKILLS, type SkillCategory } from '@udyaibase/utils/skill-dictionary';
import { modelOptions, openaiChat } from '@/lib/ops/ai';

/**
 * Weekly: ask the AI how the most-seen unknown skill strings should be handled. Suggestions only: they wait in the
 * admin review queue, and nothing enters the dictionary until a person approves it. Only short skill tags are sent
 * (no resume text, no names).
 */

const MODEL = AI_MODELS.skillSuggestions;
const BATCH = 50;
const CATEGORIES: SkillCategory[] = ['language', 'frontend', 'backend', 'mobile', 'data', 'database', 'ml', 'ai', 'cloud', 'devops', 'testing', 'security', 'design', 'product', 'business', 'soft', 'tools'];

const SCHEMA = {
  name: 'skill_suggestions', strict: true,
  schema: {
    type: 'object', additionalProperties: false, required: ['items'],
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false, required: ['key', 'action', 'skill', 'category', 'reason'],
          properties: {
            key: { type: 'string' },
            action: { type: 'string', enum: ['alias', 'new', 'ignore'] },
            skill: { type: 'string', description: 'alias: an existing skill name exactly as listed. new: the canonical name. ignore: empty.' },
            category: { type: 'string', enum: [...CATEGORIES, ''] },
            reason: { type: 'string', description: 'Under 15 words.' },
          },
        },
      },
    },
  },
};

export async function runSkillSuggestions(): Promise<{ suggested: number }> {
  if (!process.env.OPENAI_API_KEY) return { suggested: 0 };
  const pending = await prisma.skillDictionaryUnknown.findMany({
    where: { status: 'PENDING', suggestedAt: null },
    orderBy: { seenCount: 'desc' }, take: BATCH, select: { key: true, sample: true, seenCount: true },
  });
  if (!pending.length) return { suggested: 0 };
  const added = await prisma.skillDictionarySkill.findMany({ select: { name: true } });
  const names = [...SKILLS.map((s) => s.name), ...added.map((a) => a.name)];
  const nameSet = new Set(names);

  const data = await openaiChat('skill_suggestions', {
    model: MODEL, ...modelOptions(MODEL),
    response_format: { type: 'json_schema', json_schema: SCHEMA },
    messages: [
      { role: 'system', content: `You maintain a skills dictionary for tech and startup hiring in India. For each unknown string, choose:
- alias: it is another way to write one of the existing skills (give that skill's name exactly as listed).
- new: it is a real, distinct skill or tool people hire for (give its usual canonical spelling and a category).
- ignore: not a skill (a sentence fragment, a company, a job title, a degree, a typo you can't place, or too vague).
Be conservative: when unsure between alias and new, prefer new; never map two different tools together.` },
      { role: 'user', content: `Existing skills:\n${names.join(', ')}\n\nUnknown strings (key: as written, times seen):\n${pending.map((p) => `${p.key}: "${p.sample}" (${p.seenCount})`).join('\n')}` },
    ],
  }, 60_000);
  const items = (JSON.parse(data.choices?.[0]?.message?.content ?? '{}').items ?? []) as { key: string; action: string; skill: string; category: string; reason: string }[];
  const keys = new Set(pending.map((p) => p.key));
  let suggested = 0;
  for (const it of items) {
    if (!keys.has(it.key) || !['alias', 'new', 'ignore'].includes(it.action)) continue;
    // An alias must point at a skill that exists; otherwise the suggestion isn't usable.
    if (it.action === 'alias' && !nameSet.has(it.skill)) continue;
    const suggestion = {
      action: it.action, skill: it.action === 'ignore' ? '' : String(it.skill).slice(0, 60),
      category: CATEGORIES.includes(it.category as SkillCategory) ? it.category : '', reason: String(it.reason).slice(0, 120), model: MODEL,
    };
    await prisma.skillDictionaryUnknown.update({ where: { key: it.key }, data: { suggestion, suggestedAt: new Date() } });
    suggested++;
  }
  return { suggested };
}
