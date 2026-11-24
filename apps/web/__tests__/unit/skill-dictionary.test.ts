import { describe, it, expect, afterEach } from 'vitest';
import { SKILLS, baseKey } from '@udyaibase/utils/skill-dictionary';
import { impliedBy, isKnownSkill, matchSkills, normalizeSkill, setSkillOverrides, skillName } from '@/lib/jobs/skills';
import { skillsInLine } from '@/lib/jobs/resume-score';

afterEach(() => setSkillOverrides({}));

describe('the dictionary itself', () => {
  it('has about 300 skills and no alias points at two different skills', () => {
    expect(SKILLS.length).toBeGreaterThanOrEqual(300);
    const owner = new Map<string, string>();
    const clashes: string[] = [];
    for (const e of SKILLS) for (const a of [e.name, ...(e.aliases ?? []), ...(e.loose ?? [])]) {
      const k = baseKey(a); const mine = baseKey(e.name);
      if (owner.has(k) && owner.get(k) !== mine) clashes.push(`${a} → ${owner.get(k)} and ${mine}`);
      owner.set(k, mine);
    }
    expect(clashes).toEqual([]);
  });

  it('every implies target is a skill in the dictionary', () => {
    const names = new Set(SKILLS.map((e) => e.name));
    expect(SKILLS.flatMap((e) => (e.implies ?? []).filter((t) => !names.has(t)).map((t) => `${e.name} → ${t}`))).toEqual([]);
  });

  it('keys that existed before the dictionary are unchanged (stored matches keep lining up)', () => {
    for (const [written, key] of [['Node.js', 'nodejs'], ['node', 'nodejs'], ['postgres', 'postgresql'], ['Machine Learning', 'machinelearning'], ['ml', 'machinelearning'],
      ['LLM', 'llms'], ['GenAI', 'generativeai'], ['GCP', 'googlecloud'], ['sklearn', 'scikitlearn'], ['k8s', 'kubernetes'], ['golang', 'go'], ['torch', 'pytorch'], ['UX', 'uxdesign']] as const) {
      expect(normalizeSkill(written)).toBe(key);
    }
  });
});

describe('skill tags (a job’s skills, ticked skills)', () => {
  it.each([
    ['ReactJS', 'React'], ['React.js', 'React'], ['react js', 'React'], ['NextJS', 'Next.js'], ['Vue.js', 'Vue'], ['Golang', 'Go'], ['Postgres', 'PostgreSQL'],
    ['K8s', 'Kubernetes'], ['Amazon Web Services', 'AWS'], ['C Sharp', 'C#'], ['dotnet', '.NET'], ['ASP.NET', '.NET'], ['CI CD', 'CI/CD'], ['Continuous Integration', 'CI/CD'],
    ['Power-BI', 'Power BI'], ['sklearn', 'scikit-learn'], ['HuggingFace', 'Hugging Face'], ['Gen AI', 'Generative AI'], ['RAG', 'RAG'], ['LangGraph', 'LangChain'],
    ['DSA', 'Data Structures'], ['OOPs', 'Object-Oriented Programming'], ['MS Excel', 'Excel'], ['REST', 'REST APIs'], ['TS', 'TypeScript'], ['CV', 'Computer Vision'],
  ])('%s → %s', (written, canonical) => expect(normalizeSkill(written)).toBe(baseKey(canonical)));

  it('C++, C# and C stay three different skills; Java ≠ JavaScript', () => {
    const keys = ['C++', 'C#', 'C', 'Java', 'JavaScript'].map(normalizeSkill);
    expect(new Set(keys).size).toBe(5);
  });

  it('matches across spellings', () => {
    expect(matchSkills(['React', 'Node.js', 'PostgreSQL'], ['reactjs', 'NodeJS', 'Postgres'])).toEqual(['React', 'Node.js', 'PostgreSQL']);
  });
});

describe('skills in resume text', () => {
  const has = (line: string, skill: string) => skillsInLine(line).has(normalizeSkill(skill));

  it.each([
    ['Built the dashboard in ReactJS and Redux', 'React'],
    ['Services written in C++ and C#', 'C++'],
    ['Services written in C++ and C#', 'C#'],
    ['Migrated the backend to .NET Core', '.NET'],
    ['Set up CI/CD with GitHub Actions', 'CI/CD'],
    ['Wrote Go services for ride matching', 'Go'],
    ['Ran Spark jobs on Databricks', 'Spark'],
    ['Built REST APIs in Node', 'Node.js'],
    ['Deployed on K8s in Amazon Web Services', 'Kubernetes'],
    ['Fine-tuned models with Hugging Face transformers', 'Hugging Face'],
    ['Built a RAG pipeline with LangChain', 'RAG'],
    ['Trained models with scikit-learn', 'scikit-learn'],
  ])('finds it: “%s” → %s', (line, skill) => expect(has(line, skill)).toBe(true));

  it.each([
    ['Wrote JavaScript for the checkout page', 'Java'],
    ['I go to college in Pune', 'Go'],
    ['Go-to-Market Manager', 'Go'],
    ['Helped sales react quickly to pricing', 'React'],
    ['Sparked a culture of code review', 'Spark'],
    ['Handled the rest of the release', 'REST APIs'],
    ['Drove 40% growth in signups', 'Growth Marketing'],
    ['Updated my CV for the role', 'Computer Vision'],
    ['Built a sense of unity in the team', 'Game Development'],
    ['Next we shipped the app', 'Next.js'],
  ])('doesn’t invent it: “%s” ≠ %s', (line, skill) => expect(has(line, skill)).toBe(false));

  it('an everyday word counts when the dictionary marks it plainly as the tool (Go in a skills list)', () => {
    expect(has('Skills: Go, Python, SQL', 'Go')).toBe(true);
  });
});

describe('implies', () => {
  it('Next.js, Redux and React Native imply React; PyTorch implies Python and Deep Learning', () => {
    expect(impliedBy('react')).toEqual(expect.arrayContaining(['nextjs', 'redux', 'reactnative']));
    expect(impliedBy('python')).toContain('pytorch');
    expect(impliedBy('deeplearning')).toContain('pytorch');
  });
});

describe('admin additions (database) override the base list on the server', () => {
  it('a new alias, a new skill, an ambiguity mark and an implies rule', () => {
    expect(normalizeSkill('ShadCN')).toBe('shadcn');
    expect(isKnownSkill('Turborepo')).toBe(false);
    setSkillOverrides({ aliases: { shadcn: 'react', shadcnui: 'react' }, names: { turborepo: 'Turborepo' }, ambiguous: ['kafka'], implies: { turborepo: ['typescript'] } });
    expect(normalizeSkill('shadcn/ui')).toBe('react');
    expect(isKnownSkill('Turborepo')).toBe(true);
    expect(skillName('turborepo')).toBe('Turborepo');
    expect(skillsInLine('kafka streams were slow').has('kafka')).toBe(false);
    expect(skillsInLine('Kafka streams were slow').has('kafka')).toBe(true);
    expect(impliedBy('typescript')).toContain('turborepo');
  });
});
