/**
 * Every OpenAI model the web app uses, in one place. Each can be overridden with its environment variable.
 *
 * Models get retired. Before switching any resume model, re-run the benchmark and the real-data check:
 *   scripts/resume-eval.ts (test set) and scripts/resume-decisions.ts (past recruiter decisions)
 * and add the model's price to packages/utils/ai-cost.ts.
 */
export const AI_MODELS = {
  /** AI review of a candidate, paid plans and trial (step 4 benchmark choice). */
  reviewAdvanced: process.env.AI_SCREEN_MODEL || 'gpt-4.1',
  /** AI review on the Free plan. */
  reviewStandard: process.env.AI_SCREEN_MODEL_STANDARD || 'gpt-4.1-mini',
  /** Reading a resume into its structured profile (built once per file, shared by every plan). */
  resumeProfile: process.env.RESUME_PROFILE_MODEL || 'gpt-4.1-mini',
  /** The original review, used only when no profile can be built (or RESUME_ENGINE=v2). */
  reviewLegacy: process.env.AI_SCREEN_LEGACY_MODEL || 'gpt-4o-mini',
  /** Filling the apply form from a resume (with the candidate's consent), and reading resumes a team adds. */
  resumePrefill: process.env.RESUME_PREFILL_MODEL || 'gpt-4o-mini',
  /** Turning a pasted job description into the job form. */
  jobParse: process.env.JOB_PARSE_MODEL || 'gpt-4o-mini',
  /** Weekly suggestions for unknown skills (admin approves each). */
  skillSuggestions: process.env.SKILL_SUGGEST_MODEL || 'gpt-4.1-mini',
} as const;
