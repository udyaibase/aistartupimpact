/**
 * Deterministic skill matching (no AI): the job's skill tags compared with the skills the
 * candidate confirmed, after normalising case, punctuation and common aliases.
 */

const ALIASES: Record<string, string> = {
  js: 'javascript', javascript: 'javascript', ecmascript: 'javascript',
  ts: 'typescript', typescript: 'typescript',
  node: 'nodejs', nodejs: 'nodejs',
  react: 'react', reactjs: 'react',
  next: 'nextjs', nextjs: 'nextjs',
  vue: 'vue', vuejs: 'vue',
  postgres: 'postgresql', postgresql: 'postgresql', psql: 'postgresql',
  mongo: 'mongodb', mongodb: 'mongodb',
  k8s: 'kubernetes', kubernetes: 'kubernetes',
  golang: 'go', go: 'go',
  py: 'python', python: 'python', python3: 'python',
  ml: 'machinelearning', machinelearning: 'machinelearning',
  dl: 'deeplearning', deeplearning: 'deeplearning',
  llm: 'llms', llms: 'llms', largelanguagemodels: 'llms',
  genai: 'generativeai', generativeai: 'generativeai',
  gcp: 'googlecloud', googlecloud: 'googlecloud', googlecloudplatform: 'googlecloud',
  aws: 'aws', amazonwebservices: 'aws',
  tf: 'tensorflow', tensorflow: 'tensorflow',
  pytorch: 'pytorch', torch: 'pytorch',
  sklearn: 'scikitlearn', scikitlearn: 'scikitlearn',
  ux: 'uxdesign', uxdesign: 'uxdesign',
  ui: 'uidesign', uidesign: 'uidesign',
};

export function normalizeSkill(s: string): string {
  const key = s.toLowerCase().replace(/\.js\b/g, 'js').replace(/[^a-z0-9+#]/g, '');
  return ALIASES[key] ?? key;
}

/** Job skills the candidate has, in the job's own wording. */
export function matchSkills(jobSkills: string[], candidateSkills: string[]): string[] {
  const have = new Set(candidateSkills.map(normalizeSkill).filter(Boolean));
  return jobSkills.filter((s) => have.has(normalizeSkill(s)));
}
