import { prisma } from '@udyaibase/database';
import { ensureSkillOverrides } from '@/lib/jobs/skill-overrides';
import { scoreProfile, type ScreenV3Result } from '@/lib/jobs/ai-screen-v3';
import type { ResumeProfileData } from '@/lib/jobs/resume-profile-shared';

/**
 * When the skills dictionary changes (admin approved an alias, a skill or a rule), recompute stored AI review scores
 * by code: the saved profile plus the model's saved line evidence go through the scorer again. No AI calls, no cost,
 * and nothing counted against any plan. Runs from the daily maintenance job, a batch at a time.
 */
export async function rescoreReviews(opts: { batch?: number; now?: Date } = {}): Promise<{ version: number; rescored: number; done: boolean }> {
  const meta = await prisma.skillDictionaryMeta.findUnique({ where: { id: 'main' } }).catch(() => null);
  if (!meta || meta.version <= meta.rescoredVersion) return { version: meta?.version ?? 0, rescored: 0, done: true };
  await ensureSkillOverrides(true);
  const now = opts.now ?? new Date();
  const ym = { y: now.getUTCFullYear(), m: now.getUTCMonth() + 1 };
  const batch = opts.batch ?? 200;
  let rescored = 0;
  let cursor: string | undefined;
  let exhausted = false;
  // Walk every v3 review once, skipping those already scored with this dictionary version.
  while (rescored < batch) {
    const rows = await prisma.jobBoardAiScreening.findMany({
      where: { status: 'DONE', promptVersion: { startsWith: 'screen-v3' } },
      orderBy: { id: 'asc' }, take: 200, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true, result: true,
        Application: {
          select: {
            confirmedSkills: true, experienceYears: true, city: true, noticePeriodDays: true, expectedCtcLakh: true, screeningAnswers: true,
            ResumeProfile: { select: { data: true } },
            Listing: { select: { title: true, description: true, skills: true, mustHaveSkills: true, experienceMin: true, experienceMax: true, workType: true, city: true, salaryMax: true, salaryCurrency: true, maxNoticeDays: true, screeningQuestions: true } },
          },
        },
      },
    });
    if (!rows.length) { exhausted = true; break; }
    cursor = rows[rows.length - 1]!.id;
    for (const r of rows) {
      const old = r.result as unknown as (ScreenV3Result & { dictVersion?: number }) | null;
      const profile = r.Application.ResumeProfile?.data as unknown as ResumeProfileData | undefined;
      // Already on this version, or nothing to recompute from (older review without saved evidence).
      if (!old || old.v !== 3 || old.dictVersion === meta.version || !profile || !('modelEvidence' in old)) continue;
      const next = scoreProfile(r.Application.Listing, r.Application, profile, old.modelEvidence ?? null, ym);
      next.result.tier = old.tier;
      await prisma.jobBoardAiScreening.update({
        where: { id: r.id },
        data: { fitScore: next.fitScore, recommendation: next.recommendation, result: { ...next.result, dictVersion: meta.version } as object },
      });
      if (++rescored >= batch) break;
    }
    if (rows.length < 200) { exhausted = true; break; }
  }
  const done = exhausted;
  if (done) await prisma.skillDictionaryMeta.update({ where: { id: 'main' }, data: { rescoredVersion: meta.version } });
  return { version: meta.version, rescored, done };
}
