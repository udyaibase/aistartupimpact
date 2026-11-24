/**
 * One-off (and occasional) skills mining: counts skill tags in your job posts and in the skills lists of stored resume
 * profiles that the dictionary doesn't know yet, most frequent first. With --save, puts them in the admin review queue
 * (Skills dictionary page) with their counts. Prints skill tags and counts only.
 *
 * Run from apps/web:
 *   npx dotenv-cli -e ../../.env -- npx tsx --tsconfig tsconfig.json scripts/skill-mining.ts [--top 100] [--save]
 */
import { prisma } from '@udyaibase/database';
import { baseKey } from '@udyaibase/utils/skill-dictionary';
import { ensureSkillOverrides, skillTags } from '../lib/jobs/skill-overrides';
import { isKnownSkill } from '../lib/jobs/skills';
import type { ResumeProfileData } from '../lib/jobs/resume-profile-shared';

const arg = (n: string, d: string) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1]! : d; };
const TOP = Number(arg('top', '100'));
const SAVE = process.argv.includes('--save');

(async () => {
  await ensureSkillOverrides(true);
  const counts = new Map<string, { sample: string; job: number; resume: number }>();
  const add = (raw: string, src: 'job' | 'resume') => {
    for (const t of skillTags(raw)) {
      if (t.length < 2 || t.length > 40 || t.split(/\s+/).length > 4 || !/[a-z]/i.test(t) || /\[(name|email|phone|link)\]/i.test(t) || isKnownSkill(t)) continue;
      const k = baseKey(t);
      const c = counts.get(k) ?? { sample: t, job: 0, resume: 0 };
      c[src]++;
      counts.set(k, c);
    }
  };
  const listings = await prisma.jobBoardListing.findMany({ where: { deletedAt: null }, select: { skills: true, mustHaveSkills: true }, take: 20000 });
  for (const l of listings) for (const s of [...l.skills, ...l.mustHaveSkills]) add(s, 'job');
  const profiles = await prisma.jobBoardResumeProfile.findMany({ select: { data: true }, take: 20000 });
  for (const p of profiles) {
    const d = p.data as unknown as ResumeProfileData;
    for (const l of d.skillLines ?? []) add(d.lines?.[l - 1] ?? '', 'resume');
  }
  const top = [...counts].sort((a, b) => (b[1].job + b[1].resume) - (a[1].job + a[1].resume)).slice(0, TOP);
  console.log(`${listings.length} jobs and ${profiles.length} resume profiles read; ${counts.size} skill tags the dictionary doesn't know.\n`);
  console.log('| Skill tag | In jobs | In resumes |');
  console.log('|---|---|---|');
  for (const [, c] of top) console.log(`| ${c.sample} | ${c.job} | ${c.resume} |`);
  if (SAVE) {
    for (const [key, c] of top) {
      await prisma.skillDictionaryUnknown.upsert({
        where: { key },
        create: { key, sample: c.sample, source: c.job >= c.resume ? 'job' : 'resume', seenCount: c.job + c.resume },
        update: { seenCount: Math.max(c.job + c.resume, 1), lastSeen: new Date() },
      });
    }
    console.log(`\nSaved ${top.length} to the review queue (admin → Skills dictionary).`);
  }
  await prisma.$disconnect();
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
